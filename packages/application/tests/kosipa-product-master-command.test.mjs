import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductMaster, updateProductMaster, setProductMasterStatus, listProductMaster } from '../src/kosipa/commands/product-master.ts';
import { KosipaError } from '../../domain/src/kosipa/errors.ts';

const KEY = (n = 1) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const V = 'b'.repeat(64);
const manager = { userId: 7, kosipaUserId: 70, capabilities: new Set(['kosipa.member.view', 'kosipa.master.manage']), requestId: 'req-1' };
const values = () => ({ code_suku_bunga: 'TT', desc_suku_bunga: 'Tanggal jatuh tempo', field: 'tgl_tempo', nilai_persen: '25', remarks_suku_bunga: '' });
function world(owns = true) {
  const calls = [], events = [], ledger = new Map();
  const commit = async (method, envelope, ...args) => {
    calls.push({ method, envelope, args });
    const k = `${envelope.actorConsoleUserId}:${envelope.idempotencyKey}`; const s = ledger.get(k);
    if (s) { if (s.hash !== envelope.requestHash) throw new KosipaError('IDEMPOTENCY_CONFLICT'); return { result: s.result, replayed: true, ledgerId: s.id }; }
    const result = { id: 5, values: {}, active: true, version: V }; ledger.set(k, { hash: envelope.requestHash, result, id: ledger.size + 1 }); return { result, replayed: false, ledgerId: ledger.size };
  };
  const ports = { ownership: { owns: (f) => owns && f === 'master.suku_bunga' }, audit: { async append(e) { events.push(e); } }, now: () => new Date(),
    products: { create: (d, e, v) => commit('create', e, d.key, v), update: (d, e, ...a) => commit('update', e, d.key, ...a), setStatus: (d, e, ...a) => commit('status', e, d.key, ...a),
      async list() { return { rows: [], facts: { coa: [], financing: [], parents: [] } }; }, async fenceState() { return 'fenced'; } } };
  return { ports, calls, events };
}

test('ownership, capability and view gates run before parsing; feature is master.<key>', async () => {
  await assert.rejects(createProductMaster(world(false).ports, manager, 'suku-bunga', null), { code: 'WRITE_DISABLED' });
  for (const actor of [{ ...manager, capabilities: new Set(['kosipa.member.view']) }, { ...manager, kosipaUserId: null }, { ...manager, capabilities: new Set(['kosipa.master.manage']) }]) {
    const w = world(); await assert.rejects(createProductMaster(w.ports, actor, 'suku-bunga', null), { code: 'FORBIDDEN' }); assert.equal(w.calls.length, 0);
  }
  await assert.rejects(createProductMaster(world().ports, manager, 'divisi', {}), { code: 'MASTER_TYPE_UNKNOWN' }, 'retired masters (FD-33) have no command');
});

test('create/update/status bodies are exact; reason optional on update (required later by the planner for financial changes), mandatory on status', async () => {
  const w = world();
  const c = await createProductMaster(w.ports, manager, 'suku-bunga', { idempotencyKey: KEY(1), values: values() });
  assert.equal(c.replayed, false); assert.equal(w.calls[0].envelope.command, 'master.suku_bunga.create'); assert.equal(w.calls[0].envelope.capability, 'kosipa.master.manage');
  assert.deepEqual(w.calls[0].args[1], values());
  for (const [body, code] of [[{ idempotencyKey: KEY(2), values: values(), extra: 1 }, 'FIELD_NOT_ALLOWED'], [{ idempotencyKey: KEY(2), values: { ...values(), is_active: '1' } }, 'FIELD_NOT_ALLOWED'], [{ idempotencyKey: KEY(2) }, 'INVALID_INPUT']])
    await assert.rejects(createProductMaster(w.ports, manager, 'suku-bunga', body), (e) => e.code === code, code);
  await updateProductMaster(w.ports, manager, 'suku-bunga', '5', { idempotencyKey: KEY(3), values: values(), expectedVersion: V });
  assert.equal(w.calls.at(-1).args[4], undefined, 'no reason supplied');
  await updateProductMaster(w.ports, manager, 'suku-bunga', '5', { idempotencyKey: KEY(4), values: values(), expectedVersion: V, reason: 'Penyesuaian tanggal' });
  assert.equal(w.calls.at(-1).args[4], 'Penyesuaian tanggal');
  await assert.rejects(updateProductMaster(w.ports, manager, 'suku-bunga', '5', { idempotencyKey: KEY(5), values: values(), expectedVersion: 'a'.repeat(16) }), { code: 'VERSION_INVALID' });
  await assert.rejects(updateProductMaster(w.ports, manager, 'suku-bunga', '5', { idempotencyKey: KEY(5), values: values(), expectedVersion: V, reason: 'x' }), { code: 'REASON_INVALID' });
  await assert.rejects(updateProductMaster(w.ports, manager, 'suku-bunga', 'abc', { idempotencyKey: KEY(5), values: values(), expectedVersion: V }), { code: 'MASTER_ID_INVALID' });
  await assert.rejects(setProductMasterStatus(w.ports, manager, 'suku-bunga', '5', { idempotencyKey: KEY(6), expectedVersion: V }, false), { code: 'REASON_INVALID' });
  await setProductMasterStatus(w.ports, manager, 'suku-bunga', '5', { idempotencyKey: KEY(7), expectedVersion: V, reason: 'Tidak dipakai' }, false);
  assert.equal(w.calls.at(-1).envelope.command, 'master.suku_bunga.deactivate');
  assert.deepEqual(w.events.map((e) => e.action).filter((a) => a !== 'kosipa.command.failed'), ['kosipa.master.create', 'kosipa.master.update', 'kosipa.master.update', 'kosipa.master.deactivate']);
  assert.ok(!JSON.stringify(w.events).includes('Penyesuaian'), 'reasons never reach the console audit');
});

test('list needs member view; writable needs ownership and the fence', async () => {
  const data = await listProductMaster(world().ports, manager, 'suku-bunga');
  assert.equal(data.canManage, true); assert.equal(data.writable, true); assert.equal(data.legacy, 'fenced');
  assert.equal((await listProductMaster(world(false).ports, manager, 'suku-bunga')).writable, false);
  await assert.rejects(listProductMaster(world().ports, { capabilities: new Set(), kosipaUserId: 1 }, 'suku-bunga'), { code: 'FORBIDDEN' });
});
