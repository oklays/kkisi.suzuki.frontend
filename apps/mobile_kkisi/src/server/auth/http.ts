import { randomUUID } from 'node:crypto';
import { ConfigError } from '../../lib/config/env.ts';
import { requestContext } from '../observability/metrics.ts';
import { clearedCookie, isJson, sameOrigin, sessionCookie } from '../../lib/security/request.ts';
import { authDeps } from '../container.ts';
import { StoreUnavailableError } from '../db/mysql.ts';
import { VerifierBusyError } from './password-verifier.ts';

const NO_STORE = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' };

export function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...NO_STORE, ...extra } });
}

export const readCookie = (request: Request, name: string): string | null => {
  const header = request.headers.get('cookie');
  if (!header || header.length > 4096) return null;
  for (const part of header.split(';')) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim(); }
  return null;
};

/** Shared envelope of the auth endpoints: configuration, CSRF/JSON checks, and code-only error mapping. */
export async function authEndpoint(request: Request, handle: (ctx: { deps: ReturnType<typeof authDeps>; body: unknown; sid: string | null }) => Promise<Response>): Promise<Response> {
  let deps: ReturnType<typeof authDeps>;
  try { deps = authDeps(); } catch (e) { if (e instanceof ConfigError) return json(503, { error: 'NOT_CONFIGURED' }); throw e; }
  if (!sameOrigin(request.headers, deps.settings.origin)) return json(403, { error: 'CSRF' });
  if (!isJson(request.headers)) return json(415, { error: 'BAD_REQUEST' });
  let body: unknown;
  try { body = JSON.parse((await request.text()).slice(0, 4096)); } catch { return json(400, { error: 'BAD_REQUEST' }); }
  try {
    // Every log line and slow-query record of this request carries its id (X-Request-Id, set by the proxy from nginx).
    const requestId = request.headers.get('x-request-id') ?? randomUUID();
    return await requestContext.run({ requestId }, () => handle({ deps, body, sid: readCookie(request, deps.settings.cookieName) }));
  } catch (e) {
    if (e instanceof VerifierBusyError) return json(503, { error: 'BUSY' }, { 'Retry-After': '5' });
    if (e instanceof StoreUnavailableError || (e instanceof Error && e.message === 'SESSION_GONE')) return json(503, { error: 'UNAVAILABLE' });
    deps.log('auth.endpoint.error');
    return json(500, { error: 'UNAVAILABLE' });
  }
}

export const setSession = (deps: ReturnType<typeof authDeps>, sid: string) => sessionCookie(deps.settings.cookieName, deps.settings.secure, sid);
export const clearSession = (deps: ReturnType<typeof authDeps>) => clearedCookie(deps.settings.cookieName, deps.settings.secure);
