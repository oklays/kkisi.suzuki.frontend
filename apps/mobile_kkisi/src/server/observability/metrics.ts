import { AsyncLocalStorage } from 'node:async_hooks';

// Observability (P2), in-process and dependency-free:
//   - request id: set by the proxy (from nginx $request_id, else generated), echoed in X-Request-Id, carried into logs through AsyncLocalStorage;
//   - per-query latency: every statement is labelled "<verb> <table>" and kept in a ring of the last 512 samples, giving p50 / p95 / max and the
//     error rate per label without any personal data (no SQL text, no parameters);
//   - alerts: thresholds evaluated on read (GET /health?check=metrics, internal callers only); the host monitor turns them into notifications.

const RING = 512;
type Series = { samples: number[]; next: number; count: number; errors: number; slow: number; lastAt: number };
const g = globalThis as typeof globalThis & { __kkisiMobileMetrics?: Map<string, Series>; __kkisiMobileStarted?: number; __kkisiMobileRequestCtx?: AsyncLocalStorage<{ requestId: string }> };
const series = (g.__kkisiMobileMetrics ??= new Map());
g.__kkisiMobileStarted ??= Date.now();
export const SLOW_QUERY_MS = 500;

export const requestContext = (g.__kkisiMobileRequestCtx ??= new AsyncLocalStorage<{ requestId: string }>());
export const currentRequestId = (): string | null => requestContext.getStore()?.requestId ?? null;

export { acceptRequestId } from '../../lib/observability/request-id.ts';

/** "SELECT … FROM trans_simpanan_dtl …" -> "select trans_simpanan_dtl". Labels only ever contain a verb and a table name. */
export function sqlLabel(sql: string): string {
  const text = sql.replace(/^\s*SET STATEMENT [^;]*? FOR\s+/i, '');
  const verb = (/^\s*(SELECT|INSERT|UPDATE|DELETE|REPLACE|SHOW)\b/i.exec(text)?.[1] ?? 'other').toLowerCase();
  const table = /\b(?:FROM|INTO|UPDATE)\s+`?([A-Za-z_][A-Za-z0-9_]*)`?/i.exec(text)?.[1]?.toLowerCase() ?? 'expr';
  return `${verb} ${table}`;
}

export function recordQuery(label: string, ms: number, ok: boolean, now: number = Date.now()): void {
  let s = series.get(label);
  if (!s) { s = { samples: [], next: 0, count: 0, errors: 0, slow: 0, lastAt: 0 }; series.set(label, s); }
  if (s.samples.length < RING) s.samples.push(ms); else { s.samples[s.next] = ms; s.next = (s.next + 1) % RING; }
  s.count++; s.lastAt = now;
  if (!ok) s.errors++;
  if (ms >= SLOW_QUERY_MS) s.slow++;
}

const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : 0);

export type QuerySummary = { label: string; count: number; errors: number; slow: number; p50: number; p95: number; max: number; window: number };
export function querySummary(): QuerySummary[] {
  return [...series.entries()].map(([label, s]) => {
    const sorted = [...s.samples].sort((a, b) => a - b);
    return { label, count: s.count, errors: s.errors, slow: s.slow, p50: Math.round(pct(sorted, 50)), p95: Math.round(pct(sorted, 95)), max: Math.round(sorted.at(-1) ?? 0), window: sorted.length };
  }).sort((a, b) => b.p95 - a.p95);
}

export type Alert = { level: 'warn' | 'critical'; code: 'QUERY_P95' | 'QUERY_ERRORS' | 'DB_DOWN'; subject: string; value: number; threshold: number };
export type Thresholds = { p95WarnMs: number; p95CriticalMs: number; errorRateWarn: number; minSamples: number };

export function thresholdsFromEnv(env: Record<string, string | undefined> = process.env): Thresholds {
  const n = (v: string | undefined, d: number, min: number, max: number) => { const x = Number(v); return v !== undefined && v !== '' && Number.isFinite(x) && x >= min && x <= max ? x : d; };
  return { p95WarnMs: n(env.METRICS_P95_WARN_MS, 1000, 50, 60_000), p95CriticalMs: n(env.METRICS_P95_CRITICAL_MS, 3000, 100, 120_000), errorRateWarn: n(env.METRICS_ERROR_RATE_WARN, 0.05, 0.001, 1), minSamples: n(env.METRICS_MIN_SAMPLES, 20, 1, RING) };
}

/** Alerts for the current window. `checks` are the readiness results (a pool that is down is always critical). */
export function evaluateAlerts(summary: readonly QuerySummary[], t: Thresholds, checks: Record<string, string> = {}): Alert[] {
  const alerts: Alert[] = [];
  for (const [name, state] of Object.entries(checks)) if (state === 'down') alerts.push({ level: 'critical', code: 'DB_DOWN', subject: name, value: 1, threshold: 0 });
  for (const q of summary) {
    if (q.window < t.minSamples) continue;
    if (q.p95 >= t.p95CriticalMs) alerts.push({ level: 'critical', code: 'QUERY_P95', subject: q.label, value: q.p95, threshold: t.p95CriticalMs });
    else if (q.p95 >= t.p95WarnMs) alerts.push({ level: 'warn', code: 'QUERY_P95', subject: q.label, value: q.p95, threshold: t.p95WarnMs });
    const rate = q.count ? q.errors / q.count : 0;
    if (q.count >= t.minSamples && rate >= t.errorRateWarn) alerts.push({ level: 'warn', code: 'QUERY_ERRORS', subject: q.label, value: Math.round(rate * 1000) / 1000, threshold: t.errorRateWarn });
  }
  return alerts;
}

export const uptimeSeconds = (now: number = Date.now()) => Math.round((now - (g.__kkisiMobileStarted ?? now)) / 1000);
/** Tests only. */
export const resetMetrics = () => series.clear();
