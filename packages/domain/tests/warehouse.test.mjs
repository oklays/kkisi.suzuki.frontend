import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WarehouseError, MAX_QUANTITY, addQuantity, convertQuantity, validateUnitConversion, mappingRef, suggestCandidates, proposeMapping, confirmMapping, retireMapping, resolveMapping,
  buildShipmentLines, createShipment, submitShipment, approveShipment, dispatchShipment, cancelShipment, applyReceipt, resolveDiscrepancy, closeShipment, reconcile, stockIntents,
} from '../src/warehouse/index.ts';

const code = (fn) => { try { fn(); return null; } catch (e) { assert.ok(e instanceof WarehouseError, String(e)); return e.code; } };
const T = '2026-10-16T05:00:00.000Z';
const actor = (userId, n = 1) => ({ userId, requestId: `req-${userId}-${n}`, at: T });
const G = (id, over = {}) => ({ id, active: true, code: `G-${id}`, barcode: `899${id}`, unit: 'PCS', ...over });
const S = (id, over = {}) => ({ id, active: true, code: `S-${id}`, barcode: `899${id}`, unit: 'PCS', ...over });
const IDENT = { kind: 'IDENTICAL' };
const RATIO = (numerator, denominator) => ({ kind: 'RATIO', numerator, denominator, approvedBy: 9, approvedAt: T, evidence: 'owner memo 2026-10-10' });
const confirmed = (g, c, s, conversion = IDENT, units = ['PCS', 'PCS']) => {
  const gi = G(g, { unit: units[0] }), si = S(s, { unit: units[1] });
  const m = proposeMapping({ gudangItem: gi, storeCompanyId: c, storeItem: si, conversion, basis: 'barcode', actorUserId: 1, at: T }, []);
  return confirmMapping(m, { gudangItem: gi, storeItem: si }, 2, T);
};

// ============================================================================================ 1-4 item mapping
test('1. valid mapping: deterministic ref, explicit propose -> confirm, resolvable only once confirmed', () => {
  assert.equal(mappingRef(11, 1, 77), 'map:g11:c1:s77');
  const gi = G(11), si = S(77);
  const proposed = proposeMapping({ gudangItem: gi, storeCompanyId: 1, storeItem: si, conversion: IDENT, basis: 'barcode', actorUserId: 1, at: T }, []);
  assert.equal(proposed.status, 'PROPOSED'); assert.equal(proposed.ref, 'map:g11:c1:s77');
  assert.equal(code(() => resolveMapping([proposed], 11, 1, { gudangItem: gi, storeItem: si })), 'MAPPING_NOT_CONFIRMED');
  const ok = confirmMapping(proposed, { gudangItem: gi, storeItem: si }, 2, T);
  assert.deepEqual([ok.status, ok.confirmedBy, ok.proposedBy], ['CONFIRMED', 2, 1]);
  assert.equal(resolveMapping([ok], 11, 1, { gudangItem: gi, storeItem: si }).ref, ok.ref);
  assert.equal(code(() => confirmMapping(ok, { gudangItem: gi, storeItem: si }, 2, T)), 'MAPPING_INVALID_STATE');
});

test('suggestions: exact barcode first, then exact item code; names are never used; ambiguity is flagged, inactive items skipped', () => {
  const g = G(1, { barcode: 'ABC', code: 'X-1' });
  assert.deepEqual(suggestCandidates(g, [S(5, { barcode: 'abc ', code: 'other' }), S(6, { barcode: 'zzz', code: 'X-1' })]), { candidates: [{ storeItemId: 5, basis: 'barcode' }], ambiguous: false }, 'a barcode match beats a code match');
  assert.deepEqual(suggestCandidates(g, [S(6, { barcode: 'zzz', code: 'x-1' })]), { candidates: [{ storeItemId: 6, basis: 'item_code' }], ambiguous: false });
  assert.deepEqual(suggestCandidates(g, [S(7, { barcode: 'ABC' }), S(5, { barcode: 'abc' })]), { candidates: [{ storeItemId: 5, basis: 'barcode' }, { storeItemId: 7, basis: 'barcode' }], ambiguous: true });
  assert.deepEqual(suggestCandidates(g, [S(8, { barcode: 'ABC', active: false })]), { candidates: [], ambiguous: false });
  assert.deepEqual(suggestCandidates({ ...g, barcode: null, code: '' }, [S(9, { barcode: null, code: '', name: 'same name' })]), { candidates: [], ambiguous: false }, 'empty identifiers never match each other');
  assert.deepEqual(suggestCandidates(G(3, { barcode: '1', code: 'a' }), [{ ...S(3), barcode: '2', code: 'b' }]).candidates, [], 'equal ids in two databases mean nothing');
});

