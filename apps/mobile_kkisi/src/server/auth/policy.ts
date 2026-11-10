import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { canonicalNik, sameMember } from '@koperasi/domain/kosipa';
import type { Secret } from '../../lib/config/env.ts';
import type { IdentityQuery, MemberRow, PasswordVerifier } from './types.ts';

// Member session policy. Shorter than the staff console (2 h idle) because the app shows personal financial data on a phone.
export const MEMBER_IDLE_MS = 30 * 60 * 1000;
export const MEMBER_ABSOLUTE_MS = 12 * 60 * 60 * 1000;
export const PIN_STAGE_MS = 5 * 60 * 1000;          // a password login must be confirmed with the PIN within 5 minutes
export const TOUCH_INTERVAL_MS = 60 * 1000;          // write last_seen at most once a minute
export const MAX_PIN_FAILURES = 5;                   // then the session is revoked and the member logs in again
/** Legacy smartkkisi PINs are 4 digits (all 1,189 accounts on the 30 Sep 2026 copy). The mockup's 6 dots are a documented deviation. */
export const PIN_LENGTH = 4;

// Login throttle (same windows as the console: packages/domain/src/auth/throttle-policy.ts).
// `pin: 10` locks the account for 15 minutes after two 5-attempt PIN session lockouts, while sub-threshold failures carry over across sessions.
export const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
export const THROTTLE_LOCK_MS = 15 * 60 * 1000;
export const THROTTLE_LIMITS = { identity: 8, ip: 30, pin: 10 } as const;

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

const SCRYPT_RE = /^\$scrypt(-p)?\$(?:kid=([a-z0-9]{1,16}),)?n=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9+/_-]+={0,2})\$([A-Za-z0-9+/_-]+={0,2})$/;
export const isScryptPinHash = (value: string): boolean => SCRYPT_RE.test(value.trim());

function deriveScrypt(input: Buffer | string, salt: Buffer, N: number, r: number, p: number, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(input, salt, keylen, { N, r, p, maxmem: 64 * 1024 * 1024 }, (err, derived) => (err ? reject(err) : resolve(derived)));
  });
}

function pepperInput(pin: string, pepper: Secret): Buffer {
  return createHmac('sha256', pepper.key).update(`pin:v1:${pin}`, 'utf8').digest();
}

/**
 * Hashes a 4–6 digit PIN using memory-hard scrypt (N=16384, r=8, p=1, 32-byte output) and an optional server-side HMAC pepper.
 * Because 4-digit PINs have only 10,000 combinations, the server-side pepper prevents offline brute-force if the DB is leaked.
 */
