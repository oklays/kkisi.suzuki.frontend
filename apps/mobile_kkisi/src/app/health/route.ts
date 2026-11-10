import { appEnv } from '@/lib/config/env';
import { isInternalCaller } from '@/lib/security/request';
import { authDb, featureFlags, readerDb } from '@/server/container';

export const dynamic = 'force-dynamic';

async function pingPool(pool: { query: (sql: string) => Promise<unknown> } | null): Promise<'ok' | 'skipped' | 'down'> {
  if (!pool) return 'skipped';
  try {
    await Promise.race([
      pool.query('SELECT /*+ MAX_EXECUTION_TIME(1500) */ 1 AS ok'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
    ]);
    return 'ok';
  } catch {
    return 'down';
  }
}

function trustedHops(): number {
  const raw = Number(process.env.TRUSTED_PROXY_HOPS ?? '0');
  return Number.isInteger(raw) && raw >= 0 && raw <= 5 ? raw : 1;   // unparsable -> assume a proxy (detail stays hidden)
}

/**
 * Liveness (`/health`) and optional readiness (`/health?check=ready`) for reverse proxy / container healthchecks.
 * Never exposes credentials, DSNs, hostnames, or internal stack traces. Through the public proxy it answers with the status
 * only; app, version, environment, per-pool checks and the effective feature flags are reported to internal callers only.
 */
export async function GET(request: Request) {
  let env = 'invalid';
  try { env = appEnv(process.env); } catch { /* reported as invalid */ }
  const detail = isInternalCaller(request.headers, trustedHops());
  const headers = { 'Cache-Control': 'no-store' };
  const check = new URL(request.url).searchParams.get('check');
  if (check !== 'ready') {
    const status = env === 'invalid' ? 'degraded' : 'ok';
    return Response.json(
      detail ? { status, app: 'mobile_kkisi', version: process.env.APP_VERSION ?? null, env, features: featureFlags(process.env) } : { status },
      { status: env === 'invalid' ? 503 : 200, headers },
    );
  }
  let readerStatus: 'ok' | 'skipped' | 'down' = 'down';
  let authStatus: 'ok' | 'skipped' | 'down' = 'down';
  try {
    [readerStatus, authStatus] = await Promise.all([
      pingPool(readerDb(process.env)),
      pingPool(authDb(process.env)),
    ]);
  } catch {
    /* reported as down */
  }
  const ready = env !== 'invalid' && readerStatus === 'ok' && (authStatus === 'ok' || authStatus === 'skipped');
  const status = ready ? 'ok' : 'degraded';
  return Response.json(
    detail
      ? { status, app: 'mobile_kkisi', version: process.env.APP_VERSION ?? null, env, checks: { readerDb: readerStatus, authDb: authStatus }, features: featureFlags(process.env) }
      : { status },
    { status: ready ? 200 : 503, headers },
  );
}
