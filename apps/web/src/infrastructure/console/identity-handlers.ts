import { randomUUID } from 'node:crypto';
import { ConsoleError } from '@koperasi/domain/console/identity-link';
import { resolveConsoleAccess, type PermissionSetSource } from '@koperasi/application/console/capabilities';
import { linkIdentity, revokeIdentityLink, type IdentityPorts } from '@koperasi/application/console/identity-links';
import { errorResponse, guard, json, readJson, type AuthServices } from '../auth/http.ts';

export type IdentityDeps = { enabled: boolean; permissions: PermissionSetSource; ports: IdentityPorts | null };

const STATUS: Record<string, number> = {
  FORBIDDEN: 403, CONSOLE_USER_NOT_FOUND: 404, KOSIPA_USER_NOT_FOUND: 404, LINK_NOT_FOUND: 404,
  SELF_LINK: 422, CONSOLE_USER_INACTIVE: 422, KOSIPA_USER_INACTIVE: 422, KOSIPA_USER_NO_ACCESS: 422, REASON_REQUIRED: 422,
  CONSOLE_USER_ALREADY_LINKED: 409, KOSIPA_USER_ALREADY_LINKED: 409, ALREADY_LINKED: 409, LINK_NOT_ACTIVE: 409,
};
const positiveId = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;

/** Common gate: flag, session + CSRF, console store present, then the actor's server-side capabilities. */
type Actor = { userId: number; capabilities: Awaited<ReturnType<typeof resolveConsoleAccess>>['capabilities']; requestId: string };
async function actorFor(services: AuthServices, request: Request, deps: IdentityDeps): Promise<{ response: Response } | { actor: Actor; ports: IdentityPorts }> {
  if (!deps.enabled) return { response: json(404, { error: 'NOT_FOUND' }) };
  const g = await guard(services, request, { csrf: true });
  if (!g.ok) return { response: g.response };
  if (!deps.ports) return { response: json(503, { error: 'CONSOLE_STORE_UNAVAILABLE' }) };
  const access = await resolveConsoleAccess({ permissions: deps.permissions, kosipa: null }, { userId: g.ctx.userId, roleId: g.ctx.roleId, canSwitchBranch: g.ctx.canSwitchBranch });
  return { actor: { userId: g.ctx.userId, capabilities: access.capabilities, requestId: randomUUID() }, ports: deps.ports };
}

function failure(services: AuthServices, error: unknown): Response {
  if (error instanceof ConsoleError) return json(STATUS[error.code] ?? 400, { error: error.code });
  // Console store or business reader unreachable: fail closed without detail.
  if (error instanceof Error && !(error.name === 'AuthError')) { services.deps.log('console_store_failed', {}); return json(503, { error: 'CONSOLE_STORE_UNAVAILABLE' }); }
  return errorResponse(services, error);
}

/** POST /api/console/identity-links  { consoleUserId, kosipaUserId } */
export async function handleCreateIdentityLink(services: AuthServices, request: Request, deps: IdentityDeps): Promise<Response> {
  try {
    const a = await actorFor(services, request, deps);
    if ('response' in a) return a.response;
    const body = await readJson(request, 512) as { consoleUserId?: unknown; kosipaUserId?: unknown } | null;
    if (!body || !positiveId(body.consoleUserId) || !positiveId(body.kosipaUserId)) return json(400, { error: 'BAD_REQUEST' });
    return json(201, await linkIdentity(a.ports, a.actor, { consoleUserId: body.consoleUserId, kosipaUserId: body.kosipaUserId }));
  } catch (error) { return failure(services, error); }
}

/** POST /api/console/identity-links/{id}/revoke  { reason } */
export async function handleRevokeIdentityLink(services: AuthServices, request: Request, rawId: string, deps: IdentityDeps): Promise<Response> {
  try {
    const a = await actorFor(services, request, deps);
    if ('response' in a) return a.response;
    const linkId = Number(rawId);
    const body = await readJson(request, 1024) as { reason?: unknown } | null;
    if (!positiveId(linkId) || !/^\d+$/.test(rawId) || !body || typeof body.reason !== 'string') return json(400, { error: 'BAD_REQUEST' });
    await revokeIdentityLink(a.ports, a.actor, { linkId, reason: body.reason });
    return json(200, { revoked: linkId });
  } catch (error) { return failure(services, error); }
}
