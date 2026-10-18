import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { WarehouseError, stockIntents } from '@koperasi/domain/warehouse';
import {
  WAREHOUSE_PERMISSIONS as P, advanceDispatch, closeShipmentForBranch, confirmItemMapping, drainStockOutbox, enqueueStockIntents, proposeItemMapping, receiveShipment, registerDispatch, resolveShipmentDiscrepancy, retireItemMapping, MAX_SAVE_ATTEMPTS,
} from '@koperasi/application/warehouse';
import { PrismaWarehouseStore, PrismaStockOutbox, PrismaSimulatedStockApplier, requeueDeadLetter, outboxReconciliation } from '../src/infrastructure/warehouse/warehouse-store.repository.ts';
import { MemoryWarehouseStore } from '../src/infrastructure/warehouse/memory-store.ts';
import { runApplierContract, runOutboxContract } from '../../../packages/application/tests/contracts/stock-contracts.mjs';

// Opt-in LOCAL rehearsal of the Warehouse persistence proposal against real database constraints (kkisi_warehouse_rehearsal, account kkisi_wh_rehearsal):
//   bash scripts/setup-warehouse-rehearsal.sh --apply
//   WAREHOUSE_REHEARSAL_DB_TEST=1 node --experimental-strip-types --env-file=.env.warehouse-rehearsal --test tests/warehouse-store-db.test.mjs
// Never touches TOKO stock, Gudang, the Console store or any production database. The account cannot DELETE, so every test works in its own random namespace.
const ON = process.env.WAREHOUSE_REHEARSAL_DB_TEST === '1';
const RUN = randomBytes(3).toString('hex');
// Unique ids per run: the account has no DELETE, so every run's rows stay. Each run owns its own block of 1000 ids above 1e9 (the old 100000 + RUN % 700000 + seq*1000
// scheme could overlap between runs whose offsets differed by a multiple of 1000).
let seq = 0; const uid = () => 1_000_000_000 + (parseInt(RUN, 16) % 900_000) * 1000 + ++seq;

const code = async (p) => { try { await p; return null; } catch (e) { return e instanceof WarehouseError ? e.code : `OTHER:${String(e?.message).slice(0, 80)}`; } };
const refused = async (db, sql, ...p) => { try { await db.$executeRawUnsafe(sql, ...p); return 'ALLOWED'; } catch (e) { const m = String(e?.message); return /1644/.test(m) ? 'TRIGGER' : /1062/.test(m) ? 'DUPLICATE' : /4025|3819|CONSTRAINT/i.test(m) ? 'CHECK' : /1265/.test(m) ? 'ENUM' : /1142|denied/i.test(m) ? 'DENIED' : /1451|1452|foreign/i.test(m) ? 'FK' : `OTHER:${m.slice(0, 120)}`; } };
const actor = (userId, permissions, extra = {}) => ({ userId, requestId: `rehearsal-${RUN}-${userId}`, permissions: new Set(permissions), storeCompanyId: extra.storeCompanyId ?? null, warehouseIds: extra.warehouseIds ?? new Set() });
const IDENT = { kind: 'IDENTICAL' };

