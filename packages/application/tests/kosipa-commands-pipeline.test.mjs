import assert from 'node:assert/strict';
import test from 'node:test';
import { KosipaError } from '@koperasi/domain/kosipa';
import { planMasterCreate, planMasterStatus, planMasterUpdate } from '@koperasi/domain/kosipa/master';
import { createMaster, listMaster, setMasterStatus, updateMaster, toMasterResult } from '../src/kosipa/commands/master.ts';

// The FA-01 tests drive Master Lokasi through the generic master commands; the definition-specific rules are domain-tested.
const createLocation = (ports, actor, body) => createMaster(ports, actor, 'lokasi', body);
const updateLocation = (ports, actor, id, body) => updateMaster(ports, actor, 'lokasi', id, body);
const setLocationStatus = (ports, actor, id, body, active) => setMasterStatus(ports, actor, 'lokasi', id, body, active);
const listLocations = (ports, actor) => listMaster(ports, actor, 'lokasi');

const KEY = (n = 1) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const manager = { userId: 7, kosipaUserId: 70, capabilities: new Set(['kosipa.member.view', 'kosipa.master.manage']), requestId: 'req-1' };

/** In-memory repository with the same contract as the writer: domain re-check, ledger keyed by (actor, key), replay on same hash. */
function world({ owns = true, legacy = 'fenced' } = {}) {
  const rows = [{ id: 1, values: { code: 'TMB1', name: 'Tambun I' }, active: true }];
  const ledger = new Map(); const audit = []; const calls = [];
  const commit = (envelope, apply) => {
    const k = `${envelope.actorConsoleUserId}:${envelope.idempotencyKey}`;
    const stored = ledger.get(k);
    if (stored) { if (stored.hash !== envelope.requestHash || stored.command !== envelope.command) throw new KosipaError('IDEMPOTENCY_CONFLICT'); return { result: stored.result, replayed: true, ledgerId: stored.id }; }
    const result = apply();
    ledger.set(k, { id: ledger.size + 1, hash: envelope.requestHash, command: envelope.command, result, envelope });
    return { result, replayed: false, ledgerId: ledger.size };
  };
  const find = (id) => rows.find((r) => r.id === id) ?? null;
  const masters = {
    async list() { return rows.map((r) => ({ ...r })); },
    async fenceState() { return legacy; },
    async create(def, envelope, values) { calls.push('create'); return commit(envelope, () => { const p = planMasterCreate(def, values, rows); const row = { id: rows.length + 1, ...p }; rows.push(row); return toMasterResult(def, row); }); },
    async update(def, envelope, id, values, version) { calls.push('update'); return commit(envelope, () => { const c = planMasterUpdate(def, find(id), values, version, rows, 0); Object.assign(find(id), c.after); return toMasterResult(def, c.after); }); },
    async setStatus(def, envelope, id, active, version) { calls.push('status'); return commit(envelope, () => { const c = planMasterStatus(def, find(id), active, version); Object.assign(find(id), c.after); return toMasterResult(def, c.after); }); },
  };
  const ports = { ownership: { owns: (f) => owns && f === 'master.lokasi' }, audit: { async append(e) { audit.push(e); } }, now: () => new Date('2026-10-30T03:00:00Z'), masters };
  return { ports, rows, ledger, audit, calls };
}
const trail = (w) => w.audit.map((e) => `${e.action}:${e.outcome}:${e.detail?.code ?? ''}`);

test('flag/ownership off: 503-class WRITE_DISABLED before authorization, parsing, audit or any write', async () => {
  const w = world({ owns: false });
  await assert.rejects(createLocation(w.ports, manager, { idempotencyKey: KEY(), code: 'A', name: 'B' }), { code: 'WRITE_DISABLED' });
  assert.deepEqual(w.calls, []); assert.deepEqual(w.audit, []);
});

