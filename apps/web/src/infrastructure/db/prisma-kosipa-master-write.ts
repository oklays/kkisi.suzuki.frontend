import { PrismaClient } from '@prisma/client';
import { KosipaError } from '@koperasi/domain/kosipa';
import { isProduction } from './deployment-guard.ts';

/**
 * KOSIPA reference-master writer (FA-01 proof slice, TASK-114 / SEC-107): its own account (local kosipa_master_w, grants in
 * db/kosipa/002_master_writer_grants.sql.tpl), never shared with the reader, the auth/console stores or a TOKO writer.
 *
 * FA-01 boundary: the ONLY database this client may reach is the isolated synthetic KOSIPA database on the FA-01 container
 * (loopback, port 3322, kkisi_kfa_synthetic). The real-data staging copy, DEV LOCAL and production are refused here, whatever the
 * flags say. Production enablement is a later cutover step (11, gates 1-8) and needs this guard extended deliberately.
 */
const LOCAL_TARGETS = new Set(['3322/kkisi_kfa_synthetic']);
const OTHER_ACCOUNTS = ['DATABASE_URL', 'DATABASE_URL_AUTH', 'DATABASE_URL_CONSOLE', 'DATABASE_URL_WRITE', 'DATABASE_URL_REGISTER_WRITE', 'DATABASE_URL_INVENTORY_WRITE', 'DATABASE_URL_PRODUCT_WRITE', 'DATABASE_URL_RETURN_WRITE'];

export function validateKosipaMasterWriteConfig(env: Record<string, string | undefined> = process.env): string {
  const fail = (): never => { throw new KosipaError('WRITE_NOT_CONFIGURED'); };
  try {
    if (env.KOSIPA_MASTER_WRITES_ENABLED !== 'true' || isProduction(env)) return fail();
    const url = new URL(env.DATABASE_URL_KOSIPA_MASTER_WRITE ?? '');
    const user = decodeURIComponent(url.username);
    if (url.protocol !== 'mysql:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || !LOCAL_TARGETS.has(`${url.port}${url.pathname}`)) return fail();
    if (!user || !url.password || ['root', 'admin'].includes(user)) return fail();
    for (const key of OTHER_ACCOUNTS) {
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

/**
 * The command ledger's database (FD-01b option b): a separate database on the SAME server as the business database, where the writer holds
 * SELECT, INSERT only. Required for every KOSIPA writer; FA-01.5 allows only the synthetic ledger database next to the synthetic business one.
 */
const LOCAL_LEDGERS = new Set(['kkisi_kfa_ledger']);
export function validateKosipaLedgerDatabase(env: Record<string, string | undefined> = process.env): string {
  const url = validateKosipaMasterWriteConfig(env);
  const ledger = env.KOSIPA_LEDGER_DATABASE ?? '';
  if (!/^[A-Za-z0-9_]{1,64}$/.test(ledger) || !LOCAL_LEDGERS.has(ledger) || `/${ledger}` === new URL(url).pathname) throw new KosipaError('WRITE_NOT_CONFIGURED');
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
