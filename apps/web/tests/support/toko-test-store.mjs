// TEST-ONLY code (never imported by the application): the target-side contract for the cross-database outbox harness. It writes to the TOKO posting TEST store
// (kkisi_toko_posting_test), not to TOKO. It shows the shape the real TOKO stock writer must have: a unique idempotency record and the stock change
// committed in ONE transaction, with an identical-content check on duplicates.
import { PrismaClient } from '@prisma/client';
import { PrismaStockOutbox } from '../../src/infrastructure/warehouse/warehouse-store.repository.ts';

const num = (v) => Number(typeof v === 'bigint' ? Number(v) : v);
const dup = (e) => /\b1062\b/.test(String(e?.message));

export class PayloadConflictError extends Error { constructor(key) { super(`PAYLOAD_CONFLICT ${key}`); this.name = 'PayloadConflictError'; } }

/** Opens a client with an explicit pool size (the account's local MAX_USER_CONNECTIONS is 6; every process/client must stay inside it). */
export function client(url, limit = 1) { const u = new URL(url); u.searchParams.set('connection_limit', String(limit)); u.searchParams.set('connect_timeout', '5'); return new PrismaClient({ datasourceUrl: u.toString() }); }

export class TokoTestApplier {
  constructor(db, hooks = {}) { this.db = db; this.hooks = hooks; }
  async apply(r) {
    const outcome = await this.db.$transaction(async (tx) => {
      try {
        await tx.$executeRaw`INSERT INTO toko_test_stock_posting (intent_key, source_ref, event_key, store_company_id, store_item_id, mapping_ref, quantity, applied_at)
          VALUES (${r.intentKey}, ${r.sourceRef}, ${r.eventKey}, ${r.storeCompanyId}, ${r.storeItemId}, ${r.mappingRef}, ${r.quantity}, ${new Date().toISOString()})`;
      } catch (e) {
        if (!dup(e)) throw e;
        const cur = (await tx.$queryRaw`SELECT source_ref, event_key, store_company_id, store_item_id, mapping_ref, quantity FROM toko_test_stock_posting WHERE intent_key = ${r.intentKey} LOCK IN SHARE MODE`)[0];
        const same = cur && cur.source_ref === r.sourceRef && cur.event_key === r.eventKey && num(cur.store_company_id) === r.storeCompanyId && num(cur.store_item_id) === r.storeItemId && cur.mapping_ref === r.mappingRef && num(cur.quantity) === r.quantity;
        if (!same) throw new PayloadConflictError(r.intentKey);   // the transaction rolls back: nothing changes
        return 'ALREADY_APPLIED';
      }
      if (this.hooks.afterPostingInsert) await this.hooks.afterPostingInsert(r);   // fault-injection point INSIDE the transaction: posting written, stock not yet
      // Not `INSERT .. ON DUPLICATE KEY UPDATE`: MariaDB then demands UPDATE on every inserted column, which defeats the column-level grant (UPDATE (quantity) only).
      await tx.$executeRaw`INSERT IGNORE INTO toko_test_stock (store_company_id, store_item_id, quantity) VALUES (${r.storeCompanyId}, ${r.storeItemId}, 0)`;
      await tx.$executeRaw`UPDATE toko_test_stock SET quantity = quantity + ${r.quantity} WHERE store_company_id = ${r.storeCompanyId} AND store_item_id = ${r.storeItemId}`;
      return 'APPLIED';
    });
    if (this.hooks.afterCommit) await this.hooks.afterCommit(r, outcome);   // fault-injection point AFTER the TOKO commit, BEFORE the outbox acknowledgement
    return outcome;
  }
}

export async function tokoSnapshot(db, ns) {
  const postings = (await db.$queryRaw`SELECT intent_key, source_ref, event_key, store_company_id, store_item_id, mapping_ref, quantity FROM toko_test_stock_posting WHERE source_ref LIKE ${ns + '%'} ORDER BY intent_key`)
    .map((p) => ({ intentKey: p.intent_key, sourceRef: p.source_ref, eventKey: p.event_key, storeCompanyId: num(p.store_company_id), storeItemId: num(p.store_item_id), mappingRef: p.mapping_ref, quantity: num(p.quantity) }));
  const items = [...new Set(postings.map((p) => `${p.storeCompanyId}:${p.storeItemId}`))];
  const stock = [];
  for (const k of items) { const [c, i] = k.split(':').map(Number); const row = (await db.$queryRaw`SELECT quantity FROM toko_test_stock WHERE store_company_id = ${c} AND store_item_id = ${i}`)[0]; stock.push({ storeCompanyId: c, storeItemId: i, quantity: row ? num(row.quantity) : 0 }); }
  return { postings, stock };
}

/** The Warehouse outbox restricted to ONE test namespace (sourceRef prefix), so tests sharing the rehearsal store never drain each other's records. */
export class ScopedOutbox {
  constructor(db, prefix) { this.db = db; this.prefix = prefix; this.inner = new PrismaStockOutbox(db); }
  enqueue(records) { return this.inner.enqueue(records); }
  markApplied(k, at) { return this.inner.markApplied(k, at); }
  markFailed(k, e, m) { return this.inner.markFailed(k, e, m); }
  async pending(limit) { return this.#rows(`status = 'PENDING'`, limit); }
  async all() { return this.#rows('1 = 1', 5000); }
  async #rows(where, limit) {
    const rows = await this.db.$queryRawUnsafe(`SELECT intent_key, source_ref, event_key, store_company_id, store_item_id, mapping_ref, quantity, treatment, status, attempts, last_error, enqueued_at, applied_at FROM warehouse_stock_outbox WHERE ${where} AND source_ref LIKE ? ORDER BY enqueued_at, intent_key LIMIT ${Math.trunc(limit)}`, this.prefix + '%');
    return rows.map((r) => ({ intentKey: r.intent_key, sourceRef: r.source_ref, eventKey: r.event_key, storeCompanyId: num(r.store_company_id), storeItemId: num(r.store_item_id), mappingRef: r.mapping_ref, quantity: num(r.quantity), treatment: r.treatment, status: r.status, attempts: num(r.attempts), lastError: r.last_error, enqueuedAt: r.enqueued_at, appliedAt: r.applied_at }));
  }
}

export const record = (ns, n, over = {}) => ({ intentKey: `${ns}:${n}|ev1|1`, sourceRef: `${ns}:${n}`, eventKey: 'ev1', storeCompanyId: 1, storeItemId: 1, mappingRef: 'map:test', quantity: 10, treatment: 'INTERNAL_TRANSFER', status: 'PENDING', attempts: 0, lastError: null, enqueuedAt: new Date(Date.UTC(2026, 9, 17, 6, 0, 0)).toISOString(), appliedAt: null, ...over });
