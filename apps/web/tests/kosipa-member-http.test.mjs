import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { KosipaError } from '@koperasi/domain/kosipa';
import { planMemberProfile, planMemberRegistration, planMemberStatus } from '@koperasi/domain/kosipa/member-command';
import { handleLogin } from '../src/infrastructure/auth/handlers/login.ts';
import { handleChangeMemberStatus, handleGetMemberForEdit, handleRegisterMember, handleUpdateMemberProfile } from '../src/infrastructure/console/kosipa-command-http.ts';
import { kosipaWriteOwnership } from '../src/infrastructure/console/kosipa-ownership.ts';
import { makeWorld, makeRequest, bodyOf, cookieOf } from './helpers/auth-fakes.mjs';

// HTTP security matrix of the member commands (FA-03B T05) through the real route handlers, session guard and capability resolver.
// The repository is in memory but uses the REAL domain planners; SQL behaviour is covered by kosipa-member-write-db.test.mjs.
async function signedIn(id = 4, roleId = 4) {
  const world = makeWorld();
  world.addUser({ id, roleId, username: `u${id}` });
  const r = await handleLogin(world.services, makeRequest('/api/auth/login', { method: 'POST', body: { username: `u${id}`, password: 'Pw-Synthetic-1' } }));
  return { world, cookie: cookieOf(r), token: (await bodyOf(r)).csrfToken };
}
const facts = { bagian: [{ name: 'Produksi', active: true }], lokasi: [{ name: 'Tambun', active: true }] };
const versionOf = (m) => createHash('sha256').update(JSON.stringify(m.fields)).digest('hex');

