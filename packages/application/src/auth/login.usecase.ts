import { StoreUnavailableError, VerifierBusyError } from '@koperasi/domain/auth/errors';
import { DUMMY_HASH, isBcryptHash, passwordCandidates, unsupportedPasswordClass } from '@koperasi/domain/auth/password';
import { newDeadlines, PURGE_LIMIT } from '@koperasi/domain/auth/session-policy';
import { LIMITS, LOCK_MS, THROTTLE_PURGE_LIMIT, THROTTLE_PURGE_MS, WINDOW_MS, isActiveLock, retryAfterSeconds } from '@koperasi/domain/auth/throttle-policy';
import type { AuthDeps, UserRecord } from '@koperasi/application/auth/ports';

export type LoginInput = { username: string; password: string; ip: string | null };
export type LoginResult =
  | { status: 'ok'; sid: string; sidHash: Buffer; user: { id: number; name: string; roleId: number }; companyId: number }
  | { status: 'invalid' }
  | { status: 'throttled'; retryAfterSec: number };

export function normalizeUsername(username: string): string { return username.trim().toLowerCase(); }

/** A user may log in only if active, with an active role (S2 decision 4) and an active branch. */
function usable(user: UserRecord | null): user is UserRecord {
  return !!user && user.status === 1 && user.roleStatus === 1 && user.companyStatus === 1 && isBcryptHash(user.passwordHash);
}

async function bestEffort(deps: AuthDeps, name: string, fn: () => Promise<unknown>): Promise<void> {
  try { await fn(); } catch { deps.log('housekeeping_failed', { task: name }); }
}

/**
 * Generic failure for everything wrong with the credentials. Store/verifier outages propagate as
 * StoreUnavailableError / VerifierBusyError so the caller answers 503 (fail closed), never 401 and never "allowed".
 */
export async function login(deps: AuthDeps, input: LoginInput): Promise<LoginResult> {
  const now = deps.clock.now();
  const username = normalizeUsername(input.username);
  const keys = deps.throttleKeys(username, input.ip);

  const locks = await deps.throttle.activeLocks(keys, now);
  const active = locks.filter((l) => isActiveLock(l.lockedUntil, now));
  if (active.length > 0) {
    const until = active.reduce((a, b) => (a.lockedUntil > b.lockedUntil ? a : b)).lockedUntil;
    deps.log('login_failed', { reason: 'throttled' });
    return { status: 'throttled', retryAfterSec: retryAfterSeconds(until, now) };
  }

  const user = await deps.users.findByUsername(username);
  const good = usable(user);
  const hash = good ? user.passwordHash : DUMMY_HASH;   // spend the same CPU whether or not the account is usable

  let matched = false;
  for (const candidate of passwordCandidates(input.password)) {
    if (await deps.verifier.verify(candidate, hash)) { matched = true; break; }
  }

  if (!good || !matched) {
    const reason = !user ? 'bad_credentials'
      : user.status !== 1 ? 'bad_credentials'
      : user.roleStatus !== 1 ? 'role_inactive'
      : user.companyStatus !== 1 ? 'company_inactive'
      : !isBcryptHash(user.passwordHash) ? 'unsupported_hash'
      : unsupportedPasswordClass(input.password) ? 'unsupported_password_class' : 'bad_credentials';
    for (const key of keys) {
      await deps.throttle.recordFailure({ key, limit: LIMITS[key.kind], now, windowMs: WINDOW_MS, lockMs: LOCK_MS, purgeAfter: new Date(now.getTime() + THROTTLE_PURGE_MS) });
    }
    deps.log('login_failed', { reason });
    return { status: 'invalid' };
  }

  const sid = deps.random.bytes(32).toString('base64url');   // 256-bit opaque id: a fresh one per login (no fixation)
  const sidHash = deps.identity.sidToHash(sid);
  await deps.sessions.create({
    sidHash, userId: user.id, companyId: user.companyId, pwf: deps.identity.passwordFingerprint(user.passwordHash), now, ...newDeadlines(now),
  });
  await bestEffort(deps, 'throttle_clear', () => deps.throttle.clear(keys.filter((k) => k.kind !== 'ip')));
  await bestEffort(deps, 'session_purge', () => deps.sessions.purge(now, PURGE_LIMIT));
  await bestEffort(deps, 'throttle_purge', () => deps.throttle.purge(now, THROTTLE_PURGE_LIMIT));
  deps.log('login_ok', { user: user.id, cid: user.companyId });
  return { status: 'ok', sid, sidHash, user: { id: user.id, name: user.fullName, roleId: user.roleId }, companyId: user.companyId };
}

export { StoreUnavailableError, VerifierBusyError };
