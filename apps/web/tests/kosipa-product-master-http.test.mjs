import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { KosipaError } from '@koperasi/domain/kosipa';
import { PRODUCT_MASTER_DEFINITIONS, planProductCreate, planProductStatus, planProductUpdate } from '@koperasi/domain/kosipa/product-master';
import { productVersion } from '@koperasi/domain/kosipa/product-master-version';
import { handleLogin } from '../src/infrastructure/auth/handlers/login.ts';
import { handleCreateMaster, handleListMaster, handleMasterStatus, handleUpdateMaster } from '../src/infrastructure/console/kosipa-command-http.ts';
import { kosipaWriteOwnership } from '../src/infrastructure/console/kosipa-ownership.ts';
import { makeWorld, makeRequest, bodyOf, cookieOf } from './helpers/auth-fakes.mjs';

// HTTP matrix for the product masters (FA-03B T06) through the real route handlers; in-memory repository using the REAL domain planners.
async function signedIn() {
  const world = makeWorld(); world.addUser({ id: 4, roleId: 4, username: 'u4' });
  const r = await handleLogin(world.services, makeRequest('/api/auth/login', { method: 'POST', body: { username: 'u4', password: 'Pw-Synthetic-1' } }));
  return { world, cookie: cookieOf(r), token: (await bodyOf(r)).csrfToken };
}
const facts = { coa: [{ code: '1-1300', desc: 'Piutang', group: false }, { code: '2-1100', desc: 'Simpanan Pokok', group: false }], financing: [{ code: 'PB-REG', active: true }] };
const version = (r) => productVersion({ id: r.id, columns: { ...r.values, active: r.active ? '1' : '0' } });
function fixture({ grants = ['kosipa.master.manage'], owns = true, legacy = 'fenced' } = {}) {
  const rows = []; const ledger = new Map(); const audit = []; const writes = []; const state = { grants, legacy };
  const commit = (e, apply) => {
    const k = `${e.actorConsoleUserId}:${e.idempotencyKey}`; const s = ledger.get(k);
    if (s) { if (s.hash !== e.requestHash) throw new KosipaError('IDEMPOTENCY_CONFLICT'); return { result: s.result, replayed: true, ledgerId: s.id }; }
    if (state.legacy !== 'fenced') throw new KosipaError('LEGACY_ACTIVE');
    const result = apply(); writes.push(e.command); ledger.set(k, { id: ledger.size + 1, hash: e.requestHash, result }); return { result, replayed: false, ledgerId: ledger.size };
  };
  const out = (r) => ({ ...r, version: version(r) });
  const locked = (id, v) => { const r = rows.find((x) => x.id === id); if (r && version(r) !== v) throw new KosipaError('STALE'); return r ?? null; };
  const ports = {
    links: { async activeForConsoleUser() { return { externalUserId: 9102 }; } },
    kosipa: { async kosipaUser(id) { return { id, active: true, activeGroups: 1 }; }, async allowedMenuUrls() { return ['master/anggota_c']; } },
    grants: { async activeCapabilities() { return state.grants; } }, audit: { async append(e) { audit.push(e); } }, now: () => new Date(),
    ownership: kosipaWriteOwnership(owns ? { KOSIPA_MASTER_WRITES_ENABLED: 'true', KOSIPA_WRITE_OWNERSHIP: 'master.jenis_pembiayaan' } : {}),
    masters: {}, members: {},
    products: {
      async list() { return { rows: rows.map(out), facts: { ...facts, parents: [] } }; }, async fenceState() { return state.legacy; },
      async create(d, e, v) { return commit(e, () => { const p = planProductCreate(d, v, rows, facts); const r = { id: rows.length + 1, ...p }; rows.push(r); return out(r); }); },
      async update(d, e, id, v, ver, reason) { return commit(e, () => { const c = planProductUpdate(d, locked(id, ver), v, reason, rows, facts, 0); Object.assign(rows.find((x) => x.id === id), c.after); return out(c.after); }); },
      async setStatus(d, e, id, active, ver) { return commit(e, () => { const c = planProductStatus(d, locked(id, ver), active); Object.assign(rows.find((x) => x.id === id), c.after); return out(c.after); }); },
    },
  };
  return { ports, rows, writes, audit, state };
}
const permissions = { async grantedAmong() { return new Set(); } };
const deps = (f, extra = {}) => ({ enabled: true, permissions, ports: f.ports, ...extra });
const T = 'jenis-pembiayaan';
const values = (extra = {}) => ({ pembiayaan_code: 'PB-NEW', pembiayaan_name: 'Pembiayaan Baru', pembiayaan_remarks: '', jenis_bunga: 'Flat', biaya_asuransi: '0', biaya_jasa: '1.25', biaya_admin: '10000', biaya_bunga: '1', biaya_pinalty: '0', tgl_tempo: '25', akun_code: '1-1300', lock_1angsuran: '0', ...extra });
const post = (s, path, body, o = {}) => makeRequest(path, { method: 'POST', cookie: s.cookie, token: s.token, body, ...o });
const create = (s, f, body, d) => handleCreateMaster(s.world.services, post(s, `/api/kosipa/master/${T}`, body), T, d ?? deps(f));
const patch = (s, f, id, body) => handleUpdateMaster(s.world.services, makeRequest(`/api/kosipa/master/${T}/${id}`, { method: 'PATCH', cookie: s.cookie, token: s.token, body }), T, String(id), deps(f));
const status = (s, f, id, action, body) => handleMasterStatus(s.world.services, post(s, `/api/kosipa/master/${T}/${id}/${action}`, body), T, String(id), action, deps(f));

