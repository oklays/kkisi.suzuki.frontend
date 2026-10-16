import assert from 'node:assert/strict';
import test from 'node:test';
import { WarehouseError } from '@koperasi/domain/warehouse';
import {
  suggestMappings, proposeItemMapping, confirmItemMapping, retireItemMapping, registerDispatch, advanceDispatch, receiveShipment, resolveShipmentDiscrepancy, closeShipmentForBranch, readShipment,
} from '../src/warehouse/index.ts';
import { makeWarehouseWorld, actor, PERM } from './helpers/warehouse-fakes.mjs';

const code = async (p) => { try { await p; return null; } catch (e) { assert.ok(e instanceof WarehouseError, String(e?.stack ?? e)); return e.code; } };
const IDENT = { kind: 'IDENTICAL' };
const world = () => makeWarehouseWorld({
  gudang: [{ id: 11, active: true, code: 'G-11', barcode: '8990011', unit: 'PCS' }, { id: 12, active: true, code: 'G-12', barcode: '8990012', unit: 'BOX' }, { id: 13, active: false, code: 'G-13', barcode: '8990013', unit: 'PCS' }],
  store: [
    { companyId: 1, id: 77, active: true, code: 'S-77', barcode: '8990011', unit: 'PCS' }, { companyId: 1, id: 78, active: true, code: 'S-78', barcode: '8990012', unit: 'PCS' },
    { companyId: 2, id: 77, active: true, code: 'S-77', barcode: '8990011', unit: 'PCS' }, { companyId: 1, id: 90, active: true, code: 'G-11', barcode: 'zzz', unit: 'PCS' },
  ],
});
const admin = actor(1, [PERM.mapping]);
const confirmer = actor(2, [PERM.mapping]);
const maker = actor(10, [PERM.create, PERM.view], { warehouseIds: [5] });
const checker = actor(11, [PERM.approve, PERM.release], { warehouseIds: [5] });
const branch1 = actor(20, [PERM.receive, PERM.resolve, PERM.receivingView], { storeCompanyId: 1 });
const branch2 = actor(30, [PERM.receive, PERM.resolve, PERM.receivingView], { storeCompanyId: 2 });
const RATIO = { kind: 'RATIO', numerator: 12, denominator: 1, approvedBy: 9, approvedAt: '2026-10-10T00:00:00Z', evidence: 'memo owner 10 Okt' };

async function mapped(w) {
  const m1 = await proposeItemMapping(w.deps, admin, { gudangItemId: 11, storeCompanyId: 1, storeItemId: 77, conversion: IDENT, basis: 'barcode' });
  await confirmItemMapping(w.deps, confirmer, { ref: m1.ref });
  const m2 = await proposeItemMapping(w.deps, admin, { gudangItemId: 12, storeCompanyId: 1, storeItemId: 78, conversion: RATIO, basis: 'manual' });
  await confirmItemMapping(w.deps, confirmer, { ref: m2.ref });
  return [m1, m2];
}
const dispatchInput = (over = {}) => ({ sourceRef: 'gudang:dispatch:500', sourceWarehouseId: 5, destinationStoreCompanyId: 1, idempotencyKey: 'idem-500-000001', receivingPolicy: { allowMultipleReceipts: true }, lines: [{ gudangItemId: 11, quantity: 100 }, { gudangItemId: 12, quantity: 5 }], ...over });
async function inTransit(w) {
  await mapped(w);
  await registerDispatch(w.deps, maker, dispatchInput());
  await advanceDispatch(w.deps, maker, { sourceRef: 'gudang:dispatch:500', destinationStoreCompanyId: 1, action: 'submit' });
  await advanceDispatch(w.deps, checker, { sourceRef: 'gudang:dispatch:500', destinationStoreCompanyId: 1, action: 'approve' });
  return advanceDispatch(w.deps, checker, { sourceRef: 'gudang:dispatch:500', destinationStoreCompanyId: 1, action: 'dispatch' });
}
const receive = (w, who, eventKey, lines, ref = 'gudang:dispatch:500') => receiveShipment(w.deps, who, { sourceRef: ref, eventKey, lines });

