import { AuthError } from '../../domain/auth/errors.ts';

export type ParsedSecret = { kid: string; key: Buffer };
export type AuthConfig = {
  appOrigin: string;
  secure: boolean;
  cookieName: string;
  trustedProxyHops: number;
  secrets: ParsedSecret[];        // first = active
};

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const notConfigured = (): never => { throw new AuthError('NOT_CONFIGURED'); };

/** Fails closed: any missing or unsafe setting makes authentication unavailable (no defaults, no generated keys). */
export function parseSecrets(raw: string | undefined): ParsedSecret[] {
  if (!raw || raw.length > 2000) return notConfigured();
  const seen = new Set<string>();
  const out: ParsedSecret[] = [];
  for (const part of raw.split(',')) {
    const i = part.indexOf(':');
    const kid = part.slice(0, i).trim();
    const b64 = part.slice(i + 1).trim();
    if (i < 1 || !/^[a-z0-9]{1,16}$/.test(kid) || seen.has(kid) || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(b64)) return notConfigured();
    const key = Buffer.from(b64, /[-_]/.test(b64) ? 'base64url' : 'base64');
    if (key.length < 32) return notConfigured();
    seen.add(kid);
    out.push({ kid, key });
  }
  return out.length > 0 ? out : notConfigured();
}

/** APP_ORIGIN must be a bare loopback origin (S2-10: local staging only; no public exposure). */
export function parseAppOrigin(raw: string | undefined): { origin: string; secure: boolean } {
  if (!raw) return notConfigured();
  let url: URL;
  try { url = new URL(raw); } catch { return notConfigured(); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return notConfigured();
  if (!LOOPBACK_HOSTS.has(url.hostname === '::1' ? '[::1]' : url.hostname)) return notConfigured();
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) return notConfigured();
  return { origin: url.origin, secure: url.protocol === 'https:' };
}

export function parseDsn(name: string, raw: string | undefined): { user: string; host: string; database: string } {
  if (!raw) return notConfigured();
  let url: URL;
  try { url = new URL(raw); } catch { return notConfigured(); }
  if (url.protocol !== 'mysql:') return notConfigured();
  void name;
  return { user: decodeURIComponent(url.username), host: url.hostname, database: url.pathname.replace(/^\//, '') };
}

/** Both connections are pinned to the local staging server; the legacy account must not be able to write. */
export function assertLocalDatabases(env: Record<string, string | undefined>): void {
  const legacy = parseDsn('DATABASE_URL', env.DATABASE_URL);
  const auth = parseDsn('DATABASE_URL_AUTH', env.DATABASE_URL_AUTH);
  for (const dsn of [legacy, auth]) {
    if (dsn.host !== '127.0.0.1' && dsn.host !== 'localhost') notConfigured();
  }
  if (['root', 'kkisi_app'].includes(legacy.user)) notConfigured();      // the legacy connection is SELECT-only
  if (legacy.user === auth.user || legacy.database === auth.database) notConfigured();
}

export function loadAuthConfig(env: Record<string, string | undefined> = process.env): AuthConfig {
  const { origin, secure } = parseAppOrigin(env.APP_ORIGIN);
  const hops = env.TRUSTED_PROXY_HOPS === undefined || env.TRUSTED_PROXY_HOPS === '' ? 0 : Number(env.TRUSTED_PROXY_HOPS);
  if (!Number.isInteger(hops) || hops < 0 || hops > 5) return notConfigured();
  assertLocalDatabases(env);
  return {
    appOrigin: origin,
    secure,
    cookieName: secure ? '__Host-kkisi_sid' : 'kkisi_sid',
    trustedProxyHops: hops,
    secrets: parseSecrets(env.AUTH_SECRETS),
  };
}
