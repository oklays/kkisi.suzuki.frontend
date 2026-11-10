import { login } from '@/server/auth/auth-service';
import { authEndpoint, json, setSession } from '@/server/auth/http';
import { parseLoginInput } from '@/server/auth/policy';
import { clientIp } from '@/lib/security/request';

export const dynamic = 'force-dynamic';

/** Step 1 of 2: NIK/email/phone + password (smartkkisi account). Success opens a PIN-stage session only. */
export async function POST(request: Request) {
  return authEndpoint(request, async ({ deps, body }) => {
    const input = parseLoginInput(body);
    if (!input.ok) return json(400, { error: input.error });
    const result = await login(deps, input.value, clientIp(request.headers, deps.settings.trustedProxyHops));
    if (result.ok) return json(200, { next: '/pin' }, { 'Set-Cookie': setSession(deps, result.sid) });
    if (result.code === 'THROTTLED') return json(429, { error: 'THROTTLED', retryAfterSec: result.retryAfterSec }, { 'Retry-After': String(result.retryAfterSec) });
    return json(result.code === 'INVALID_CREDENTIALS' ? 401 : 403, { error: result.code });
  });
}
