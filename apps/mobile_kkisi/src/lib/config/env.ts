// Fail-closed configuration of the member PWA. Pure: every function takes the environment as an argument so it is unit-tested
// without touching process.env. Nothing here ever logs or returns a credential.

export class ConfigError extends Error {
  readonly setting: string;
  constructor(setting: string) { super(`NOT_CONFIGURED:${setting}`); this.setting = setting; }
}

export type AppEnv = 'production' | 'staging' | 'development';
export type Secret = { kid: string; key: Buffer };
export type DsnInfo = { url: string; user: string; host: string; database: string };

export type AuthSettings = {
  appEnv: AppEnv;
  origin: string;
  secure: boolean;
  cookieName: string;
  trustedProxyHops: number;
  secrets: Secret[];
  store: { kind: 'mysql'; dsn: DsnInfo } | { kind: 'memory' };
};

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
type Env = Record<string, string | undefined>;

export function appEnv(env: Env): AppEnv {
  const raw = (env.APP_ENV ?? '').trim();
  if (raw === 'production' || raw === 'staging' || raw === 'development') return raw;
  if (raw === '') return env.NODE_ENV === 'production' ? 'production' : 'development';
  throw new ConfigError('APP_ENV');
}

/** Bare origin only. Production: HTTPS on a public host. Elsewhere: loopback HTTP(S) or any HTTPS host (staging). */
export function parseOrigin(raw: string | undefined, mode: AppEnv): { origin: string; secure: boolean } {
  if (!raw) throw new ConfigError('APP_ORIGIN');
  let url: URL;
  try { url = new URL(raw); } catch { throw new ConfigError('APP_ORIGIN'); }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) throw new ConfigError('APP_ORIGIN');
  const loopback = LOOPBACK.has(url.hostname);
  const https = url.protocol === 'https:';
  if (url.protocol !== 'http:' && !https) throw new ConfigError('APP_ORIGIN');
  if (mode === 'production' && (!https || loopback || url.hostname === '0.0.0.0')) throw new ConfigError('APP_ORIGIN');
  if (mode !== 'production' && !https && !loopback) throw new ConfigError('APP_ORIGIN');
  return { origin: url.origin, secure: https };
}

export function parseSecrets(raw: string | undefined): Secret[] {
  if (!raw || raw.length > 2000) throw new ConfigError('MEMBER_AUTH_SECRETS');
  const seen = new Set<string>();
  const out: Secret[] = [];
  for (const part of raw.split(',')) {
    const i = part.indexOf(':');
    const kid = part.slice(0, i).trim();
    const b64 = part.slice(i + 1).trim();
    if (i < 1 || !/^[a-z0-9]{1,16}$/.test(kid) || seen.has(kid) || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(b64)) throw new ConfigError('MEMBER_AUTH_SECRETS');
    const key = Buffer.from(b64, /[-_]/.test(b64) ? 'base64url' : 'base64');
    if (key.length < 32) throw new ConfigError('MEMBER_AUTH_SECRETS');
    seen.add(kid);
    out.push({ kid, key });
  }
  if (out.length === 0) throw new ConfigError('MEMBER_AUTH_SECRETS');
  return out;
}

export function parseDsn(name: string, raw: string | undefined, mode: AppEnv): DsnInfo {
  if (!raw) throw new ConfigError(name);
  let url: URL;
  try { url = new URL(raw); } catch { throw new ConfigError(name); }
  if (url.protocol !== 'mysql:' || !url.hostname || url.pathname.length < 2) throw new ConfigError(name);
  const user = decodeURIComponent(url.username);
  if (!user || user === 'root') throw new ConfigError(name);              // never a superuser account
  if (mode === 'production' && LOOPBACK.has(url.hostname) && url.hostname !== '127.0.0.1') throw new ConfigError(name);
  return { url: raw, user, host: url.hostname, database: decodeURIComponent(url.pathname.slice(1)) };
}

export function loadAuthSettings(env: Env): AuthSettings {
  const mode = appEnv(env);
  const { origin, secure } = parseOrigin(env.APP_ORIGIN, mode);
  const hopsRaw = env.TRUSTED_PROXY_HOPS ?? '';
  const trustedProxyHops = hopsRaw === '' ? 0 : Number(hopsRaw);
  if (!Number.isInteger(trustedProxyHops) || trustedProxyHops < 0 || trustedProxyHops > 5) throw new ConfigError('TRUSTED_PROXY_HOPS');
  const secrets = parseSecrets(env.MEMBER_AUTH_SECRETS);
  let store: AuthSettings['store'];
  if (env.MEMBER_AUTH_STORE === 'memory') {
    if (mode === 'production') throw new ConfigError('MEMBER_AUTH_STORE');   // process memory cannot revoke across instances
    store = { kind: 'memory' };
  } else {
    const dsn = parseDsn('DATABASE_URL_MEMBER_AUTH', env.DATABASE_URL_MEMBER_AUTH, mode);
    const reader = env.DATABASE_URL_MEMBER_READ ? parseDsn('DATABASE_URL_MEMBER_READ', env.DATABASE_URL_MEMBER_READ, mode) : null;
    // The session store and the legacy reader must be separate accounts and databases (least privilege).
    if (reader && (reader.user === dsn.user || (reader.host === dsn.host && reader.database === dsn.database))) throw new ConfigError('DATABASE_URL_MEMBER_AUTH');
    store = { kind: 'mysql', dsn };
  }
  return { appEnv: mode, origin, secure, cookieName: secure ? '__Host-kkisi_member' : 'kkisi_member', trustedProxyHops, secrets, store };
}

export type ReaderSettings = { dsn: DsnInfo; poolLimit: number; catalogCompanyId: number };
export function loadReaderSettings(env: Env): ReaderSettings {
  const mode = appEnv(env);
  const dsn = parseDsn('DATABASE_URL_MEMBER_READ', env.DATABASE_URL_MEMBER_READ, mode);
  const poolLimit = env.MEMBER_DB_POOL_LIMIT ? Number(env.MEMBER_DB_POOL_LIMIT) : 2;
  if (!Number.isInteger(poolLimit) || poolLimit < 1 || poolLimit > 4) throw new ConfigError('MEMBER_DB_POOL_LIMIT');
  const catalogCompanyId = env.MEMBER_CATALOG_COMPANY_ID ? Number(env.MEMBER_CATALOG_COMPANY_ID) : 1;
  if (!Number.isSafeInteger(catalogCompanyId) || catalogCompanyId <= 0) throw new ConfigError('MEMBER_CATALOG_COMPANY_ID');
  return { dsn, poolLimit, catalogCompanyId };
}
