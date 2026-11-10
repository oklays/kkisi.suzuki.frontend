// Fail-closed configuration of the member PWA. Pure: every function takes the environment as an argument so it is unit-tested
// without touching process.env. Nothing here ever logs or returns a credential.
import { createHmac } from 'node:crypto';
import { parseIntakeKeys, type IntakeKey } from '@koperasi/application/member-intake/signature';
import { parseMemberQrSigningKey, type MemberQrSigningKey } from '@koperasi/application/member-qr/token';

export class ConfigError extends Error {
  readonly setting: string;
  constructor(setting: string) { super(`NOT_CONFIGURED:${setting}`); this.setting = setting; }
}

export type AppEnv = 'production' | 'staging' | 'development';
export type Secret = { kid: string; key: Buffer };
export type DsnInfo = { url: string; user: string; host: string; database: string };

export type FeatureFlags = {
  enableLoanApplication: boolean;
  enableDeductionChange: boolean;
  enableStoreCheckout: boolean;
  enablePpob: boolean;
  enableMemberFavouritesWrite: boolean;
};

export type AuthSettings = {
  appEnv: AppEnv;
  origin: string;
  secure: boolean;
  cookieName: string;
  trustedProxyHops: number;
  secrets: Secret[];
  pinPeppers: Secret[];
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

export function parseSecrets(raw: string | undefined, settingName = 'MEMBER_AUTH_SECRETS'): Secret[] {
  if (!raw || raw.length > 2000) throw new ConfigError(settingName);
  const seen = new Set<string>();
  const out: Secret[] = [];
  for (const part of raw.split(',')) {
    const i = part.indexOf(':');
    const kid = part.slice(0, i).trim();
    const b64 = part.slice(i + 1).trim();
    if (i < 1 || !/^[a-z0-9]{1,16}$/.test(kid) || seen.has(kid) || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(b64)) throw new ConfigError(settingName);
    const key = Buffer.from(b64, /[-_]/.test(b64) ? 'base64url' : 'base64');
    if (key.length < 32) throw new ConfigError(settingName);
    seen.add(kid);
    out.push({ kid, key });
  }
  if (out.length === 0) throw new ConfigError(settingName);
  return out;
}

/** Derives a domain-separated 32-byte PIN pepper ring when MEMBER_PIN_PEPPER is not set separately. */
export function derivePinPeppers(secrets: readonly Secret[]): Secret[] {
  return secrets.map((s) => ({
    kid: s.kid,
    key: createHmac('sha256', s.key).update('kkisi:pin-pepper:v1').digest(),
  }));
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

function parseFlag(name: string, raw: string | undefined): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === '' || v === 'false' || v === '0') return false;
  if (v === 'true' || v === '1') return true;
  throw new ConfigError(name);
}

/**
 * Centralized server-enforced feature capability flags (WS-03 §5.7).
 * All writer-dependent features default to false (fail-closed).
 */
export function loadFeatureFlags(env: Env = process.env): FeatureFlags {
  return {
    enableLoanApplication: parseFlag('ENABLE_LOAN_APPLICATION', env.ENABLE_LOAN_APPLICATION),
    enableDeductionChange: parseFlag('ENABLE_DEDUCTION_CHANGE', env.ENABLE_DEDUCTION_CHANGE),
    enableStoreCheckout: parseFlag('ENABLE_STORE_CHECKOUT', env.ENABLE_STORE_CHECKOUT),
    enablePpob: parseFlag('ENABLE_PPOB', env.ENABLE_PPOB),
    enableMemberFavouritesWrite: parseFlag('ENABLE_MEMBER_FAVOURITES_WRITE', env.ENABLE_MEMBER_FAVOURITES_WRITE),
  };
}

