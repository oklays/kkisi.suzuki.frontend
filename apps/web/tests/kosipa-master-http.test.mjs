import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { IDLE_MS } from '@koperasi/domain/auth/session-policy';
import { KosipaError } from '@koperasi/domain/kosipa';
import { planMasterCreate, planMasterStatus, planMasterUpdate } from '@koperasi/domain/kosipa/master';
import { toMasterResult } from '@koperasi/application/kosipa/commands/master';
import { handleLogin } from '../src/infrastructure/auth/handlers/login.ts';
import { handleCreateMaster, handleListMaster, handleMasterStatus, handleUpdateMaster } from '../src/infrastructure/console/kosipa-command-http.ts';
import { kosipaWriteOwnership } from '../src/infrastructure/console/kosipa-ownership.ts';
import { validateKosipaLedgerDatabase, validateKosipaMasterWriteConfig } from '../src/infrastructure/db/prisma-kosipa-master-write.ts';
import { makeWorld, makeRequest, bodyOf, cookieOf } from './helpers/auth-fakes.mjs';

// Security matrix of 08 §6 for the Master Lokasi commands, through the real route handlers, session guard and capability resolver.
// The repository is in memory (DB behaviour is covered by kosipa-foundation-db.test.mjs).

async function signedIn(id = 4, roleId = 4) {
  const world = makeWorld();
  world.addUser({ id, roleId, username: `u${id}` });
  const r = await handleLogin(world.services, makeRequest('/api/auth/login', { method: 'POST', body: { username: `u${id}`, password: 'Pw-Synthetic-1' } }));
  return { world, cookie: cookieOf(r), token: (await bodyOf(r)).csrfToken };
}

function fixture({ grants = ['kosipa.master.manage'], menus = ['master/anggota_c'], linked = true, owns = true, legacy = 'fenced' } = {}) {
  const rows = [{ id: 1, values: { code: 'SYN-TMB', name: 'SYNTH Tambun' }, active: true }];
  const ledger = new Map(); const audit = []; const writes = [];
  const commit = (e, apply) => {
    const k = `${e.actorConsoleUserId}:${e.idempotencyKey}`; const s = ledger.get(k);
    if (s) { if (s.hash !== e.requestHash) throw new KosipaError('IDEMPOTENCY_CONFLICT'); return { result: s.result, replayed: true, ledgerId: s.id }; }
    const result = apply(); writes.push(e.command); ledger.set(k, { id: ledger.size + 1, hash: e.requestHash, result }); return { result, replayed: false, ledgerId: ledger.size };
  };
  const state = { grants, linked, legacy };
  const ports = {
    links: { async activeForConsoleUser() { return state.linked ? { externalUserId: 9102 } : null; } },
    kosipa: { async kosipaUser(id) { return { id, active: true, activeGroups: 1 }; }, async allowedMenuUrls() { return menus; } },
    grants: { async activeCapabilities() { return state.grants; } },
    audit: { async append(e) { audit.push(e); } },
    now: () => new Date(),
    ownership: kosipaWriteOwnership(owns ? { KOSIPA_MASTER_WRITES_ENABLED: 'true', KOSIPA_WRITE_OWNERSHIP: 'master.lokasi' } : { KOSIPA_MASTER_WRITES_ENABLED: 'false', KOSIPA_WRITE_OWNERSHIP: 'master.lokasi' }),
    masters: {
      async list() { return rows; },
      async fenceState() { return state.legacy; },
      async create(d, e, f) { if (state.legacy !== 'fenced') throw new KosipaError('LEGACY_ACTIVE'); return commit(e, () => { const p = planMasterCreate(d, f, rows); const row = { id: rows.length + 1, ...p }; rows.push(row); return toMasterResult(d, row); }); },
      async update(d, e, id, f, v) { return commit(e, () => { const c = planMasterUpdate(d, rows.find((r) => r.id === id) ?? null, f, v, rows, 0); Object.assign(rows.find((r) => r.id === id), c.after); return toMasterResult(d, c.after); }); },
      async setStatus(d, e, id, active, v) { return commit(e, () => { const c = planMasterStatus(d, rows.find((r) => r.id === id) ?? null, active, v); Object.assign(rows.find((r) => r.id === id), c.after); return toMasterResult(d, c.after); }); },
    },
  };
  return { ports, rows, writes, audit, state };
}
const permissions = { async grantedAmong() { return new Set(); } };
const deps = (f, extra = {}) => ({ enabled: true, permissions, ports: f.ports, ...extra });
const post = (path, s, body, o = {}) => makeRequest(path, { method: 'POST', cookie: s.cookie, token: s.token, body, ...o });
const create = (s, f, body, o, d) => handleCreateMaster(s.world.services, post('/api/kosipa/master/lokasi', s, body, o), 'lokasi', d ?? deps(f));
const valid = () => ({ idempotencyKey: randomUUID(), code: 'SYN-CKR', name: 'SYNTH Cikarang' });

