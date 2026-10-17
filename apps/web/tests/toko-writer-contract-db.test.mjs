import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { TokoStockWriterContract, StockWriterError, legacyRecompute, stockOf, ledgerSum, postingsFor } from './support/toko-stock-writer.mjs';

// Opt-in (checkpoint 12): the TOKO stock-writer contract against tables with the EXACT legacy DDL of db_items / db_stockentry (copied from the local legacy copy,
// verified column-by-column and index-by-index by the setup script) plus the proposed nx_stock_posting, under the least-privilege account a production writer would get.
//   bash scripts/setup-toko-writer-contract.sh --apply
//   TOKO_WRITER_CONTRACT_TEST=1 node --experimental-strip-types --env-file=.env.toko-writer-contract --test tests/toko-writer-contract-db.test.mjs
// Synthetic items 990001-990020 (990020 is under stock opname). Not production, not the TOKO database, no real stock.
const ON = process.env.TOKO_WRITER_CONTRACT_TEST === '1';
const RUN = randomBytes(3).toString('hex');
let n = 0; const ns = () => `wct:${RUN}:${++n}`;
const intent = (prefix, i, item, qty, over = {}) => ({ intentKey: `${prefix}|ev|${i}`, sourceRef: prefix, eventKey: 'ev', storeCompanyId: 9001, storeItemId: item, mappingRef: 'map:ct', quantity: qty, ...over });
function client(limit = 2) {
  const u = new URL(process.env.TOKO_WRITER_CONTRACT_URL); assert.ok(['127.0.0.1', 'localhost'].includes(u.hostname)); assert.equal(u.pathname, '/kkisi_toko_writer_contract'); assert.equal(decodeURIComponent(u.username), 'kkisi_toko_writer_ct');
  u.searchParams.set('connection_limit', String(limit)); return new PrismaClient({ datasourceUrl: u.toString() });
}
const denied = async (p) => { try { await p; return 'ALLOWED'; } catch (e) { const m = /\b(1142|1143|1644)\b/.exec(String(e.message)); return m ? Number(m[1]) : `OTHER ${String(e.message).slice(-120)}`; } };

test('SQL privilege compatibility: the least-privilege grants refuse everything but the contract; ON DUPLICATE KEY UPDATE is incompatible with them', { skip: !ON }, async () => {
  const db = client();
  try {
    assert.equal(await denied(db.$executeRaw`UPDATE db_items SET status_so = 0 WHERE id = 990020`), 1143, 'only the stock column is updatable');
    assert.equal(await denied(db.$executeRaw`DELETE FROM db_stockentry WHERE id = 0`), 1142, 'no DELETE on the ledger');
    assert.equal(await denied(db.$executeRaw`UPDATE db_stockentry SET qty = 0 WHERE id = 0`), 1142, 'ledger rows are insert-only for the writer');
    assert.equal(await denied(db.$executeRaw`INSERT INTO db_items (id, company_id, stock) VALUES (990001, 9001, 1) ON DUPLICATE KEY UPDATE stock = stock + 1`), 1142, 'no INSERT on db_items: an upsert of the cache is impossible');
    const k = `${ns()}|odku`;
    assert.equal(await denied(db.$executeRaw`INSERT INTO nx_stock_posting (intent_key, source_ref, event_key, company_id, item_id, mapping_ref, quantity, ledger_table, ledger_id, posted_at) VALUES (${k}, 'x', 'e', 9001, 990001, 'm', 1, 'db_stockentry', 0, NOW()) ON DUPLICATE KEY UPDATE quantity = quantity`), 1142, 'ODKU on the idempotency table needs UPDATE: refused (table-level 1142) by an insert-only grant; with INSERT + a column-level UPDATE grant it is refused as 1143 (checkpoint 11 harness)');
    assert.equal(await denied(db.$executeRaw`DELETE FROM nx_stock_posting WHERE intent_key = ${k}`), 1142);
  } finally { await db.$disconnect(); }
});

test('one transaction: idempotency row + legacy ledger row + stock cache; the posting SURVIVES the legacy recompute, a cache-only increment does not', { skip: !ON }, async () => {
  const db = client(); const w = new TokoStockWriterContract(db); const p = ns(); const item = 990001;
  try {
    await legacyRecompute(db, item); const start = await stockOf(db, item);
    assert.equal(await w.apply(intent(p, 1, item, 7)), 'APPLIED');
    assert.deepEqual([await stockOf(db, item), await ledgerSum(db, item)], [start + 7, start + 7], 'cache and ledger moved together');
    const [posting] = await postingsFor(db, p); assert.equal(posting.qty, 7); assert.ok(posting.ledger > 0, 'the posting points at its ledger row');
    assert.equal(await legacyRecompute(db, item), start + 7, 'legacy PHP recomputing the item keeps the Warehouse quantity');
    // counter-example: what a writer that only touched db_items.stock would get
    await db.$executeRaw`UPDATE db_items SET stock = stock + 5 WHERE id = ${item}`;
    assert.equal(await stockOf(db, item), start + 12);
    assert.equal(await legacyRecompute(db, item), start + 7, 'the cache-only +5 is ERASED by the next legacy recompute');
  } finally { await db.$disconnect(); }
});

