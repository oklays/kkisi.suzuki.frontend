import { contentOf } from '../../src/warehouse/stock-outbox.ts';

// In-memory StockOutbox that emulates the REAL contract (unique intentKey, immutable content, compare-and-set status, deterministic order)
// and a StockApplier that is idempotent by key and can be told to fail or to "crash after applying". No database, no network.
export function makeOutbox() {
  const rows = new Map();
  const outbox = {
    async enqueue(records) {
      const inserted = [], existing = [], conflicts = [];
      for (const r of records) { const cur = rows.get(r.intentKey); if (!cur) { rows.set(r.intentKey, structuredClone(r)); inserted.push(r.intentKey); } else if (contentOf(cur, r)) existing.push(r.intentKey); else conflicts.push(r.intentKey); }
      return { inserted, existing, conflicts };
    },
    async pending(limit) { return [...rows.values()].filter((r) => r.status === 'PENDING').sort((a, b) => a.enqueuedAt.localeCompare(b.enqueuedAt) || a.intentKey.localeCompare(b.intentKey)).slice(0, limit).map((r) => structuredClone(r)); },
    async markApplied(key, at) { const r = rows.get(key); if (!r || r.status !== 'PENDING') return false; r.status = 'APPLIED'; r.appliedAt = at; return true; },
    async markFailed(key, error, maxAttempts) { const r = rows.get(key); if (!r) return 'DEAD'; r.attempts += 1; r.lastError = error; r.status = r.attempts >= maxAttempts ? 'DEAD' : 'PENDING'; return r.status; },
  };
  return { outbox, rows };
}

export function makeApplier() {
  const stock = new Map(), applied = new Set(), behaviour = { failKeys: new Set(), crashAfterApply: new Set() }, calls = [];
  const applier = {
    async apply(record) {
      calls.push(record.intentKey);
      if (behaviour.failKeys.has(record.intentKey)) throw new Error('toko writer unavailable');
      if (applied.has(record.intentKey)) return 'ALREADY_APPLIED';          // idempotent by key
      const k = `${record.storeCompanyId}:${record.storeItemId}`; stock.set(k, (stock.get(k) ?? 0) + record.quantity); applied.add(record.intentKey);
      if (behaviour.crashAfterApply.has(record.intentKey)) { behaviour.crashAfterApply.delete(record.intentKey); throw new Error('process crashed after applying'); }
      return 'APPLIED';
    },
  };
  return { applier, stock, applied, behaviour, calls };
}
