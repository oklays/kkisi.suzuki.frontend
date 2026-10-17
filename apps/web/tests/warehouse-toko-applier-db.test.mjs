import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { drainStockOutbox, reconcileOutboxAgainstPostings } from '@koperasi/application/warehouse';
import { ScopedOutbox, record } from './support/toko-test-store.mjs';
import { TokoStockWriterContract, legacyRecompute, stockOf } from './support/toko-stock-writer.mjs';
import { startFaultProxy } from './support/fault-proxy.mjs';

// Opt-in (checkpoint 13): the Warehouse outbox (rehearsal store) drained into the UNWIRED staging TOKO applier (src/infrastructure/warehouse/toko-stock-applier.ts)
// on the contract database with the exact legacy DDL — two independent stores, two least-privilege accounts. The ledger is the TEST-ONLY one (D7 open).
//   CROSS_STORE_APPLIER_TEST=1 node --experimental-strip-types --env-file=.env.warehouse-rehearsal --env-file=.env.toko-writer-contract --test tests/warehouse-toko-applier-db.test.mjs
const ON = process.env.CROSS_STORE_APPLIER_TEST === '1';
const RUN = randomBytes(3).toString('hex');
const now = () => new Date();
function cl(url, limit = 2) { const u = new URL(url); u.searchParams.set('connection_limit', String(limit)); return new PrismaClient({ datasourceUrl: u.toString() }); }
async function postings(tk, ns) {
  return (await tk.$queryRaw`SELECT intent_key, source_ref, event_key, company_id, item_id, mapping_ref, quantity FROM nx_stock_posting WHERE source_ref LIKE ${ns + '%'}`)
    .map((p) => ({ intentKey: p.intent_key, sourceRef: p.source_ref, eventKey: p.event_key, storeCompanyId: Number(p.company_id), storeItemId: Number(p.item_id), mappingRef: p.mapping_ref, quantity: Number(p.quantity) }));
}

test('outbox -> ledger-based TOKO applier: posted once, redelivery acknowledged, stock survives the legacy recompute, reconciliation consistent', { skip: !ON }, async () => {
  const wh = cl(process.env.WAREHOUSE_REHEARSAL_URL, 1), tk = cl(process.env.TOKO_WRITER_CONTRACT_URL); const ns = `xdb:${RUN}a`; const item = 990007;
  try {
    await legacyRecompute(tk, item); const start = await stockOf(tk, item);
    const outbox = new ScopedOutbox(wh, ns); const rows = [1, 2, 3].map((n) => record(ns, n, { storeCompanyId: 9001, storeItemId: item, quantity: n * 2, mappingRef: 'map:ct' }));
    assert.equal((await outbox.enqueue(rows)).inserted.length, 3);
    const s1 = await drainStockOutbox({ outbox, applier: new TokoStockWriterContract(tk), now }, { limit: 10, maxAttempts: 5 }); assert.deepEqual([s1.applied, s1.failed], [3, 0]);
    for (const r of rows) assert.equal(await new TokoStockWriterContract(tk).apply(r), 'ALREADY_APPLIED', 'redelivery');
    assert.equal(await stockOf(tk, item), start + 12); assert.equal(await legacyRecompute(tk, item), start + 12, 'legacy recompute keeps the Warehouse receipt');
    const rec = reconcileOutboxAgainstPostings(await outbox.all(), await postings(tk, ns), []);
    assert.deepEqual([rec.counts.CONSISTENT, rec.critical], [3, false]);
  } finally { await wh.$disconnect(); await tk.$disconnect(); }
});

test('acknowledgement lost after the TOKO commit (TCP reply dropped): the retry is an acknowledgement, the ledger and stock move once', { skip: !ON }, async () => {
  const u = new URL(process.env.TOKO_WRITER_CONTRACT_URL); const proxy = await startFaultProxy({ host: u.hostname, port: Number(u.port || 3306) }); u.port = String(proxy.port);
  const wh = cl(process.env.WAREHOUSE_REHEARSAL_URL, 1), tk = cl(process.env.TOKO_WRITER_CONTRACT_URL), viaProxy = cl(u.toString(), 1); const ns = `xdb:${RUN}b`; const item = 990008;
  try {
    await legacyRecompute(tk, item); const start = await stockOf(tk, item);
    const outbox = new ScopedOutbox(wh, ns); await outbox.enqueue([record(ns, 1, { storeCompanyId: 9001, storeItemId: item, quantity: 5, mappingRef: 'map:ct' })]);
    await viaProxy.$queryRaw`SELECT 1`; proxy.arm('drop-ack-after-commit');
    const first = await drainStockOutbox({ outbox, applier: new TokoStockWriterContract(viaProxy), now }, { limit: 5, maxAttempts: 5 });
    assert.equal(first.failed, 1, 'the writer saw a network error'); assert.equal(proxy.state.fired.at(-1), 'drop-ack-after-commit');
    const mid = reconcileOutboxAgainstPostings(await outbox.all(), await postings(tk, ns), []); assert.equal(mid.counts.POSTED_NOT_ACKNOWLEDGED, 1, 'committed on TOKO, not acknowledged');
    let second; for (let i = 0; i < 4; i++) { second = await drainStockOutbox({ outbox, applier: new TokoStockWriterContract(viaProxy), now }, { limit: 5, maxAttempts: 5 }); if (second.alreadyApplied) break; }
    assert.equal(second.alreadyApplied, 1); assert.equal(await stockOf(tk, item), start + 5); assert.equal(await legacyRecompute(tk, item), start + 5);
    assert.equal(reconcileOutboxAgainstPostings(await outbox.all(), await postings(tk, ns), []).counts.CONSISTENT, 1);
  } finally { await wh.$disconnect(); await tk.$disconnect(); await viaProxy.$disconnect(); await proxy.close(); }
});
