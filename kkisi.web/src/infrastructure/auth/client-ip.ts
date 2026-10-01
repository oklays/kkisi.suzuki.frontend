import { isIP } from 'node:net';

/**
 * The client address is trusted ONLY behind a reverse proxy that overwrites X-Forwarded-For. `hops` is the number of
 * trusted proxies; the client is the entry `hops` positions from the right. hops = 0 (default) means "no trusted proxy":
 * X-Forwarded-For is ignored completely, so a client cannot dodge per-IP limits by forging it (verified in 2A-0).
 */
export function trustedClientIp(header: string | null, hops: number): string | null {
  if (hops <= 0 || !header || header.length > 400) return null;
  const parts = header.split(',').map((p) => p.trim());
  if (parts.length < hops) return null;
  const candidate = parts[parts.length - hops];
  return isIP(candidate) ? candidate : null;
}
