import { logout } from '../../../application/auth/logout.usecase.ts';
import { AuthError } from '../../../domain/auth/errors.ts';
import { isSessionValid, isWellFormedSid, sidToHash } from '../../../domain/auth/session.ts';
import { clearedCookie, readCookie } from '../cookies.ts';
import { checkOrigin, isJsonRequest } from '../origin.ts';
import { errorResponse, json, type AuthServices } from '../http.ts';

/**
 * POST /api/auth/logout. A live session needs the CSRF token (so a third party cannot log a user out); a request
 * without a live session just clears the cookie. Revocation is persistent: the session id is dead after a restart too.
 */
export async function handleLogout(services: AuthServices, request: Request): Promise<Response> {
  try {
    if (!checkOrigin(request, services.config) || !isJsonRequest(request)) throw new AuthError('CSRF');
    const sid = readCookie(request.headers.get('cookie'), services.config.cookieName);
    if (isWellFormedSid(sid)) {
      const hash = sidToHash(sid);
      const session = await services.deps.sessions.find(hash);
      if (session && isSessionValid(session, services.deps.clock.now())) {
        if (!services.keys.verifyCsrf(request.headers.get('x-csrf-token'), hash)) throw new AuthError('CSRF');
        await logout(services.deps, sid);
        services.deps.log('logout', { user: session.userId });
      }
    }
    return json(200, { ok: true }, { 'Set-Cookie': clearedCookie(services.config) });
  } catch (error) {
    return errorResponse(services, error);
  }
}
