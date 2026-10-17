import { WindowThrottle } from '@koperasi/application/kosipa/report-export';
import type { ExportPolicy } from '@koperasi/application/console/capabilities';

/**
 * Deployment policy for report export (the risky action). Interim mechanism until the reviewed `console_action_policy` store exists
 * (design §2; decision register E1): an operator-owned feature flag plus an explicit allow-list of console user ids, neither of which the
 * web application can change. Anything malformed means "nobody may export" (fail closed). The allow-list never widens a view grant.
 */
type Env = Record<string, string | undefined>;
const MAX_IDS = 50;
export function exportEnabled(env: Env = process.env): boolean { return env.KOSIPA_EXPORT_ENABLED === 'true'; }
export function exportUserIds(env: Env = process.env): ReadonlySet<number> {
  const raw = env.KOSIPA_EXPORT_USER_IDS;
  if (!raw) return new Set();
  const parts = raw.split(',').map((p) => p.trim());
  if (parts.length === 0 || parts.length > MAX_IDS || !parts.every((p) => /^[1-9]\d{0,9}$/.test(p))) return new Set();   // one bad entry invalidates the list
  return new Set(parts.map(Number));
}
export function exportPolicyFromEnv(env: Env = process.env): ExportPolicy { return { enabled: exportEnabled(env), allowedUserIds: exportUserIds(env) }; }

/** 6 exports per user per 10 minutes, per process: bounds repetition and accidental loops. */
export const exportThrottle = new WindowThrottle(6, 10 * 60 * 1000);
