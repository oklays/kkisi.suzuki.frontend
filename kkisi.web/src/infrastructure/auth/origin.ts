import type { AuthConfig } from './config.ts';

/**
 * CSRF layers 3-4 for state-changing requests (SameSite=Lax cookie and the derived token are the other layers):
 * the Origin (or, failing that, the Referer's origin) must equal APP_ORIGIN exactly, a browser-declared cross-site
 * fetch is refused, and the body must be JSON (a plain HTML form cannot send that without a preflight).
 */
export function checkOrigin(request: Request, config: Pick<AuthConfig, 'appOrigin'>): boolean {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (origin !== null) return origin === config.appOrigin;
  const referer = request.headers.get('referer');
  if (referer) { try { return new URL(referer).origin === config.appOrigin; } catch { return false; } }
  return false;
}

export function isJsonRequest(request: Request): boolean {
  const type = request.headers.get('content-type');
  return !!type && /^application\/json\s*(;|$)/i.test(type);
}
