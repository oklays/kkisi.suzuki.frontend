import assert from 'node:assert/strict';
import test from 'node:test';
import { WarehouseError } from '@koperasi/domain/warehouse';
import { proposeItemMapping, confirmItemMapping, registerDispatch, advanceDispatch, receiveShipment, listMappingsView, listShipmentsView, warehouseOverview, LIST_LIMIT } from '../src/warehouse/index.ts';
import { makeWarehouseWorld, actor, PERM } from './helpers/warehouse-fakes.mjs';

const code = async (p) => { try { await p; return null; } catch (e) { assert.ok(e instanceof WarehouseError, String(e?.stack ?? e)); return e.code; } };
const IDENT = { kind: 'IDENTICAL' };
const admin = actor(1, [PERM.mapping]), confirmer = actor(2, [PERM.mapping]);
const maker = actor(10, [PERM.create, PERM.view], { warehouseIds: [5, 6] });
const branch1 = actor(20, [PERM.receive, PERM.resolve, PERM.receivingView], { storeCompanyId: 1 }), branch2 = actor(30, [PERM.receive, PERM.resolve, PERM.receivingView], { storeCompanyId: 2 });

// The fake world has write ports only; the read ports are derived from its stores with the same scoping contract the SQL adapter must follow.
async function world() {
  const w = makeWarehouseWorld({ gudang: [{ id: 11, active: true, code: 'G', barcode: '1', unit: 'PCS' }], store: [{ companyId: 1, id: 77, active: true, code: 'S', barcode: '1', unit: 'PCS' }, { companyId: 2, id: 77, active: true, code: 'S', barcode: '1', unit: 'PCS' }] });
  for (const c of [1, 2]) { const m = await proposeItemMapping(w.deps, admin, { gudangItemId: 11, storeCompanyId: c, storeItemId: 77, conversion: IDENT, basis: 'barcode' }); await confirmItemMapping(w.deps, confirmer, { ref: m.ref }); }
  let n = 0; const ref = (c, wh = 5) => `gudang:dispatch:${c}${wh}${++n}0000`;
  const refs = {};
  for (const [name, dest, wh, qty] of [['a', 1, 5, 100], ['b', 2, 5, 40], ['c', 1, 6, 10]]) {
    const sourceRef = ref(dest, wh); refs[name] = sourceRef;
    await registerDispatch(w.deps, actor(10, [PERM.create], { warehouseIds: [wh] }), { sourceRef, sourceWarehouseId: wh, destinationStoreCompanyId: dest, idempotencyKey: `idem-${name}-000001`, receivingPolicy: { allowMultipleReceipts: true }, lines: [{ gudangItemId: 11, quantity: qty }] });
    const mk = actor(10, [PERM.create], { warehouseIds: [wh] }), ck = actor(11, [PERM.approve, PERM.release], { warehouseIds: [wh] });
    await advanceDispatch(w.deps, mk, { sourceRef, destinationStoreCompanyId: dest, action: 'submit' }); await advanceDispatch(w.deps, ck, { sourceRef, destinationStoreCompanyId: dest, action: 'approve' }); await advanceDispatch(w.deps, ck, { sourceRef, destinationStoreCompanyId: dest, action: 'dispatch' });
  }
  await receiveShipment(w.deps, branch1, { sourceRef: refs.a, eventKey: 'event-read-0000001', lines: [{ lineNo: 1, acceptedQuantity: 98 }] });
  const read = {
    mappings: { async list(f, limit) { return [...w.mappings.values()].filter((m) => (f.storeCompanyId === null || m.storeCompanyId === f.storeCompanyId) && (f.status === null || m.status === f.status)).slice(0, limit); } },
    shipments: { async list(f, limit) { return [...w.shipments.values()].filter((s) => (f.status === null || s.status === f.status) && (f.destinationStoreCompanyId === null || s.destinationStoreCompanyId === f.destinationStoreCompanyId) && (f.sourceWarehouseIds === null || f.sourceWarehouseIds.includes(s.sourceWarehouseId))).slice(0, limit); } },
    now: () => new Date('2026-10-17T00:00:00Z'),
  };
  return { w, read, refs };
}

