import { isSessionValid, isWellFormedSid } from '@koperasi/domain/auth/session-policy';
import type { AuthDeps } from '@koperasi/application/auth/ports';

/** Idempotent. Returns whether a live session was revoked. A store failure propagates (503): the user must retry. */
export async function logout(deps: AuthDeps, sid: string | null | undefined): Promise<boolean> {
  if (!isWellFormedSid(sid)) return false;
  const now = deps.clock.now();
  const hash = deps.identity.sidToHash(sid);
  const session = await deps.sessions.find(hash);
  if (!session || !isSessionValid(session, now)) return false;
  return deps.sessions.revoke(hash, 'logout', now);
}