test('gate order: flag off 404, anonymous 401, missing/forged CSRF token 403, cross-origin 403, form post 403, services missing 503 — nothing written', async () => {
  const s = await signedIn(); const f = fixture();
  assert.equal((await create(s, f, valid(), {}, deps(f, { enabled: false }))).status, 404);
  assert.equal((await create({ ...s, cookie: undefined }, f, valid())).status, 401);
  assert.equal((await create({ ...s, token: undefined }, f, valid())).status, 403);
  assert.equal((await create({ ...s, token: 'forged' }, f, valid())).status, 403);
  assert.equal((await create(s, f, valid(), { origin: 'https://evil.example' })).status, 403);
  assert.equal((await create(s, f, valid(), { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await create(s, f, 'code=SYN&name=x', { contentType: 'application/x-www-form-urlencoded' })).status, 403);
  assert.equal((await create(s, f, valid(), {}, deps(f, { ports: null }))).status, 503);
  assert.deepEqual(f.writes, []);
});

test('authorization matrix: read-only, unlinked, link with every legacy menu, grant without view -> 403 + denied audit; forged ids never reach the store', async () => {
  const s = await signedIn();
  for (const variant of [{ grants: [] }, { linked: false }, { grants: [], menus: ['master/anggota_c', 'master/lokasi_c', 'pinjaman/pinjaman_c'] }, { menus: ['pinjaman/pinjaman_c'] }]) {
    const f = fixture(variant);
    const r = await create(s, f, valid());
    assert.equal(r.status, 403, JSON.stringify(variant)); assert.deepEqual(await bodyOf(r), { error: 'FORBIDDEN' });
    const u = await handleUpdateMaster(s.world.services, makeRequest('/api/kosipa/master/lokasi/999999', { method: 'PATCH', cookie: s.cookie, token: s.token, body: { idempotencyKey: randomUUID(), code: 'X', name: 'Y', expectedVersion: '0'.repeat(16) } }), 'lokasi', '999999', deps(f));
    assert.equal(u.status, 403, 'unauthorized callers cannot probe whether a record exists');
    assert.deepEqual(f.writes, []);
    assert.ok(f.audit.length >= 1 && f.audit.every((e) => e.action === 'kosipa.command.denied' && e.outcome === 'denied'));
  }
});

test('read-only page data: GET needs member view; returns rows with versions and the manage flag; no CSRF needed for reads', async () => {
  const s = await signedIn();
  const viewer = fixture({ grants: [] });
  const r = await handleListMaster(s.world.services, makeRequest('/api/kosipa/master/lokasi', { cookie: s.cookie }), 'lokasi', deps(viewer));
  const body = await bodyOf(r);
  assert.equal(r.status, 200); assert.equal(body.canManage, false); assert.equal(body.rows[0].values.code, 'SYN-TMB');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const none = fixture({ menus: [] });
  assert.equal((await handleListMaster(s.world.services, makeRequest('/api/kosipa/master/lokasi', { cookie: s.cookie }), 'lokasi', deps(none))).status, 403);
  assert.equal((await handleListMaster(s.world.services, makeRequest('/api/kosipa/master/suku-bunga', { cookie: s.cookie }), 'suku-bunga', deps(viewer))).status, 404, 'masters without native commands do not exist here');
});

test('granted operator: 201 create, 200 replay, 409 key reuse, 400/422 validation, PATCH update, 409 stale, deactivate with reason', async () => {
  const s = await signedIn(); const f = fixture();
  const body = valid();
  const first = await create(s, f, body);
  assert.equal(first.status, 201);
  const created = (await bodyOf(first)).data;
  const replay = await create(s, f, body);
  assert.equal(replay.status, 200); assert.deepEqual(await bodyOf(replay), { success: true, replayed: true, data: created });
  assert.equal((await create(s, f, { ...body, name: 'SYNTH Lain' })).status, 409);
  assert.equal((await bodyOf(await create(s, f, { ...valid(), code: '' }))).error, 'MASTER_CODE_INVALID');
  assert.equal((await create(s, f, { ...valid(), code: 'syn-tmb' })).status, 422);
  assert.equal((await bodyOf(await create(s, f, { ...valid(), status: 0 }))).error, 'FIELD_NOT_ALLOWED');
  assert.equal((await create(s, f, '{not json')).status, 400);
  const patch = (b) => handleUpdateMaster(s.world.services, makeRequest(`/api/kosipa/master/lokasi/${created.id}`, { method: 'PATCH', cookie: s.cookie, token: s.token, body: b }), 'lokasi', String(created.id), deps(f));
  const updated = await patch({ idempotencyKey: randomUUID(), code: 'SYN-CKR2', name: created.values.name, expectedVersion: created.version });
  assert.equal(updated.status, 200);
  assert.equal((await bodyOf(await patch({ idempotencyKey: randomUUID(), code: 'SYN-CKR3', name: created.values.name, expectedVersion: created.version }))).error, 'STALE');
  const v = (await bodyOf(updated)).data.version;
  const status = (action, b) => handleMasterStatus(s.world.services, post(`/api/kosipa/master/lokasi/${created.id}/${action}`, s, b), 'lokasi', String(created.id), action, deps(f));
  assert.equal((await status('deactivate', { idempotencyKey: randomUUID(), expectedVersion: v, reason: 'x' })).status, 400);
  assert.equal((await status('delete', { idempotencyKey: randomUUID(), expectedVersion: v, reason: 'hapus permanen' })).status, 404, 'no hard delete route');
  const off = await status('deactivate', { idempotencyKey: randomUUID(), expectedVersion: v, reason: 'lokasi ditutup' });
  assert.equal(off.status, 200); assert.equal((await bodyOf(off)).data.active, false);
  assert.deepEqual(f.writes, ['master.lokasi.create', 'master.lokasi.update', 'master.lokasi.deactivate']);
  for (const e of f.audit) assert.ok(!/SYNTH Cikarang|lokasi ditutup/.test(JSON.stringify(e.detail ?? {})), 'no record values or reasons in audit detail');
});

test('permission and identity changes apply on the very next request; expired sessions are refused (SEC-108)', async () => {
  const s = await signedIn(); const f = fixture();
  assert.equal((await create(s, f, valid())).status, 201);
  f.state.grants = [];                                                    // grant revoked
  assert.equal((await create(s, f, { ...valid(), code: 'SYN-B', name: 'SYNTH B' })).status, 403);
  f.state.grants = ['kosipa.master.manage']; f.state.linked = false;      // identity link revoked
  assert.equal((await create(s, f, { ...valid(), code: 'SYN-C', name: 'SYNTH C' })).status, 403);
  f.state.linked = true;
  s.world.clock.advance(IDLE_MS + 1000);                                 // idle session
  assert.equal((await create(s, f, { ...valid(), code: 'SYN-D', name: 'SYNTH D' })).status, 401);
  assert.deepEqual(f.writes, ['master.lokasi.create']);
});

test('kill switch: flag off -> 503 WRITE_DISABLED on the next request, before any write or audit', async () => {
  const s = await signedIn(); const f = fixture({ owns: false });
  const r = await create(s, f, valid());
  assert.equal(r.status, 503); assert.deepEqual(await bodyOf(r), { error: 'WRITE_DISABLED' });
  assert.deepEqual(f.writes, []); assert.deepEqual(f.audit, []);
  const listed = await bodyOf(await handleListMaster(s.world.services, makeRequest('/api/kosipa/master/lokasi', { cookie: s.cookie }), 'lokasi', deps(f)));
  assert.equal(listed.writable, false, 'the page hides actions while the feature is not owned');
});

test('legacy controller re-enabled: 503 LEGACY_ACTIVE for commands, and the page data says read-only', async () => {
  const s = await signedIn(); const f = fixture({ legacy: 'legacy-active' });
  const r = await create(s, f, valid());
  assert.equal(r.status, 503); assert.deepEqual(await bodyOf(r), { error: 'LEGACY_ACTIVE' });
  const listed = await bodyOf(await handleListMaster(s.world.services, makeRequest('/api/kosipa/master/lokasi', { cookie: s.cookie }), 'lokasi', deps(f)));
  assert.equal(listed.writable, false); assert.equal(listed.legacy, 'legacy-active');
  assert.ok(f.audit.some((e) => e.action === 'kosipa.command.failed' && e.detail?.code === 'LEGACY_ACTIVE'), 'the refusal is audited');
});

test('ownership needs the feature flag AND the ownership list; unknown features never write', () => {
  const owns = (env, f = 'master.lokasi') => kosipaWriteOwnership(env).owns(f);
  assert.equal(owns({ KOSIPA_MASTER_WRITES_ENABLED: 'true', KOSIPA_WRITE_OWNERSHIP: 'master.lokasi' }), true);
  assert.equal(owns({ KOSIPA_MASTER_WRITES_ENABLED: 'true' }), false);
  assert.equal(owns({ KOSIPA_MASTER_WRITES_ENABLED: '1', KOSIPA_WRITE_OWNERSHIP: 'master.lokasi' }), false);
  assert.equal(owns({ KOSIPA_MASTER_WRITES_ENABLED: 'true', KOSIPA_WRITE_OWNERSHIP: 'master.lokasi,loan.disburse' }, 'loan.disburse'), false);
  assert.equal(owns({ KOSIPA_MASTER_WRITES_ENABLED: 'true', KOSIPA_WRITE_OWNERSHIP: '__proto__' }, '__proto__'), false);
  assert.equal(owns({ KOSIPA_MASTER_WRITES_ENABLED: 'true', KOSIPA_WRITE_OWNERSHIP: 'master.lokasi' }, 'master.bagian'), false, 'ownership is per master');
  assert.equal(owns({ KOSIPA_MASTER_WRITES_ENABLED: 'true', KOSIPA_WRITE_OWNERSHIP: 'master.rekening_bank' }, 'master.rekening_bank'), true);
});

test('writer guard: only the isolated FA-01 synthetic database; never staging, DEV LOCAL, production, root or a shared account', () => {
  const ok = 'mysql://kosipa_master_w:pw@127.0.0.1:3322/kkisi_kfa_synthetic?connection_limit=2';
  const base = { KOSIPA_MASTER_WRITES_ENABLED: 'true', DATABASE_URL_KOSIPA_MASTER_WRITE: ok, DATABASE_URL: 'mysql://kfa_read:pw@127.0.0.1:3322/kkisi_kfa_synthetic' };
  assert.equal(validateKosipaMasterWriteConfig(base), ok);
  const refused = [
    { KOSIPA_MASTER_WRITES_ENABLED: 'false' },
    { DATABASE_URL_KOSIPA_MASTER_WRITE: 'mysql://kosipa_master_w:pw@127.0.0.1:3307/kkisi_staging?connection_limit=2' },
    { DATABASE_URL_KOSIPA_MASTER_WRITE: 'mysql://kosipa_master_w:pw@127.0.0.1:3307/kkisi_devlocal_staging?connection_limit=2' },
    { DATABASE_URL_KOSIPA_MASTER_WRITE: 'mysql://kosipa_master_w:pw@db.example.com:3322/kkisi_kfa_synthetic?connection_limit=2' },
    { DATABASE_URL_KOSIPA_MASTER_WRITE: 'mysql://root:pw@127.0.0.1:3322/kkisi_kfa_synthetic?connection_limit=2' },
    { DATABASE_URL_KOSIPA_MASTER_WRITE: 'mysql://kosipa_master_w:pw@127.0.0.1:3322/kkisi_kfa_synthetic?connection_limit=5' },
    { DATABASE_URL_KOSIPA_MASTER_WRITE: 'mysql://kosipa_master_w@127.0.0.1:3322/kkisi_kfa_synthetic?connection_limit=2' },
    { DATABASE_URL: 'mysql://kosipa_master_w:pw@127.0.0.1:3322/kkisi_kfa_synthetic' },
    { APP_ENV: 'production' },
    { APP_ENV: 'staging-typo' },
  ];
  for (const change of refused) assert.throws(() => validateKosipaMasterWriteConfig({ ...base, ...change }), { code: 'WRITE_NOT_CONFIGURED' }, JSON.stringify(change));
  // FD-01b: the ledger database is mandatory, allow-listed, and never the business database itself.
  assert.equal(validateKosipaLedgerDatabase({ ...base, KOSIPA_LEDGER_DATABASE: 'kkisi_kfa_ledger' }), 'kkisi_kfa_ledger');
  for (const ledger of [undefined, '', 'kkisi_kfa_synthetic', 'kkisi_staging', 'kkisi_kfa_ledger`; DROP', 'smart_kopkar']) {
    assert.throws(() => validateKosipaLedgerDatabase({ ...base, KOSIPA_LEDGER_DATABASE: ledger }), { code: 'WRITE_NOT_CONFIGURED' }, String(ledger));
  }
});
