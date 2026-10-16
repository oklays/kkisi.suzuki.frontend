import { resolveConsoleCapabilities, type PermissionSetSource } from '@koperasi/application/console/capabilities';
import { errorResponse, guard, json, type AuthServices } from '../auth/http.ts';

/**
 * GET /api/console/capabilities: the server-authoritative capability set of the calling session (spec REQ-011).
 * Read-only; a session or permission-store failure is fail-closed (401/503), never an empty "allowed" list.
 */
export async function handleConsoleCapabilities(services: AuthServices, request: Request, source: PermissionSetSource, enabled: boolean): Promise<Response> {
  if (!enabled) return json(404, { error: 'NOT_FOUND' });
  const g = await guard(services, request);
  if (!g.ok) return g.response;
  try {
    const capabilities = await resolveConsoleCapabilities(source, { roleId: g.ctx.roleId, canSwitchBranch: g.ctx.canSwitchBranch });
    return json(200, { capabilities: [...capabilities].sort(), companyId: g.ctx.companyId, canSwitchBranch: g.ctx.canSwitchBranch });
  } catch (error) {
    return errorResponse(services, error);
  }
}