test('authorization: capability, its view capability AND a live KOSIPA identity are all required; refusals are audited, nothing written', async () => {
  const cases = [
    { ...manager, capabilities: new Set(['kosipa.member.view']) },                              // read-only user
    { ...manager, capabilities: new Set(['kosipa.master.manage']) },                            // grant left without view
    { ...manager, kosipaUserId: null },                                                          // no active KOSIPA identity
    { ...manager, capabilities: new Set(['kosipa.member.view', 'iam.link.manage', 'iam.kosipa.grant', 'toko.products.edit']) }, // escalation via admin caps
  ];
  for (const actor of cases) {
    const w = world();
    await assert.rejects(createLocation(w.ports, actor, { idempotencyKey: KEY(), code: 'A', name: 'B' }), { code: 'FORBIDDEN' });
    await assert.rejects(updateLocation(w.ports, actor, '999', { idempotencyKey: KEY(2), code: 'A', name: 'B', expectedVersion: '0'.repeat(16) }), { code: 'FORBIDDEN' }, 'no NOT_FOUND leak for a forged id');
    assert.deepEqual(w.calls, []);
    assert.deepEqual(trail(w), ['kosipa.command.denied:denied:FORBIDDEN', 'kosipa.command.denied:denied:FORBIDDEN']);
  }
});

test('validation: body shape, key, fields, forged fields and route ids are refused before the repository; failures audited', async () => {
  const w = world();
  const bad = [
    [() => createLocation(w.ports, manager, null), 'INVALID_INPUT'],
    [() => createLocation(w.ports, manager, [KEY()]), 'INVALID_INPUT'],
    [() => createLocation(w.ports, manager, { code: 'A', name: 'B' }), 'IDEMPOTENCY_KEY_INVALID'],
    [() => createLocation(w.ports, manager, { idempotencyKey: KEY(), code: '', name: 'B' }), 'MASTER_CODE_INVALID'],
    [() => createLocation(w.ports, manager, { idempotencyKey: KEY(), code: 'A', name: 'B', status: 0 }), 'FIELD_NOT_ALLOWED'],
    [() => createLocation(w.ports, manager, { idempotencyKey: KEY(), code: 'A', name: 'B', id: 1 }), 'FIELD_NOT_ALLOWED'],
    [() => updateLocation(w.ports, manager, '1 OR 1=1', { idempotencyKey: KEY(), code: 'A', name: 'B', expectedVersion: '0'.repeat(16) }), 'MASTER_ID_INVALID'],
    [() => updateLocation(w.ports, manager, '1', { idempotencyKey: KEY(), code: 'A', name: 'B' }), 'VERSION_INVALID'],
    [() => setLocationStatus(w.ports, manager, '1', { idempotencyKey: KEY(), expectedVersion: '0'.repeat(16), reason: 'x' }, false), 'REASON_INVALID'],
  ];
  for (const [call, code] of bad) await assert.rejects(call(), { code });
  assert.deepEqual(w.calls, []);
  assert.ok(w.audit.every((e) => e.action === 'kosipa.command.failed' && e.outcome === 'failed'));
  assert.equal(w.audit.length, bad.length);
});

test('create -> update -> deactivate -> reactivate; one success event per committed command, ledger carries actor ids', async () => {
  const w = world();
  const created = await createLocation(w.ports, manager, { idempotencyKey: KEY(1), code: 'CKR', name: 'Cikarang' });
  assert.equal(created.replayed, false); assert.equal(created.result.values.code, 'CKR'); assert.equal(created.result.active, true);
  const updated = await updateLocation(w.ports, manager, String(created.result.id), { idempotencyKey: KEY(2), code: 'CKR-1', name: 'Cikarang', expectedVersion: created.result.version });
  const off = await setLocationStatus(w.ports, manager, String(created.result.id), { idempotencyKey: KEY(3), expectedVersion: updated.result.version, reason: 'lokasi ditutup' }, false);
  assert.equal(off.result.active, false);
  const on = await setLocationStatus(w.ports, manager, String(created.result.id), { idempotencyKey: KEY(4), expectedVersion: off.result.version, reason: 'dibuka kembali' }, true);
  assert.equal(on.result.active, true);
  assert.deepEqual(trail(w), ['kosipa.master.create:success:', 'kosipa.master.update:success:', 'kosipa.master.deactivate:success:', 'kosipa.master.reactivate:success:']);
  const env = [...w.ledger.values()].map((l) => l.envelope);
  assert.ok(env.every((e) => e.actorConsoleUserId === 7 && e.actorKosipaUserId === 70 && e.requestId === 'req-1' && /^[0-9a-f]{64}$/.test(e.requestHash)));
  assert.deepEqual(env.map((e) => `${e.command}@${e.subjectType}:${e.subjectRef}`), ['master.lokasi.create@master.lokasi:new', `master.lokasi.update@master.lokasi:${created.result.id}`, `master.lokasi.deactivate@master.lokasi:${created.result.id}`, `master.lokasi.reactivate@master.lokasi:${created.result.id}`]);
  for (const e of w.audit) assert.ok(!JSON.stringify(e.detail).includes('Cikarang'), 'audit detail carries ids/codes, never the record values');
});