test('lists are permission-gated and scope-pinned: a Gudang user sees their warehouses, a branch user only documents addressed to their branch', async () => {
  const { read, refs } = await world();
  const wh5 = actor(40, [PERM.view], { warehouseIds: [5] }), wh6 = actor(41, [PERM.view], { warehouseIds: [6] });
  assert.deepEqual((await listShipmentsView(read, wh5)).items.map((s) => s.sourceRef).sort(), [refs.a, refs.b].sort());
  assert.deepEqual((await listShipmentsView(read, wh6)).items.map((s) => s.sourceRef), [refs.c]);
  assert.deepEqual((await listShipmentsView(read, branch1)).items.map((s) => s.sourceRef).sort(), [refs.a, refs.c].sort());
  assert.deepEqual((await listShipmentsView(read, branch2)).items.map((s) => s.sourceRef), [refs.b]);
  assert.deepEqual((await listShipmentsView(read, branch1, { destinationStoreCompanyId: 2 })).items.map((s) => s.sourceRef).sort(), [refs.a, refs.c].sort(), 'a branch user cannot widen the scope by asking for another branch');
  assert.equal(await code(listShipmentsView(read, actor(50, []))), 'FORBIDDEN'); assert.equal(await code(listShipmentsView(read, actor(51, [PERM.receivingView]))), 'FORBIDDEN', 'receiving view without a branch');
  assert.equal(await code(listShipmentsView(read, actor(52, [PERM.create], { warehouseIds: [5] }))), 'FORBIDDEN', 'create is not view');
});

test('a repository that ignores the scope filter still cannot leak another scope (defence in depth)', async () => {
  const { read, refs } = await world();
  const leaky = { ...read, shipments: { async list(_f, limit) { return [...(await read.shipments.list({ status: null, destinationStoreCompanyId: null, sourceWarehouseIds: null }, limit))]; } } };
  assert.deepEqual((await listShipmentsView(leaky, branch2)).items.map((s) => s.sourceRef), [refs.b]);
  assert.deepEqual((await listShipmentsView(leaky, actor(40, [PERM.view], { warehouseIds: [6] }))).items.map((s) => s.sourceRef), [refs.c]);
});

test('mapping list: view or manage permission; a branch user is pinned to their branch; filters apply', async () => {
  const { read } = await world();
  assert.equal(await code(listMappingsView(read, actor(60, []))), 'FORBIDDEN');
  assert.equal((await listMappingsView(read, admin)).items.length, 2);
  assert.deepEqual((await listMappingsView(read, actor(61, ['warehouse.mapping.view']), { storeCompanyId: 2 })).items.map((m) => m.storeCompanyId), [2]);
  assert.deepEqual((await listMappingsView(read, actor(62, ['warehouse.mapping.view'], { storeCompanyId: 1 }), { storeCompanyId: 2 })).items.map((m) => m.storeCompanyId), [1], 'pinned to the user\'s own branch');
  assert.equal((await listMappingsView(read, admin, { status: 'PROPOSED' })).items.length, 0);
});

test('summaries come from the real reconciliation: partial receipt keeps the outstanding units; treatment stays UNSPECIFIED without a policy', async () => {
  const { read, refs } = await world();
  const a = (await listShipmentsView(read, maker)).items.find((s) => s.sourceRef === refs.a);
  assert.deepEqual([a.outcome, a.totals.expected, a.totals.accepted, a.totals.outstanding, a.hasOpenDiscrepancy, a.treatment], ['PARTIALLY_RECEIVED', 100, 98, 2, true, 'UNSPECIFIED']);
  const open = await listShipmentsView(read, maker, { onlyOpenDiscrepancy: true }); assert.equal(open.items.length, 3, 'every dispatched document still awaits units');
  const policy = await listShipmentsView({ ...read, treatment: { treatmentFor: () => 'INTERNAL_TRANSFER' } }, maker); assert.ok(policy.items.every((s) => s.treatment === 'INTERNAL_TRANSFER'), 'only a supplied policy changes it');
  const o = await warehouseOverview(read, maker); assert.deepEqual([o.shipments.DISPATCHED, o.outcomes.PARTIALLY_RECEIVED, o.outcomes.NOT_RECEIVED, o.openDiscrepancies, o.outstandingUnits, o.acceptedUnits, o.treatmentUnspecified], [3, 1, 2, 1, 52, 98, 3]);
});

test('lists are bounded: one extra row detects truncation and no more than the limit is returned', async () => {
  const many = Array.from({ length: LIST_LIMIT + 5 }, (_, i) => ({ sourceRef: `gudang:dispatch:${i}`, sourceWarehouseId: 5, destinationStoreCompanyId: 1, status: 'DRAFT', lines: [], receipts: [], resolutions: [], history: [], version: 1, createdAt: 'x', receivingPolicy: { allowMultipleReceipts: true } }));
  const read = { mappings: { async list() { return []; } }, shipments: { async list(_f, limit) { return many.slice(0, limit); } }, now: () => new Date() };
  const v = await listShipmentsView(read, actor(70, [PERM.view], { warehouseIds: [5] })); assert.equal(v.items.length, LIST_LIMIT); assert.equal(v.truncated, true);
});
