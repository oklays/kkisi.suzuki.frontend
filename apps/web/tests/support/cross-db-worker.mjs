// TEST-ONLY child process: drains ONE test namespace of the Warehouse outbox into the TOKO posting TEST store. Exists so the parent can kill it with SIGKILL
// at a precise point (a real process death, not a simulated exception) and so several consumers can run as genuinely separate processes.
//   WORKER_NS (namespace prefix)  WORKER_STOP_AT = none | mid-transaction | after-commit   WORKER_HOLD_MS = delay inside the TOKO transaction (widens race windows)
import { drainStockOutbox } from '@koperasi/application/warehouse';
import { TokoTestApplier, ScopedOutbox, client } from './toko-test-store.mjs';

const ns = process.env.WORKER_NS, stopAt = process.env.WORKER_STOP_AT ?? 'none', hold = Number(process.env.WORKER_HOLD_MS ?? 0);
if (!ns || !/^xdb:[a-z0-9]+/.test(ns)) { process.stderr.write('WORKER_NS missing or not a test namespace\n'); process.exit(3); }
const wh = client(process.env.WAREHOUSE_REHEARSAL_URL, 1), tk = client(process.env.TOKO_POSTING_TEST_URL, 1);
const freeze = async (point) => { process.stdout.write(`AT_POINT:${point}\n`); await new Promise(() => {}); };   // waits for the parent's SIGKILL
const applier = new TokoTestApplier(tk, {
  afterPostingInsert: async () => { if (stopAt === 'mid-transaction') await freeze('mid-transaction'); if (hold) await new Promise((r) => setTimeout(r, hold)); },
  afterCommit: async () => { if (stopAt === 'after-commit') await freeze('after-commit'); },
});
try {
  const summary = await drainStockOutbox({ outbox: new ScopedOutbox(wh, ns), applier, now: () => new Date() }, { limit: 200, maxAttempts: 5 });
  process.stdout.write(`SUMMARY:${JSON.stringify(summary)}\n`);
} finally { await wh.$disconnect(); await tk.$disconnect(); }