test('2. duplicate and ambiguous mappings are refused (both directions, per branch only)', () => {
  const book = [confirmed(11, 1, 77)];
  const prop = (g, c, s) => () => proposeMapping({ gudangItem: G(g), storeCompanyId: c, storeItem: S(s), conversion: IDENT, basis: 'manual', actorUserId: 1, at: T }, book);
  assert.equal(code(prop(11, 1, 77)), 'DUPLICATE_MAPPING', 'same pair');
  assert.equal(code(prop(11, 1, 78)), 'DUPLICATE_MAPPING', 'same Gudang item to a second TOKO item in the branch');
  assert.equal(code(prop(12, 1, 77)), 'AMBIGUOUS_MAPPING', 'two Gudang items feeding one TOKO item');
  assert.equal(code(prop(11, 2, 77)), null, 'another branch is independent');
  const retired = retireMapping(book[0], 3, T, 'salah pasangan');
  assert.equal(code(() => proposeMapping({ gudangItem: G(11), storeCompanyId: 1, storeItem: S(78), conversion: IDENT, basis: 'manual', actorUserId: 1, at: T }, [retired])), null, 'a retired mapping frees both sides');
  assert.equal(code(() => resolveMapping([book[0], { ...book[0], ref: 'map:g11:c1:s99', storeItemId: 99 }], 11, 1, { gudangItem: G(11), storeItem: S(77) })), 'AMBIGUOUS_MAPPING', 'a corrupted book with two live mappings is never guessed');
});

test('3. unknown, inactive and missing references are refused', () => {
  const m = confirmed(11, 1, 77);
  const items = { gudangItem: G(11), storeItem: S(77) };
  assert.equal(code(() => resolveMapping([m], 12, 1, items)), 'MAPPING_NOT_FOUND');
  assert.equal(code(() => resolveMapping([m], 11, 2, items)), 'MAPPING_NOT_FOUND');
  assert.equal(code(() => resolveMapping([m], 11, 1, { ...items, storeItem: null })), 'ITEM_NOT_FOUND');
  assert.equal(code(() => resolveMapping([m], 11, 1, { ...items, storeItem: S(77, { active: false }) })), 'ITEM_INACTIVE');
  assert.equal(code(() => resolveMapping([m], 11, 1, { ...items, gudangItem: G(11, { active: false }) })), 'ITEM_INACTIVE');
  assert.equal(code(() => resolveMapping([m], 11, 1, { ...items, storeItem: S(78) })), 'MAPPING_INCONSISTENT');
  assert.equal(code(() => resolveMapping([retireMapping(m, 3, T, 'tidak dipakai')], 11, 1, items)), 'MAPPING_RETIRED');
  assert.equal(code(() => proposeMapping({ gudangItem: G(11), storeCompanyId: 1, storeItem: S(77, { active: false }), conversion: IDENT, basis: 'manual', actorUserId: 1, at: T }, [])), 'ITEM_INACTIVE');
  assert.equal(code(() => proposeMapping({ gudangItem: null, storeCompanyId: 1, storeItem: S(77), conversion: IDENT, basis: 'manual', actorUserId: 1, at: T }, [])), 'ITEM_NOT_FOUND');
  for (const bad of [0, -1, 1.5, NaN, null]) assert.equal(code(() => mappingRef(bad, 1, 1)), 'INVALID_REFERENCE');
  assert.equal(code(() => retireMapping(m, 3, T, '  ')), 'REASON_REQUIRED');
});

test('4. unit conversion: equal units are 1:1; different units need an approved, documented, exact ratio; nothing is assumed', () => {
  assert.equal(code(() => validateUnitConversion('PCS', ' pcs ', IDENT)), null);
  assert.equal(code(() => validateUnitConversion('BOX', 'PCS', IDENT)), 'UNIT_CONVERSION_REQUIRED', 'different units are never assumed equal');
  assert.equal(code(() => validateUnitConversion('BOX', 'PCS', RATIO(12, 1))), null);
  assert.equal(code(() => validateUnitConversion('PCS', 'pcs', RATIO(12, 1))), 'UNIT_CONVERSION_INVALID', 'a ratio between identical units is a data error');
  assert.equal(code(() => validateUnitConversion('', 'PCS', IDENT)), 'UNIT_MISSING');
  assert.equal(code(() => validateUnitConversion('BOX', 'PCS', undefined)), 'UNIT_CONVERSION_INVALID');
  assert.equal(code(() => validateUnitConversion('BOX', 'PCS', { ...RATIO(12, 1), evidence: '' })), 'UNIT_CONVERSION_INVALID', 'no evidence, no factor');
  assert.equal(code(() => validateUnitConversion('BOX', 'PCS', { ...RATIO(12, 1), approvedBy: 0 })), 'UNIT_CONVERSION_INVALID');
  for (const bad of [RATIO(0, 1), RATIO(1, 0), RATIO(1.5, 1), RATIO(1000001, 1), RATIO(1, -2)]) assert.equal(code(() => validateUnitConversion('BOX', 'PCS', bad)), 'UNIT_CONVERSION_INVALID');
  assert.equal(convertQuantity(5, IDENT), 5);
  assert.equal(convertQuantity(5, RATIO(12, 1)), 60);
  assert.equal(convertQuantity(10, RATIO(1, 5)), 2);
  assert.equal(code(() => convertQuantity(3, RATIO(1, 2))), 'UNIT_CONVERSION_INEXACT', 'never rounded');
  assert.equal(code(() => convertQuantity(MAX_QUANTITY, RATIO(1000000, 1))), 'QUANTITY_OVERFLOW');
  assert.equal(code(() => convertQuantity(0, IDENT)), 'ZERO_QUANTITY');
});

