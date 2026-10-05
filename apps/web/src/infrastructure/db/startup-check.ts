import type { PrismaClient } from '@prisma/client';
import { loadAuthConfig } from '../auth/config.ts';
import { authStoreStatus, pingAuthStore } from '../auth/store-health.ts';
import { assertConnectionBudget, assertProductionDsn, assertProductionReadAndAuth, DeploymentConfigError, expectedServer, isProduction, productionWritesAllowed, type ProductionDsn } from './deployment-guard.ts';
import { prisma } from './prisma.ts';
import { posWritePrisma, validatePosWriteConfig } from './prisma-pos-write.ts';
import { registerWritePrisma, validateRegisterWriteConfig } from './prisma-register-write.ts';
import { inventoryWritePrisma, validateInventoryWriteConfig } from './prisma-inventory-write.ts';
import { productWritePrisma, validateProductWriteConfig } from './prisma-product-write.ts';

type Env = Record<string, string | undefined>;
type Writer = { name: string; dsn: ProductionDsn; client: () => PrismaClient };

/** Short, safe failure reason: configuration reason or error code only (never a DSN, host, user, SQL or driver text). */
export function safeReason(error: unknown): string {
  if (error instanceof DeploymentConfigError) return error.reason;
  const e = error as { code?: unknown; errorCode?: unknown } | null;
  for (const code of [e?.code, e?.errorCode]) if (typeof code === 'string' && /^[A-Z0-9_]{1,40}$/.test(code)) return code;
  // DNS/network failures surface as an initialization error without a code.
  if ((error as Error | null)?.name === 'PrismaClientInitializationError') return 'DB_INIT_FAILED';
  return 'UNEXPECTED';
}

const DDL = /\b(ALL PRIVILEGES|CREATE|DROP|ALTER|INDEX|TRIGGER|REFERENCES|GRANT OPTION|SUPER|FILE|RELOAD|SHUTDOWN|PROCESS)\b/;
const WRITE = /\b(INSERT|UPDATE|DELETE|LOCK TABLES|EXECUTE|EVENT)\b/;

