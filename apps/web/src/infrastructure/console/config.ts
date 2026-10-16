import { assertProductionConsole, assertProductionReadAndAuth, isProduction } from '../db/deployment-guard.ts';

type Env = Record<string, string | undefined>;
const LOOPBACK = new Set(['127.0.0.1', 'localhost']);
const dsn = (raw: string) => { const u = new URL(raw); return { user: decodeURIComponent(u.username), host: u.hostname, database: u.pathname.replace(/^\//, '') }; };

/** KOSIPA read-only integration flag (spec P1-R). Off unless exactly "true". */
export function kosipaReadEnabled(env: Env = process.env): boolean {
  return env.KOSIPA_READ_ENABLED === 'true';
}

/**
 * Whether the console store may be used. Not configured -> false (features that need it are off).
 * Local: loopback only, a third account and database (never the reader's or the auth store's, never root).
 * Production: the deployment-guard allowlist (assertProductionConsole). Any doubt -> false (fail closed).
 */
export function consoleStoreUsable(env: Env = process.env): boolean {
  if (!env.DATABASE_URL_CONSOLE) return false;
  try {
    if (isProduction(env)) return assertProductionConsole(env, assertProductionReadAndAuth(env)) !== null;
    const c = dsn(env.DATABASE_URL_CONSOLE), legacy = dsn(env.DATABASE_URL ?? ''), auth = dsn(env.DATABASE_URL_AUTH ?? '');
    if (!LOOPBACK.has(c.host) || ['root', 'kkisi_app'].includes(c.user)) return false;
    return ![legacy, auth].some((o) => o.user === c.user || o.database === c.database);
  } catch { return false; }
}