test('mapping flow: suggestions by exact identifier, explicit propose -> confirm, duplicates/ambiguity/inactive refused, permission required', async () => {
  const w = world();
  assert.deepEqual(await suggestMappings(w.deps, admin, { gudangItemId: 11, storeCompanyId: 1 }), { candidates: [{ storeItemId: 77, basis: 'barcode' }], ambiguous: false }, 'barcode beats the code-equal item 90');
  await assert.rejects(suggestMappings(w.deps, actor(3, []), { gudangItemId: 11, storeCompanyId: 1 }), { code: 'FORBIDDEN' });
  assert.equal(await code(suggestMappings(w.deps, admin, { gudangItemId: 99, storeCompanyId: 1 })), 'ITEM_NOT_FOUND');
  const m = await proposeItemMapping(w.deps, admin, { gudangItemId: 11, storeCompanyId: 1, storeItemId: 77, conversion: IDENT, basis: 'barcode' });
  assert.deepEqual([m.status, m.proposedBy], ['PROPOSED', 1]);
  assert.equal(await code(proposeItemMapping(w.deps, admin, { gudangItemId: 11, storeCompanyId: 1, storeItemId: 77, conversion: IDENT, basis: 'barcode' })), 'DUPLICATE_MAPPING');
  assert.equal(await code(proposeItemMapping(w.deps, admin, { gudangItemId: 12, storeCompanyId: 1, storeItemId: 77, conversion: IDENT, basis: 'manual' })), 'UNIT_CONVERSION_REQUIRED', 'BOX vs PCS is refused before anything else');
  assert.equal(await code(proposeItemMapping(w.deps, admin, { gudangItemId: 13, storeCompanyId: 1, storeItemId: 78, conversion: IDENT, basis: 'manual' })), 'ITEM_INACTIVE');
  assert.equal(await code(proposeItemMapping(w.deps, admin, { gudangItemId: 11, storeCompanyId: 1, storeItemId: 999, conversion: IDENT, basis: 'manual' })), 'ITEM_NOT_FOUND');
  assert.equal(await code(confirmItemMapping(w.deps, confirmer, { ref: 'map:g1:c1:s1' })), 'MAPPING_NOT_FOUND');
  const ok = await confirmItemMapping(w.deps, confirmer, { ref: m.ref });
  assert.deepEqual([ok.status, ok.confirmedBy], ['CONFIRMED', 2]);
  assert.equal(await code(confirmItemMapping(w.deps, confirmer, { ref: m.ref })), 'MAPPING_INVALID_STATE');
});

test('12a. concurrent mapping proposals: the repository unique key decides, the loser gets DUPLICATE_MAPPING and nothing is stored twice', async () => {
  const w = world();
  const results = await Promise.allSettled([1, 2].map((id) => proposeItemMapping(w.deps, actor(id, [PERM.mapping]), { gudangItemId: 11, storeCompanyId: 1, storeItemId: 77, conversion: IDENT, basis: 'barcode' })));
  assert.deepEqual(results.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'DUPLICATE_MAPPING');
  assert.equal(w.mappings.size, 1);
});

test('dispatch registration: whole-document validation, idempotent replay, conflicting reuse, scope and permission', async () => {
  const w = world(); await mapped(w);
  const first = await registerDispatch(w.deps, maker, dispatchInput());
  assert.deepEqual([first.replayed, first.shipment.lines.map((l) => l.expectedQuantity), first.shipment.status], [false, [100, 60], 'DRAFT']);
  const again = await registerDispatch(w.deps, maker, dispatchInput());
  assert.equal(again.replayed, true); assert.equal(w.log.shipmentInserts, 1, 'duplicate document processing is prevented');
  assert.equal(await code(registerDispatch(w.deps, maker, dispatchInput({ lines: [{ gudangItemId: 11, quantity: 101 }] }))), 'DUPLICATE_DOCUMENT');
  assert.equal(await code(registerDispatch(w.deps, maker, dispatchInput({ idempotencyKey: 'idem-500-OTHER01' }))), 'DUPLICATE_DOCUMENT');
  assert.equal(await code(registerDispatch(w.deps, maker, dispatchInput({ sourceRef: 'gudang:dispatch:501', lines: [{ gudangItemId: 11, quantity: 1 }, { gudangItemId: 13, quantity: 1 }] }))), 'MAPPING_NOT_FOUND');
  assert.equal(await code(registerDispatch(w.deps, maker, dispatchInput({ sourceRef: 'gudang:dispatch:502', lines: [{ gudangItemId: 11, quantity: 0 }] }))), 'ZERO_QUANTITY');
  assert.equal(await code(registerDispatch(w.deps, maker, dispatchInput({ sourceRef: 'gudang:dispatch:503', destinationStoreCompanyId: 2 }))), 'MAPPING_NOT_FOUND');
  assert.equal(await code(registerDispatch(w.deps, actor(10, [PERM.create], { warehouseIds: [6] }), dispatchInput({ sourceRef: 'gudang:dispatch:504' }))), 'FORBIDDEN', 'other warehouse scope');
  assert.equal(await code(registerDispatch(w.deps, actor(10, [], { warehouseIds: [5] }), dispatchInput({ sourceRef: 'gudang:dispatch:505' }))), 'FORBIDDEN');
  assert.equal(w.log.shipmentInserts, 1, 'a rejected document stores nothing');
});

