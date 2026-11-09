import { nikLookupKeys } from '@koperasi/domain/kosipa';
import type { Secret } from '../../lib/config/env.ts';
import { isWellFormedSid, newSessionId, sessionHashes, throttleKey } from './crypto.ts';
import {
  classifyIdentity, isBcryptHash, isWellFormedPin, MAX_PIN_FAILURES, MEMBER_ABSOLUTE_MS, MEMBER_IDLE_MS, PIN_STAGE_MS, plainPinMatches,
  THROTTLE_LIMITS, THROTTLE_LOCK_MS, THROTTLE_WINDOW_MS, TOUCH_INTERVAL_MS, type LoginInput,
} from './policy.ts';
import type { AccountRow, AuthLogger, MemberIdentityReader, MemberRow, MemberSessionStore, PasswordVerifier, SessionRow } from './types.ts';

export type AuthDeps = {
  identity: MemberIdentityReader;
  store: MemberSessionStore;
  verifier: PasswordVerifier;
  secrets: readonly Secret[];
  now: () => Date;
  log: AuthLogger;
};

export type LoginResult =
  | { ok: true; sid: string }
  | { ok: false; code: 'INVALID_CREDENTIALS' | 'ACCOUNT_INACTIVE' | 'NOT_A_MEMBER' }
  | { ok: false; code: 'THROTTLED'; retryAfterSec: number };

export type PinResult =
  | { ok: true; sid: string }
  | { ok: false; code: 'PIN_INVALID'; remaining: number }
  | { ok: false; code: 'PIN_LOCKED' | 'SESSION_EXPIRED' | 'PIN_NOT_SET' | 'PIN_MALFORMED' };

export type ActiveSession = { userId: number; memberId: number; nik: string; nikKeys: string[]; idHash: string };

// A real bcrypt hash of a random value: verifying against it when no account matches keeps the response time equal.
const DUMMY_HASH = '$2b$10$ggvppgIAoSU/umSIiLsYA.Fc4Uo4zh.BB4hO6Y7Vk2CvlBoJGXRGa';

function deadlines(now: Date, stage: 'pin' | 'active') {
  const t = now.getTime();
  return stage === 'pin'
    ? { idleExpiresAt: new Date(t + PIN_STAGE_MS), absExpiresAt: new Date(t + PIN_STAGE_MS) }
    : { idleExpiresAt: new Date(t + MEMBER_IDLE_MS), absExpiresAt: new Date(t + MEMBER_ABSOLUTE_MS) };
}

const valid = (s: SessionRow, now: Date) => s.revokedAt === null && now < s.idleExpiresAt && now < s.absExpiresAt;

/** Picks the KOSIPA member row for an account: prefer AKTIVE when legacy holds duplicates for one NIK. */
function pickMember(rows: MemberRow[]): MemberRow | null {
  if (rows.length === 0) return null;
  return rows.find((r) => r.status === 'AKTIVE') ?? rows[0];
}

async function throttleCheck(d: AuthDeps, keys: { hash: string; limit: number }[], now: Date): Promise<number> {
  let retry = 0;
  for (const k of keys) {
    const s = await d.store.throttleGet(k.hash);
    if (s?.lockedUntil && s.lockedUntil > now && s.lockedUntil.getTime() <= now.getTime() + THROTTLE_LOCK_MS + 60_000) {
      retry = Math.max(retry, Math.ceil((s.lockedUntil.getTime() - now.getTime()) / 1000));
    }
  }
  return retry;
}

async function throttleFail(d: AuthDeps, keys: { hash: string; limit: number }[], now: Date): Promise<void> {
  for (const k of keys) {
    const s = await d.store.throttleGet(k.hash);
    const fresh = !s || now.getTime() - s.windowStart.getTime() > THROTTLE_WINDOW_MS;
    const failures = fresh ? 1 : s.failures + 1;
    await d.store.throttleSet(k.hash, { failures, windowStart: fresh ? now : s.windowStart, lockedUntil: failures >= k.limit ? new Date(now.getTime() + THROTTLE_LOCK_MS) : null });
  }
}