export function loadAuthSettings(env: Env): AuthSettings {
  const mode = appEnv(env);
  const { origin, secure } = parseOrigin(env.APP_ORIGIN, mode);
  const hopsRaw = env.TRUSTED_PROXY_HOPS ?? '';
  const trustedProxyHops = hopsRaw === '' ? 0 : Number(hopsRaw);
  if (!Number.isInteger(trustedProxyHops) || trustedProxyHops < 0 || trustedProxyHops > 5) throw new ConfigError('TRUSTED_PROXY_HOPS');
  const secrets = parseSecrets(env.MEMBER_AUTH_SECRETS, 'MEMBER_AUTH_SECRETS');
  // Production needs its own PIN pepper ring: a pepper derived from the session keys would change (and silently re-key every
  // shadow PIN credential) whenever the session keys are rotated, and one leaked env value would expose both.
  if (mode === 'production' && !env.MEMBER_PIN_PEPPER?.trim()) throw new ConfigError('MEMBER_PIN_PEPPER');
  const pinPeppers = env.MEMBER_PIN_PEPPER?.trim()
    ? parseSecrets(env.MEMBER_PIN_PEPPER, 'MEMBER_PIN_PEPPER')
    : derivePinPeppers(secrets);
  if (pinPeppers.some((p) => secrets.some((s) => s.key.equals(p.key)))) throw new ConfigError('MEMBER_PIN_PEPPER');
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
  return { appEnv: mode, origin, secure, cookieName: secure ? '__Host-kkisi_member' : 'kkisi_member', trustedProxyHops, secrets, pinPeppers, store };
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

export type WriterSettings = { dsn: DsnInfo; poolLimit: number } | null;
/**
 * Optional dedicated least-privilege writer DSN for approved member intake tables.
 * Never reuses the read-only account (`DATABASE_URL_MEMBER_READ`).
 */
export function loadWriterSettings(env: Env = process.env): WriterSettings {
  const raw = env.DATABASE_URL_MEMBER_WRITE?.trim();
  if (!raw) return null;
  const mode = appEnv(env);
  const dsn = parseDsn('DATABASE_URL_MEMBER_WRITE', raw, mode);
  const reader = env.DATABASE_URL_MEMBER_READ ? parseDsn('DATABASE_URL_MEMBER_READ', env.DATABASE_URL_MEMBER_READ, mode) : null;
  if (reader && reader.user === dsn.user) throw new ConfigError('DATABASE_URL_MEMBER_WRITE');
  return { dsn, poolLimit: 1 };
}

export type IntakeSettings = { baseUrl: string; keys: IntakeKey[] } | null;
const PRIVATE_HOST = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[::1\]|[a-z0-9][a-z0-9-]{0,62})$/i;
/**
 * apps/web member-intake channel (P1): MEMBER_INTAKE_API_URL + MEMBER_INTAKE_KEYS. Unset URL = not configured (loan application and
 * deduction change stay off). The URL must be a bare origin on the internal network: loopback, a private address or a single-label
 * container name (e.g. http://genesis-web-netns:3000), never a public host — the endpoint does not exist through the public proxy.
 */
export function loadIntakeSettings(env: Env = process.env): IntakeSettings {
  const raw = env.MEMBER_INTAKE_API_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try { url = new URL(raw); } catch { throw new ConfigError('MEMBER_INTAKE_API_URL'); }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')
    || !PRIVATE_HOST.test(url.hostname)) throw new ConfigError('MEMBER_INTAKE_API_URL');
  let keys: IntakeKey[];
  try { keys = parseIntakeKeys(env.MEMBER_INTAKE_KEYS); } catch { throw new ConfigError('MEMBER_INTAKE_KEYS'); }
  return { baseUrl: url.origin, keys };
}

/**
 * Dynamic member QR (P2): MEMBER_QR_SIGNING_KEY = "kid:base64(PKCS#8 Ed25519)". Unset = the QR screen explains that QR is not available
 * yet (no fallback to a static or unsigned code). The matching public key goes to apps/web as MEMBER_QR_VERIFY_KEYS.
 */
export function loadQrSigningKey(env: Env = process.env): MemberQrSigningKey | null {
  const raw = env.MEMBER_QR_SIGNING_KEY?.trim();
  if (!raw) return null;
  try { return parseMemberQrSigningKey(raw); } catch { throw new ConfigError('MEMBER_QR_SIGNING_KEY'); }
}
