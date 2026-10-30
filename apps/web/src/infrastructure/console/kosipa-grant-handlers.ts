import { randomUUID } from 'node:crypto';
import { ConsoleError } from '@koperasi/domain/console/identity-link';
import { resolveConsoleAccess, type PermissionSetSource } from '@koperasi/application/console/capabilities';
import type { IdentityPorts } from '@koperasi/application/console/identity-links';
import { decideKosipaGrant, listKosipaGrants, requestKosipaGrant, revokeKosipaGrant, type GrantActor, type GrantPorts, type KosipaGrantStore } from '@koperasi/application/console/kosipa-grants';
import { errorResponse, guard, json, readJson, type AuthServices } from '../auth/http.ts';

export type GrantDeps = { enabled: boolean; permissions: PermissionSetSource; ports: (IdentityPorts & { grants: KosipaGrantStore; grantAdmins: ReadonlySet<number> }) | null };

const STATUS: Record<string, number> = {
  FORBIDDEN: 403, SELF_APPROVAL: 403, CONSOLE_USER_NOT_FOUND: 404, GRANT_NOT_FOUND: 404,
  SELF_GRANT: 422, CONSOLE_USER_INACTIVE: 422, NOT_LINKED: 422, CAPABILITY_NOT_GRANTABLE: 422, REASON_REQUIRED: 422,
  ALREADY_GRANTED: 409, GRANT_NOT_ACTIVE: 409, GRANT_NOT_PENDING: 409, GRANT_REQUEST_EXPIRED: 409, GRANT_REQUEST_STALE: 409,
};
const positiveId = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0 && (v as number) <= 2_147_483_647;

async function actorFor(services: AuthServices, request: Request, deps: GrantDeps, write: boolean): Promise<{ response: Response } | { actor: GrantActor; ports: GrantPorts }> {
  if (!deps.enabled) return { response: json(404, { error: 'NOT_FOUND' }) };
  const g = await guard(services, request, write ? { csrf: true } : {});
  if (!g.ok) return { response: g.response };
  if (!deps.ports) return { response: json(503, { error: 'CONSOLE_STORE_UNAVAILABLE' }) };
  const { links, kosipa, grants, grantAdmins } = deps.ports;
  const access = await resolveConsoleAccess({ permissions: deps.permissions, kosipa: { links, kosipa, grants, grantAdmins } }, { userId: g.ctx.userId, roleId: g.ctx.roleId, canSwitchBranch: g.ctx.canSwitchBranch });
  return { actor: { userId: g.ctx.userId, capabilities: access.capabilities, requestId: randomUUID() }, ports: { ...deps.ports, permissions: deps.permissions } };
}

function failure(services: AuthServices, error: unknown): Response {
  if (error instanceof ConsoleError) return json(STATUS[error.code] ?? 400, { error: error.code });
  if (error instanceof Error && error.name !== 'AuthError') { services.deps.log('console_store_failed', {}); return json(503, { error: 'CONSOLE_STORE_UNAVAILABLE' }); }
  return errorResponse(services, error);
}

/** GET /api/console/kosipa-grants */
export async function handleListKosipaGrants(services: AuthServices, request: Request, deps: GrantDeps): Promise<Response> {
  try {
    const a = await actorFor(services, request, deps, false);
    if ('response' in a) return a.response;
    const grants = await listKosipaGrants(a.ports, a.actor);
    return json(200, { grants: grants.map((g) => ({ id: g.id, consoleUserId: g.consoleUserId, capability: g.capability, status: g.status, requestedBy: g.requestedBy,
      requestedAt: g.requestedAt.toISOString(), expiresAt: g.expiresAt.toISOString(), decidedBy: g.decidedBy })) });
  } catch (error) { return failure(services, error); }
}

/** POST /api/console/kosipa-grants  { consoleUserId, capability, reason } -> 201 pending request (step 1 of 2) */
export async function handleCreateKosipaGrant(services: AuthServices, request: Request, deps: GrantDeps): Promise<Response> {
  try {
    const a = await actorFor(services, request, deps, true);
    if ('response' in a) return a.response;
    const body = await readJson(request, 1024) as { consoleUserId?: unknown; capability?: unknown; reason?: unknown } | null;
    if (!body || !positiveId(body.consoleUserId)) return json(400, { error: 'BAD_REQUEST' });
    return json(201, await requestKosipaGrant(a.ports, a.actor, { consoleUserId: body.consoleUserId, capability: body.capability, reason: body.reason }));
  } catch (error) { return failure(services, error); }
}

/** POST /api/console/kosipa-grants/{id}/approve | reject { note } | revoke { reason } */
export async function handleKosipaGrantAction(services: AuthServices, request: Request, rawId: string, action: string, deps: GrantDeps): Promise<Response> {
  try {
    if (!['approve', 'reject', 'revoke'].includes(action)) return json(404, { error: 'NOT_FOUND' });
    const a = await actorFor(services, request, deps, true);
    if ('response' in a) return a.response;
    const body = await readJson(request, 1024) as { reason?: unknown; note?: unknown } | null;
    if (!/^[1-9]\d{0,9}$/.test(rawId) || !positiveId(Number(rawId)) || !body) return json(400, { error: 'BAD_REQUEST' });
    const grantId = Number(rawId);
    if (action === 'revoke') { await revokeKosipaGrant(a.ports, a.actor, { grantId, reason: body.reason }); return json(200, { id: grantId, status: 'revoked' }); }
    return json(200, await decideKosipaGrant(a.ports, a.actor, { grantId, decision: action as 'approve' | 'reject', note: body.note }));
  } catch (error) { return failure(services, error); }
}
