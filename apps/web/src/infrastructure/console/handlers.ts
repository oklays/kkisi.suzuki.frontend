import { resolveConsoleAccess, type PermissionSetSource } from '@koperasi/application/console/capabilities';
import type { IdentityPorts } from '@koperasi/application/console/identity-links';
import { errorResponse, guard, json, type AuthServices } from '../auth/http.ts';

/**
 * GET /api/console/capabilities: the server-authoritative capability set of the calling session (spec REQ-011).
 * Read-only; a session or permission-store failure is fail-closed (401/503), never an empty "allowed" list.
 */
export async function handleConsoleCapabilities(services: AuthServices, request: Request, source: PermissionSetSource, enabled: boolean, kosipa: Pick<IdentityPorts, 'links' | 'kosipa'> | null = null): Promise<Response> {
  if (!enabled) return json(404, { error: 'NOT_FOUND' });
  const g = await guard(services, request);
  if (!g.ok) return g.response;
  try {
    const access = await resolveConsoleAccess({ permissions: source, kosipa }, { userId: g.ctx.userId, roleId: g.ctx.roleId, canSwitchBranch: g.ctx.canSwitchBranch });
    return json(200, { capabilities: [...access.capabilities].sort(), kosipa: access.kosipa, companyId: g.ctx.companyId, canSwitchBranch: g.ctx.canSwitchBranch });
  } catch (error) {
    return errorResponse(services, error);
  }
}
