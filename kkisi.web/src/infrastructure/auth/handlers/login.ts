import { login } from '../../../application/auth/login.usecase.ts';
import { AuthError } from '../../../domain/auth/errors.ts';
import { clearedCookie, sessionCookie } from '../cookies.ts';
import { trustedClientIp } from '../client-ip.ts';
import { checkOrigin, isJsonRequest } from '../origin.ts';
import { errorResponse, json, readJson, type AuthServices } from '../http.ts';

/** POST /api/auth/login. Every credential failure is the same 401; throttling is a generic 429; outages are 503. */
export async function handleLogin(services: AuthServices, request: Request): Promise<Response> {
  try {
    if (!checkOrigin(request, services.config) || !isJsonRequest(request)) throw new AuthError('CSRF');
    const body = await readJson(request, 1024) as { username?: unknown; password?: unknown } | null;
    if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') throw new AuthError('BAD_REQUEST');
    const username = body.username.trim();
    if (username.length < 1 || username.length > 100 || body.password.length < 1 || body.password.length > 128) throw new AuthError('BAD_REQUEST');

    const ip = trustedClientIp(request.headers.get('x-forwarded-for'), services.config.trustedProxyHops);
    const result = await login(services.deps, { username, password: body.password, ip });
    if (result.status === 'throttled') throw new AuthError('THROTTLED', result.retryAfterSec);
    if (result.status === 'invalid') return json(401, { error: 'INVALID_CREDENTIALS' }, { 'Set-Cookie': clearedCookie(services.config) });
    return json(200, {
      user: { id: result.user.id, name: result.user.name, roleId: result.user.roleId },
      companyId: result.companyId,
      csrfToken: services.keys.csrfToken(result.sidHash),
    }, { 'Set-Cookie': sessionCookie(services.config, result.sid) });
  } catch (error) {
    return errorResponse(services, error);
  }
}
