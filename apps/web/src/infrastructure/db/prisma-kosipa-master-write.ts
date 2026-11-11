import { PrismaClient } from '@prisma/client';
import { KosipaError } from '@koperasi/domain/kosipa';
import { assertProductionDsn, isProduction, productionWritesAllowed } from './deployment-guard.ts';

/**
 * KOSIPA reference-master writer (FA-01 proof slice, TASK-114 / SEC-107): its own account (local kosipa_master_w, grants in
 * db/kosipa/002_master_writer_grants.sql.tpl; production cPanel writer in db/kosipa/003_cpanel_model_writer.sql.tpl), never shared with
 * the reader, the auth/console stores or a TOKO writer.
 *
 * Local: the isolated synthetic KOSIPA database on the FA-01 container (loopback, port 3322, kkisi_kfa_synthetic), or the local COPY of
 * production (127.0.0.1:3307/kkisi_staging) when KOSIPA_LOCAL_STAGING_WRITES is exactly "true".
 * Production (APP_ENV=production): requires ALLOW_PRODUCTION_DB_WRITE=true, the module's *_WRITES_ENABLED=true flag, a dedicated DSN
 * passing assertProductionDsn('legacy', ...) with connection_limit <= 2, and a dedicated non-staging ledger database.
 */
const LOCAL_TARGETS = new Set(['3322/kkisi_kfa_synthetic']);
const LOCAL_STAGING_TARGETS = new Set(['3307/kkisi_staging']);
const LOCAL_STAGING_LEDGERS = new Set(['kkisi_staging_ledger']);
const PRODUCTION_STAGING_LEDGER = /staging|test|e2e|replace_me|example|fixture|synthetic/i;
const localStagingOptIn = (env: Record<string, string | undefined>): boolean => env.KOSIPA_LOCAL_STAGING_WRITES === 'true';
const OTHER_ACCOUNTS = ['DATABASE_URL', 'DATABASE_URL_AUTH', 'DATABASE_URL_CONSOLE', 'DATABASE_URL_WRITE', 'DATABASE_URL_REGISTER_WRITE', 'DATABASE_URL_INVENTORY_WRITE', 'DATABASE_URL_PRODUCT_WRITE', 'DATABASE_URL_RETURN_WRITE'];

/** Shared by every KOSIPA writer account (master, member, ...): own flag + own DSN variable, never the same login as any other account. */
export function validateKosipaWriterConfig(env: Record<string, string | undefined>, flag: string, dsnVariable: string): string {
  const fail = (): never => { throw new KosipaError('WRITE_NOT_CONFIGURED'); };
  try {
    if (env[flag] !== 'true') return fail();
    if (isProduction(env)) {
      if (!productionWritesAllowed(env)) return fail();
      const write = assertProductionDsn('legacy', env[dsnVariable], env);
      if (write.connectionLimit > 2) return fail();
      for (const key of [...OTHER_ACCOUNTS, ...KOSIPA_WRITER_DSNS].filter((k) => k !== dsnVariable)) {
        const other = env[key];
        if (other && decodeURIComponent(new URL(other).username) === write.user) return fail();
      }
      return write.url;
    }
    const url = new URL(env[dsnVariable] ?? '');
    const user = decodeURIComponent(url.username);
    if (url.protocol !== 'mysql:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || !(LOCAL_TARGETS.has(`${url.port}${url.pathname}`) || (localStagingOptIn(env) && LOCAL_STAGING_TARGETS.has(`${url.port}${url.pathname}`)))) return fail();
    if (!user || !url.password || ['root', 'admin'].includes(user)) return fail();
    for (const key of [...OTHER_ACCOUNTS, ...KOSIPA_WRITER_DSNS].filter((k) => k !== dsnVariable)) {
      const other = env[key];
      if (other && decodeURIComponent(new URL(other).username) === user) return fail();
    }
    const limit = Number(url.searchParams.get('connection_limit') ?? '0');
    if (!Number.isInteger(limit) || limit < 1 || limit > 2) return fail();       // NFR-102: writer pool <= 2
    return url.href;
  } catch (error) {
    if (error instanceof KosipaError) throw error;
    return fail();
  }
}
const KOSIPA_WRITER_DSNS = ['DATABASE_URL_KOSIPA_MASTER_WRITE', 'DATABASE_URL_KOSIPA_MEMBER_WRITE', 'DATABASE_URL_KOSIPA_SAVINGS_WRITE', 'DATABASE_URL_KOSIPA_LOAN_WRITE', 'DATABASE_URL_KOSIPA_REQUEST_WRITE'];

export function validateKosipaMasterWriteConfig(env: Record<string, string | undefined> = process.env): string {
  return validateKosipaWriterConfig(env, 'KOSIPA_MASTER_WRITES_ENABLED', 'DATABASE_URL_KOSIPA_MASTER_WRITE');
}

/**
 * The command ledger's database (FD-01b option b): a separate database on the SAME server as the business database, where the writer holds
 * SELECT, INSERT only. Required for every KOSIPA writer.
 */
const LOCAL_LEDGERS = new Set(['kkisi_kfa_ledger']);
export function validateKosipaLedgerDatabase(env: Record<string, string | undefined> = process.env, url: string = validateKosipaMasterWriteConfig(env)): string {
  const ledger = env.KOSIPA_LEDGER_DATABASE ?? '';
  const targetUrl = new URL(url);
  if (!/^[A-Za-z0-9_]{1,64}$/.test(ledger) || `/${ledger}` === targetUrl.pathname) throw new KosipaError('WRITE_NOT_CONFIGURED');
  if (isProduction(env)) {
    const forbidden = new Set([env.LEGACY_DB_NAME, env.AUTH_DB_NAME, env.CONSOLE_DB_NAME, 'smart_kopkar'].filter(Boolean));
    if (!productionWritesAllowed(env) || PRODUCTION_STAGING_LEDGER.test(ledger) || forbidden.has(ledger)) throw new KosipaError('WRITE_NOT_CONFIGURED');
    return ledger;
  }
  if (!(targetUrl.port === '3322' ? LOCAL_LEDGERS.has(ledger) : localStagingOptIn(env) && LOCAL_STAGING_LEDGERS.has(ledger))) throw new KosipaError('WRITE_NOT_CONFIGURED');
  return ledger;
}

export function kosipaMasterWritesAvailable(env: Record<string, string | undefined> = process.env): boolean {
  try { validateKosipaLedgerDatabase(env); return true; } catch { return false; }
}

const holder = globalThis as typeof globalThis & { kkisiKosipaMasterWrite?: PrismaClient };
export function kosipaMasterWritePrisma(): PrismaClient {
  const url = validateKosipaMasterWriteConfig();
  return holder.kkisiKosipaMasterWrite ??= new PrismaClient({ datasources: { db: { url } } });
}