export async function hashPin(pin: string, pepper?: Secret): Promise<string> {
  if (!isWellFormedPin(pin)) throw new Error('PIN_MALFORMED');
  const salt = randomBytes(16);
  const N = 16384, r = 8, p = 1;
  const input = pepper ? pepperInput(pin, pepper) : Buffer.from(pin, 'utf8');
  const derived = await deriveScrypt(input, salt, N, r, p, 32);
  const prefix = pepper ? `$scrypt-p$kid=${pepper.kid},` : '$scrypt$';
  return `${prefix}n=${N},r=${r},p=${p}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export type PinVerifyOutcome = {
  ok: boolean;
  scheme: 'scrypt-p' | 'scrypt' | 'bcrypt' | 'plain' | 'invalid';
  needsUpgrade: boolean;
};

/**
 * Multi-format constant-time PIN verifier (WS-01 §3.2):
 * 1. `$scrypt-p$...` (peppered scrypt shadow/migrated hash)
 * 2. `$scrypt$...` (standard scrypt hash)
 * 3. `$2a$` / `$2b$` / `$2y$` (bcrypt hash via worker pool)
 * 4. Legacy 4–6 digit plaintext PIN (constant-time SHA-256 digest compare, marked `needsUpgrade: true`)
 */
export async function verifyStoredPin(
  entered: string,
  storedRaw: string,
  opts: { verifier: PasswordVerifier; peppers?: readonly Secret[] },
): Promise<PinVerifyOutcome> {
  const stored = storedRaw.trim();
  const m = SCRYPT_RE.exec(stored);
  if (m) {
    const peppered = m[1] === '-p';
    const kid = m[2] ?? null;
    const N = Number(m[3]), r = Number(m[4]), p = Number(m[5]);
    const salt = Buffer.from(m[6], /[-_]/.test(m[6]) ? 'base64url' : 'base64');
    const expected = Buffer.from(m[7], /[-_]/.test(m[7]) ? 'base64url' : 'base64');
    if (salt.length < 8 || expected.length < 16 || N < 1024 || N > 65536 || (N & (N - 1)) !== 0 || r < 1 || r > 32 || p < 1 || p > 16) {
      plainPinMatches(entered, '0000');
      return { ok: false, scheme: 'invalid', needsUpgrade: false };
    }
    if (!peppered) {
      const actual = await deriveScrypt(Buffer.from(entered, 'utf8'), salt, N, r, p, expected.length);
      const ok = timingSafeEqual(actual, expected);
      return { ok, scheme: 'scrypt', needsUpgrade: Boolean(opts.peppers?.length) };
    }
    const peppers = opts.peppers ?? [];
    if (peppers.length === 0) {
      plainPinMatches(entered, '0000');
      return { ok: false, scheme: 'invalid', needsUpgrade: false };
    }
    const candidates = kid ? peppers.filter((x) => x.kid === kid) : peppers;
    const list = candidates.length > 0 ? candidates : [peppers[0]];
    let matched = false;
    let activeMatch = false;
    for (const pep of list) {
      const actual = await deriveScrypt(pepperInput(entered, pep), salt, N, r, p, expected.length);
      if (timingSafeEqual(actual, expected)) {
        matched = true;
        if (pep.kid === peppers[0].kid) activeMatch = true;
      }
    }
    return { ok: matched, scheme: 'scrypt-p', needsUpgrade: matched && !activeMatch };
  }
  if (isBcryptHash(stored)) {
    const ok = await opts.verifier.verify(entered, stored);
    return { ok, scheme: 'bcrypt', needsUpgrade: ok && Boolean(opts.peppers?.length) };
  }
  if (isWellFormedPin(stored)) {
    const ok = plainPinMatches(entered, stored);
    return { ok, scheme: 'plain', needsUpgrade: ok };
  }
  plainPinMatches(entered, '0000');
  return { ok: false, scheme: 'invalid', needsUpgrade: false };
}

export type MemberIdentityResolution =
  | { ok: true; member: MemberRow }
  | { ok: false; reason: 'no_member_record' | 'ambiguous_member' | 'member_inactive' };

const EXITED_MEMBER_STATUSES = new Set(['RESIGN', 'PENSIUN']);

/**
 * Fail-closed member identity resolution (`users.nik` -> `m_anggota.nik_kar`, WS-01 §3.4):
 * - Rejects placeholder `'0'` or non-matching NIKs.
 * - If multiple `AKTIVE` rows share the same canonical NIK (3 such pairs exist on the 30 Sep copy), fails closed (`ambiguous_member`).
 * - If one `AKTIVE` row exists and any other row is historical exited (`RESIGN`/`PENSIUN`), selects the unique `AKTIVE` row; if another row has an unrecognised/corrupted status, fails closed.
 * - If no `AKTIVE` row exists: fails closed on multiple rows (`ambiguous_member`), exited single row (`member_inactive`), or corrupted status (`no_member_record`).
 */
export function resolveMemberIdentity(rows: readonly MemberRow[], expectedNik: string): MemberIdentityResolution {
  let canonical: string;
  try {
    canonical = canonicalNik(expectedNik);
  } catch {
    return { ok: false, reason: 'no_member_record' };
  }
  if (!canonical || canonical === '0') return { ok: false, reason: 'no_member_record' };
  const matching = rows.filter((r) => sameMember(r.nik, canonical));
  if (matching.length === 0) return { ok: false, reason: 'no_member_record' };
  const active = matching.filter((r) => (r.status ?? '').trim().toUpperCase() === 'AKTIVE');
  if (active.length > 1) return { ok: false, reason: 'ambiguous_member' };
  if (active.length === 1) {
    const others = matching.filter((r) => r !== active[0]);
    if (others.some((r) => !EXITED_MEMBER_STATUSES.has((r.status ?? '').trim().toUpperCase()))) {
      return { ok: false, reason: 'ambiguous_member' };
    }
    return { ok: true, member: active[0] };
  }
  if (matching.length > 1) return { ok: false, reason: 'ambiguous_member' };
  const singleStatus = (matching[0].status ?? '').trim().toUpperCase();
  if (EXITED_MEMBER_STATUSES.has(singleStatus)) return { ok: false, reason: 'member_inactive' };
  return { ok: false, reason: 'no_member_record' };
}

export { safeNextPath } from '../../lib/navigation/safe-next.ts';