async function harness() {
  const url = new URL(process.env.WAREHOUSE_REHEARSAL_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname)); assert.equal(url.pathname, '/kkisi_warehouse_rehearsal'); assert.equal(decodeURIComponent(url.username), 'kkisi_wh_rehearsal');
  const db = new PrismaClient({ datasourceUrl: process.env.WAREHOUSE_REHEARSAL_URL });
  const store = new PrismaWarehouseStore(db); const catalog = new MemoryWarehouseStore();
  let tick = 0; const now = () => new Date(Date.UTC(2026, 9, 17, 5, 0, tick++));
  const deps = { mappings: store, shipments: store, items: catalog, now };
  return { db, store, catalog, deps, outbox: new PrismaStockOutbox(db), applier: new PrismaSimulatedStockApplier(db), now };
}
async function scenario(h, { qty = 100, multi = true } = {}) {
  const g = uid(), s = uid(), c = 1 + (seq % 3);   // gudang item, store item, branch (1..3)
  h.catalog.seedGudangItem({ id: g, active: true, code: `RG-${g}`, barcode: `B${g}`, unit: 'PCS' }); h.catalog.seedStoreItem(c, { id: s, active: true, code: `RS-${s}`, barcode: `B${g}`, unit: 'PCS' });
  const admin = actor(1, [P.MAPPING_MANAGE, P.MAPPING_VIEW]), confirmer = actor(2, [P.MAPPING_MANAGE]), warehouseIds = new Set([uid()]);   // run-unique: the fake clock restarts each run, so a shared warehouse id let older runs' shipments crowd the current one out of list(..., 10)
  const maker = actor(10, [P.DISPATCH_CREATE, P.DISPATCH_VIEW], { warehouseIds }), checker = actor(11, [P.DISPATCH_APPROVE, P.DISPATCH_RELEASE], { warehouseIds }), branch = actor(20, [P.RECEIVE, P.RESOLVE, P.RECEIVING_VIEW], { storeCompanyId: c });
  const m = await proposeItemMapping(h.deps, admin, { gudangItemId: g, storeCompanyId: c, storeItemId: s, conversion: IDENT, basis: 'barcode' }); await confirmItemMapping(h.deps, confirmer, { ref: m.ref });
  const sourceRef = `rehearsal:dispatch:${RUN}-${g}`;
  await registerDispatch(h.deps, maker, { sourceRef, sourceWarehouseId: [...warehouseIds][0], destinationStoreCompanyId: c, idempotencyKey: `idem-${RUN}-${g}`, receivingPolicy: { allowMultipleReceipts: multi }, lines: [{ gudangItemId: g, quantity: qty }] });
  for (const [who, a] of [[maker, 'submit'], [checker, 'approve'], [checker, 'dispatch']]) await advanceDispatch(h.deps, who, { sourceRef, destinationStoreCompanyId: c, action: a });
  return { g, s, c, sourceRef, branch, maker, checker, admin, confirmer, mapping: m };
}
const recv = (h, sc, key, accepted, extra = {}) => receiveShipment(h.deps, sc.branch, { sourceRef: sc.sourceRef, eventKey: `event-${RUN}-${key}`, lines: [{ lineNo: 1, acceptedQuantity: accepted, rejectedQuantity: 0, rejectedReason: null, ...extra }] });
const balance = async (db, c, s) => Number((await db.$queryRaw`SELECT COALESCE(SUM(quantity), 0) AS q FROM warehouse_sim_stock_balance WHERE store_company_id = ${c} AND store_item_id = ${s}`)[0].q);
const ledgerCount = async (db, sourceRef) => Number((await db.$queryRawUnsafe('SELECT COUNT(*) AS n FROM warehouse_sim_stock_ledger WHERE intent_key LIKE ?', `${sourceRef}|%`))[0].n);