test('quantities: zero, negative, fractional, non-numeric and overflowing values are refused', () => {
  for (const bad of [-1, 0.5, '3', null, undefined, NaN, Infinity]) assert.ok(['INVALID_QUANTITY', 'ZERO_QUANTITY'].includes(code(() => convertQuantity(bad, IDENT))), String(bad));
  assert.equal(code(() => convertQuantity(MAX_QUANTITY + 1, IDENT)), 'QUANTITY_OVERFLOW');
  assert.equal(addQuantity(MAX_QUANTITY - 1, 1), MAX_QUANTITY);
  assert.equal(code(() => addQuantity(MAX_QUANTITY, 1)), 'QUANTITY_OVERFLOW');
});

// ============================================================================================ dispatch lines + lifecycle
const items = { gudangItem: (id) => G(id, { unit: id === 12 ? 'BOX' : 'PCS' }), storeItem: (company, id) => S(id, { unit: 'PCS' }) };
const book = [confirmed(11, 1, 77), confirmed(12, 1, 78, RATIO(12, 1), ['BOX', 'PCS']), confirmed(13, 1, 79)];

test('dispatch lines resolve only confirmed mappings and convert exactly once; any bad line rejects the whole document', () => {
  const lines = buildShipmentLines([{ gudangItemId: 11, quantity: 100 }, { gudangItemId: 12, quantity: 5 }], 1, book, items);
  assert.deepEqual(lines.map((l) => [l.lineNo, l.storeItemId, l.gudangQuantity, l.expectedQuantity, l.gudangUnit, l.storeUnit]), [[1, 77, 100, 100, 'PCS', 'PCS'], [2, 78, 5, 60, 'BOX', 'PCS']]);
  assert.equal(code(() => buildShipmentLines([{ gudangItemId: 11, quantity: 1 }, { gudangItemId: 11, quantity: 2 }], 1, book, items)), 'DUPLICATE_LINE');
  assert.equal(code(() => buildShipmentLines([{ gudangItemId: 99, quantity: 1 }], 1, book, items)), 'MAPPING_NOT_FOUND');
  assert.equal(code(() => buildShipmentLines([{ gudangItemId: 11, quantity: 0 }], 1, book, items)), 'ZERO_QUANTITY');
  assert.equal(code(() => buildShipmentLines([{ gudangItemId: 11, quantity: 1 }], 2, book, items)), 'MAPPING_NOT_FOUND', 'mapping is per branch');
  assert.equal(code(() => buildShipmentLines([], 1, book, items)), 'NO_LINES');
  assert.equal(code(() => buildShipmentLines([{ gudangItemId: 11, quantity: 1 }], 1, [{ ...book[0], status: 'PROPOSED' }], items)), 'MAPPING_NOT_CONFIRMED');
  assert.equal(code(() => buildShipmentLines([{ gudangItemId: 11, quantity: 1 }], 1, book, { ...items, storeItem: () => S(77, { active: false }) })), 'ITEM_INACTIVE');
  assert.equal(code(() => buildShipmentLines([{ gudangItemId: 12, quantity: 3 }], 1, [confirmed(12, 1, 78, RATIO(1, 2), ['BOX', 'PCS'])], items)), 'UNIT_CONVERSION_INEXACT');
});

