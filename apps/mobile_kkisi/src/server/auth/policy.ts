import { createHash, timingSafeEqual } from 'node:crypto';
import { canonicalNik } from '@koperasi/domain/kosipa';
import type { IdentityQuery } from './types.ts';

// Member session policy. Shorter than the staff console (2 h idle) because the app shows personal financial data on a phone.
export const MEMBER_IDLE_MS = 30 * 60 * 1000;
export const MEMBER_ABSOLUTE_MS = 12 * 60 * 60 * 1000;
export const PIN_STAGE_MS = 5 * 60 * 1000;          // a password login must be confirmed with the PIN within 5 minutes
export const TOUCH_INTERVAL_MS = 60 * 1000;          // write last_seen at most once a minute
export const MAX_PIN_FAILURES = 5;                   // then the session is revoked and the member logs in again
/** Legacy smartkkisi PINs are 4 digits (all 1,189 accounts on the 30 Sep 2026 copy). The mockup's 6 dots are a documented deviation. */
export const PIN_LENGTH = 4;

// Login throttle (same windows as the console: packages/domain/src/auth/throttle-policy.ts).
export const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
export const THROTTLE_LOCK_MS = 15 * 60 * 1000;
export const THROTTLE_LIMITS = { identity: 8, ip: 30 } as const;

export type LoginInput = { identity: string; password: string };
export type LoginInputError = 'IDENTITY_REQUIRED' | 'PASSWORD_REQUIRED' | 'IDENTITY_INVALID' | 'TOO_LONG';

/** Validates the raw JSON body of a login request. Never trims the password. */
export function parseLoginInput(body: unknown): { ok: true; value: LoginInput } | { ok: false; error: LoginInputError } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const identity = typeof b.identity === 'string' ? b.identity.trim() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  if (!identity) return { ok: false, error: 'IDENTITY_REQUIRED' };
  if (!password) return { ok: false, error: 'PASSWORD_REQUIRED' };
  if (identity.length > 80 || password.length > 200) return { ok: false, error: 'TOO_LONG' };
  return classifyIdentity(identity) ? { ok: true, value: { identity, password } } : { ok: false, error: 'IDENTITY_INVALID' };
}

/**
 * "NIK anggota / email / telepon" (mockup field). Email: contains '@'. Phone: 9-15 digits starting with 0, 62 or +62 (tried in
 * the three stored spellings). Everything else that is 1-20 letters/digits is a NIK, matched with the KOSIPA key rule (leading
 * zeros of numeric NIKs are not significant; packages/domain/src/kosipa/nik.ts).
 */
export function classifyIdentity(raw: string): IdentityQuery | null {
  const value = raw.trim();
  if (value.includes('@')) {
    const email = value.toLowerCase();
    return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email) ? { kind: 'email', keys: [email], canonical: email } : null;
  }
  const compact = value.replace(/[\s-]/g, '');
  if (/^\+?\d{9,15}$/.test(compact) && /^(0|62|\+62)/.test(compact)) {
    const national = compact.replace(/^\+?62/, '0');
    const intl = `62${national.slice(1)}`;
    return { kind: 'phone', keys: [...new Set([compact, national, intl, `+${intl}`])], canonical: national };
  }
  try {
    const canonical = canonicalNik(value);
    return { kind: 'nik', keys: [...new Set([value, canonical])], canonical };
  } catch { return null; }
}

export const isWellFormedPin = (pin: unknown): pin is string => typeof pin === 'string' && /^\d{4,6}$/.test(pin);

/** Constant-time comparison of the entered PIN with a legacy plain stored PIN (digests make the lengths equal). */
export function plainPinMatches(entered: string, stored: string): boolean {
  const a = createHash('sha256').update(entered, 'utf8').digest();
  const b = createHash('sha256').update(stored.trim(), 'utf8').digest();
  return timingSafeEqual(a, b) && entered.length === stored.trim().length;
}

export const isBcryptHash = (value: string): boolean => /^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/.test(value);

export { safeNextPath } from '../../lib/navigation/safe-next.ts';
