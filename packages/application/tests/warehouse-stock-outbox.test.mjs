import assert from 'node:assert/strict';
import test from 'node:test';
import { WarehouseError } from '@koperasi/domain/warehouse';
import { proposeItemMapping, confirmItemMapping, registerDispatch, advanceDispatch, receiveShipment, enqueueStockIntents, drainStockOutbox } from '../src/warehouse/index.ts';
import { makeWarehouseWorld, actor, PERM } from './helpers/warehouse-fakes.mjs';
import { makeOutbox, makeApplier } from './helpers/stock-outbox-fakes.mjs';

const code = async (p) => { try { await p; return null; } catch (e) { assert.ok(e instanceof WarehouseError, String(e?.stack ?? e)); return e.code; } };
const IDENT = { kind: 'IDENTICAL' };
const admin = actor(1, [PERM.mapping]), confirmer = actor(2, [PERM.mapping]);
const maker = actor(10, [PERM.create, PERM.view], { warehouseIds: [5] }), checker = actor(11, [PERM.approve, PERM.release], { warehouseIds: [5] });
const branch1 = actor(20, [PERM.receive, PERM.resolve, PERM.receivingView], { storeCompanyId: 1 });
const REF = 'gudang:dispatch:700';

async function shipmentWithReceipts({ receipts = [[98, 60]] } = {}) {
  const w = makeWarehouseWorld({
    gudang: [{ id: 11, active: true, code: 'G-11', barcode: '8990011', unit: 'PCS' }, { id: 12, active: true, code: 'G-12', barcode: '8990012', unit: 'PCS' }],
    store: [{ companyId: 1, id: 77, active: true, code: 'S-77', barcode: '8990011', unit: 'PCS' }, { companyId: 1, id: 78, active: true, code: 'S-78', barcode: '8990012', unit: 'PCS' }],
  });
  for (const [g, s] of [[11, 77], [12, 78]]) { const m = await proposeItemMapping(w.deps, admin, { gudangItemId: g, storeCompanyId: 1, storeItemId: s, conversion: IDENT, basis: 'barcode' }); await confirmItemMapping(w.deps, confirmer, { ref: m.ref }); }
  await registerDispatch(w.deps, maker, { sourceRef: REF, sourceWarehouseId: 5, destinationStoreCompanyId: 1, idempotencyKey: 'idem-700-000001', receivingPolicy: { allowMultipleReceipts: true }, lines: [{ gudangItemId: 11, quantity: 100 }, { gudangItemId: 12, quantity: 60 }] });
  for (const [who, action] of [[maker, 'submit'], [checker, 'approve'], [checker, 'dispatch']]) await advanceDispatch(w.deps, who, { sourceRef: REF, destinationStoreCompanyId: 1, action });
  let n = 0;
  for (const [a, b] of receipts) await receiveShipment(w.deps, branch1, { sourceRef: REF, eventKey: `event-out-${String(++n).padStart(7, '0')}`, lines: [{ lineNo: 1, acceptedQuantity: a }, ...(b ? [{ lineNo: 2, acceptedQuantity: b }] : [])] });
  return w.shipments.get(`1|${REF}`);
}
const NOW = () => new Date('2026-10-17T05:00:00Z');
const INTERNAL = { treatmentFor: () => 'INTERNAL_TRANSFER' };

test('no stock hand-off without an explicit accounting treatment: UNSPECIFIED or a missing policy enqueues nothing (owner decision D7)', async () => {
  const s = await shipmentWithReceipts(); const { outbox, rows } = makeOutbox();
  assert.equal(await code(enqueueStockIntents({ outbox, now: NOW }, s)), 'POLICY_REQUIRED');
  assert.equal(await code(enqueueStockIntents({ outbox, now: NOW, treatment: { treatmentFor: () => 'UNSPECIFIED' } }, s)), 'POLICY_REQUIRED');
  assert.equal(rows.size, 0);
});

test('accepted quantities only become outbox records, with stable keys; rejected or unreceived units never do; replay is a no-op', async () => {
  const s = await shipmentWithReceipts({ receipts: [[98, 0]] });   // dispatch 100 + 60, received 98 + 0: the 2 + 60 outstanding are NOT stock
  const { outbox, rows } = makeOutbox(); const deps = { outbox, now: NOW, treatment: INTERNAL };
  assert.deepEqual(await enqueueStockIntents(deps, s), { inserted: 1, existing: 0 });
  const r = [...rows.values()][0]; assert.deepEqual([r.quantity, r.storeItemId, r.status, r.treatment, r.intentKey], [98, 77, 'PENDING', 'INTERNAL_TRANSFER', `${REF}|event-out-0000001|1`]);
  assert.deepEqual(await enqueueStockIntents(deps, s), { inserted: 0, existing: 1 }, 'the same shipment again changes nothing');
  assert.equal(rows.size, 1);
});