const MAKER = 10, CHECKER = 11, RECEIVER = 20;
const lines = () => buildShipmentLines([{ gudangItemId: 11, quantity: 100 }, { gudangItemId: 13, quantity: 40 }], 1, book, items);
const input = (over = {}) => ({ sourceRef: 'gudang:dispatch:123', sourceWarehouseId: 5, destinationStoreCompanyId: 1, idempotencyKey: 'idem-key-00000001', receivingPolicy: { allowMultipleReceipts: true }, lines: lines(), ...over });
function dispatched(over = {}) {
  let s = createShipment(input(over), actor(MAKER));
  s = submitShipment(s, actor(MAKER)); s = approveShipment(s, actor(CHECKER)); return dispatchShipment(s, actor(MAKER));
}
const receive = (s, eventKey, lines, company = 1, who = RECEIVER) => applyReceipt(s, { eventKey, actorCompanyId: company, lines }, actor(who, eventKey.length));

test('11. lifecycle: DRAFT -> SUBMITTED -> APPROVED (maker != checker) -> DISPATCHED; versions and audit history advance', () => {
  let s = createShipment(input(), actor(MAKER));
  assert.deepEqual([s.status, s.version, s.history.length], ['DRAFT', 1, 1]);
  assert.equal(code(() => approveShipment(s, actor(CHECKER))), 'INVALID_TRANSITION');
  s = submitShipment(s, actor(MAKER));
  assert.equal(code(() => approveShipment(s, actor(MAKER))), 'MAKER_CHECKER');
  assert.equal(code(() => dispatchShipment(s, actor(CHECKER))), 'INVALID_TRANSITION');
  s = approveShipment(s, actor(CHECKER)); s = dispatchShipment(s, actor(MAKER));
  assert.deepEqual([s.status, s.version], ['DISPATCHED', 4]);
  assert.deepEqual(s.history.map((h) => [h.seq, h.type, h.actorUserId]), [[1, 'CREATED', MAKER], [2, 'SUBMITTED', MAKER], [3, 'APPROVED', CHECKER], [4, 'DISPATCHED', MAKER]]);
  assert.equal(code(() => receive(dispatched(), 'event-key-00000001', [{ lineNo: 1, acceptedQuantity: 1 }], 1)), null);
  assert.equal(code(() => receive(createShipment(input(), actor(MAKER)), 'event-key-00000001', [{ lineNo: 1, acceptedQuantity: 1 }])), 'WRONG_STATE', 'goods cannot be received before dispatch');
  assert.equal(code(() => submitShipment(dispatched(), actor(MAKER))), 'INVALID_TRANSITION');
});

test('shipment creation: policy is mandatory (no default); references, lines and quantities are validated', () => {
  assert.equal(code(() => createShipment(input({ receivingPolicy: undefined }), actor(MAKER))), 'POLICY_REQUIRED');
  assert.equal(code(() => createShipment(input({ receivingPolicy: {} }), actor(MAKER))), 'POLICY_REQUIRED');
  assert.equal(code(() => createShipment(input({ sourceRef: '' }), actor(MAKER))), 'INVALID_REFERENCE');
  assert.equal(code(() => createShipment(input({ sourceWarehouseId: 0 }), actor(MAKER))), 'INVALID_REFERENCE');
  assert.equal(code(() => createShipment(input({ destinationStoreCompanyId: null }), actor(MAKER))), 'INVALID_REFERENCE');
  assert.equal(code(() => createShipment(input({ idempotencyKey: 'x' }), actor(MAKER))), 'INVALID_REFERENCE');
  assert.equal(code(() => createShipment(input({ lines: [] }), actor(MAKER))), 'NO_LINES');
  assert.equal(code(() => createShipment(input({ lines: [lines()[0], lines()[0]] }), actor(MAKER))), 'DUPLICATE_LINE');
  assert.equal(code(() => createShipment(input({ lines: [{ ...lines()[0], expectedQuantity: 0 }] }), actor(MAKER))), 'ZERO_QUANTITY');
  assert.equal(code(() => createShipment(input({ lines: [{ ...lines()[0], expectedQuantity: MAX_QUANTITY + 1 }] }), actor(MAKER))), 'QUANTITY_OVERFLOW');
  assert.equal(code(() => createShipment(input({ lines: [{ ...lines()[0], mappingRef: '' }] }), actor(MAKER))), 'INVALID_REFERENCE');
  assert.equal(code(() => createShipment(input({ lines: [{ ...lines()[0], storeUnit: ' ' }] }), actor(MAKER))), 'UNIT_MISSING');
  assert.equal(code(() => createShipment(input(), { userId: 0, requestId: 'r', at: T })), 'INVALID_REFERENCE');
  assert.equal(createShipment(input(), actor(MAKER)).fingerprint, createShipment(input({ lines: [...lines()].reverse() }), actor(MAKER)).fingerprint, 'fingerprint is order-independent');
});