function fixture({ grants = ['kosipa.member.create', 'kosipa.member.update', 'kosipa.member.status'], linked = true, owns = true, legacy = 'fenced' } = {}) {
  const members = new Map(); const ledger = new Map(); const audit = []; const writes = [];
  members.set(1, { id: 1, fields: { nik_kar: '100', nama_kar: 'SYNTH Satu', bagian: 'Produksi', lokasi: 'Tambun', kd_group: 'ANGGOTA', status_anggota: 'AKTIVE', gaji: '1000', password: 'HASH', foto_ktp: 'x.jpg', limit_toko: '50' } });
  const state = { grants, linked, legacy };
  const commit = (e, apply) => {
    const k = `${e.actorConsoleUserId}:${e.idempotencyKey}`; const s = ledger.get(k);
    if (s) { if (s.hash !== e.requestHash) throw new KosipaError('IDEMPOTENCY_CONFLICT'); return { result: s.result, replayed: true, ledgerId: s.id }; }
    if (state.legacy !== 'fenced') throw new KosipaError('LEGACY_ACTIVE');
    const result = apply(); writes.push(e.command); ledger.set(k, { id: ledger.size + 1, hash: e.requestHash, result }); return { result, replayed: false, ledgerId: ledger.size };
  };
  const locked = (id, v) => { const m = members.get(id); if (!m) throw new KosipaError('MEMBER_NOT_FOUND'); if (versionOf(m) !== v) throw new KosipaError('STALE'); return m; };
  const members_ = {
    async fenceState() { return state.legacy; },
    async detail(id) { const m = members.get(id); return m ? { id, fields: m.fields, version: versionOf(m) } : null; },
    async create(e, input) { return commit(e, () => { const p = planMemberRegistration(input, facts); const id = members.size + 1; const m = { id, fields: { ...p.fields, doc_no: `REG${id}`, no_anggota: `000${id}` } }; members.set(id, m); return { id, version: versionOf(m) }; }); },
    async update(e, id, input) { return commit(e, () => { const m = locked(id, input.expectedVersion); const p = planMemberProfile({ id, fields: m.fields }, input, facts); m.fields = p.after.fields; return { id, version: versionOf(m) }; }); },
    async changeStatus(e, id, input) { return commit(e, () => { const m = locked(id, input.expectedVersion); const p = planMemberStatus({ id, status: m.fields.status_anggota }, input); m.fields.status_anggota = p.to; if (p.zeroLimits) m.fields.limit_toko = '0'; return { id, version: versionOf(m) }; }); },
  };
  const ports = {
    links: { async activeForConsoleUser() { return state.linked ? { externalUserId: 9102 } : null; } },
    kosipa: { async kosipaUser(id) { return { id, active: true, activeGroups: 1 }; }, async allowedMenuUrls() { return ['master/anggota_c']; } },
    grants: { async activeCapabilities() { return state.grants; } },
    audit: { async append(e) { audit.push(e); } },
    now: () => new Date('2026-11-06T05:00:00Z'),
    ownership: kosipaWriteOwnership(owns ? { KOSIPA_MEMBER_WRITES_ENABLED: 'true', KOSIPA_WRITE_OWNERSHIP: 'member' } : { KOSIPA_MEMBER_WRITES_ENABLED: 'false', KOSIPA_WRITE_OWNERSHIP: 'member' }),
    masters: {}, members: members_,
  };
  return { ports, members, writes, audit, state };
}
const permissions = { async grantedAmong() { return new Set(); } };
const deps = (f, extra = {}) => ({ enabled: true, permissions, ports: f.ports, ...extra });
const req = (method, path, s, body, o = {}) => makeRequest(path, { method, cookie: s.cookie, token: s.token, body, ...o });
const register = (s, f, body, o, d) => handleRegisterMember(s.world.services, req('POST', '/api/kosipa/members', s, body, o), d ?? deps(f));
const edit = (s, f, id = 1, o = {}) => handleGetMemberForEdit(s.world.services, makeRequest(`/api/kosipa/members/${id}`, { cookie: s.cookie, ...o }), String(id), deps(f));
const patch = (s, f, id, body) => handleUpdateMemberProfile(s.world.services, req('PATCH', `/api/kosipa/members/${id}`, s, body), String(id), deps(f));
const status = (s, f, id, body) => handleChangeMemberStatus(s.world.services, req('POST', `/api/kosipa/members/${id}/status`, s, body), String(id), deps(f));
const newMember = (extra = {}) => ({ idempotencyKey: randomUUID(), fields: { nik_kar: `N${Math.floor(Math.random() * 1e6)}`, nama_kar: 'SYNTH Baru', bagian: 'produksi', lokasi: 'TAMBUN', kd_group: 'ANGGOTA', status_anggota: 'AKTIVE', ...extra }, initialDeductions: { pokok: '0', wajib: '0', sukarela: '0' } });

test('gate order: flag off 404, anonymous 401, missing/forged CSRF 403, cross-origin 403, form post 403, services missing 503 — nothing written', async () => {
  const s = await signedIn(); const f = fixture();
  assert.equal((await register(s, f, newMember(), {}, deps(f, { enabled: false }))).status, 404);
  assert.equal((await register({ ...s, cookie: undefined }, f, newMember())).status, 401);
  assert.equal((await register({ ...s, token: undefined }, f, newMember())).status, 403);
  assert.equal((await register({ ...s, token: 'forged' }, f, newMember())).status, 403);
  assert.equal((await register(s, f, newMember(), { origin: 'https://evil.example' })).status, 403);
  assert.equal((await register(s, f, 'nama_kar=x', { contentType: 'application/x-www-form-urlencoded' })).status, 403);
  assert.equal((await register(s, f, newMember(), {}, deps(f, { ports: null }))).status, 503);
  assert.deepEqual(f.writes, []);
});

