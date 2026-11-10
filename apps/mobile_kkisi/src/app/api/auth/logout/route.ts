import { logout } from '@/server/auth/auth-service';
import { authEndpoint, clearSession, json } from '@/server/auth/http';

export const dynamic = 'force-dynamic';

/** Revokes the session server-side and clears the cookie. Clear-Site-Data "cache" drops the HTTP cache (the service worker and its
 *  public-asset cache stay; the client clears the session-scoped cart itself). */
export async function POST(request: Request) {
  return authEndpoint(request, async ({ deps, sid }) => {
    await logout(deps, sid);
    return json(200, { next: '/masuk' }, { 'Set-Cookie': clearSession(deps), 'Clear-Site-Data': '"cache"' });
  });
}
