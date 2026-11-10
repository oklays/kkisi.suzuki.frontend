import { appEnv } from '@/lib/config/env';
import { isInternalCaller } from '@/lib/security/request';
import { authDb, featureFlags, qrSigningKey, readerDb } from '@/server/container';
import { allCacheStats } from '@/server/cache/ttl-cache';
import { evaluateAlerts, querySummary, thresholdsFromEnv, uptimeSeconds } from '@/server/observability/metrics';

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
  if (check === 'metrics') return metrics(detail, env, headers);
  if (check !== 'ready') {
    const status = env === 'invalid' ? 'degraded' : 'ok';
    return Response.json(
      detail ? { status, app: 'mobile_kkisi', version: process.env.APP_VERSION ?? null, env, features: { ...featureFlags(process.env), memberQr: qrSigningKey() !== null } } : { status },
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

/**
 * GET /health?check=metrics — internal callers only (loopback / container network; through nginx: 404). Readiness of both pools, per-query
 * p50/p95/max/errors over the last 512 samples, cache hit rates, process memory and the alerts evaluated against METRICS_* thresholds.
 * status: ok | warn | critical (the host monitor notifies on changes). Labels are "<verb> <table>": no SQL text, parameters or member data.
 */
async function metrics(detail: boolean, env: string, headers: Record<string, string>) {
  if (!detail) return Response.json({ error: 'NOT_FOUND' }, { status: 404, headers });
  let checks: Record<string, string> = { readerDb: 'down', authDb: 'down' };
  try {
    const [readerStatus, authStatus] = await Promise.all([pingPool(readerDb(process.env)), pingPool(authDb(process.env))]);
    checks = { readerDb: readerStatus, authDb: authStatus };
  } catch { /* reported as down */ }
  const queries = querySummary();
  const alerts = evaluateAlerts(queries, thresholdsFromEnv(process.env), checks);
  const status = alerts.some((a) => a.level === 'critical') ? 'critical' : alerts.length ? 'warn' : 'ok';
  const mem = process.memoryUsage();
  return Response.json({
    status, app: 'mobile_kkisi', version: process.env.APP_VERSION ?? null, env, uptimeS: uptimeSeconds(), checks, alerts, queries, caches: allCacheStats(),
    process: { rssMb: Math.round(mem.rss / 1048576), heapUsedMb: Math.round(mem.heapUsed / 1048576) },
  }, { status: 200, headers });
}
