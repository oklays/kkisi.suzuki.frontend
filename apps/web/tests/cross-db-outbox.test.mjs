import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { drainStockOutbox, reconcileOutboxAgainstPostings } from '@koperasi/application/warehouse';
import { TokoTestApplier, PayloadConflictError, ScopedOutbox, client, tokoSnapshot, record } from './support/toko-test-store.mjs';
import { startFaultProxy } from './support/fault-proxy.mjs';

// Opt-in cross-database harness (checkpoint 11): TWO independent local transactional stores — the Warehouse outbox store (kkisi_warehouse_rehearsal) and a TOKO
// stock-posting TEST store (kkisi_toko_posting_test), each with its own least-privilege account — joined only by this test code, as in production they would be joined
// only by the drain. Nothing here touches TOKO tables, Gudang, the Console store or any production database. Setup:
//   bash scripts/setup-warehouse-rehearsal.sh --apply && bash scripts/setup-toko-posting-test.sh --apply
//   CROSS_DB_OUTBOX_TEST=1 node --experimental-strip-types --env-file=.env.warehouse-rehearsal --env-file=.env.toko-posting-test --test tests/cross-db-outbox.test.mjs
// What it PROVES is limited to: with a posting row (PRIMARY KEY intent_key) written in the same transaction as the stock change, the stock equals the sum of
// distinct postings after every fault below. That is the target-side transactional idempotency invariant; it says nothing about the real TOKO writer, which does not exist yet.
const ON = process.env.CROSS_DB_OUTBOX_TEST === '1';
const RUN = randomBytes(3).toString('hex');
const WORKER = fileURLToPath(new URL('./support/cross-db-worker.mjs', import.meta.url));
let t = 0; const nextNs = () => ({ ns: `xdb:${RUN}${String(++t).padStart(2, '0')}`, item: parseInt(RUN, 16) * 100 + t * 10 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date();

function reach(url) { const u = new URL(url); return { host: u.hostname, port: Number(u.port || 3306), db: u.pathname.slice(1), user: decodeURIComponent(u.username) }; }

async function world() {
  const wUrl = process.env.WAREHOUSE_REHEARSAL_URL, tUrl = process.env.TOKO_POSTING_TEST_URL;
  assert.ok(wUrl && tUrl, 'both DSNs must be loaded (--env-file twice)');
  const w = reach(wUrl), k = reach(tUrl);
  assert.ok(['127.0.0.1', 'localhost'].includes(w.host) && ['127.0.0.1', 'localhost'].includes(k.host), 'loopback only');
  assert.equal(w.db, 'kkisi_warehouse_rehearsal'); assert.equal(k.db, 'kkisi_toko_posting_test'); assert.equal(w.user, 'kkisi_wh_rehearsal'); assert.equal(k.user, 'kkisi_toko_post_test');
  const wh = client(wUrl, 1), tk = client(tUrl, 1);
  const proxy = await startFaultProxy({ host: k.host, port: k.port });
  const pu = new URL(tUrl); pu.port = String(proxy.port);
  const tkProxied = client(pu.toString(), 1);
  return { wh, tk, tkProxied, proxy, close: async () => { await wh.$disconnect(); await tk.$disconnect(); await tkProxied.$disconnect(); await proxy.close(); } };
}

const seed = async (w, ns, rows) => { const outbox = new ScopedOutbox(w.wh, ns); const r = await outbox.enqueue(rows); assert.equal(r.conflicts.length, 0); return outbox; };
const report = async (w, ns, outbox) => { const o = await outbox.all(); const s = await tokoSnapshot(w.tk, ns); return reconcileOutboxAgainstPostings(o, s.postings, s.stock); };
const drainAll = async (w, outbox, applier, rounds = 6) => { const total = { applied: 0, alreadyApplied: 0, failed: 0, dead: 0 }; for (let i = 0; i < rounds; i++) { const s = await drainStockOutbox({ outbox, applier, now }, { limit: 50, maxAttempts: 5 }); for (const k of Object.keys(total)) total[k] += s[k]; if ((await outbox.pending(1)).length === 0) break; await sleep(50); } return total; };

function runWorker(env) {
  const child = spawn(process.execPath, ['--experimental-strip-types', WORKER], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = ''; const waiters = [];
  child.stdout.on('data', (d) => { out += d; waiters.splice(0).forEach((f) => f()); }); child.stderr.on('data', (d) => { err += d; });
  const exited = new Promise((resolve) => child.on('exit', (code, signal) => { waiters.splice(0).forEach((f) => f()); resolve({ code, signal, out, err }); }));
  const waitFor = async (re, ms = 20000) => { const end = Date.now() + ms; while (!re.test(out)) { if (Date.now() > end) throw new Error(`worker never printed ${re}; stdout=${out} stderr=${err.slice(0, 400)}`); await new Promise((r) => { waiters.push(r); setTimeout(r, 100); }); } };
  return { child, exited, waitFor, output: () => out };
}

test('isolation: two separate stores and accounts; neither account can reach the other store', { skip: !ON }, async () => {
  const w = await world();
  try {
    const denied = async (db, sql) => { try { await db.$queryRawUnsafe(sql); return false; } catch (e) { return /1142|1044|denied/i.test(String(e.message)); } };
    assert.equal(await denied(w.wh, 'SELECT 1 FROM kkisi_toko_posting_test.toko_test_stock LIMIT 1'), true, 'Warehouse account must not read the TOKO test store');
    assert.equal(await denied(w.tk, 'SELECT 1 FROM kkisi_warehouse_rehearsal.warehouse_stock_outbox LIMIT 1'), true, 'TOKO test account must not read the Warehouse store');
    const marker = await w.tk.$queryRaw`SELECT purpose FROM toko_test_marker`; assert.deepEqual(marker.map((m) => m.purpose), ['test-only-posting-contract']);
    const del = async (db, sql) => { try { await db.$executeRawUnsafe(sql); return false; } catch (e) { return /1142|denied/i.test(String(e.message)); } };
    assert.equal(await del(w.tk, `UPDATE toko_test_stock_posting SET quantity = 1 WHERE intent_key = 'none'`), true, 'postings are not even updatable by the writer account');
    assert.equal(await del(w.tk, `DELETE FROM toko_test_stock WHERE store_item_id = 0`), true);
  } finally { await w.close(); }
});

test('durable intent and unique event identity: replays are idempotent, a changed payload under the same key is a conflict and is never stored', { skip: !ON }, async () => {
  const w = await world(); const { ns, item } = nextNs();
  try {
    const rows = [record(ns, 1, { storeItemId: item }), record(ns, 2, { storeItemId: item, quantity: 5 })];
    const a = await new ScopedOutbox(w.wh, ns).enqueue(rows); assert.deepEqual([a.inserted.length, a.existing.length, a.conflicts.length], [2, 0, 0]);
    const b = await new ScopedOutbox(w.wh, ns).enqueue(rows); assert.deepEqual([b.inserted.length, b.existing.length, b.conflicts.length], [0, 2, 0], 'same events again: nothing new');
    const c = await new ScopedOutbox(w.wh, ns).enqueue([{ ...rows[0], quantity: 11 }]); assert.deepEqual([c.inserted.length, c.conflicts.length], [0, 1]);
    // durable: a brand-new connection (and, in the crash tests, a brand-new process) still sees exactly the original content
    const fresh = client(process.env.WAREHOUSE_REHEARSAL_URL, 1);
    try { const seen = await new ScopedOutbox(fresh, ns).all(); assert.deepEqual(seen.map((r) => [r.intentKey, r.quantity, r.status]), [[rows[0].intentKey, 10, 'PENDING'], [rows[1].intentKey, 5, 'PENDING']]); } finally { await fresh.$disconnect(); }
    const out = new ScopedOutbox(w.wh, ns); await drainAll(w, out, new TokoTestApplier(w.tk));
  } finally { await w.close(); }
});

test('happy path: the drain posts once, stock = posting, the outbox is acknowledged, cross-store reconciliation is CONSISTENT', { skip: !ON }, async () => {
  const w = await world(); const { ns, item } = nextNs();
  try {
    const outbox = await seed(w, ns, [record(ns, 1, { storeItemId: item, quantity: 10 }), record(ns, 2, { storeItemId: item, quantity: 7 })]);
    const s = await drainAll(w, outbox, new TokoTestApplier(w.tk)); assert.deepEqual([s.applied, s.alreadyApplied, s.failed, s.dead], [2, 0, 0, 0]);
    const r = await report(w, ns, outbox); assert.equal(r.counts.CONSISTENT, 2); assert.equal(r.critical, false); assert.equal(r.invariantHolds, true);
    assert.deepEqual((await tokoSnapshot(w.tk, ns)).stock, [{ storeCompanyId: 1, storeItemId: item, quantity: 17 }]);
  } finally { await w.close(); }
});

test('duplicate delivery: applying the same intent again (before or after the acknowledgement) changes nothing', { skip: !ON }, async () => {
  const w = await world(); const { ns, item } = nextNs();
  try {
    const rec = record(ns, 1, { storeItemId: item, quantity: 10 }); const applier = new TokoTestApplier(w.tk);
    assert.equal(await applier.apply(rec), 'APPLIED'); assert.equal(await applier.apply(rec), 'ALREADY_APPLIED'); assert.equal(await applier.apply(rec), 'ALREADY_APPLIED');
    const outbox = await seed(w, ns, [rec]); const s = await drainAll(w, outbox, applier);   // the outbox still says PENDING although TOKO already posted: the drain must only acknowledge
    assert.deepEqual([s.applied, s.alreadyApplied], [0, 1]);
    assert.deepEqual((await tokoSnapshot(w.tk, ns)).stock, [{ storeCompanyId: 1, storeItemId: item, quantity: 10 }], 'three deliveries, one posting');
    assert.equal((await report(w, ns, outbox)).counts.CONSISTENT, 1);
  } finally { await w.close(); }
});

test('payload conflict: same event key with different content is refused on the target, never added to stock, and ends up DEAD for a human', { skip: !ON }, async () => {
  const w = await world(); const { ns, item } = nextNs();
  try {
    const applier = new TokoTestApplier(w.tk);
    await applier.apply(record(ns, 1, { storeItemId: item, quantity: 10 }));
    await assert.rejects(applier.apply(record(ns, 1, { storeItemId: item, quantity: 12 })), PayloadConflictError);
    await assert.rejects(applier.apply(record(ns, 1, { storeItemId: item + 1, quantity: 10 })), PayloadConflictError);
    // and through the drain: a PENDING outbox record whose key TOKO already holds with other content
    const outbox = await seed(w, ns, [record(ns, 2, { storeItemId: item, quantity: 3 })]);
    await applier.apply(record(ns, 2, { storeItemId: item, quantity: 4 }));
    const s = await drainAll(w, outbox, applier, 6); assert.equal(s.applied, 0); assert.ok(s.dead >= 1, 'retries are bounded: the record is parked as DEAD');
    assert.equal((await outbox.all())[0].status, 'DEAD');
    const snap = await tokoSnapshot(w.tk, ns); assert.deepEqual(snap.stock, [{ storeCompanyId: 1, storeItemId: item, quantity: 14 }], 'only the two accepted originals (10 + 4)');
    assert.equal((await report(w, ns, outbox)).counts.CONTENT_MISMATCH, 1, 'reconciliation reports the disagreement as critical');
  } finally { await w.close(); }
});

test('target atomicity: a failure after the posting row is written rolls BOTH the posting and the stock change back', { skip: !ON }, async () => {
  const w = await world(); const { ns, item } = nextNs();
  try {
    const rec = record(ns, 1, { storeItemId: item, quantity: 10 });
    const boom = new TokoTestApplier(w.tk, { afterPostingInsert: async () => { throw new Error('injected failure inside the TOKO transaction'); } });
    await assert.rejects(boom.apply(rec), /injected failure/);
    let snap = await tokoSnapshot(w.tk, ns); assert.deepEqual([snap.postings.length, snap.stock.length], [0, 0], 'neither half survived');
    assert.equal(await new TokoTestApplier(w.tk).apply(rec), 'APPLIED'); snap = await tokoSnapshot(w.tk, ns); assert.deepEqual([snap.postings.length, snap.stock[0].quantity], [1, 10]);
  } finally { await w.close(); }
});

test('network failure: lost connection mid-transaction, before COMMIT, after COMMIT (reply lost) and target unreachable — each retried to exactly one posting', { skip: !ON }, async () => {
  const w = await world();
  try {
    const cases = [
      ['cut-mid-transaction', { after: 1 }, { posted: false }],
      ['cut-before-commit', {}, { posted: false }],
      ['drop-ack-after-commit', {}, { posted: true }],     // TOKO committed; only the acknowledgement path failed
      ['refuse-next', {}, { posted: false }],
    ];
    for (const [mode, opts, expect] of cases) {
      const { ns, item } = nextNs();
      const outbox = await seed(w, ns, [record(ns, 1, { storeItemId: item, quantity: 10 })]);
      await w.tkProxied.$queryRaw`SELECT 1`.catch(() => {});   // make sure a pooled connection exists, so refuse-next hits a NEW connection
      if (mode === 'refuse-next') await w.tkProxied.$disconnect();
      const applier = new TokoTestApplier(w.tkProxied);
      w.proxy.arm(mode, opts);
      const first = await drainStockOutbox({ outbox, applier, now }, { limit: 10, maxAttempts: 5 });
      assert.equal(first.applied + first.alreadyApplied, 0, `${mode}: the first attempt must fail visibly`); assert.equal(first.failed, 1, mode);
      assert.equal(w.proxy.state.fired.at(-1)?.startsWith(mode), true, `${mode}: the fault actually fired`);
      let mid = await report(w, ns, outbox);
      assert.equal(mid.counts[expect.posted ? 'POSTED_NOT_ACKNOWLEDGED' : 'PENDING_NOT_POSTED'], 1, `${mode}: state after the failure`);
      assert.equal((await outbox.all())[0].attempts, 1); assert.equal((await outbox.all())[0].status, 'PENDING');
      const s = await drainAll(w, outbox, applier); assert.equal(s.dead, 0, mode);
      const done = await report(w, ns, outbox);
      assert.deepEqual([done.counts.CONSISTENT, done.critical, done.invariantHolds], [1, false, true], `${mode}: converged`);
      assert.deepEqual((await tokoSnapshot(w.tk, ns)).stock, [{ storeCompanyId: 1, storeItemId: item, quantity: 10 }], `${mode}: exactly one posting's worth of stock`);
      if (expect.posted) assert.equal(s.alreadyApplied, 1, 'recovery of a lost reply is an acknowledgement, not a second post');
    }
  } finally { await w.close(); }
});

test('process death: SIGKILL inside the TOKO transaction leaves nothing; SIGKILL after COMMIT leaves a posting without acknowledgement; restart repairs both without double posting', { skip: !ON }, async () => {
  const w = await world();
  try {
    // (a) killed while the TOKO transaction is open (posting row inserted, stock not yet updated)
    {
      const { ns, item } = nextNs(); const outbox = await seed(w, ns, [record(ns, 1, { storeItemId: item, quantity: 10 })]);
      const worker = runWorker({ WORKER_NS: ns, WORKER_STOP_AT: 'mid-transaction' });
      await worker.waitFor(/AT_POINT:mid-transaction/); worker.child.kill('SIGKILL'); const ended = await worker.exited; assert.equal(ended.signal, 'SIGKILL');
      const rec = await report(w, ns, outbox);
      // the server may need a moment to notice the dead socket and roll back; the recovery drain below waits on the row lock if it has not yet
      const s = await drainAll(w, outbox, new TokoTestApplier(w.tk)); assert.deepEqual([s.applied, s.alreadyApplied], [1, 0], 'nothing had been committed, so recovery is a first application');
      assert.ok(rec.counts.PENDING_NOT_POSTED === 1 || rec.counts.PENDING_NOT_POSTED === 0);
      const done = await report(w, ns, outbox); assert.deepEqual([done.counts.CONSISTENT, done.invariantHolds], [1, true]);
      assert.deepEqual((await tokoSnapshot(w.tk, ns)).stock, [{ storeCompanyId: 1, storeItemId: item, quantity: 10 }]);
    }
    // (b) killed after the TOKO commit, before the outbox acknowledgement
    {
      const { ns, item } = nextNs(); const outbox = await seed(w, ns, [record(ns, 1, { storeItemId: item, quantity: 10 })]);
      const worker = runWorker({ WORKER_NS: ns, WORKER_STOP_AT: 'after-commit' });
      await worker.waitFor(/AT_POINT:after-commit/); worker.child.kill('SIGKILL'); assert.equal((await worker.exited).signal, 'SIGKILL');
      const mid = await report(w, ns, outbox);
      assert.deepEqual([mid.counts.POSTED_NOT_ACKNOWLEDGED, mid.repairable, mid.critical, mid.invariantHolds], [1, true, false, true], 'committed on TOKO, unacknowledged in the Warehouse: repairable, stock already correct');
      assert.equal((await outbox.all())[0].status, 'PENDING');
      const restart = runWorker({ WORKER_NS: ns, WORKER_STOP_AT: 'none' }); const r = await restart.exited; assert.equal(r.code, 0, r.err);
      assert.match(r.out, /SUMMARY:\{"applied":0,"alreadyApplied":1,"failed":0,"dead":0\}/);
      const done = await report(w, ns, outbox); assert.deepEqual([done.counts.CONSISTENT, done.invariantHolds], [1, true]);
      assert.deepEqual((await tokoSnapshot(w.tk, ns)).stock, [{ storeCompanyId: 1, storeItemId: item, quantity: 10 }], 'restart did not post a second time');
    }
  } finally { await w.close(); }
});

test('concurrent consumers: three separate processes drain the same outbox at once; every intent is posted exactly once', { skip: !ON }, async () => {
  const w = await world(); const { ns, item } = nextNs();
  try {
    const rows = Array.from({ length: 12 }, (_, i) => record(ns, i + 1, { storeItemId: item + (i % 3), quantity: i + 1 }));
    const outbox = await seed(w, ns, rows);
    const workers = [1, 2, 3].map(() => runWorker({ WORKER_NS: ns, WORKER_STOP_AT: 'none', WORKER_HOLD_MS: '25' }));
    const ends = await Promise.all(workers.map((x) => x.exited)); for (const e of ends) assert.equal(e.code, 0, e.err);
    const sums = ends.map((e) => JSON.parse(/SUMMARY:(\{.*\})/.exec(e.out)[1]));
    const recovery = await drainAll(w, outbox, new TokoTestApplier(w.tk));   // a deadlock victim or lock timeout is retried, never lost
    const applied = sums.reduce((a, s) => a + s.applied, 0) + recovery.applied;
    assert.equal(applied, 12, 'each of the 12 intents was applied by exactly one consumer'); assert.equal(sums.reduce((a, s) => a + s.dead, 0) + recovery.dead, 0);
    const snap = await tokoSnapshot(w.tk, ns); assert.equal(snap.postings.length, 12);
    const r = await report(w, ns, outbox); assert.deepEqual([r.counts.CONSISTENT, r.critical, r.invariantHolds], [12, false, true]);
    const expected = [0, 1, 2].map((m) => rows.filter((_, i) => i % 3 === m).reduce((a, x) => a + x.quantity, 0));
    assert.deepEqual(snap.stock.map((s) => s.quantity).sort((a, b) => a - b), [...expected].sort((a, b) => a - b));
  } finally { await w.close(); }
});

test('reconciliation detects an acknowledgement that TOKO never backed (critical), and does not call it repairable', { skip: !ON }, async () => {
  const w = await world(); const { ns, item } = nextNs();
  try {
    const rec = record(ns, 1, { storeItemId: item, quantity: 10 }); const outbox = await seed(w, ns, [rec]);
    assert.equal(await outbox.markApplied(rec.intentKey, new Date().toISOString()), true);   // a faulty acknowledger: APPLIED without any posting
    const r = await report(w, ns, outbox); assert.deepEqual([r.counts.ACKNOWLEDGED_WITHOUT_POSTING, r.critical, r.repairable], [1, true, false]);
  } finally { await w.close(); }
});

test('seeded chaos: 24 intents under random network faults and replayed drains converge to stock = sum of distinct postings', { skip: !ON }, async () => {
  const w = await world(); const { ns, item } = nextNs();
  try {
    let seedv = parseInt(RUN, 16) || 1; const rnd = () => { seedv = (seedv * 1103515245 + 12345) & 0x7fffffff; return seedv / 0x7fffffff; };
    const rows = Array.from({ length: 24 }, (_, i) => record(ns, i + 1, { storeItemId: item + (i % 4), quantity: 1 + (i % 9) }));
    const outbox = await seed(w, ns, rows); const applier = new TokoTestApplier(w.tkProxied);
    const modes = ['cut-mid-transaction', 'cut-before-commit', 'drop-ack-after-commit']; let rounds = 0;
    while ((await outbox.pending(1)).length > 0 && rounds++ < 80) {
      if (rnd() < 0.85) w.proxy.arm(modes[Math.floor(rnd() * modes.length)], { after: 1 + Math.floor(rnd() * 3) });
      await drainStockOutbox({ outbox, applier, now }, { limit: 1 + Math.floor(rnd() * 2), maxAttempts: 20 });
      if (rnd() < 0.3) await drainStockOutbox({ outbox, applier: new TokoTestApplier(w.tk), now }, { limit: 3, maxAttempts: 20 });   // a second consumer path replays pending work
    }
    w.proxy.arm('none'); w.proxy.state.fault = null;
    await drainAll(w, outbox, new TokoTestApplier(w.tk));
    const r = await report(w, ns, outbox);
    assert.deepEqual([r.counts.CONSISTENT, r.critical, r.invariantHolds, (await outbox.pending(1)).length], [24, false, true, 0], `converged after ${rounds} rounds with ${w.proxy.state.fired.length} injected faults`);
    assert.ok(w.proxy.state.fired.length >= 8, 'the run really injected faults');
    assert.equal((await tokoSnapshot(w.tk, ns)).stock.reduce((a, s) => a + s.quantity, 0), rows.reduce((a, x) => a + x.quantity, 0));
  } finally { await w.close(); }
});
