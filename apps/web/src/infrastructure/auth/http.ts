import { AuthError, StoreUnavailableError, VerifierBusyError } from '@koperasi/domain/auth/errors';
import type { AuthDeps } from '@koperasi/application/auth/ports';
import { validateSession, requirePermission, type AuthContext } from '@koperasi/application/auth/validate-session';
import type { AuthConfig } from './config.ts';
import { readCookie } from './cookies.ts';
import type { AuthKeys } from './keys.ts';
import { checkOrigin, isJsonRequest } from './origin.ts';

export type AuthServices = { deps: AuthDeps; config: AuthConfig; keys: AuthKeys };

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  // No CORS headers are ever set; every auth/POS response is uncacheable.
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
}

/** One place that turns failures into safe, code-only responses. Unknown errors never leak details. */
export function errorResponse(services: Pick<AuthServices, 'deps'>, error: unknown): Response {
  if (error instanceof AuthError) {
    switch (error.code) {
      case 'UNAUTHENTICATED': return json(401, { error: 'UNAUTHENTICATED' });
      case 'FORBIDDEN': return json(403, { error: 'FORBIDDEN' });
      case 'CSRF': return json(403, { error: 'CSRF' });
      case 'BAD_REQUEST': return json(400, { error: 'BAD_REQUEST' });
      case 'THROTTLED': return json(429, { error: 'TOO_MANY_ATTEMPTS' }, { 'Retry-After': String(error.retryAfterSec ?? 60) });
      case 'NOT_CONFIGURED': return json(503, { error: 'AUTH_UNAVAILABLE' });
      default: return json(503, { error: 'AUTH_UNAVAILABLE' });
    }
  }
  if (error instanceof StoreUnavailableError) return json(503, { error: 'AUTH_UNAVAILABLE' }, { 'Retry-After': '5' });
  if (error instanceof VerifierBusyError) return json(503, { error: 'AUTH_BUSY' }, { 'Retry-After': '2' });
  services.deps.log('unexpected_error', { name: error instanceof Error ? error.name.slice(0, 40).replace(/[^A-Za-z0-9_]/g, '_') : 'unknown' });
  return json(500, { error: 'INTERNAL' });
}

export type Guarded = { ok: true; ctx: AuthContext; sid: string } | { ok: false; response: Response };

/**
 * Every protected API route goes through this. Order: origin/content-type (state-changing only, before any DB work),
 * session validation from both databases, CSRF token, then permission. Any error is fail-closed.
 */
export async function guard(services: AuthServices, request: Request, options: { permission?: string; csrf?: boolean } = {}): Promise<Guarded> {
  try {
    if (options.csrf) {
      if (!checkOrigin(request, services.config) || !isJsonRequest(request)) throw new AuthError('CSRF');
    }
    const sid = readCookie(request.headers.get('cookie'), services.config.cookieName);
    const ctx = await validateSession(services.deps, sid);
    if (options.csrf && !services.keys.verifyCsrf(request.headers.get('x-csrf-token'), ctx.sidHash)) throw new AuthError('CSRF');
    if (options.permission) await requirePermission(ctx, options.permission);
    return { ok: true, ctx, sid: sid as string };
  } catch (error) {
    return { ok: false, response: errorResponse(services, error) };
  }
}

/** Reads a small JSON body (<= maxBytes). Returns null on anything malformed. */
export async function readJson(request: Request, maxBytes: number): Promise<unknown | null> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const text = await request.text();
  if (text.length > maxBytes) return null;
  try { return JSON.parse(text); } catch { return null; }
}
