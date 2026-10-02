export const IDLE_MS = 2 * 60 * 60 * 1000;          // S2-1: idle timeout 2 hours
export const ABSOLUTE_MS = 12 * 60 * 60 * 1000;     // S2-1: absolute lifetime 12 hours
export const PURGE_GRACE_MS = 24 * 60 * 60 * 1000;  // rows are purgeable 24 h after the absolute expiry
export const TOUCH_INTERVAL_MS = 300 * 1000;        // write last_seen at most once per 300 s (legacy sess_time_to_update)
export const MAX_ACTIVE_SESSIONS = 5;               // valid sessions per user (6.13.10)
export const MAX_ROWS_PER_USER = 50;                // rows kept per user; only DEAD rows are ever trimmed
export const PURGE_LIMIT = 100;                     // best-effort purge batch per login

export type RevokeReason = 'logout' | 'forced' | 'user_disabled' | 'password_changed' | 'superseded';

export type SessionState = { revokedAt: Date | null; idleExpiresAt: Date; absExpiresAt: Date };

/** valid = not revoked and neither the idle nor the absolute deadline has passed. */
export function isSessionValid(session: SessionState, now: Date): boolean {
  return session.revokedAt === null && now < session.idleExpiresAt && now < session.absExpiresAt;
}

/** A session id is 32 random bytes, base64url (43 chars). Anything else is rejected before any lookup. */
export function isWellFormedSid(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function newDeadlines(now: Date): { idleExpiresAt: Date; absExpiresAt: Date; purgeAfter: Date } {
  const abs = new Date(now.getTime() + ABSOLUTE_MS);
  return {
    idleExpiresAt: new Date(now.getTime() + IDLE_MS),
    absExpiresAt: abs,
    purgeAfter: new Date(abs.getTime() + PURGE_GRACE_MS),
  };
}

/** The idle deadline slides with activity but never past the absolute one. */
export function slidIdleDeadline(now: Date): Date {
  return new Date(now.getTime() + IDLE_MS);
}