test('a second receipt adds only its own intents; earlier keys are untouched (no duplicate quantity)', async () => {
  const s1 = await shipmentWithReceipts({ receipts: [[40, 10]] }); const { outbox, rows } = makeOutbox(); const deps = { outbox, now: NOW, treatment: INTERNAL };
  assert.deepEqual(await enqueueStockIntents(deps, s1), { inserted: 2, existing: 0 });
  const s2 = await shipmentWithReceipts({ receipts: [[40, 10], [58, 50]] });
  assert.deepEqual(await enqueueStockIntents(deps, s2), { inserted: 2, existing: 2 });
  assert.equal(rows.size, 4); assert.deepEqual([...rows.values()].map((r) => r.quantity).sort((a, b) => a - b), [10, 40, 50, 58]);
});

test('a key that reappears with DIFFERENT content is an IDEMPOTENCY_CONFLICT and the stored record is never overwritten', async () => {
  const s = await shipmentWithReceipts(); const { outbox, rows } = makeOutbox(); const deps = { outbox, now: NOW, treatment: INTERNAL };
  await enqueueStockIntents(deps, s);
  const tampered = structuredClone(s); tampered.receipts[0].lines[0].acceptedQuantity = 99;
  assert.equal(await code(enqueueStockIntents(deps, tampered)), 'IDEMPOTENCY_CONFLICT');
  assert.equal([...rows.values()].find((r) => r.storeItemId === 77).quantity, 98);
});

test('drain applies each record exactly once; running it again or concurrently never increases stock twice', async () => {
  const s = await shipmentWithReceipts(); const { outbox, rows } = makeOutbox(); await enqueueStockIntents({ outbox, now: NOW, treatment: INTERNAL }, s);
  const a = makeApplier(); const deps = { outbox, applier: a.applier, now: NOW };
  const [x, y] = await Promise.all([drainStockOutbox(deps), drainStockOutbox(deps)]);
  assert.deepEqual([a.stock.get('1:77'), a.stock.get('1:78')], [98, 60], 'stock increased once per accepted line');
  assert.equal(x.applied + y.applied, 2); assert.equal(x.alreadyApplied + y.alreadyApplied >= 0, true);
  assert.deepEqual([...rows.values()].map((r) => r.status), ['APPLIED', 'APPLIED']);
  assert.deepEqual(await drainStockOutbox(deps), { applied: 0, alreadyApplied: 0, failed: 0, dead: 0 });
});

test('crash between apply and acknowledge is recoverable: the retry sees ALREADY_APPLIED, marks the record and stock is still increased once', async () => {
  const s = await shipmentWithReceipts(); const { outbox, rows } = makeOutbox(); await enqueueStockIntents({ outbox, now: NOW, treatment: INTERNAL }, s);
  const a = makeApplier(); a.behaviour.crashAfterApply.add(`${REF}|event-out-0000001|1`); const deps = { outbox, applier: a.applier, now: NOW };
  const first = await drainStockOutbox(deps); assert.deepEqual([first.applied, first.failed], [1, 1]);
  assert.equal(a.stock.get('1:77'), 98, 'the crashed apply did change stock once');
  const second = await drainStockOutbox(deps); assert.deepEqual([second.applied, second.alreadyApplied], [0, 1]);
  assert.equal(a.stock.get('1:77'), 98, 'not increased again'); assert.ok([...rows.values()].every((r) => r.status === 'APPLIED'));
});

test('one failing record never blocks the others; after the attempt limit it is DEAD and reported, not retried forever', async () => {
  const s = await shipmentWithReceipts(); const { outbox, rows } = makeOutbox(); await enqueueStockIntents({ outbox, now: NOW, treatment: INTERNAL }, s);
  const a = makeApplier(); a.behaviour.failKeys.add(`${REF}|event-out-0000001|1`); const deps = { outbox, applier: a.applier, now: NOW };
  const first = await drainStockOutbox(deps, { maxAttempts: 2 }); assert.deepEqual([first.applied, first.failed, first.dead], [1, 1, 0]); assert.equal(a.stock.get('1:78'), 60);
  const second = await drainStockOutbox(deps, { maxAttempts: 2 }); assert.deepEqual([second.applied, second.failed, second.dead], [0, 0, 1]);
  const dead = [...rows.values()].find((r) => r.status === 'DEAD'); assert.deepEqual([dead.attempts, dead.lastError], [2, 'toko writer unavailable']);
  assert.deepEqual(await drainStockOutbox(deps), { applied: 0, alreadyApplied: 0, failed: 0, dead: 0 }, 'a dead record is not drained again');
  assert.equal(a.stock.get('1:77') ?? 0, 0, 'nothing was applied for the failing line');
});

test('drain order and size are deterministic and bounded', async () => {
  const s = await shipmentWithReceipts({ receipts: [[10, 10], [10, 10], [10, 10]] }); const { outbox } = makeOutbox(); await enqueueStockIntents({ outbox, now: NOW, treatment: INTERNAL }, s);
  const a = makeApplier(); const sum = await drainStockOutbox({ outbox, applier: a.applier, now: NOW }, { limit: 4 });
  assert.equal(sum.applied, 4); assert.deepEqual(a.calls, [...a.calls].sort(), 'keys in deterministic order'); assert.equal((await outbox.pending(10)).length, 2);
  assert.equal((await drainStockOutbox({ outbox, applier: a.applier, now: NOW }, { limit: 0 })).applied, 1, 'limit is clamped to at least 1');
});