// ============================================================================================ 5-10 receiving
test('5. full receiving: every expected unit accepted -> FULLY_RECEIVED, nothing outstanding, close is allowed', () => {
  let { shipment: s } = receive(dispatched(), 'event-full-000001', [{ lineNo: 1, acceptedQuantity: 100 }, { lineNo: 2, acceptedQuantity: 40 }]);
  const r = reconcile(s);
  assert.equal(r.outcome, 'FULLY_RECEIVED'); assert.deepEqual(r.totals, { expected: 140, accepted: 140, rejected: 0, shortClosed: 0, outstanding: 0, unresolvedRejected: 0 });
  assert.equal(r.hasOpenDiscrepancy, false);
  s = closeShipment(s, actor(RECEIVER));
  assert.equal(s.status, 'CLOSED');
});

test('6. partial receiving (100 dispatched, 98 received): 2 stay outstanding, the shipment is NOT treated as fully received, close is refused', () => {
  const { shipment: s } = receive(dispatched(), 'event-part-000001', [{ lineNo: 1, acceptedQuantity: 98 }, { lineNo: 2, acceptedQuantity: 40 }]);
  const r = reconcile(s);
  const line = r.lines[0];
  assert.deepEqual([line.expectedQuantity, line.acceptedQuantity, line.outstandingQuantity], [100, 98, 2]);
  assert.equal(r.outcome, 'PARTIALLY_RECEIVED'); assert.equal(r.hasOpenDiscrepancy, true);
  assert.equal(code(() => closeShipment(s, actor(RECEIVER))), 'OUTSTANDING_QUANTITY');
  assert.equal(s.status, 'DISPATCHED');
});

test('7. receiving above the dispatch quantity is refused, per event and cumulatively; rejected counts toward the limit', () => {
  const d = dispatched();
  assert.equal(code(() => receive(d, 'event-over-000001', [{ lineNo: 1, acceptedQuantity: 101 }])), 'RECEIVE_EXCEEDS_OUTSTANDING');
  assert.equal(code(() => receive(d, 'event-over-000002', [{ lineNo: 1, acceptedQuantity: 60, rejectedQuantity: 41, rejectedReason: 'DAMAGED' }])), 'RECEIVE_EXCEEDS_OUTSTANDING');
  const { shipment: s } = receive(d, 'event-over-000003', [{ lineNo: 1, acceptedQuantity: 70 }]);
  assert.equal(code(() => receive(s, 'event-over-000004', [{ lineNo: 1, acceptedQuantity: 31 }])), 'RECEIVE_EXCEEDS_OUTSTANDING');
  assert.equal(code(() => receive(s, 'event-over-000005', [{ lineNo: 1, acceptedQuantity: 30 }])), null);
  assert.equal(code(() => receive(d, 'event-over-000006', [{ lineNo: 1, acceptedQuantity: MAX_QUANTITY }])), 'RECEIVE_EXCEEDS_OUTSTANDING');
  assert.equal(code(() => receive(d, 'event-over-000007', [{ lineNo: 1, acceptedQuantity: MAX_QUANTITY + 1 }])), 'QUANTITY_OVERFLOW');
});

test('8. duplicate receiving request: same key + same content is a replay (no new event, no new stock); different content is a conflict', () => {
  const first = receive(dispatched(), 'event-dup-0000001', [{ lineNo: 1, acceptedQuantity: 60 }]);
  assert.equal(first.replayed, false);
  const again = applyReceipt(first.shipment, { eventKey: 'event-dup-0000001', actorCompanyId: 1, lines: [{ lineNo: 1, acceptedQuantity: 60, rejectedQuantity: 0 }] }, actor(21, 99));   // other user, other request id
  assert.equal(again.replayed, true); assert.equal(again.shipment, first.shipment, 'identical aggregate: version unchanged');
  assert.equal(stockIntents(again.shipment).length, 1);
  assert.equal(code(() => receive(first.shipment, 'event-dup-0000001', [{ lineNo: 1, acceptedQuantity: 61 }])), 'IDEMPOTENCY_CONFLICT');
  // BR-013 policy: when only ONE receipt is allowed a different key is a duplicate receipt of the same document
  const single = dispatched({ receivingPolicy: { allowMultipleReceipts: false } });
  const once = receive(single, 'event-once-000001', [{ lineNo: 1, acceptedQuantity: 100 }]).shipment;
  assert.equal(code(() => receive(once, 'event-once-000002', [{ lineNo: 2, acceptedQuantity: 40 }])), 'DUPLICATE_RECEIPT');
  assert.equal(receive(once, 'event-once-000001', [{ lineNo: 1, acceptedQuantity: 100 }]).replayed, true, 'but a retry of the first event is still a replay');
  const closed = closeShipment(resolveDiscrepancy(once, { resolutionKey: 'resolve-key-0001', lineNo: 2, target: 'OUTSTANDING', kind: 'SHORT_CLOSED', quantity: 40, reason: 'tidak dikirim' }, actor(RECEIVER)).shipment, actor(RECEIVER));
  assert.equal(receive(closed, 'event-once-000001', [{ lineNo: 1, acceptedQuantity: 100 }]).replayed, true, 'a retry after close is still a replay, not an error');
});

