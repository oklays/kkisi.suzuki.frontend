import { verifyPin } from '@/server/auth/auth-service';
import { authEndpoint, clearSession, json, setSession } from '@/server/auth/http';
import { clientIp } from '@/lib/security/request';

export const dynamic = 'force-dynamic';

/** Step 2 of 2: the member's PIN. Success rotates the session id and opens the authenticated session. */
export async function POST(request: Request) {
  return authEndpoint(request, async ({ deps, body, sid }) => {
    const pin = body && typeof body === 'object' ? (body as Record<string, unknown>).pin : undefined;
    const result = await verifyPin(deps, sid, pin, clientIp(request.headers, deps.settings.trustedProxyHops));
    if (result.ok) return json(200, { ok: true }, { 'Set-Cookie': setSession(deps, result.sid) });
    if (result.code === 'PIN_INVALID') return json(401, { error: 'PIN_INVALID', remaining: result.remaining });
    if (result.code === 'PIN_MALFORMED') return json(400, { error: 'PIN_MALFORMED' });
    // Locked, expired or PIN not set: the PIN-stage session is over; the member starts again at /masuk.
    return json(result.code === 'PIN_NOT_SET' ? 409 : 401, { error: result.code }, result.code === 'PIN_NOT_SET' ? {} : { 'Set-Cookie': clearSession(deps) });
  });
}
