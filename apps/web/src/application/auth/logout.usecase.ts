import { isSessionValid, isWellFormedSid, sidToHash } from '../../domain/auth/session.ts';
import type { AuthDeps } from './ports.ts';

/** Idempotent. Returns whether a live session was revoked. A store failure propagates (503): the user must retry. */
export async function logout(deps: AuthDeps, sid: string | null | undefined): Promise<boolean> {
  if (!isWellFormedSid(sid)) return false;
  const now = deps.clock.now();
  const hash = sidToHash(sid);
  const session = await deps.sessions.find(hash);
  if (!session || !isSessionValid(session, now)) return false;
  return deps.sessions.revoke(hash, 'logout', now);
}
