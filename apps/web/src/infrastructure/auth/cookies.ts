import type { AuthConfig } from './config.ts';

export function readCookie(header: string | null, name: string): string | null {
  if (!header || header.length > 4096) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** HttpOnly, SameSite=Lax, Path=/, no Domain, session cookie (no Max-Age); Secure and __Host- over HTTPS. */
export function sessionCookie(config: Pick<AuthConfig, 'cookieName' | 'secure'>, sid: string): string {
  return `${config.cookieName}=${sid}; Path=/; HttpOnly; SameSite=Lax${config.secure ? '; Secure' : ''}`;
}

export function clearedCookie(config: Pick<AuthConfig, 'cookieName' | 'secure'>): string {
  return `${config.cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${config.secure ? '; Secure' : ''}`;
}