test('12b. concurrent registration of the same Gudang document: one insert wins, the other becomes a replay', async () => {
  const w = world(); await mapped(w);
  const [a, b] = await Promise.all([registerDispatch(w.deps, maker, dispatchInput()), registerDispatch(w.deps, maker, dispatchInput())]);
  assert.deepEqual([a.replayed, b.replayed].sort(), [false, true]); assert.equal(w.shipments.size, 1);
});

test('lifecycle use cases enforce permission, warehouse scope and maker-checker', async () => {
  const w = world(); await mapped(w); await registerDispatch(w.deps, maker, dispatchInput());
  const adv = (who, action, reason) => advanceDispatch(w.deps, who, { sourceRef: 'gudang:dispatch:500', destinationStoreCompanyId: 1, action, reason });
  assert.equal(await code(adv(checker, 'approve')), 'INVALID_TRANSITION', 'still DRAFT');
  await adv(maker, 'submit');
  assert.equal(await code(adv(actor(10, [PERM.approve], { warehouseIds: [5] }), 'approve')), 'MAKER_CHECKER');
  assert.equal(await code(adv(maker, 'approve')), 'FORBIDDEN', 'creator lacks the approve permission');
  assert.equal(await code(adv(actor(12, [PERM.approve], { warehouseIds: [6] }), 'approve')), 'FORBIDDEN');
  assert.equal(await code(adv(checker, 'teleport')), 'INVALID_TRANSITION');
  assert.equal((await adv(checker, 'approve')).shipment.status, 'APPROVED');
  assert.equal(await code(advanceDispatch(w.deps, checker, { sourceRef: 'gudang:dispatch:999', destinationStoreCompanyId: 1, action: 'approve' })), 'NOT_FOUND');
  assert.equal((await adv(maker, 'cancel', 'dibatalkan')).shipment.status, 'CANCELLED');
  assert.equal(await code(adv(checker, 'release')), 'INVALID_TRANSITION');
});

test('receiving: branch isolation, permission, not-yet-dispatched, and the full / partial / over-receipt paths', async () => {
  const w = world(); await mapped(w); await registerDispatch(w.deps, maker, dispatchInput());
  assert.equal(await code(receive(w, branch1, 'event-use-0000001', [{ lineNo: 1, acceptedQuantity: 1 }])), 'WRONG_STATE', 'not dispatched yet');
  await advanceDispatch(w.deps, maker, { sourceRef: 'gudang:dispatch:500', destinationStoreCompanyId: 1, action: 'submit' });
  await advanceDispatch(w.deps, checker, { sourceRef: 'gudang:dispatch:500', destinationStoreCompanyId: 1, action: 'approve' });
  await advanceDispatch(w.deps, checker, { sourceRef: 'gudang:dispatch:500', destinationStoreCompanyId: 1, action: 'dispatch' });
  assert.equal(await code(receive(w, branch2, 'event-use-0000002', [{ lineNo: 1, acceptedQuantity: 1 }])), 'NOT_FOUND', 'another branch cannot even see the document');
  assert.equal(await code(receive(w, actor(21, [], { storeCompanyId: 1 }), 'event-use-0000003', [{ lineNo: 1, acceptedQuantity: 1 }])), 'FORBIDDEN');
  assert.equal(await code(receive(w, actor(22, [PERM.receive], { storeCompanyId: null }), 'event-use-0000004', [{ lineNo: 1, acceptedQuantity: 1 }])), 'FORBIDDEN');
  assert.equal(await code(receive(w, branch1, 'event-use-0000005', [{ lineNo: 1, acceptedQuantity: 101 }])), 'RECEIVE_EXCEEDS_OUTSTANDING');
  const part = await receive(w, branch1, 'event-use-0000006', [{ lineNo: 1, acceptedQuantity: 98 }, { lineNo: 2, acceptedQuantity: 60 }]);
  assert.equal(part.reconciliation.outcome, 'PARTIALLY_RECEIVED'); assert.equal(part.reconciliation.lines[0].outstandingQuantity, 2);
  assert.deepEqual(part.intents.map((i) => [i.storeItemId, i.quantity]), [[77, 98], [78, 60]]);
  assert.equal(part.treatment, 'UNSPECIFIED', 'the accounting treatment is never chosen implicitly');
  const rest = await receive(w, branch1, 'event-use-0000007', [{ lineNo: 1, acceptedQuantity: 2 }]);
  assert.equal(rest.reconciliation.outcome, 'FULLY_RECEIVED');
  assert.equal((await closeShipmentForBranch(w.deps, branch1, { sourceRef: 'gudang:dispatch:500' })).shipment.status, 'CLOSED');
  assert.equal((await closeShipmentForBranch(w.deps, branch1, { sourceRef: 'gudang:dispatch:500' })).replayed, true, 'closing twice is a no-op');
  assert.equal(await code(receive(w, branch1, 'event-use-0000008', [{ lineNo: 1, acceptedQuantity: 1 }])), 'TERMINAL_STATE');
});