test('database constraints refuse what the application would also refuse (and what a bug might attempt)', { skip: !ON }, async () => {
  const h = await harness();
  try {
    const g = uid(), s = uid(), s2 = uid(), g2 = uid();
    const ins = (ref, gi, si, over = '') => h.db.$executeRawUnsafe(`INSERT INTO warehouse_item_map (ref, gudang_item_id, store_company_id, store_item_id, gudang_unit, store_unit, conv_kind, basis, status, proposed_by, proposed_at ${over ? ', ' + over.split('|')[0] : ''}) VALUES (?,?,?,?,?,?,?,?,?,?,? ${over ? ', ' + over.split('|')[1] : ''})`, ref, gi, 7, si, 'PCS', 'PCS', 'IDENTICAL', 'manual', 'PROPOSED', 1, 'x');
    await ins(`map:g${g}:c7:s${s}`, g, s);
    assert.equal(await refused(h.db, `INSERT INTO warehouse_item_map (ref, gudang_item_id, store_company_id, store_item_id, gudang_unit, store_unit, conv_kind, basis, status, proposed_by, proposed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, `map:g${g}:c7:s${s2}`, g, 7, s2, 'PCS', 'PCS', 'IDENTICAL', 'manual', 'PROPOSED', 1, 'x'), 'DUPLICATE', 'same Gudang item twice in one branch');
    assert.equal(await refused(h.db, `INSERT INTO warehouse_item_map (ref, gudang_item_id, store_company_id, store_item_id, gudang_unit, store_unit, conv_kind, basis, status, proposed_by, proposed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, `map:g${g2}:c7:s${s}`, g2, 7, s, 'PCS', 'PCS', 'IDENTICAL', 'manual', 'PROPOSED', 1, 'x'), 'DUPLICATE', 'same TOKO item twice in one branch');
    assert.equal(await refused(h.db, `INSERT INTO warehouse_item_map (ref, gudang_item_id, store_company_id, store_item_id, gudang_unit, store_unit, conv_kind, basis, status, proposed_by, proposed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, `map:g${g}:c8:s${s}`, g, 8, s, 'PCS', 'PCS', 'IDENTICAL', 'manual', 'PROPOSED', 1, 'x'), 'ALLOWED', 'another branch is independent');
    assert.equal(await refused(h.db, `INSERT INTO warehouse_item_map (ref, gudang_item_id, store_company_id, store_item_id, gudang_unit, store_unit, conv_kind, conv_numerator, conv_denominator, basis, status, proposed_by, proposed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, `map:g${g2}:c9:s${s2}`, g2, 9, s2, 'BOX', 'PCS', 'RATIO', 12, 1, 'manual', 'PROPOSED', 1, 'x'), 'CHECK', 'a ratio without approver and evidence is refused');
    assert.equal(await refused(h.db, `INSERT INTO warehouse_item_map (ref, gudang_item_id, store_company_id, store_item_id, gudang_unit, store_unit, conv_kind, basis, status, proposed_by, proposed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, `map:g${g2}:c9:s${s2}`, g2, 9, s2, 'PCS', 'PCS', 'IDENTICAL', 'manual', 'CONFIRMED', 1, 'x'), 'CHECK', 'CONFIRMED without a confirmer is refused');
    assert.equal(await refused(h.db, 'UPDATE warehouse_item_map SET store_item_id = ? WHERE ref = ?', s2, `map:g${g}:c7:s${s}`), 'DENIED', 'identity columns are not even grantable for UPDATE');
    assert.equal(await refused(h.db, "UPDATE warehouse_item_map SET status = 'RETIRED', retired_by = 1, retired_at = 'x', retire_reason = 'rehearsal retire' WHERE ref = ?", `map:g${g}:c7:s${s}`), 'ALLOWED');
    assert.equal(await refused(h.db, "UPDATE warehouse_item_map SET status = 'PROPOSED' WHERE ref = ?", `map:g${g}:c7:s${s}`), 'TRIGGER', 'a retired mapping never changes (trigger)');
    assert.equal(await refused(h.db, `INSERT INTO warehouse_item_map (ref, gudang_item_id, store_company_id, store_item_id, gudang_unit, store_unit, conv_kind, basis, status, proposed_by, proposed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, `map:g${g}:c7:s${s}x`, g, 7, s, 'PCS', 'PCS', 'IDENTICAL', 'manual', 'PROPOSED', 1, 'x'), 'ALLOWED', 'after retirement the same pair may be proposed again');
    assert.equal(await refused(h.db, 'DELETE FROM warehouse_item_map WHERE ref = ?', 'x'), 'DENIED');

    const sc = await scenario(h); await recv(h, sc, 'k1', 10);
    const head = (await h.db.$queryRaw`SELECT id, version FROM warehouse_shipment WHERE source_ref = ${sc.sourceRef}`)[0];
    assert.equal(await refused(h.db, "INSERT INTO warehouse_shipment (source_ref, destination_store_company_id, source_warehouse_id, status, maker_user_id, fingerprint, idempotency_key, allow_multiple_receipts, version, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)", sc.sourceRef, sc.c, 1, 'DRAFT', 1, 'f', 'idem-dup-0001', 1, 1, 'x'), 'DUPLICATE', 'one shipment per (source document, destination)');
    assert.equal(await refused(h.db, "UPDATE warehouse_shipment SET fingerprint = 'tampered' WHERE id = ?", Number(head.id)), 'DENIED', 'fingerprint is not updatable by the account');
    assert.equal(await refused(h.db, "UPDATE warehouse_shipment SET version = version + 2 WHERE id = ?", Number(head.id)), 'TRIGGER', 'version advances by exactly one');
    assert.equal(await refused(h.db, "INSERT INTO warehouse_receipt (shipment_id, event_key, actor_user_id, request_id, at, payload) VALUES (?,?,?,?,?,?)", Number(head.id), `event-${RUN}-k1`, 1, 'r', 'x', 'p'), 'DUPLICATE', 'one receipt per event key');
    assert.equal(await refused(h.db, 'UPDATE warehouse_receipt SET payload = ? WHERE shipment_id = ?', 'x', Number(head.id)), 'DENIED'); assert.equal(await refused(h.db, 'DELETE FROM warehouse_history WHERE shipment_id = ?', Number(head.id)), 'DENIED');
    assert.equal(await refused(h.db, "INSERT INTO warehouse_receipt_line (receipt_id, line_no, accepted_quantity, rejected_quantity, rejected_reason) SELECT id, 9, 1, 1, NULL FROM warehouse_receipt WHERE shipment_id = ? LIMIT 1", Number(head.id)), 'CHECK', 'a rejected quantity needs a reason');
    assert.equal(await refused(h.db, 'DELETE FROM warehouse_shipment WHERE id = ?', Number(head.id)), 'DENIED');

    const key = `${sc.sourceRef}|manual|1`;
    const outIns = () => h.db.$executeRawUnsafe("INSERT INTO warehouse_stock_outbox (intent_key, source_ref, event_key, store_company_id, store_item_id, mapping_ref, quantity, treatment, enqueued_at) VALUES (?,?,?,?,?,?,?,?,?)", key, sc.sourceRef, 'manual', sc.c, sc.s, sc.mapping.ref, 5, 'INTERNAL_TRANSFER', 'x');
    await outIns(); assert.equal(await refused(h.db, "INSERT INTO warehouse_stock_outbox (intent_key, source_ref, event_key, store_company_id, store_item_id, mapping_ref, quantity, treatment, enqueued_at) VALUES (?,?,?,?,?,?,?,?,?)", key, sc.sourceRef, 'manual', sc.c, sc.s, sc.mapping.ref, 5, 'INTERNAL_TRANSFER', 'x'), 'DUPLICATE', 'the intent key is the primary key');
    assert.equal(await refused(h.db, "INSERT INTO warehouse_stock_outbox (intent_key, source_ref, event_key, store_company_id, store_item_id, mapping_ref, quantity, treatment, enqueued_at) VALUES (?,?,?,?,?,?,?,?,?)", `${key}z`, sc.sourceRef, 'manual', sc.c, sc.s, sc.mapping.ref, 0, 'INTERNAL_TRANSFER', 'x'), 'CHECK', 'zero quantity');
    assert.equal(await refused(h.db, "INSERT INTO warehouse_stock_outbox (intent_key, source_ref, event_key, store_company_id, store_item_id, mapping_ref, quantity, treatment, enqueued_at) VALUES (?,?,?,?,?,?,?,?,?)", `${key}u`, sc.sourceRef, 'manual', sc.c, sc.s, sc.mapping.ref, 5, 'UNSPECIFIED', 'x'), 'ENUM', 'UNSPECIFIED treatment is not representable');
    assert.equal(await refused(h.db, 'UPDATE warehouse_stock_outbox SET quantity = 6 WHERE intent_key = ?', key), 'DENIED', 'content columns are not updatable by the account');
    assert.equal(await refused(h.db, "UPDATE warehouse_stock_outbox SET status = 'APPLIED' WHERE intent_key = ?", key), 'CHECK', 'APPLIED needs applied_at');
    assert.equal(await refused(h.db, "UPDATE warehouse_stock_outbox SET status = 'APPLIED', applied_at = 'x' WHERE intent_key = ?", key), 'ALLOWED');
    assert.equal(await refused(h.db, "UPDATE warehouse_stock_outbox SET status = 'PENDING', applied_at = NULL WHERE intent_key = ?", key), 'TRIGGER', 'an applied record never goes back');
    assert.equal(await refused(h.db, 'DELETE FROM warehouse_stock_outbox WHERE intent_key = ?', key), 'DENIED');
    await h.db.$executeRawUnsafe("INSERT INTO warehouse_sim_stock_ledger (intent_key, store_company_id, store_item_id, quantity, applied_at) VALUES (?,?,?,?,?)", key, sc.c, sc.s, 5, 'x');
    assert.equal(await refused(h.db, "INSERT INTO warehouse_sim_stock_ledger (intent_key, store_company_id, store_item_id, quantity, applied_at) VALUES (?,?,?,?,?)", key, sc.c, sc.s, 5, 'x'), 'DUPLICATE', 'the posting ledger cannot apply a key twice');
    assert.equal(await refused(h.db, 'UPDATE warehouse_sim_stock_ledger SET quantity = 9 WHERE intent_key = ?', key), 'DENIED'); assert.equal(await refused(h.db, 'DELETE FROM warehouse_sim_stock_ledger WHERE intent_key = ?', key), 'DENIED');
    await h.db.$executeRawUnsafe("INSERT INTO warehouse_audit_event (occurred_at, actor_user_id, action, subject, request_id) VALUES (NOW(3), 1, 'rehearsal.check', ?, 'r')", `rehearsal:${RUN}`);
    assert.equal(await refused(h.db, "UPDATE warehouse_audit_event SET action = 'rehearsal.other' WHERE subject = ?", `rehearsal:${RUN}`), 'DENIED'); assert.equal(await refused(h.db, "DELETE FROM warehouse_audit_event WHERE subject = ?", `rehearsal:${RUN}`), 'DENIED');
    assert.equal(await refused(h.db, "INSERT INTO warehouse_audit_event (occurred_at, actor_user_id, action, subject, request_id) VALUES (NOW(3), 1, 'Bad Action!', 'x', 'r')"), 'CHECK');
    assert.equal(await refused(h.db, 'DROP TABLE warehouse_stock_outbox'), 'DENIED'); assert.equal(await refused(h.db, 'ALTER TABLE warehouse_stock_outbox ADD COLUMN x INT'), 'DENIED');
  } finally { await h.db.$disconnect(); }
});

test('repositories keep the port contracts: persisted aggregates round-trip, replays are idempotent, concurrent writers are serialised', { skip: !ON }, async () => {
  const h = await harness();
  try {
    const sc = await scenario(h);
    const loaded = await h.store.find(sc.sourceRef, sc.c); assert.equal(loaded.status, 'DISPATCHED'); assert.equal(loaded.version, 4); assert.deepEqual(loaded.history.map((x) => x.type), ['CREATED', 'SUBMITTED', 'APPROVED', 'DISPATCHED']);
    const again = await registerDispatch(h.deps, sc.maker, { sourceRef: sc.sourceRef, sourceWarehouseId: loaded.sourceWarehouseId, destinationStoreCompanyId: sc.c, idempotencyKey: loaded.idempotencyKey, receivingPolicy: { allowMultipleReceipts: true }, lines: [{ gudangItemId: sc.g, quantity: 100 }] });
    assert.equal(again.replayed, true, 'the same document is a replay, not a second row');
    assert.equal(Number((await h.db.$queryRaw`SELECT COUNT(*) AS n FROM warehouse_shipment WHERE source_ref = ${sc.sourceRef}`)[0].n), 1);
    const dup = await Promise.allSettled([1, 2].map((id) => proposeItemMapping(h.deps, actor(id, [P.MAPPING_MANAGE]), { gudangItemId: uid(), storeCompanyId: 1, storeItemId: sc.s + 7, conversion: IDENT, basis: 'manual' }).catch((e) => { throw e; })));
    // (different gudang ids, same store item: the TOKO side is unique per branch, so exactly one of two concurrent proposals may win)
    const s2 = uid(); const g3 = uid(), g4 = uid(); h.catalog.seedGudangItem({ id: g3, active: true, code: `RG-${g3}`, barcode: null, unit: 'PCS' }); h.catalog.seedGudangItem({ id: g4, active: true, code: `RG-${g4}`, barcode: null, unit: 'PCS' }); h.catalog.seedStoreItem(2, { id: s2, active: true, code: `RS-${s2}`, barcode: null, unit: 'PCS' });
    const race = await Promise.allSettled([g3, g4].map((g, i) => proposeItemMapping(h.deps, actor(30 + i, [P.MAPPING_MANAGE]), { gudangItemId: g, storeCompanyId: 2, storeItemId: s2, conversion: IDENT, basis: 'manual' })));
    // Exactly one wins. Which refusal the loser gets depends on timing and both are correct: AMBIGUOUS_MAPPING when its pre-check already sees the winner's committed
    // mapping, DUPLICATE_MAPPING when both passed the pre-check and the unique key refused the second insert (pinning one code made this test timing-dependent).
    assert.deepEqual(race.map((r) => r.status).sort(), ['fulfilled', 'rejected']); assert.ok(['DUPLICATE_MAPPING', 'AMBIGUOUS_MAPPING'].includes(race.find((r) => r.status === 'rejected').reason.code)); void dup;
    assert.equal(Number((await h.db.$queryRaw`SELECT COUNT(*) AS n FROM warehouse_item_map WHERE store_company_id = 2 AND store_item_id = ${s2}`)[0].n), 1, 'exactly one mapping persisted for the contested store item');

    // concurrent receipts with DIFFERENT event keys on one shipment: version compare-and-set serialises them; the bounded retry lets both succeed; no unit is lost or doubled
    const [r1, r2] = await Promise.all([recv(h, sc, 'a', 30), recv(h, sc, 'b', 20)]);
    const after = await h.store.find(sc.sourceRef, sc.c); assert.equal(after.receipts.length, 2); assert.equal(after.receipts.reduce((t, r) => t + r.lines[0].acceptedQuantity, 0), 50); assert.ok(r1 && r2);
    assert.equal(after.version, 6); assert.deepEqual(after.history.map((x) => x.seq), [1, 2, 3, 4, 5, 6]);
    // concurrent SAME event key: one write, the other a replay
    const same = await Promise.all([recv(h, sc, 'dup', 5), recv(h, sc, 'dup', 5), recv(h, sc, 'dup', 5)]);
    assert.equal((await h.store.find(sc.sourceRef, sc.c)).receipts.filter((r) => r.eventKey === `event-${RUN}-dup`).length, 1); assert.ok(same.every(Boolean));
    assert.equal(await code(recv(h, sc, 'dup', 6)), 'IDEMPOTENCY_CONFLICT', 'the same event key with another payload is refused');
    assert.equal(await code(recv(h, sc, 'toomuch', 1000)), 'RECEIVE_EXCEEDS_OUTSTANDING');
    // direct compare-and-set: a stale writer loses, nothing is partially written
    const stale = await h.store.find(sc.sourceRef, sc.c); const before = Number((await h.db.$queryRaw`SELECT COUNT(*) AS n FROM warehouse_history`)[0].n);
    await assert.rejects(h.store.save({ ...stale, version: stale.version + 1, status: 'CLOSED', history: [...stale.history, { seq: stale.history.length + 1, type: 'CLOSED', actorUserId: 1, requestId: 'x', at: 'x', ref: null }] }, stale.version - 1), (e) => e.code === 'VERSION_CONFLICT');
    assert.equal(Number((await h.db.$queryRaw`SELECT COUNT(*) AS n FROM warehouse_history`)[0].n), before, 'a rejected save writes nothing (one transaction)');
    assert.ok(MAX_SAVE_ATTEMPTS >= 3);
    assert.equal(await h.store.hasOpenShipmentForMapping(sc.mapping.ref), true);
    await assert.rejects(retireItemMapping(h.deps, sc.confirmer, { ref: sc.mapping.ref, reason: 'rehearsal retire attempt' }), (e) => e.code === 'MAPPING_IN_USE');
    const list = await h.store.list({ status: null, destinationStoreCompanyId: sc.c, sourceWarehouseIds: [loaded.sourceWarehouseId] }, 10); assert.ok(list.some((x) => x.sourceRef === sc.sourceRef));
    assert.equal((await h.store.list({ status: null, destinationStoreCompanyId: null, sourceWarehouseIds: [] }, 10)).length, 0, 'an empty warehouse scope sees nothing');
  } finally { await h.db.$disconnect(); }
});

test('outbox + posting side: durable, idempotent, atomic; crash, duplicate delivery, conflict, concurrent consumers and dead letters behave as specified', { skip: !ON }, async () => {
  const h = await harness(); const policy = { treatmentFor: () => 'INTERNAL_TRANSFER' };
  try {
    // 1. durable outbox from a persisted shipment; replay inserts nothing; refused without a treatment
    const sc = await scenario(h); await recv(h, sc, 'r1', 60); await recv(h, sc, 'r2', 38);
    const shipment = await h.store.find(sc.sourceRef, sc.c);
    assert.equal(await code(enqueueStockIntents({ outbox: h.outbox, now: h.now }, shipment)), 'POLICY_REQUIRED'); assert.equal((await h.outbox.all()).filter((r) => r.sourceRef === sc.sourceRef).length, 0);
    const deps = { outbox: h.outbox, now: h.now, treatment: policy };
    assert.deepEqual(await enqueueStockIntents(deps, shipment), { inserted: 2, existing: 0 }); assert.deepEqual(await enqueueStockIntents(deps, shipment), { inserted: 0, existing: 2 });
    const tampered = structuredClone(shipment); tampered.receipts[0].lines[0].acceptedQuantity = 61; assert.equal(await code(enqueueStockIntents(deps, tampered)), 'IDEMPOTENCY_CONFLICT');
    assert.deepEqual((await h.outbox.all()).filter((r) => r.sourceRef === sc.sourceRef).map((r) => r.quantity).sort((a, b) => a - b), [38, 60], 'the stored content was never overwritten');
    let rec = await outboxReconciliation(h.db, sc.sourceRef); assert.ok(rec.every((r) => r.finding === 'PENDING'));

    // 2. concurrent consumers: both drain the same pending records; the ledger primary key lets each intent through exactly once
    const dd = { outbox: h.outbox, applier: h.applier, now: h.now };
    const [x, y] = await Promise.all([drainStockOutbox(dd), drainStockOutbox(dd)]);
    assert.equal(await balance(h.db, sc.c, sc.s), 98, 'stock increased once per accepted line, never doubled'); assert.equal(await ledgerCount(h.db, sc.sourceRef), 2);
    assert.equal(x.applied + y.applied + x.alreadyApplied + y.alreadyApplied >= 2, true);
    rec = await outboxReconciliation(h.db, sc.sourceRef); assert.ok(rec.every((r) => r.finding === 'CONSISTENT'));
    assert.deepEqual(await drainStockOutbox(dd), { applied: 0, alreadyApplied: 0, failed: 0, dead: 0 });
    const intents = stockIntents(shipment); assert.equal(intents.reduce((t, i) => t + i.quantity, 0), await balance(h.db, sc.c, sc.s), 'posted total equals the accepted total of the shipment');

    // 3. duplicate delivery to the posting side: the second apply of one key answers ALREADY_APPLIED and changes nothing
    const one = (await h.outbox.all()).find((r) => r.sourceRef === sc.sourceRef);
    assert.equal(await h.applier.apply(one), 'ALREADY_APPLIED'); assert.equal(await balance(h.db, sc.c, sc.s), 98);

    // 4. crash AFTER the stock change but BEFORE the acknowledgement: the retry acknowledges, stock is not changed again
    const sc2 = await scenario(h); await recv(h, sc2, 'c1', 40); await enqueueStockIntents(deps, await h.store.find(sc2.sourceRef, sc2.c));
    let crashed = false; const crashing = { apply: async (r) => { const res = await h.applier.apply(r); if (!crashed) { crashed = true; throw new Error('process crashed after the stock change'); } return res; } };
    const first = await drainStockOutbox({ ...dd, applier: crashing }); assert.deepEqual([first.applied, first.failed], [0, 1]);
    assert.equal(await balance(h.db, sc2.c, sc2.s), 40, 'the stock change itself committed'); rec = await outboxReconciliation(h.db, sc2.sourceRef); assert.equal(rec[0].finding, 'APPLIED_NOT_ACKNOWLEDGED');
    const second = await drainStockOutbox(dd); assert.deepEqual([second.applied, second.alreadyApplied], [0, 1]); assert.equal(await balance(h.db, sc2.c, sc2.s), 40);
    assert.equal((await outboxReconciliation(h.db, sc2.sourceRef))[0].finding, 'CONSISTENT');

    // 5. failures, attempt limit, dead letter; manual recovery rules (reason required, audited, ledger checked first)
    const sc3 = await scenario(h); await recv(h, sc3, 'd1', 25); await enqueueStockIntents(deps, await h.store.find(sc3.sourceRef, sc3.c));
    const failing = { apply: async () => { throw new Error('toko writer unavailable'); } };
    const f1 = await drainStockOutbox({ ...dd, applier: failing }, { maxAttempts: 2 }); const f2 = await drainStockOutbox({ ...dd, applier: failing }, { maxAttempts: 2 });
    assert.deepEqual([f1.failed, f2.dead], [1, 1]); const dead = (await h.outbox.all()).find((r) => r.sourceRef === sc3.sourceRef); assert.deepEqual([dead.status, dead.attempts, dead.lastError], ['DEAD', 2, 'toko writer unavailable']);
    assert.equal((await outboxReconciliation(h.db, sc3.sourceRef))[0].finding, 'DEAD_NEEDS_ACTION'); assert.deepEqual(await drainStockOutbox(dd), { applied: 0, alreadyApplied: 0, failed: 0, dead: 0 }, 'a dead record is not drained');
    await assert.rejects(requeueDeadLetter(h.db, { intentKey: dead.intentKey, actorUserId: 5, requestId: 'r', reason: 'short' }), /REASON_REQUIRED/);
    assert.equal(await requeueDeadLetter(h.db, { intentKey: 'nope|x|1', actorUserId: 5, requestId: 'r', reason: 'rehearsal requeue of a missing key' }), 'NOT_FOUND');
    assert.equal(await requeueDeadLetter(h.db, { intentKey: dead.intentKey, actorUserId: 5, requestId: `req-${RUN}`, reason: 'rehearsal: writer restored, replay' }), 'REQUEUED');
    assert.equal(await requeueDeadLetter(h.db, { intentKey: dead.intentKey, actorUserId: 5, requestId: 'r', reason: 'rehearsal: second attempt is not dead' }), 'NOT_DEAD');
    const ok = await drainStockOutbox(dd); assert.equal(ok.applied, 1); assert.equal(await balance(h.db, sc3.c, sc3.s), 25);
    const audit = await h.db.$queryRaw`SELECT action, subject, JSON_EXTRACT(detail, '$.outcome') AS outcome FROM warehouse_audit_event WHERE subject = ${`outbox:${dead.intentKey}`}`; assert.deepEqual(audit.map((a) => a.action), ['warehouse.outbox.requeue']);
    // dead AND already in the ledger (applied but never acknowledged): the rule marks it instead of replaying
    const sc4 = await scenario(h); await recv(h, sc4, 'e1', 15); await enqueueStockIntents(deps, await h.store.find(sc4.sourceRef, sc4.c));
    const rec4 = (await h.outbox.all()).find((r) => r.sourceRef === sc4.sourceRef); await h.applier.apply(rec4);   // applied on the posting side, outbox still PENDING
    await h.db.$executeRawUnsafe("UPDATE warehouse_stock_outbox SET status = 'DEAD', attempts = 5 WHERE intent_key = ?", rec4.intentKey);
    assert.equal((await outboxReconciliation(h.db, sc4.sourceRef))[0].finding, 'APPLIED_NOT_ACKNOWLEDGED');
    assert.equal(await requeueDeadLetter(h.db, { intentKey: rec4.intentKey, actorUserId: 5, requestId: 'r', reason: 'rehearsal: ledger already has this key' }), 'MARKED_APPLIED');
    const fin = await drainStockOutbox(dd); assert.deepEqual([fin.applied, fin.alreadyApplied], [0, 1]); assert.equal(await balance(h.db, sc4.c, sc4.s), 15, 'not posted twice'); assert.equal((await outboxReconciliation(h.db, sc4.sourceRef))[0].finding, 'CONSISTENT');

    // 6. closing the shipment never touches posted quantities; the reconciliation still agrees with the shipment
    await resolveShipmentDiscrepancy(h.deps, sc.branch, { sourceRef: sc.sourceRef, resolutionKey: `resolution-${RUN}-1`, lineNo: 1, target: 'OUTSTANDING', kind: 'SHORT_CLOSED', quantity: 2, reason: 'rehearsal shortage accepted' });
    await closeShipmentForBranch(h.deps, sc.branch, { sourceRef: sc.sourceRef }); const closed = await h.store.find(sc.sourceRef, sc.c); assert.equal(closed.status, 'CLOSED');
    assert.equal(await balance(h.db, sc.c, sc.s), 98); assert.equal(stockIntents(closed).reduce((t, i) => t + i.quantity, 0), 98);
  } finally { await h.db.$disconnect(); }
});

// The SAME conformance suites the in-memory doubles pass (packages/application/tests/warehouse-stock-contracts.test.mjs), run against the database adapters.
// (One shared client for the contract runs; closed by the last test through the process exit.)
const contractDb = ON ? new PrismaClient({ datasourceUrl: process.env.WAREHOUSE_REHEARSAL_URL }) : null;
runOutboxContract({ name: 'database outbox (rehearsal)', test, skip: !ON, make: async () => ({ outbox: new PrismaStockOutbox(contractDb), uniqueKeyPrefix: `contract:outbox:${RUN}${++seq}` }) });
runApplierContract({ name: 'database applier (rehearsal)', test, skip: !ON, make: async () => ({ applier: new PrismaSimulatedStockApplier(contractDb), balanceOf: (c, i) => balance(contractDb, c, i), uniqueKeyPrefix: `contract:applier:${RUN}${++seq}` }) });
test('close the shared contract client', { skip: !ON }, async () => { await contractDb.$disconnect(); });
