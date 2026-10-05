/**
 * Deployment-target guard for every database connection.
 *
 * APP_ENV unset (or "local") keeps the existing loopback/staging-only rules of each client unchanged.
 * APP_ENV=production replaces them with an explicit allowlist (partial cutover on the Niagahoster production MariaDB):
 * every DSN must name exactly the configured host, port and database, use a dedicated non-admin account, keep a small
 * pool that is recycled before the server's wait_timeout, and declare its transport. Legacy writes additionally need
 * ALLOW_PRODUCTION_DB_WRITE=true plus the module's own *_WRITES_ENABLED flag. Any other APP_ENV value fails closed.
 * Errors carry a short reason only: never a DSN, host, user or password.
 */
type Env = Record<string, string | undefined>;
export type DbTargetKind = 'legacy' | 'auth';
export type ProductionDsn = { url: string; user: string; host: string; database: string; connectionLimit: number; server: string };

export class DeploymentConfigError extends Error {
  readonly reason: string;
  constructor(reason: string) { super(`DEPLOYMENT_CONFIG:${reason}`); this.name = 'DeploymentConfigError'; this.reason = reason; }
}
const fail = (reason: string): never => { throw new DeploymentConfigError(reason); };

/** Per-client pool ceiling (Niagahoster max_user_connections = 20 is shared with the legacy PHP application). */
export const MAX_POOL_PER_CLIENT = 4;
/** Ceiling for LEGACY_DB_CONNECTION_BUDGET: leaves at least 8 of the 20 connections to the legacy PHP application. */
export const MAX_CONNECTION_BUDGET = 12;
/** Pooled connections must be dropped before the server's wait_timeout (20 s), otherwise Prisma reuses dead sockets (P1017). */
export const MAX_IDLE_LIFETIME_SECONDS = 15;

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', '0.0.0.0']);
const FORBIDDEN_USERS = new Set(['root', 'admin', 'mysql', 'mariadb.sys']);
const STAGING_MARKER = /staging|test|e2e|replace_me|example|fixture/i;

export function isProduction(env: Env = process.env): boolean {
  const value = env.APP_ENV;
  if (value === undefined || value === '' || value === 'local') return false;
  if (value === 'production') return true;
  return fail('APP_ENV');
}

export function productionWritesAllowed(env: Env = process.env): boolean {
  return env.ALLOW_PRODUCTION_DB_WRITE === 'true';
}

export type Transport = 'direct' | 'ssh-tunnel';
type Target = { host: string; port: string; database: string; transport: Transport; tls: 'required' | 'disabled-acknowledged' | 'ssh-tunnel'; serverHostname: string; serverPort: string };
/** The only address an SSH tunnel may listen on inside the application's network namespace. */
export const TUNNEL_HOST = '127.0.0.1';

/**
 * <P>_TRANSPORT is explicit:
 * - direct:     non-loopback host, ALLOW_REMOTE_<P>=true, <P>_TLS declared (unchanged rules);
 * - ssh-tunnel: host must be exactly 127.0.0.1 (the tunnel's local end); transport is encrypted by SSH.
 * Loopback is never accepted without ssh-tunnel. In both modes the real server is pinned by <P>_SERVER_HOSTNAME and
 * <P>_SERVER_PORT, which the startup check compares with the server's own @@hostname / @@port.
 */
function target(kind: DbTargetKind, env: Env): Target {
  const p = kind === 'legacy' ? 'LEGACY_DB' : 'AUTH_DB';
  const host = (env[`${p}_HOST`] ?? '').trim().toLowerCase();
  const port = (env[`${p}_PORT`] ?? '').trim();
  const database = (env[`${p}_NAME`] ?? '').trim();
  const transport = env[`${p}_TRANSPORT`];
  const serverHostname = (env[`${p}_SERVER_HOSTNAME`] ?? '').trim().toLowerCase();
  const serverPort = (env[`${p}_SERVER_PORT`] ?? '').trim();
  if (transport !== 'direct' && transport !== 'ssh-tunnel') return fail(`${p}_TRANSPORT`);
  if (!/^[0-9]{2,5}$/.test(port)) fail(`${p}_PORT`);
  if (!/^[A-Za-z0-9_]{1,64}$/.test(database) || STAGING_MARKER.test(database)) fail(`${p}_NAME`);
  if (!/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/.test(serverHostname) || LOOPBACK.has(serverHostname)) fail(`${p}_SERVER_HOSTNAME`);
  if (!/^[0-9]{2,5}$/.test(serverPort)) fail(`${p}_SERVER_PORT`);
  if (transport === 'ssh-tunnel') {
    if (host !== TUNNEL_HOST) fail(`${p}_HOST`);
    return { host, port, database, transport, tls: 'ssh-tunnel', serverHostname, serverPort };
  }
  const tls = env[`${p}_TLS`];
  if (!host || LOOPBACK.has(host)) fail(`${p}_HOST`);                     // direct: inside a container loopback is never production
  if (env[kind === 'legacy' ? 'ALLOW_REMOTE_LEGACY_DB' : 'ALLOW_REMOTE_AUTH_DB'] !== 'true') fail(`ALLOW_REMOTE_${p}`);
  if (tls !== 'required' && tls !== 'disabled-acknowledged') return fail(`${p}_TLS`);
  return { host, port, database, transport, tls, serverHostname, serverPort };
}