test('8b. repeated receiving request: replay returns the same intents and writes nothing; conflicting reuse of a key is refused', async () => {
  const w = world(); await inTransit(w);
  const first = await receive(w, branch1, 'event-rep-0000001', [{ lineNo: 1, acceptedQuantity: 60 }]);
  const saves = w.log.shipmentSaves;
  const second = await receive(w, actor(23, [PERM.receive], { storeCompanyId: 1 }), 'event-rep-0000001', [{ lineNo: 1, acceptedQuantity: 60 }]);
  assert.equal(second.replayed, true); assert.deepEqual(second.intents, first.intents); assert.equal(w.log.shipmentSaves, saves);
  assert.equal(second.shipment.receipts.length, 1);
  assert.equal(await code(receive(w, branch1, 'event-rep-0000001', [{ lineNo: 1, acceptedQuantity: 59 }])), 'IDEMPOTENCY_CONFLICT');
  assert.equal(reconcile_accepted(second), 60);
});
const reconcile_accepted = (r) => r.reconciliation.totals.accepted;

test('12c. concurrent receipts: a version conflict is retried against the fresh state; the cumulative limit still holds', async () => {
  const w = world(); await inTransit(w);
  // two different receiving events race for the same 100 units: 70 + 40 > 100, so exactly one of them must lose on the limit
  let raced = false;
  const base = w.log.saveAttempts;
  w.hooks.beforeSave = async (candidate, expectedVersion, repo) => {
    if (raced || candidate.receipts.length !== 1 || candidate.receipts[0].eventKey !== 'event-race-000001') return;
    raced = true;                                       // another writer saves its own event first, between our read and our save
    const cur = await repo.find(candidate.sourceRef, candidate.destinationStoreCompanyId);
    const { applyReceipt } = await import('@koperasi/domain/warehouse');
    const other = applyReceipt(cur, { eventKey: 'event-race-000002', actorCompanyId: 1, lines: [{ lineNo: 1, acceptedQuantity: 40 }] }, { userId: 99, requestId: 'r', at: '2026-10-16T05:00:00.000Z' }).shipment;
    await repo.save(other, cur.version);
  };
  const lost = await code(receive(w, branch1, 'event-race-000001', [{ lineNo: 1, acceptedQuantity: 70 }]));
  assert.equal(lost, 'RECEIVE_EXCEEDS_OUTSTANDING', 'after the retry the 70 no longer fit into the remaining 60');
  const s = w.shipments.get('1|gudang:dispatch:500');
  assert.deepEqual(s.receipts.map((r) => r.eventKey), ['event-race-000002']);
  assert.ok(w.log.saveAttempts > base, 'the first attempt did reach the repository');
});

