// Request checks for state-changing endpoints (login, PIN, logout). Together with the SameSite=Lax HttpOnly cookie they form the
// CSRF defence: the Origin (or Referer origin) must equal APP_ORIGIN, a browser-declared cross-site request is refused, and the
// body must be JSON, which a plain cross-site HTML form cannot send without a CORS preflight (no CORS is ever granted).

export function sameOrigin(headers: Headers, appOrigin: string): boolean {
  if (headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = headers.get('origin');
  if (origin !== null) return origin === appOrigin;
  const referer = headers.get('referer');
  if (!referer) return false;
  try { return new URL(referer).origin === appOrigin; } catch { return false; }
}

export const isJson = (headers: Headers): boolean => /^application\/json\s*(;|$)/i.test(headers.get('content-type') ?? '');

/** Client address only when a known number of proxies sits in front (X-Forwarded-For counted from the right). */
export function clientIp(headers: Headers, trustedHops: number): string | null {
  if (trustedHops <= 0) return null;
  const parts = (headers.get('x-forwarded-for') ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  const ip = parts[parts.length - trustedHops];
  return ip && /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : null;
}

/** HttpOnly session cookie; no Domain attribute (host-only, never shared with other kkisitb2.id subdomains); __Host- over HTTPS. */
export function sessionCookie(name: string, secure: boolean, value: string): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}
export function clearedCookie(name: string, secure: boolean): string {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure ? '; Secure' : ''}`;
}

/**
 * True only for a caller on the host or container network (Docker HEALTHCHECK, an operator's curl on the loopback port), never
 * for a public request. nginx OVERWRITES X-Forwarded-For with the public client address; for a direct request Next itself fills
 * the header with the socket address (base-server: `x-forwarded-for ??= socket.remoteAddress`), which is loopback, or the Docker
 * gateway when the operator curls the published port. Without a proxy (development, synthetic stack) every caller is internal.
 */
export function isInternalCaller(headers: Headers, trustedHops: number): boolean {
  if (trustedHops <= 0) return true;
  const ip = clientIp(headers, trustedHops)?.toLowerCase().replace(/^::ffff:/, '') ?? null;
  if (!ip) return false;
  if (ip === '::1' || /^127\./.test(ip) || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^f[cd][0-9a-f]{2}:/.test(ip)) return true;
  const m = /^172\.(\d{1,3})\./.exec(ip);
  return Boolean(m && Number(m[1]) >= 16 && Number(m[1]) <= 31);
}