/** Expected identity of the server behind a target (verified at startup against @@hostname / @@port). */
export function expectedServer(kind: DbTargetKind, env: Env = process.env): { hostname: string; port: string; transport: Transport } {
  const t = target(kind, env);
  return { hostname: t.serverHostname, port: t.serverPort, transport: t.transport };
}

/** Validates one production DSN against the explicit allowlist of its target. Returns the DSN unchanged. */
export function assertProductionDsn(kind: DbTargetKind, raw: string | undefined, env: Env = process.env): ProductionDsn {
  const t = target(kind, env);
  const label = kind === 'legacy' ? 'LEGACY_DSN' : 'AUTH_DSN';
  let url: URL;
  try { url = new URL(raw ?? ''); } catch { return fail(label); }
  if (url.protocol !== 'mysql:') fail(`${label}_PROTOCOL`);
  if (url.hostname.toLowerCase() !== t.host || (url.port || '3306') !== t.port || url.pathname !== `/${t.database}`) fail(`${label}_TARGET`);
  let user: string;
  try { user = decodeURIComponent(url.username); } catch { return fail(`${label}_USER`); }
  if (!user || !url.password || FORBIDDEN_USERS.has(user.toLowerCase()) || /^kkisi_/i.test(user) || STAGING_MARKER.test(user)) fail(`${label}_USER`);
  const q = url.searchParams;
  const limit = Number(q.get('connection_limit'));
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_POOL_PER_CLIENT) fail(`${label}_CONNECTION_LIMIT`);
  const idle = Number(q.get('max_idle_connection_lifetime'));
  if (!Number.isInteger(idle) || idle < 1 || idle > MAX_IDLE_LIFETIME_SECONDS) fail(`${label}_IDLE_LIFETIME`);
  if (q.get('sslaccept') === 'accept_invalid_certs') fail(`${label}_TLS`);
  if (t.tls === 'required' && q.get('sslaccept') !== 'strict') fail(`${label}_TLS`);
  return { url: url.href, user, host: t.host, database: t.database, connectionLimit: limit, server: `${t.serverHostname}:${t.serverPort}` };
}

/** Production read/auth pair: separate accounts and databases (the auth store never shares the legacy schema). */
export function assertProductionReadAndAuth(env: Env = process.env): { legacy: ProductionDsn; auth: ProductionDsn } {
  const legacy = assertProductionDsn('legacy', env.DATABASE_URL, env);
  const auth = assertProductionDsn('auth', env.DATABASE_URL_AUTH, env);
  if (legacy.user === auth.user || (legacy.server === auth.server && legacy.database === auth.database)) fail('AUTH_SHARES_LEGACY');
  return { legacy, auth };
}

/**
 * Upper bound of connections this process can open to the legacy MariaDB server (identified by its pinned
 * <P>_SERVER_HOSTNAME:<P>_SERVER_PORT, so a tunnel and a direct path to the same server count together):
 *   sum(connection_limit of every client on that server). TOTAL = this × processes per container × containers.
 * Only one Next.js process per container and one container are supported; LEGACY_DB_CONNECTION_BUDGET states the bound.
 */
export function assertConnectionBudget(dsns: readonly ProductionDsn[], env: Env = process.env): { used: number; budget: number } {
  const budget = Number(env.LEGACY_DB_CONNECTION_BUDGET);
  if (!Number.isInteger(budget) || budget < 1 || budget > MAX_CONNECTION_BUDGET) fail('LEGACY_DB_CONNECTION_BUDGET');
  const t = target('legacy', env);
  const legacyServer = `${t.serverHostname}:${t.serverPort}`;
  const used = dsns.filter((d) => d.server === legacyServer).reduce((n, d) => n + d.connectionLimit, 0);
  if (used > budget) fail('CONNECTION_BUDGET_EXCEEDED');
  return { used, budget };
}