test('9. multiple valid partial receipts accumulate deterministically and reach FULLY_RECEIVED', () => {
  let s = dispatched();
  s = receive(s, 'event-multi-00001', [{ lineNo: 1, acceptedQuantity: 30 }]).shipment;
  s = receive(s, 'event-multi-00002', [{ lineNo: 1, acceptedQuantity: 50 }, { lineNo: 2, acceptedQuantity: 40 }]).shipment;
  assert.deepEqual(reconcile(s).lines.map((l) => [l.acceptedQuantity, l.outstandingQuantity]), [[80, 20], [40, 0]]);
  s = receive(s, 'event-multi-00003', [{ lineNo: 1, acceptedQuantity: 20 }]).shipment;
  assert.equal(reconcile(s).outcome, 'FULLY_RECEIVED');
  assert.deepEqual(s.receipts.map((r) => r.eventKey), ['event-multi-00001', 'event-multi-00002', 'event-multi-00003']);
  // order of event application does not change the figures
  const reorder = receive(receive(receive(dispatched(), 'event-multi-00003', [{ lineNo: 1, acceptedQuantity: 20 }]).shipment, 'event-multi-00002', [{ lineNo: 1, acceptedQuantity: 50 }, { lineNo: 2, acceptedQuantity: 40 }]).shipment, 'event-multi-00001', [{ lineNo: 1, acceptedQuantity: 30 }]).shipment;
  assert.deepEqual(reconcile(reorder).totals, reconcile(s).totals);
});

test('10. damaged/rejected quantities: need a reason, never become stock, stay an open discrepancy until explicitly handled', () => {
  const d = dispatched();
  assert.equal(code(() => receive(d, 'event-rej-0000001', [{ lineNo: 1, acceptedQuantity: 95, rejectedQuantity: 5 }])), 'REJECTION_REASON_REQUIRED');
  assert.equal(code(() => receive(d, 'event-rej-0000002', [{ lineNo: 1, acceptedQuantity: 95, rejectedQuantity: 5, rejectedReason: 'LOST' }])), 'REJECTION_REASON_REQUIRED');
  let s = receive(d, 'event-rej-0000003', [{ lineNo: 1, acceptedQuantity: 95, rejectedQuantity: 5, rejectedReason: 'DAMAGED' }, { lineNo: 2, acceptedQuantity: 40 }]).shipment;
  const r = reconcile(s);
  assert.deepEqual([r.lines[0].acceptedQuantity, r.lines[0].rejectedQuantity, r.lines[0].outstandingQuantity, r.lines[0].unresolvedRejectedQuantity], [95, 5, 0, 5]);
  assert.equal(r.outcome, 'RECEIVED_WITH_DISCREPANCY'); assert.equal(r.hasOpenDiscrepancy, true);
  assert.deepEqual(stockIntents(s).map((i) => [i.storeItemId, i.quantity]), [[77, 95], [79, 40]], 'damaged units are not in the stock intents');
  assert.equal(code(() => closeShipment(s, actor(RECEIVER))), 'UNRESOLVED_REJECTED');
  assert.equal(code(() => resolveDiscrepancy(s, { resolutionKey: 'resolve-key-0001', lineNo: 1, target: 'REJECTED', kind: 'SHORT_CLOSED', quantity: 5, reason: 'rusak' }, actor(RECEIVER))), 'INVALID_TRANSITION', 'a kind belongs to its target');
  assert.equal(code(() => resolveDiscrepancy(s, { resolutionKey: 'resolve-key-0001', lineNo: 1, target: 'REJECTED', kind: 'RETURNED_TO_SOURCE', quantity: 6, reason: 'rusak' }, actor(RECEIVER))), 'RESOLUTION_EXCEEDS_UNRESOLVED');
  s = resolveDiscrepancy(s, { resolutionKey: 'resolve-key-0001', lineNo: 1, target: 'REJECTED', kind: 'RETURNED_TO_SOURCE', quantity: 5, reason: 'dikembalikan ke gudang' }, actor(RECEIVER)).shipment;
  assert.equal(reconcile(s).hasOpenDiscrepancy, false);
  s = closeShipment(s, actor(RECEIVER)); assert.equal(s.status, 'CLOSED');
});

