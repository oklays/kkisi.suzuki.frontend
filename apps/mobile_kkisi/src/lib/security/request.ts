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
