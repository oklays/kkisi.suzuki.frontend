import { MAX_CONNECTION_BUDGET } from './deployment-guard.ts';

/**
 * Connection-capacity PLAN evaluator (checkpoint 11). Pure arithmetic over the pool registry the startup guard already enforces: it opens no connection, reads no
 * environment and changes no setting. Its only purpose is to make the capacity options comparable with the same numbers the guard will compute at startup, and to
 * fail a test when the documented pools drift from `deploy/genesis/env.production.example`.
 *
 * `limit` is a CEILING (Prisma `connection_limit`), not a measurement of use. The legacy PHP application's own peak is NOT known here; `legacyPhpLeft` below is therefore
 * "what remains of max_user_connections under the strict reading that every account shares one limit", an assumption inherited from the budget, not evidence of spare capacity.
 */
export type PoolId = 'reader' | 'auth' | 'console' | 'pos' | 'register' | 'inventory' | 'products' | 'returns' | 'warehouseStore' | 'stockApply';
export type Pool = { id: PoolId; account: string; limit: number; flag: string; server: 'legacy' | 'warehouse'; existing: boolean };

export const POOLS: readonly Pool[] = [
  { id: 'reader', account: 'n1608204_nxread', limit: 3, flag: 'always', server: 'legacy', existing: true },
  { id: 'auth', account: 'n1608204_nxauth', limit: 2, flag: 'always', server: 'legacy', existing: true },
  { id: 'console', account: 'n1608204_nxcon', limit: 1, flag: 'CONSOLE_ENABLED', server: 'legacy', existing: true },
  { id: 'pos', account: 'n1608204_nxpos', limit: 2, flag: 'POS_WRITES_ENABLED', server: 'legacy', existing: true },
  { id: 'register', account: 'n1608204_nxreg', limit: 1, flag: 'POS_WRITES_ENABLED', server: 'legacy', existing: true },
  { id: 'inventory', account: '(inventory writer)', limit: 1, flag: 'INVENTORY_WRITES_ENABLED', server: 'legacy', existing: true },
  { id: 'products', account: '(product writer)', limit: 1, flag: 'PRODUCTS_WRITES_ENABLED', server: 'legacy', existing: true },
  { id: 'returns', account: 'n1608204_nxret', limit: 1, flag: 'SALES_RETURN_WRITES_ENABLED', server: 'legacy', existing: true },
  // PROPOSED, not provisioned anywhere: the Warehouse store (documents, mappings, outbox) and the TOKO stock-apply writer (idempotency record + stock).
  { id: 'warehouseStore', account: '(proposed) Warehouse store account', limit: 1, flag: '(proposed; no such flag exists)', server: 'legacy', existing: false },
  { id: 'stockApply', account: '(proposed) TOKO stock-apply writer', limit: 1, flag: '(proposed; no such flag exists)', server: 'legacy', existing: false },
];

export type Evaluation = { used: number; budget: number; withinBudget: boolean; headroom: number; legacyPhpLeft: number; pools: { id: PoolId; limit: number }[] };

/**
 * `moveWarehouseTo: 'warehouse'` models option C (the Warehouse store lives on separately provisioned capacity and does not count against the legacy server).
 * `limitOverrides` models pool tuning (option A). Overrides below 1 or above MAX_POOL_PER_CLIENT (4) are refused, as the guard does.
 */
export function evaluate(active: readonly PoolId[], opts: { budget?: number; serverMaxUserConnections?: number; moveWarehouseTo?: 'warehouse'; limitOverrides?: Partial<Record<PoolId, number>> } = {}): Evaluation {
  const budget = opts.budget ?? MAX_CONNECTION_BUDGET, max = opts.serverMaxUserConnections ?? 20;
  const pools = [...new Set(active)].map((id) => {
    const p = POOLS.find((x) => x.id === id); if (!p) throw new Error(`unknown pool ${id}`);
    const limit = opts.limitOverrides?.[id] ?? p.limit; if (!Number.isInteger(limit) || limit < 1 || limit > 4) throw new Error(`pool ${id}: limit out of range`);
    const server = id === 'warehouseStore' && opts.moveWarehouseTo ? opts.moveWarehouseTo : p.server;
    return { id, limit, server };
  });
  const used = pools.filter((p) => p.server === 'legacy').reduce((n, p) => n + p.limit, 0);
  return { used, budget, withinBudget: used <= budget, headroom: budget - used, legacyPhpLeft: max - used, pools: pools.map(({ id, limit }) => ({ id, limit })) };
}

/**
 * Evidence intake for decision B5/B8 (checkpoint 15): given the hosting's answer and the legacy PHP peak, does a pool set fit? Pure arithmetic; it never invents a missing number.
 * `scope` is how the hosting counts the limit: 'per-account' (each database account has its own `limit`) or 'hosting-wide' (one limit shared with legacy PHP and every account).
 */
export type CapacityEvidence = { scope: 'per-account' | 'hosting-wide'; limit: number; legacyPhpPeak: number | null; reserve: number; instances: number };
export type CapacityAssessment = { verdict: 'FITS' | 'DOES_NOT_FIT' | 'INSUFFICIENT_EVIDENCE'; totalUsed: number; available: number | null; margin: number | null; reasons: string[] };

export function assessCapacityEvidence(active: readonly PoolId[], ev: CapacityEvidence): CapacityAssessment {
  const reasons: string[] = []; const int = (v: unknown, min: number) => Number.isInteger(v) && (v as number) >= min;
  if (ev.scope !== 'per-account' && ev.scope !== 'hosting-wide') reasons.push('scope must be "per-account" or "hosting-wide" (the hosting provider has not said how the limit is counted)');
  if (!int(ev.limit, 1)) reasons.push('limit must be a positive integer');
  if (!int(ev.reserve, 0)) reasons.push('reserve must be a non-negative integer (the owner sets it)');
  if (!int(ev.instances, 1)) reasons.push('instances must be a positive integer');
  if (ev.scope === 'hosting-wide' && !int(ev.legacyPhpPeak, 0)) reasons.push('hosting-wide counting needs the measured legacy PHP peak');
  if (reasons.length) return { verdict: 'INSUFFICIENT_EVIDENCE', totalUsed: 0, available: null, margin: null, reasons };
  const e = evaluate(active); const totalUsed = e.used * ev.instances;
  if (ev.scope === 'hosting-wide') {
    const available = ev.limit - (ev.legacyPhpPeak as number) - ev.reserve;
    return { verdict: totalUsed <= available ? 'FITS' : 'DOES_NOT_FIT', totalUsed, available, margin: available - totalUsed, reasons: [`hosting-wide: ${ev.limit} - legacy peak ${ev.legacyPhpPeak} - reserve ${ev.reserve} = ${available} available; the pools need ${totalUsed} (${e.used} x ${ev.instances} instance(s))`] };
  }
  const widest = Math.max(...e.pools.map((p) => p.limit)) * ev.instances; const available = ev.limit - ev.reserve;
  return { verdict: widest <= available ? 'FITS' : 'DOES_NOT_FIT', totalUsed, available, margin: available - widest, reasons: [`per-account: the widest pool needs ${widest} (${Math.max(...e.pools.map((p) => p.limit))} x ${ev.instances} instance(s)) of ${available} (limit ${ev.limit} - reserve ${ev.reserve}); legacy PHP does not compete only if the hosting confirms the accounts are distinct from the PHP account`] };
}