test('retry with the same key replays the first result without a second effect or audit event; another payload conflicts', async () => {
  const w = world();
  const body = { idempotencyKey: KEY(9), code: 'CKR', name: 'Cikarang' };
  const first = await createLocation(w.ports, manager, body);
  const again = await createLocation(w.ports, manager, { name: 'Cikarang', code: 'CKR', idempotencyKey: KEY(9).toUpperCase() });
  assert.deepEqual(again, { ...first, replayed: true });
  assert.equal(w.rows.length, 2);
  await assert.rejects(createLocation(w.ports, manager, { ...body, name: 'Cikarang Baru' }), { code: 'IDEMPOTENCY_CONFLICT' });
  assert.deepEqual(trail(w), ['kosipa.master.create:success:', 'kosipa.command.failed:failed:IDEMPOTENCY_CONFLICT']);
});

test('domain refusals and infrastructure failures are audited as failed and rethrown; a lost audit event never fails a commit', async () => {
  const w = world();
  await assert.rejects(createLocation(w.ports, manager, { idempotencyKey: KEY(1), code: 'tmb1', name: 'Lain' }), { code: 'MASTER_CODE_DUPLICATE' });
  await assert.rejects(updateLocation(w.ports, manager, '1', { idempotencyKey: KEY(2), code: 'X', name: 'Tambun I', expectedVersion: 'ffffffffffffffff' }), { code: 'STALE' });
  w.ports.masters.create = async () => { throw new Error('ECONNRESET'); };
  await assert.rejects(createLocation(w.ports, manager, { idempotencyKey: KEY(3), code: 'Z', name: 'Z' }), /ECONNRESET/);
  assert.deepEqual(trail(w), ['kosipa.command.failed:failed:MASTER_CODE_DUPLICATE', 'kosipa.command.failed:failed:STALE', 'kosipa.command.failed:failed:UNAVAILABLE']);
  const quiet = world(); const logged = [];
  quiet.ports.audit.append = async () => { throw new Error('console store down'); };
  quiet.ports.log = (event) => logged.push(event);
  const ok = await createLocation(quiet.ports, manager, { idempotencyKey: KEY(4), code: 'Q', name: 'Q' });
  assert.equal(ok.replayed, false); assert.deepEqual(logged, ['kosipa_audit_append_failed']);
});

test('list: member view required; canManage reflects the write gate, writable the ownership flag', async () => {
  const w = world();
  await assert.rejects(listLocations(w.ports, { capabilities: new Set(), kosipaUserId: 70 }), { code: 'FORBIDDEN' });
  const viewer = await listLocations(w.ports, { capabilities: new Set(['kosipa.member.view']), kosipaUserId: 70 });
  assert.equal(viewer.canManage, false); assert.equal(viewer.writable, true); assert.match(viewer.rows[0].version, /^[0-9a-f]{16}$/);
  assert.equal((await listLocations(w.ports, manager)).canManage, true);
  assert.equal((await listLocations(world({ owns: false }).ports, manager)).writable, false);
  const reopened = await listLocations(world({ legacy: 'legacy-active' }).ports, manager);
  assert.equal(reopened.writable, false, 'a legacy controller switched back on makes the page read-only');
  assert.equal(reopened.legacy, 'legacy-active');
  await assert.rejects(listMaster(world().ports, manager, 'jenis_pinjaman'), { code: 'MASTER_TYPE_UNKNOWN' });
});
