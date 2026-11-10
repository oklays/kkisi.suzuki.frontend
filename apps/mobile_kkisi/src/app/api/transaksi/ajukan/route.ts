import { pendingPinSession, resolveMember } from '@/server/auth/auth-service';
import { authEndpoint, clearSession, json } from '@/server/auth/http';
import { mutationService } from '@/server/container';

export const dynamic = 'force-dynamic';

/**
 * Member-scoped BFF mutation endpoint for loan applications, deduction changes, store checkout, PPOB, and favourites.
 * Enforces:
 * 1. CSRF (Origin/Sec-Fetch-Site) + JSON Content-Type via authEndpoint
 * 2. Active authenticated + PIN-verified member session (re-checking live account status)
 * 3. Server-side feature capability flags (defaulted to false in production)
 * 4. Strict body parsing, a per-member write lease, and an Idempotency-Key ledger row reserved (PENDING) before any business write
 * 5. Server-side recalculation of rates, limits, prices, and store credit
 */
export async function POST(request: Request) {
  return authEndpoint(request, async ({ deps, body, sid }) => {
    const member = await resolveMember(deps, sid);
    if (!member) {
      if (await pendingPinSession(deps, sid)) return json(403, { error: 'PIN_REQUIRED' });
      return json(401, { error: 'UNAUTHENTICATED' }, sid ? { 'Set-Cookie': clearSession(deps) } : {});
    }

    // The body is untrusted: MemberMutationService parses it strictly (unknown fields refused) before anything else runs.
    const outcome = await mutationService().execute(member, body, request.headers.get('idempotency-key'));
    if (outcome.ok) {
      deps.log('member.mutation.recorded', { kind: outcome.kind, replayed: outcome.replayed });
      return json(outcome.status, {
        ok: true,
        replayed: outcome.replayed,
        kind: outcome.kind,
        docNo: outcome.docNo,
        summary: outcome.summary,
      });
    }
    const kind = body && typeof body === 'object' ? (body as Record<string, unknown>).kind : null;
    deps.log('member.mutation.blocked', { kind: typeof kind === 'string' ? kind.slice(0, 32) : 'unknown', code: outcome.code });
    return json(outcome.status, {
      error: outcome.code,
      ...(outcome.feature ? { feature: outcome.feature } : {}),
      ...(outcome.field ? { field: outcome.field } : {}),
      ...(outcome.message ? { message: outcome.message } : {}),
    }, outcome.code === 'BUSY_RETRY' ? { 'Retry-After': '2' } : {});
  });
}