test('gates: CSRF, ownership, the master-manage grant; retired masters (FD-33) do not exist; list needs member view only', async () => {
  const s = await signedIn();
  assert.equal((await create({ ...s, token: undefined }, fixture(), { idempotencyKey: randomUUID(), values: values() })).status, 403);
  const off = await create(s, fixture({ owns: false }), { idempotencyKey: randomUUID(), values: values() });
  assert.equal(off.status, 503); assert.equal((await bodyOf(off)).error, 'WRITE_DISABLED');
  assert.equal((await create(s, fixture({ grants: [] }), { idempotencyKey: randomUUID(), values: values() })).status, 403);
  for (const retired of ['divisi', 'jabatan', 'master-surat', 'cabang', 'daftar-pajak', 'mata-uang', 'kategori-beban', 'jenis-pembayaran'])
    assert.equal((await handleListMaster(s.world.services, makeRequest(`/api/kosipa/master/${retired}`, { cookie: s.cookie }), retired, deps(fixture()))).status, 404, retired);
  const viewer = fixture({ grants: [] });
  const list = await handleListMaster(s.world.services, makeRequest(`/api/kosipa/master/${T}`, { cookie: s.cookie }), T, deps(viewer));
  const body = await bodyOf(list);
  assert.equal(list.status, 200); assert.equal(body.canManage, false); assert.deepEqual(body.facts.coa.map((c) => c.code), ['1-1300', '2-1100']);
});

test('create 201 / replay 200 / key reuse 409; a field error names the field; FD-32 reason on financial PATCH; status with reason; no values in audit', async () => {
  const s = await signedIn(); const f = fixture();
  const b = { idempotencyKey: randomUUID(), values: values() };
  const first = await create(s, f, b); assert.equal(first.status, 201);
  const created = (await bodyOf(first)).data;
  assert.equal(created.values.akun_desc, 'Piutang', 'description derived on the server');
  assert.equal((await create(s, f, b)).status, 200);
  assert.equal((await create(s, f, { ...b, values: values({ biaya_admin: '1' }) })).status, 409);
  const bad = await create(s, f, { idempotencyKey: randomUUID(), values: values({ pembiayaan_code: 'PB-X', biaya_jasa: '1.23456' }) });
  assert.equal(bad.status, 400); assert.deepEqual(await bodyOf(bad), { error: 'PRODUCT_FIELD_INVALID', field: 'biaya_jasa' });
  const coa = await create(s, f, { idempotencyKey: randomUUID(), values: values({ pembiayaan_code: 'PB-X', akun_code: '7-0000' }) });
  assert.equal(coa.status, 422); assert.deepEqual(await bodyOf(coa), { error: 'PRODUCT_COA_INVALID', field: 'akun_code' });
  assert.equal((await bodyOf(await create(s, f, { idempotencyKey: randomUUID(), values: { ...values({ pembiayaan_code: 'PB-Y' }), akun_desc: 'forged' } }))).error, 'FIELD_NOT_ALLOWED');
  const noReason = await patch(s, f, created.id, { idempotencyKey: randomUUID(), values: values({ biaya_jasa: '2' }), expectedVersion: created.version });
  assert.equal(noReason.status, 400); assert.equal((await bodyOf(noReason)).error, 'REASON_INVALID');
  const okFin = await patch(s, f, created.id, { idempotencyKey: randomUUID(), values: values({ biaya_jasa: '2' }), expectedVersion: created.version, reason: 'Tarif baru per rapat' });
  assert.equal(okFin.status, 200);
  const v = (await bodyOf(okFin)).data.version;
  assert.equal((await bodyOf(await patch(s, f, created.id, { idempotencyKey: randomUUID(), values: values({ pembiayaan_name: 'X' }), expectedVersion: created.version }))).error, 'STALE');
  assert.equal((await status(s, f, created.id, 'deactivate', { idempotencyKey: randomUUID(), expectedVersion: v })).status, 400);
  const off = await status(s, f, created.id, 'deactivate', { idempotencyKey: randomUUID(), expectedVersion: v, reason: 'Produk dihentikan' });
  assert.equal(off.status, 200); assert.equal((await bodyOf(off)).data.active, false);
  assert.equal((await status(s, f, created.id, 'delete', { idempotencyKey: randomUUID(), expectedVersion: v, reason: 'hapus permanen' })).status, 404, 'no hard delete');
  assert.deepEqual(f.writes, ['master.jenis_pembiayaan.create', 'master.jenis_pembiayaan.update', 'master.jenis_pembiayaan.deactivate']);
  for (const e of f.audit) assert.ok(!/Pembiayaan Baru|Tarif baru|dihentikan|10000/.test(JSON.stringify(e.detail ?? {})), 'no record values or reasons in audit');
});

test('legacy controller re-enabled: 503 LEGACY_ACTIVE and the list reports writable=false', async () => {
  const s = await signedIn(); const f = fixture({ legacy: 'legacy-active' });
  const r = await create(s, f, { idempotencyKey: randomUUID(), values: values() });
  assert.equal(r.status, 503); assert.equal((await bodyOf(r)).error, 'LEGACY_ACTIVE');
  assert.equal((await bodyOf(await handleListMaster(s.world.services, makeRequest(`/api/kosipa/master/${T}`, { cookie: s.cookie }), T, deps(f)))).writable, false);
  void PRODUCT_MASTER_DEFINITIONS;
});