test('12d. the same receiving event racing with itself becomes a replay, never a double receipt', async () => {
  const w = world(); await inTransit(w);
  let raced = false;
  w.hooks.beforeSave = async (candidate, expectedVersion, repo) => {
    if (raced) return; raced = true;
    const cur = await repo.find(candidate.sourceRef, candidate.destinationStoreCompanyId);
    await repo.save(candidate, cur.version);              // the identical event is committed by the "other" attempt first
  };
  const r = await receive(w, branch1, 'event-self-000001', [{ lineNo: 1, acceptedQuantity: 40 }]);
  assert.equal(r.replayed, true);
  assert.equal(w.shipments.get('1|gudang:dispatch:500').receipts.length, 1);
  assert.equal(r.intents.length, 1);
});

test('persistent concurrent modification surfaces as CONCURRENT_MODIFICATION after bounded retries, with nothing written', async () => {
  const w = world(); await inTransit(w);
  w.hooks.beforeSave = async (candidate, expectedVersion, repo) => { const cur = await repo.find(candidate.sourceRef, candidate.destinationStoreCompanyId); cur.version += 1; w.shipments.set('1|gudang:dispatch:500', cur); };
  const before = JSON.stringify(w.shipments.get('1|gudang:dispatch:500').receipts), base = w.log.saveAttempts;
  assert.equal(await code(receive(w, branch1, 'event-cmod-000001', [{ lineNo: 1, acceptedQuantity: 1 }])), 'CONCURRENT_MODIFICATION');
  assert.equal(JSON.stringify(w.shipments.get('1|gudang:dispatch:500').receipts), before);
  assert.equal(w.log.saveAttempts - base, 3, 'exactly MAX_SAVE_ATTEMPTS tries, then give up');
});

test('non-conflict repository failures are not swallowed or retried', async () => {
  const w = world(); await inTransit(w);
  w.hooks.beforeSave = async () => { throw new Error('connection reset'); };
  const base = w.log.saveAttempts;
  await assert.rejects(receive(w, branch1, 'event-fail-000001', [{ lineNo: 1, acceptedQuantity: 1 }]), /connection reset/);
  assert.equal(w.log.saveAttempts - base, 1, 'no retry for a non-conflict failure');
});

test('mapping inconsistencies are rejected before posting; a mapping in use cannot be retired', async () => {
  const w = world(); const [m1] = await inTransit(w).then(async () => [...w.mappings.values()]);
  assert.equal(await code(retireItemMapping(w.deps, admin, { ref: m1.ref, reason: 'salah pasangan' })), 'MAPPING_IN_USE');
  const tamper = (patch) => w.mappings.set(m1.ref, { ...m1, ...patch });
  tamper({ storeItemId: 78 });  assert.equal(await code(receive(w, branch1, 'event-map-0000001', [{ lineNo: 1, acceptedQuantity: 1 }])), 'MAPPING_INCONSISTENT');
  tamper({ status: 'PROPOSED' }); assert.equal(await code(receive(w, branch1, 'event-map-0000002', [{ lineNo: 1, acceptedQuantity: 1 }])), 'MAPPING_NOT_CONFIRMED');
  tamper({ status: 'RETIRED' });  assert.equal(await code(receive(w, branch1, 'event-map-0000003', [{ lineNo: 1, acceptedQuantity: 1 }])), 'MAPPING_RETIRED');
  w.mappings.delete(m1.ref);      assert.equal(await code(receive(w, branch1, 'event-map-0000004', [{ lineNo: 1, acceptedQuantity: 1 }])), 'MAPPING_NOT_FOUND');
  w.mappings.set(m1.ref, m1);
  w.storeItems.set('1:77', { ...w.storeItems.get('1:77'), active: false });
  assert.equal(await code(receive(w, branch1, 'event-map-0000005', [{ lineNo: 1, acceptedQuantity: 1 }])), 'ITEM_INACTIVE');
  w.storeItems.delete('1:77');
  assert.equal(await code(receive(w, branch1, 'event-map-0000006', [{ lineNo: 1, acceptedQuantity: 1 }])), 'ITEM_NOT_FOUND');
  assert.equal(w.shipments.get('1|gudang:dispatch:500').receipts.length, 0, 'nothing was recorded by any rejected event');
});

