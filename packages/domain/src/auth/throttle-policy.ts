export const WINDOW_MS = 15 * 60 * 1000;   // fixed window from the first failure
export const LOCK_MS = 15 * 60 * 1000;
export const LOCK_CLOCK_SLACK_MS = 60 * 1000;
export const THROTTLE_PURGE_MS = 2 * 60 * 60 * 1000;
export const THROTTLE_PURGE_LIMIT = 100;

export type ThrottleKind = 'user' | 'pair' | 'ip';
export const LIMITS: Record<ThrottleKind, number> = { user: 10, pair: 5, ip: 30 };


/** A lock counts only if it lies in the future and within LOCK_MS (+slack): a clock jump can never lock for years. */
export function isActiveLock(lockedUntil: Date | null, now: Date): boolean {
  if (!lockedUntil) return false;
  const t = lockedUntil.getTime();
  return t > now.getTime() && t <= now.getTime() + LOCK_MS + LOCK_CLOCK_SLACK_MS;
}

export function retryAfterSeconds(lockedUntil: Date, now: Date): number {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000));
}

/** Only the user key is trustworthy without a trusted reverse proxy; pair/ip need a real client address. */
export function activeKinds(ipTrusted: boolean): ThrottleKind[] {
  return ipTrusted ? ['user', 'pair', 'ip'] : ['user'];
}