test('receiving input rules: zero, missing, duplicate, unknown lines and wrong branch/state are refused', () => {
  const d = dispatched();
  assert.equal(code(() => receive(d, 'event-bad-0000001', [{ lineNo: 1, acceptedQuantity: 0 }])), 'ZERO_QUANTITY');
  assert.equal(code(() => receive(d, 'event-bad-0000002', [])), 'NO_LINES');
  assert.equal(code(() => receive(d, 'event-bad-0000003', [{ lineNo: 1, acceptedQuantity: 1 }, { lineNo: 1, acceptedQuantity: 1 }])), 'DUPLICATE_LINE');
  assert.equal(code(() => receive(d, 'event-bad-0000004', [{ lineNo: 9, acceptedQuantity: 1 }])), 'LINE_NOT_FOUND');
  assert.equal(code(() => receive(d, 'event-bad-0000005', [{ lineNo: 1, acceptedQuantity: -1 }])), 'INVALID_QUANTITY');
  assert.equal(code(() => receive(d, 'event-bad-0000006', [{ lineNo: 1, acceptedQuantity: 1.5 }])), 'INVALID_QUANTITY');
  assert.equal(code(() => receive(d, 'short', [{ lineNo: 1, acceptedQuantity: 1 }])), 'INVALID_REFERENCE');
  assert.equal(code(() => receive(d, 'event-bad-0000007', [{ lineNo: 1, acceptedQuantity: 1 }], 2)), 'CROSS_BRANCH', 'only the destination branch may receive');
});

test('cancel is possible only before any receipt; a cancelled shipment is terminal', () => {
  assert.equal(code(() => cancelShipment(dispatched(), actor(MAKER), ' ')), 'REASON_REQUIRED');
  const c = cancelShipment(dispatched(), actor(MAKER), 'dibatalkan gudang');
  assert.equal(c.status, 'CANCELLED');
  assert.equal(code(() => receive(c, 'event-can-0000001', [{ lineNo: 1, acceptedQuantity: 1 }])), 'TERMINAL_STATE');
  assert.equal(code(() => cancelShipment(receive(dispatched(), 'event-can-0000002', [{ lineNo: 1, acceptedQuantity: 1 }]).shipment, actor(MAKER), 'terlambat')), 'INVALID_TRANSITION');
});

// ============================================================================================ 13-14 reconciliation + terminal
test('13. reconciliation after a partial receipt is deterministic, balanced and traceable to its source events', () => {
  let s = receive(dispatched(), 'event-rec-0000001', [{ lineNo: 1, acceptedQuantity: 60, rejectedQuantity: 10, rejectedReason: 'REJECTED' }]).shipment;
  s = resolveDiscrepancy(s, { resolutionKey: 'resolve-key-0002', lineNo: 1, target: 'OUTSTANDING', kind: 'SHORT_CLOSED', quantity: 10, reason: 'kurang kirim' }, actor(RECEIVER)).shipment;
  const r = reconcile(s);
  assert.deepEqual(r.lines[0], { lineNo: 1, gudangItemId: 11, storeItemId: 77, mappingRef: 'map:g11:c1:s77', expectedQuantity: 100, acceptedQuantity: 60, rejectedQuantity: 10, shortClosedQuantity: 10, rejectedResolvedQuantity: 0, outstandingQuantity: 20, unresolvedRejectedQuantity: 10 });
  for (const l of r.lines) assert.equal(l.acceptedQuantity + l.rejectedQuantity + l.shortClosedQuantity + l.outstandingQuantity, l.expectedQuantity);
  assert.deepEqual([r.sourceRef, r.receiptKeys, r.resolutionKeys], ['gudang:dispatch:123', ['event-rec-0000001'], ['resolve-key-0002']]);
  assert.deepEqual(reconcile(s), r, 'pure: same input, same output');
  assert.equal(code(() => resolveDiscrepancy(s, { resolutionKey: 'resolve-key-0003', lineNo: 1, target: 'OUTSTANDING', kind: 'SHORT_CLOSED', quantity: 21, reason: 'x lebih' }, actor(RECEIVER))), 'RESOLUTION_EXCEEDS_UNRESOLVED');
  assert.equal(code(() => resolveDiscrepancy(s, { resolutionKey: 'resolve-key-0003', lineNo: 1, target: 'OUTSTANDING', kind: 'SHORT_CLOSED', quantity: 5, reason: '' }, actor(RECEIVER))), 'REASON_REQUIRED');
  assert.equal(resolveDiscrepancy(s, { resolutionKey: 'resolve-key-0002', lineNo: 1, target: 'OUTSTANDING', kind: 'SHORT_CLOSED', quantity: 10, reason: 'kurang kirim' }, actor(RECEIVER)).replayed, true);
  assert.equal(code(() => resolveDiscrepancy(s, { resolutionKey: 'resolve-key-0002', lineNo: 1, target: 'OUTSTANDING', kind: 'SHORT_CLOSED', quantity: 11, reason: 'kurang kirim' }, actor(RECEIVER))), 'IDEMPOTENCY_CONFLICT');
});