test('7b/10b/13b. discrepancy handling end to end: partial + damaged -> explicit resolutions -> close; quantities stay balanced', async () => {
  const w = world(); await inTransit(w);
  const r1 = await receive(w, branch1, 'event-dis-0000001', [{ lineNo: 1, acceptedQuantity: 90, rejectedQuantity: 5, rejectedReason: 'DAMAGED' }, { lineNo: 2, acceptedQuantity: 60 }]);
  assert.equal(r1.reconciliation.outcome, 'PARTIALLY_RECEIVED');
  assert.deepEqual(r1.intents.map((i) => i.quantity), [90, 60], 'damaged units are not stock');
  assert.equal(await code(closeShipmentForBranch(w.deps, branch1, { sourceRef: 'gudang:dispatch:500' })), 'OUTSTANDING_QUANTITY');
  const res = (resolutionKey, target, kind, quantity) => resolveShipmentDiscrepancy(w.deps, branch1, { sourceRef: 'gudang:dispatch:500', resolutionKey, lineNo: 1, target, kind, quantity, reason: 'diputuskan manajer' });
  assert.equal(await code(res('resolve-use-0001', 'OUTSTANDING', 'SHORT_CLOSED', 6)), 'RESOLUTION_EXCEEDS_UNRESOLVED');
  await res('resolve-use-0001', 'OUTSTANDING', 'SHORT_CLOSED', 5);
  assert.equal((await res('resolve-use-0001', 'OUTSTANDING', 'SHORT_CLOSED', 5)).replayed, true);
  assert.equal(await code(closeShipmentForBranch(w.deps, branch1, { sourceRef: 'gudang:dispatch:500' })), 'UNRESOLVED_REJECTED');
  const last = await res('resolve-use-0002', 'REJECTED', 'RETURNED_TO_SOURCE', 5);
  assert.equal(last.reconciliation.hasOpenDiscrepancy, false);
  const closed = await closeShipmentForBranch(w.deps, branch1, { sourceRef: 'gudang:dispatch:500' });
  assert.deepEqual([closed.shipment.status, closed.reconciliation.outcome], ['CLOSED', 'RECEIVED_WITH_DISCREPANCY'], 'a shortage is never relabelled as a full receipt');
  assert.equal(await code(res('resolve-use-0003', 'REJECTED', 'WRITTEN_OFF', 1)), 'TERMINAL_STATE');
  assert.equal(await code(resolveShipmentDiscrepancy(w.deps, actor(24, [], { storeCompanyId: 1 }), { sourceRef: 'gudang:dispatch:500', resolutionKey: 'resolve-use-0004', lineNo: 1, target: 'REJECTED', kind: 'WRITTEN_OFF', quantity: 1, reason: 'x y z' })), 'FORBIDDEN');
});

test('reading: only the destination branch (receiving view) or the source warehouse scope (dispatch view); the same answer for a missing document', async () => {
  const w = world(); await inTransit(w);
  const ref = { sourceRef: 'gudang:dispatch:500', destinationStoreCompanyId: 1 };
  assert.equal((await readShipment(w.deps, branch1, ref)).reconciliation.outcome, 'NOT_RECEIVED');
  assert.equal((await readShipment(w.deps, maker, ref)).shipment.status, 'DISPATCHED');
  assert.equal(await code(readShipment(w.deps, branch2, ref)), 'FORBIDDEN');
  assert.equal(await code(readShipment(w.deps, actor(10, [PERM.view], { warehouseIds: [6] }), ref)), 'FORBIDDEN');
  assert.equal(await code(readShipment(w.deps, branch1, { sourceRef: 'gudang:dispatch:404', destinationStoreCompanyId: 1 })), 'NOT_FOUND');
  assert.equal(await code(readShipment(w.deps, branch2, { sourceRef: 'gudang:dispatch:404', destinationStoreCompanyId: 1 })), 'FORBIDDEN', 'does not reveal whether a document exists');
});

test('accounting boundary: the treatment comes only from an injected policy; quantities are identical whatever it says', async () => {
  const w = world(); await inTransit(w);
  const withPolicy = { ...w.deps, treatment: { treatmentFor: (m) => (m.destinationStoreCompanyId === 1 ? 'INTERNAL_TRANSFER' : 'COMMERCIAL_PURCHASE') } };
  const a = await receiveShipment(withPolicy, branch1, { sourceRef: 'gudang:dispatch:500', eventKey: 'event-pol-0000001', lines: [{ lineNo: 1, acceptedQuantity: 10 }] });
  assert.equal(a.treatment, 'INTERNAL_TRANSFER');
  const b = await readShipment(w.deps, branch1, { sourceRef: 'gudang:dispatch:500', destinationStoreCompanyId: 1 });
  assert.equal(b.treatment, 'UNSPECIFIED'); assert.deepEqual(b.reconciliation, a.reconciliation);
});