test('authorization matrix: each command needs its own grant plus view and a live link; denials audit without values and never reveal existence', async () => {
  const s = await signedIn();
  for (const variant of [{ grants: [] }, { linked: false }, { grants: ['kosipa.member.update'] }]) {
    const f = fixture(variant);
    assert.equal((await register(s, f, newMember())).status, 403, JSON.stringify(variant));
    assert.equal((await status(s, f, 999999, { idempotencyKey: randomUUID(), status: 'RESIGN', reason: 'alasan sah', expectedVersion: 'a'.repeat(64) })).status, 403, 'no existence probing');
    assert.deepEqual(f.writes, []);
  }
  const onlyStatus = fixture({ grants: ['kosipa.member.status'] });
  assert.equal((await patch(s, onlyStatus, 1, { idempotencyKey: randomUUID(), fields: { jabatan: 'X' }, expectedVersion: 'a'.repeat(64) })).status, 403);
  assert.equal((await register(s, onlyStatus, newMember())).status, 403);
  const onlyCreate = fixture({ grants: ['kosipa.member.create'] });
  assert.equal((await status(s, onlyCreate, 1, { idempotencyKey: randomUUID(), status: 'RESIGN', reason: 'alasan sah', expectedVersion: 'a'.repeat(64) })).status, 403);
  assert.ok(onlyCreate.audit.every((e) => e.action === 'kosipa.command.denied'));
});

test('ownership off -> 503 WRITE_DISABLED for every command; edit view still works read-only and reports writable=false', async () => {
  const s = await signedIn(); const f = fixture({ owns: false });
  for (const r of [await register(s, f, newMember()), await patch(s, f, 1, { idempotencyKey: randomUUID(), fields: { jabatan: 'X' }, expectedVersion: 'a'.repeat(64) }), await status(s, f, 1, { idempotencyKey: randomUUID(), status: 'RESIGN', reason: 'alasan sah', expectedVersion: 'a'.repeat(64) })]) {
    assert.equal(r.status, 503); assert.equal((await bodyOf(r)).error, 'WRITE_DISABLED');
  }
  const view = await bodyOf(await edit(s, f)); assert.equal(view.writable, false);
  const legacy = await bodyOf(await edit(s, fixture({ legacy: 'legacy-active' }))); assert.equal(legacy.writable, false); assert.equal(legacy.legacy, 'legacy-active');
  assert.deepEqual(f.writes, []);
});

test('edit view: needs view + a member write capability; returns only the allowlisted fields, never credentials, photos or ceilings; no-store', async () => {
  const s = await signedIn();
  const r = await edit(s, fixture());
  const body = await bodyOf(r);
  assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.match(body.version, /^[0-9a-f]{64}$/); assert.equal(body.canUpdate, true); assert.equal(body.canChangeStatus, true); assert.equal(body.writable, true);
  assert.equal(body.fields.nama_kar, 'SYNTH Satu'); assert.equal(body.fields.gaji, '1000');
  for (const hidden of ['password', 'foto_ktp', 'limit_toko', 'sim_pokok']) assert.ok(!(hidden in body.fields), hidden);
  assert.equal((await edit(s, fixture({ grants: [] }))).status, 403, 'view alone is not enough for the PII-rich edit record');
  assert.equal((await edit(s, fixture({ linked: false }))).status, 403);
  assert.equal((await edit(s, fixture(), 777)).status, 404);
  assert.equal((await edit(s, fixture(), 'abc')).status, 400);
  const statusOnly = await bodyOf(await edit(s, fixture({ grants: ['kosipa.member.status'] }))); assert.deepEqual([statusOnly.canUpdate, statusOnly.canChangeStatus], [false, true]);
});