/** Grant lines (normalized) that apply to `database` (or to every database). */
const applying = (lines: string[], database: string) => lines.filter((line) => / ON \*\.\* /.test(line) || line.includes(` ON ${database}.`));
async function grantsOn(client: PrismaClient, database: string): Promise<string[]> {
  const rows = await client.$queryRaw<Record<string, string>[]>`SHOW GRANTS`;
  return applying(rows.map((row) => String(Object.values(row)[0] ?? '').replace(/[`\\]/g, '')), database);
}
const privileges = (line: string) => line.replace(/^GRANT /, '').split(' ON ')[0];

/**
 * The connection selected `database` AND reaches the pinned server: @@hostname / @@port must equal
 * <P>_SERVER_HOSTNAME / <P>_SERVER_PORT. Through an SSH tunnel this is what proves 127.0.0.1 is the production server.
 */
async function assertSelected(client: PrismaClient, database: string, server: { hostname: string; port: string }, reason: string): Promise<string> {
  const rows = await client.$queryRaw<{ db: string | null; v: string; h: string; p: number | bigint }[]>`SELECT DATABASE() AS db, VERSION() AS v, @@hostname AS h, @@port AS p`;
  if (rows[0]?.db !== database) throw new DeploymentConfigError(reason);
  if (String(rows[0].h).toLowerCase() !== server.hostname || String(rows[0].p) !== server.port) throw new DeploymentConfigError('DB_SERVER_IDENTITY_MISMATCH');
  return rows[0].v;
}

/** Enabled legacy writers. A module flag without the production acknowledgement (or vice versa) is a startup error. */
function enabledWriters(env: Env): Writer[] {
  const writers: Writer[] = [];
  const add = (name: string, url: string, client: () => PrismaClient) => writers.push({ name, dsn: assertProductionDsn('legacy', url, env), client });
  if (env.POS_WRITES_ENABLED === '1') {
    add('pos', validatePosWriteConfig(env), posWritePrisma);
    add('register', validateRegisterWriteConfig(env), registerWritePrisma);
  }
  if (env.INVENTORY_WRITES_ENABLED === '1') add('inventory', validateInventoryWriteConfig(env), inventoryWritePrisma);
  if (env.PRODUCTS_WRITES_ENABLED === '1') add('products', validateProductWriteConfig(env), productWritePrisma);
  if (productionWritesAllowed(env) && writers.length === 0) throw new DeploymentConfigError('WRITE_ACK_WITHOUT_WRITER');
  return writers;
}

/**
 * Production fail-fast sequence: APP_ENV -> origin/secrets/read+auth targets -> writers -> pool budget -> connect and
 * verify the selected databases -> legacy reader is SELECT-only and no account can run DDL -> auth tables present.
 * Every statement is a read (SELECT / SHOW GRANTS). Returns a log line without secrets.
 */
export async function verifyProductionStartup(env: Env = process.env): Promise<string> {
  if (!isProduction(env)) throw new DeploymentConfigError('APP_ENV');
  const { legacy, auth } = assertProductionReadAndAuth(env);   // first, so a DSN problem is reported with its reason
  loadAuthConfig(env);
  const writers = enabledWriters(env);
  const { used, budget } = assertConnectionBudget([legacy, auth, ...writers.map((w) => w.dsn)], env);

  const legacyServer = expectedServer('legacy', env);
  const authServer = expectedServer('auth', env);
  const version = await assertSelected(prisma, legacy.database, legacyServer, 'LEGACY_DB_NOT_SELECTED');
  const readGrants = await grantsOn(prisma, legacy.database);
  if (readGrants.some((line) => DDL.test(privileges(line)) || WRITE.test(privileges(line)))) throw new DeploymentConfigError('LEGACY_READER_NOT_READ_ONLY');
  for (const writer of writers) {
    const client = writer.client();
    await assertSelected(client, legacy.database, legacyServer, 'LEGACY_WRITER_NOT_SELECTED');
    if ((await grantsOn(client, legacy.database)).some((line) => DDL.test(privileges(line)))) throw new DeploymentConfigError('LEGACY_WRITER_HAS_DDL');
  }
  const store = await authStoreStatus();
  if (store.database !== auth.database) throw new DeploymentConfigError('AUTH_DB_NOT_SELECTED');
  if (store.serverHostname !== authServer.hostname || store.serverPort !== authServer.port) throw new DeploymentConfigError('DB_SERVER_IDENTITY_MISMATCH');
  if (store.tables !== 2) throw new DeploymentConfigError('AUTH_TABLES_MISSING');
  // The auth account reaches only its own store: nothing on the business database, no DDL anywhere it applies.
  if (applying(store.grants, legacy.database).some((line) => privileges(line) !== 'USAGE')) throw new DeploymentConfigError('AUTH_USER_REACHES_LEGACY_DB');
  if (applying(store.grants, auth.database).some((line) => DDL.test(privileges(line)))) throw new DeploymentConfigError('AUTH_USER_HAS_DDL');

  return `[startup] production database configuration verified: legacy_db=${legacy.database} auth_db=${auth.database} `
    + `server=${legacyServer.hostname}:${legacyServer.port} (${version}) transport=${legacyServer.transport} `
    + `writes=${writers.map((w) => w.name).join(',') || 'none'} legacy_pool=${used}/${budget}`;
}

export type Readiness = { ready: boolean; checks: { config: boolean; legacyDb: boolean; authDb: boolean } };

/** Readiness probe: configuration still valid and both stores answer `SELECT 1`. Read-only; no business queries. */
export async function checkReadiness(env: Env = process.env): Promise<Readiness> {
  let config = true;
  try { loadAuthConfig(env); } catch { config = false; }
  const ping = async (fn: () => Promise<unknown>) => { try { await fn(); return true; } catch { return false; } };
  const [legacyDb, authDb] = config
    ? await Promise.all([ping(() => prisma.$queryRaw`SELECT 1`), ping(pingAuthStore)])
    : [false, false];
  return { ready: config && legacyDb && authDb, checks: { config, legacyDb, authDb } };
}
