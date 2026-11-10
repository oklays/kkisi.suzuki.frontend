import { createPool, type Pool, type PoolOptions } from 'mysql2/promise';

// Small, guarded pools. Decimals and dates arrive as exact strings (never JS floats or shifted Date objects), so money keeps
// full precision and legacy '0000-00-00' values survive as text for the domain's classifyLegacyDate.
const SAFE: PoolOptions = {
  decimalNumbers: false,
  supportBigNumbers: true,
  bigNumberStrings: true,
  dateStrings: true,
  charset: 'utf8mb4',
  connectTimeout: 5000,
  waitForConnections: true,
  queueLimit: 20,
  enableKeepAlive: true,
  multipleStatements: false,
};

export const SLOW_QUERY_THRESHOLD_MS = 500;

const g = globalThis as typeof globalThis & { __kkisiMobilePools?: Map<string, Pool> };

/** One pool per (purpose, DSN) per process, even when Next evaluates this module in several module graphs. */
export function pool(purpose: 'reader' | 'auth' | 'writer', uri: string, connectionLimit: number): Pool {
  g.__kkisiMobilePools ??= new Map();
  const key = `${purpose}:${uri}`;
  let p = g.__kkisiMobilePools.get(key);
  if (!p) {
    p = createPool({ ...SAFE, uri, connectionLimit, maxIdle: connectionLimit, idleTimeout: 60_000 });
    g.__kkisiMobilePools.set(key, p);
  }
  return p;
}

export class StoreUnavailableError extends Error { constructor() { super('STORE_UNAVAILABLE'); } }

/** Runs a parameterised statement; driver errors become a code-only error (no SQL, host or value ever leaves this file). */
export async function rows<T>(p: Pool, sql: string, params: unknown[] = []): Promise<T[]> {
  const start = Date.now();
  try {
    const [result] = await p.query(sql, params);
    const ms = Date.now() - start;
    if (ms >= SLOW_QUERY_THRESHOLD_MS) {
      console.warn(JSON.stringify({ at: new Date().toISOString(), app: 'mobile_kkisi', event: 'db.query.slow', ms }));
    }
    return result as T[];
  } catch {
    throw new StoreUnavailableError();
  }
}