test('stock intents: one stable key per (event, line), accepted quantity only, quantity-only (no valuation or accounting fields)', () => {
  const s = receive(receive(dispatched(), 'event-int-0000001', [{ lineNo: 1, acceptedQuantity: 30 }]).shipment, 'event-int-0000002', [{ lineNo: 1, acceptedQuantity: 20, rejectedQuantity: 5, rejectedReason: 'DAMAGED' }, { lineNo: 2, acceptedQuantity: 40 }]).shipment;
  const intents = stockIntents(s);
  assert.deepEqual(intents.map((i) => i.intentKey), ['gudang:dispatch:123|event-int-0000001|1', 'gudang:dispatch:123|event-int-0000002|1', 'gudang:dispatch:123|event-int-0000002|2']);
  assert.deepEqual(intents.map((i) => i.quantity), [30, 20, 40]);
  assert.deepEqual(Object.keys(intents[0]).sort(), ['eventKey', 'intentKey', 'mappingRef', 'quantity', 'sourceRef', 'storeCompanyId', 'storeItemId']);
  assert.equal(new Set(intents.map((i) => i.intentKey)).size, intents.length);
  assert.equal(intents.reduce((n, i) => n + i.quantity, 0), reconcile(s).totals.accepted);
});

test('14. terminal documents are immutable: CLOSED and CANCELLED accept no transition, receipt or resolution (new keys)', () => {
  const closed = closeShipment(receive(dispatched(), 'event-term-0000001', [{ lineNo: 1, acceptedQuantity: 100 }, { lineNo: 2, acceptedQuantity: 40 }]).shipment, actor(RECEIVER));
  const cancelled = cancelShipment(dispatched(), actor(MAKER), 'dibatalkan');
  for (const s of [closed, cancelled]) {
    for (const fn of [submitShipment, approveShipment, dispatchShipment, closeShipment]) assert.equal(code(() => fn(s, actor(CHECKER))), 'TERMINAL_STATE', fn.name);
    assert.equal(code(() => cancelShipment(s, actor(MAKER), 'lagi')), 'TERMINAL_STATE');
    assert.equal(code(() => receive(s, 'event-term-0000009', [{ lineNo: 1, acceptedQuantity: 1 }])), 'TERMINAL_STATE');
    assert.equal(code(() => resolveDiscrepancy(s, { resolutionKey: 'resolve-key-0009', lineNo: 1, target: 'OUTSTANDING', kind: 'SHORT_CLOSED', quantity: 1, reason: 'terlambat' }, actor(RECEIVER))), 'TERMINAL_STATE');
  }
  assert.equal(closed.version, 6);
});

test('inputs are never mutated: transitions return new aggregates', () => {
  const d = dispatched(); const snapshot = JSON.stringify(d);
  receive(d, 'event-mut-0000001', [{ lineNo: 1, acceptedQuantity: 1 }]);
  resolveDiscrepancy(d, { resolutionKey: 'resolve-key-0010', lineNo: 1, target: 'OUTSTANDING', kind: 'SHORT_CLOSED', quantity: 1, reason: 'uji' }, actor(RECEIVER));
  assert.equal(JSON.stringify(d), snapshot);
});

test('a corrupted aggregate (more recorded than expected) is reported as an invariant violation, never reconciled silently', () => {
  const d = dispatched();
  const corrupted = { ...d, receipts: [{ eventKey: 'x', actorUserId: 1, requestId: 'r', at: T, payload: '', lines: [{ lineNo: 1, acceptedQuantity: 101, rejectedQuantity: 0, rejectedReason: null }] }] };
  assert.equal(code(() => reconcile(corrupted)), 'INVARIANT_VIOLATION');
  const overflow = { ...d, receipts: [{ eventKey: 'x', actorUserId: 1, requestId: 'r', at: T, payload: '', lines: [{ lineNo: 1, acceptedQuantity: MAX_QUANTITY, rejectedQuantity: 0, rejectedReason: null }, { lineNo: 1, acceptedQuantity: MAX_QUANTITY, rejectedQuantity: 0, rejectedReason: null }] }] };
  assert.equal(code(() => reconcile(overflow)), 'QUANTITY_OVERFLOW');
});