test('register: 201, replay 200, key reuse 409, duplicate-free validation errors; profile PATCH with stale 409; status with reason; audit carries no values or reasons', async () => {
  const s = await signedIn(); const f = fixture();
  const b = newMember();
  const first = await register(s, f, b); assert.equal(first.status, 201);
  const created = (await bodyOf(first)).data; assert.deepEqual(Object.keys(created).sort(), ['id', 'version']);
  const replay = await register(s, f, b); assert.equal(replay.status, 200); assert.deepEqual(await bodyOf(replay), { success: true, replayed: true, data: created });
  assert.equal((await register(s, f, { ...b, initialDeductions: { pokok: '1', wajib: '0', sukarela: '0' } })).status, 409);
  assert.equal((await bodyOf(await register(s, f, newMember({ limit_toko: '9' })))).error, 'FIELD_NOT_ALLOWED');
  assert.equal((await bodyOf(await register(s, f, newMember({ bagian: 'Tidak Ada' })))).error, 'MEMBER_MASTER_INVALID');
  assert.equal((await register(s, f, '{not json')).status, 400);
  const before = f.writes.length;
  const huge = await register(s, f, { ...newMember(), pad: 'x'.repeat(20000) });
  assert.equal(huge.status, 400); assert.equal((await bodyOf(huge)).error, 'INVALID_INPUT'); assert.equal(f.writes.length, before, 'an oversized body is refused before any command'); 

  const v0 = (await bodyOf(await edit(s, f, created.id))).version;
  const upd = await patch(s, f, created.id, { idempotencyKey: randomUUID(), fields: { jabatan: 'STAF', nama_kar: 'SYNTH Rahasia' }, expectedVersion: v0 });
  assert.equal(upd.status, 200); const v1 = (await bodyOf(upd)).data.version; assert.notEqual(v1, v0);
  assert.equal((await bodyOf(await patch(s, f, created.id, { idempotencyKey: randomUUID(), fields: { jabatan: 'LAIN' }, expectedVersion: v0 }))).error, 'STALE');
  assert.equal((await bodyOf(await patch(s, f, created.id, { idempotencyKey: randomUUID(), fields: { jabatan: 'STAF' }, expectedVersion: v1 }))).error, 'NO_CHANGE');
  assert.equal((await bodyOf(await patch(s, f, created.id, { idempotencyKey: randomUUID(), fields: { status_anggota: 'RESIGN' }, expectedVersion: v1 }))).error, 'FIELD_NOT_ALLOWED', 'status is never a profile field');

  const sb = (extra = {}) => ({ idempotencyKey: randomUUID(), status: 'RESIGN', reason: 'Karyawan mengundurkan diri', expectedVersion: v1, ...extra });
  assert.equal((await bodyOf(await status(s, f, created.id, sb({ reason: '' })))).error, 'REASON_INVALID');
  assert.equal((await bodyOf(await status(s, f, created.id, sb({ status: 'DELETED' })))).error, 'MEMBER_STATUS_INVALID');
  assert.equal((await bodyOf(await status(s, f, created.id, sb({ limit_toko: 5 })))).error, 'FIELD_NOT_ALLOWED');
  assert.equal((await status(s, f, 'abc', sb())).status, 400);
  assert.equal((await status(s, f, 4242, sb())).status, 404);
  const off = await status(s, f, created.id, sb()); assert.equal(off.status, 200);
  assert.equal(f.members.get(created.id).fields.status_anggota, 'RESIGN');
  assert.equal((await bodyOf(await status(s, f, created.id, sb({ expectedVersion: (await bodyOf(off)).data.version, status: 'RESIGN' })))).error, 'NO_CHANGE');
  assert.deepEqual(f.writes, ['member.register', 'member.update_profile', 'member.change_status']);
  for (const e of f.audit) assert.ok(!/SYNTH|Rahasia|mengundurkan|N\d{3,}/.test(JSON.stringify(e.detail ?? {}) + e.subjectId), 'no values or reasons in audit');
});

test('permission and identity changes apply on the very next request; legacy re-enabled mid-way refuses with 503 LEGACY_ACTIVE', async () => {
  const s = await signedIn(); const f = fixture();
  assert.equal((await register(s, f, newMember())).status, 201);
  f.state.legacy = 'legacy-active';
  const r = await register(s, f, newMember()); assert.equal(r.status, 503); assert.equal((await bodyOf(r)).error, 'LEGACY_ACTIVE');
  f.state.legacy = 'fenced'; f.state.grants = [];
  assert.equal((await register(s, f, newMember())).status, 403);
  f.state.grants = ['kosipa.member.create']; f.state.linked = false;
  assert.equal((await register(s, f, newMember())).status, 403);
});