export async function login(d: AuthDeps, input: LoginInput, clientIp: string | null): Promise<LoginResult> {
  const now = d.now();
  const query = classifyIdentity(input.identity);
  const active = d.secrets[0];
  const keys: { hash: string; limit: number }[] = [{ hash: throttleKey('identity', query ? `${query.kind}:${query.canonical}` : input.identity, active), limit: THROTTLE_LIMITS.identity }];
  if (clientIp) keys.push({ hash: throttleKey('ip', clientIp, active), limit: THROTTLE_LIMITS.ip });
  const retry = await throttleCheck(d, keys, now);
  if (retry > 0) { d.log('auth.login.throttled', { kind: query?.kind ?? null }); return { ok: false, code: 'THROTTLED', retryAfterSec: retry }; }

  const accounts: AccountRow[] = query ? await d.identity.findAccounts(query, 3) : [];
  // Exactly one account may match. A shared phone number (legacy uniqueness is only ktp+phone) is refused, never guessed.
  const account = accounts.length === 1 ? accounts[0] : null;
  const passwordOk = await d.verifier.verify(input.password, account && isBcryptHash(account.passwordHash) ? account.passwordHash : DUMMY_HASH);
  if (!account || !passwordOk || !isBcryptHash(account.passwordHash)) {
    await throttleFail(d, keys, now);
    d.log('auth.login.failed', { kind: query?.kind ?? null, reason: accounts.length > 1 ? 'ambiguous_identity' : !account ? 'no_account' : 'password' });
    return { ok: false, code: 'INVALID_CREDENTIALS' };
  }
  // The password was right: from here on it is safe to say why access is refused.
  if (!account.active || account.deleted) { d.log('auth.login.refused', { reason: 'account_inactive' }); return { ok: false, code: 'ACCOUNT_INACTIVE' }; }
  let nikKeys: string[];
  try { nikKeys = nikLookupKeys(account.nik); } catch { d.log('auth.login.refused', { reason: 'nik_unusable' }); return { ok: false, code: 'NOT_A_MEMBER' }; }
  const member = pickMember(await d.identity.memberByNik(nikKeys));
  if (!member) { d.log('auth.login.refused', { reason: 'no_member_record' }); return { ok: false, code: 'NOT_A_MEMBER' }; }

  for (const k of keys.slice(0, 1)) await d.store.throttleClear(k.hash);
  const sid = newSessionId();
  const [{ kid, hash }] = sessionHashes(sid, d.secrets);
  await d.store.insert({ idHash: hash, kid, userId: account.userId, memberId: member.memberId, nik: member.nik, stage: 'pin', pinFailures: 0, createdAt: now, lastSeenAt: now, ...deadlines(now, 'pin'), revokedAt: null, revokeReason: null });
  d.log('auth.login.password_ok', { stage: 'pin' });
  return { ok: true, sid };
}

async function findSession(d: AuthDeps, sid: string | null | undefined): Promise<SessionRow | null> {
  if (!isWellFormedSid(sid)) return null;
  return d.store.find(sessionHashes(sid, d.secrets).map((h) => h.hash));
}

export async function verifyPin(d: AuthDeps, sid: string | null | undefined, pin: unknown): Promise<PinResult> {
  const now = d.now();
  const session = await findSession(d, sid);
  if (!session || session.stage !== 'pin' || !valid(session, now)) return { ok: false, code: 'SESSION_EXPIRED' };
  if (!isWellFormedPin(pin)) return { ok: false, code: 'PIN_MALFORMED' };
  const stored = await d.identity.storedPin(session.userId);
  if (!stored || !stored.trim()) { d.log('auth.pin.not_set'); return { ok: false, code: 'PIN_NOT_SET' }; }
  const ok = isBcryptHash(stored) ? await d.verifier.verify(pin, stored) : plainPinMatches(pin, stored);
  if (!ok) {
    const failures = session.pinFailures + 1;
    if (failures >= MAX_PIN_FAILURES) {
      await d.store.update(session.idHash, { pinFailures: failures, revokedAt: now, revokeReason: 'pin_locked' });
      d.log('auth.pin.locked');
      return { ok: false, code: 'PIN_LOCKED' };
    }
    await d.store.update(session.idHash, { pinFailures: failures });
    d.log('auth.pin.failed', { failures });
    return { ok: false, code: 'PIN_INVALID', remaining: MAX_PIN_FAILURES - failures };
  }
  const state = await d.identity.accountState(session.userId);
  if (!state || !state.active || state.deleted) {
    await d.store.update(session.idHash, { revokedAt: now, revokeReason: 'account_disabled' });
    return { ok: false, code: 'SESSION_EXPIRED' };
  }
  // New id after the second factor: a session id seen before the PIN step can never become an authenticated one.
  const next = newSessionId();
  const [{ kid, hash }] = sessionHashes(next, d.secrets);
  await d.store.rotate(session.idHash, { ...session, idHash: hash, kid, stage: 'active', pinFailures: 0, createdAt: now, lastSeenAt: now, ...deadlines(now, 'active'), revokedAt: null, revokeReason: null });
  d.log('auth.pin.ok');
  return { ok: true, sid: next };
}

/** The PIN-stage session (for the /pin screen), or null. */
export async function pendingPinSession(d: AuthDeps, sid: string | null | undefined): Promise<SessionRow | null> {
  const s = await findSession(d, sid);
  return s && s.stage === 'pin' && valid(s, d.now()) ? s : null;
}

/** Authenticated member for a request: valid session AND a still-active account. Slides the idle deadline. */
export async function resolveMember(d: AuthDeps, sid: string | null | undefined): Promise<ActiveSession | null> {
  const now = d.now();
  const s = await findSession(d, sid);
  if (!s || s.stage !== 'active' || !valid(s, now)) return null;
  const state = await d.identity.accountState(s.userId);
  if (!state || !state.active || state.deleted) {
    await d.store.update(s.idHash, { revokedAt: now, revokeReason: 'account_disabled' });
    d.log('auth.session.revoked', { reason: 'account_disabled' });
    return null;
  }
  if (now.getTime() - s.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS) {
    const idle = new Date(Math.min(now.getTime() + MEMBER_IDLE_MS, s.absExpiresAt.getTime()));
    await d.store.update(s.idHash, { lastSeenAt: now, idleExpiresAt: idle });
  }
  let nikKeys: string[];
  try { nikKeys = nikLookupKeys(s.nik); } catch { return null; }
  return { userId: s.userId, memberId: s.memberId, nik: s.nik, nikKeys, idHash: s.idHash };
}

export async function logout(d: AuthDeps, sid: string | null | undefined): Promise<void> {
  const s = await findSession(d, sid);
  if (s && s.revokedAt === null) await d.store.update(s.idHash, { revokedAt: d.now(), revokeReason: 'logout' });
  d.log('auth.logout');
}