test('retry after a successful commit changes nothing; a reused event key with a different payload is rejected and changes nothing', { skip: !ON }, async () => {
  const db = client(); const w = new TokoStockWriterContract(db); const p = ns(); const item = 990002;
  try {
    await legacyRecompute(db, item); const start = await stockOf(db, item);
    assert.equal(await w.apply(intent(p, 1, item, 4)), 'APPLIED');
    for (let i = 0; i < 3; i++) assert.equal(await w.apply(intent(p, 1, item, 4)), 'ALREADY_APPLIED');
    for (const over of [{ quantity: 5 }, { storeItemId: 990003 }, { mappingRef: 'map:other' }]) await assert.rejects(w.apply(intent(p, 1, item, 4, over)), (e) => e instanceof StockWriterError && e.code === 'PAYLOAD_CONFLICT');
    assert.deepEqual([await stockOf(db, item), await ledgerSum(db, item), (await postingsFor(db, p)).length], [start + 4, start + 4, 1]);
    assert.equal(await stockOf(db, 990003), await ledgerSum(db, 990003), 'the conflicting item was not touched');
  } finally { await db.$disconnect(); }
});

test('an item under stock opname (status_so = 1) or an unknown item/branch is refused and nothing is written; a failure before the posting row rolls everything back', { skip: !ON }, async () => {
  const db = client(); const p = ns();
  try {
    const before20 = [await stockOf(db, 990020), await ledgerSum(db, 990020)];
    await assert.rejects(new TokoStockWriterContract(db).apply(intent(p, 1, 990020, 3)), (e) => e.code === 'ITEM_LOCKED');
    await assert.rejects(new TokoStockWriterContract(db).apply(intent(p, 2, 990004, 3, { storeCompanyId: 9002 })), (e) => e.code === 'ITEM_UNKNOWN', 'another branch is not this item');
    await assert.rejects(new TokoStockWriterContract(db).apply(intent(p, 3, 999999, 3)), (e) => e.code === 'ITEM_UNKNOWN');
    assert.deepEqual([await stockOf(db, 990020), await ledgerSum(db, 990020)], before20);
    const item = 990005; await legacyRecompute(db, item); const start = [await stockOf(db, item), await ledgerSum(db, item)];
    const boom = new TokoStockWriterContract(db, { beforePosting: async () => { throw new Error('injected failure after the ledger row'); } });
    await assert.rejects(boom.apply(intent(p, 4, item, 9)), /injected failure/);
    assert.deepEqual([await stockOf(db, item), await ledgerSum(db, item), (await postingsFor(db, p)).length], [...start, 0], 'cache, ledger and posting all rolled back');
  } finally { await db.$disconnect(); }
});

test('concurrency with the POS checkout statement: duplicate deliveries from three writers post once, concurrent sales and postings keep cache = ledger-derived stock', { skip: !ON }, async () => {
  const writers = [client(2), client(2), client(2)]; const pos = client(2); const p = ns(); const item = 990006;
  try {
    await legacyRecompute(pos, item); const start = await stockOf(pos, item);
    const intents = Array.from({ length: 10 }, (_, i) => intent(p, i + 1, item, i + 1));
    let sold = 0; let posStop = false;
    const posWorker = (async () => {   // the exact POS stock statement (prisma-pos.repository.ts), each sale booked as a negative ledger entry in this contract DB
      while (!posStop) { await pos.$transaction(async (tx) => { const changed = await tx.$executeRaw`UPDATE db_items SET stock = stock - 1 WHERE id = ${item} AND company_id = 9001 AND status = 1 AND status_so = 0 AND stock >= 1`; if (changed === 1) { await tx.$executeRaw`INSERT INTO db_stockentry (entry_date, item_id, qty, expire_date, company_id, status, note) VALUES (NOW(), ${item}, -1, NULL, 9001, 1, 'Penyesuaian')`; sold++; } }); }
    })();
    const outcomes = await Promise.all(writers.map(async (db) => { const w = new TokoStockWriterContract(db); const out = []; for (const r of [...intents].sort(() => Math.random() - 0.5)) { for (let attempt = 0; ; attempt++) { try { out.push(await w.apply(r)); break; } catch (e) { if (/\b1213\b|deadlock/i.test(String(e.message)) && attempt < 5) continue; throw e; } } } return out; }));
    posStop = true; await posWorker;
    const applied = outcomes.flat().filter((o) => o === 'APPLIED').length;
    assert.equal(applied, 10, 'each intent applied by exactly one of the three writers'); assert.equal(outcomes.flat().length, 30);
    const posted = (await postingsFor(pos, p)).reduce((a, x) => a + x.qty, 0); assert.equal(posted, 55);
    assert.equal(await stockOf(pos, item), start + 55 - sold, `cache = start + posted - sold (sold ${sold})`);
    assert.equal(await legacyRecompute(pos, item), start + 55 - sold, 'and equals the ledger-derived stock');
  } finally { for (const db of [...writers, pos]) await db.$disconnect(); }
});
