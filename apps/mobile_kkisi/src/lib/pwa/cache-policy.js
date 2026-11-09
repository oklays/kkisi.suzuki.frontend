// Service-worker cache policy. Plain, self-contained JavaScript on purpose: the /sw.js route embeds THIS function's source
// (Function.prototype.toString), and tests/unit/cache-policy.test.mjs imports the same function, so what is tested is what ships.
//
//   'static'   cache-first, versioned cache: content-hashed build assets and public brand files only
//   'navigate' network-only; on network failure the precached /offline.html (never a cached member page)
//   'network'  network-only, never stored: API calls, RSC payloads, images routes, everything personal
//   'bypass'   not handled by the worker at all (non-GET, other origins)

/**
 * @param {string} method
 * @param {string} url absolute request URL
 * @param {string} mode Request.mode
 * @param {string} origin the app origin (self.location.origin)
 * @param {boolean} isRsc request carries the RSC header or `_rsc` query
 * @returns {'static' | 'navigate' | 'network' | 'bypass'}
 */
export function classifyRequest(method, url, mode, origin, isRsc) {
  if (method !== 'GET') return 'bypass';
  let u;
  try { u = new URL(url); } catch { return 'bypass'; }
  if (u.origin !== origin) return 'bypass';
  const p = u.pathname;
  if (isRsc || u.searchParams.has('_rsc')) return 'network';
  if (p.startsWith('/api/')) return 'network';
  if (p.startsWith('/_next/static/')) return 'static';
  if (/^\/(icons|images)\/[A-Za-z0-9._-]+$/.test(p) || p === '/offline.html' || p === '/manifest.webmanifest') return 'static';
  if (mode === 'navigate') return 'navigate';
  return 'network';
}
