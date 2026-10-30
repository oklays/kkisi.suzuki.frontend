import { randomUUID } from 'node:crypto';
import { KosipaError } from '@koperasi/domain/kosipa';
import { resolveConsoleAccess, type KosipaWriteSources, type PermissionSetSource } from '@koperasi/application/console/capabilities';
import type { IdentityPorts } from '@koperasi/application/console/identity-links';
import type { CommandActor, CommandOutcome, WriteOwnership } from '@koperasi/application/kosipa/commands/pipeline';
import { createMaster, listMaster, setMasterStatus, updateMaster, type MasterRepository } from '@koperasi/application/kosipa/commands/master';
import { errorResponse, guard, json, readJson, type AuthServices } from '../auth/http.ts';

/**
 * HTTP edge of the native KOSIPA commands (TASK-107 `kosipa-command-http`). Order: flags -> session (+ Origin + CSRF token +
 * JSON content type for every state change, SEC-105) -> services present -> server-side capabilities (fresh per request, from the
 * live identity link and explicit grants, SEC-108) -> use case. Responses are code-only (SEC-111) and never cached.
 */
export type KosipaCommandPorts = Pick<IdentityPorts, 'links' | 'kosipa' | 'audit' | 'now'> & KosipaWriteSources & { ownership: WriteOwnership; masters: MasterRepository };
export type KosipaCommandDeps = { enabled: boolean; permissions: PermissionSetSource; ports: KosipaCommandPorts | null; log?: (event: string, fields: Record<string, string | number>) => void };

const STATUS: Record<string, number> = {
  INVALID_INPUT: 400, FIELD_NOT_ALLOWED: 400, IDEMPOTENCY_KEY_INVALID: 400, MASTER_CODE_INVALID: 400, MASTER_NAME_INVALID: 400, MASTER_REMARKS_INVALID: 400, MASTER_ID_INVALID: 400, VERSION_INVALID: 400, REASON_INVALID: 400,
  FORBIDDEN: 403,
  MASTER_TYPE_UNKNOWN: 404, MASTER_NOT_FOUND: 404,
  STALE: 409, IDEMPOTENCY_CONFLICT: 409, BUSY_RETRY: 409, DOCUMENT_NUMBER_CONFLICT: 409,
  MASTER_CODE_DUPLICATE: 422, MASTER_NAME_DUPLICATE: 422, MASTER_REFERENCED: 422, MASTER_FIELD_IMMUTABLE: 422, NO_CHANGE: 422,
  WRITE_DISABLED: 503, WRITE_NOT_CONFIGURED: 503, LEGACY_ACTIVE: 503, MASTER_TOO_LARGE: 503, POSTCONDITION_FAILED: 503,
};
const BODY_LIMIT = 4096;

async function actorFor(services: AuthServices, request: Request, deps: KosipaCommandDeps, write: boolean): Promise<{ response: Response } | { actor: CommandActor; ports: KosipaCommandPorts }> {
  if (!deps.enabled) return { response: json(404, { error: 'NOT_FOUND' }) };
  const g = await guard(services, request, write ? { csrf: true } : {});
  if (!g.ok) return { response: g.response };
  if (!deps.ports) return { response: json(503, { error: 'KOSIPA_UNAVAILABLE' }) };
  const { links, kosipa, grants, grantAdmins } = deps.ports;
  const access = await resolveConsoleAccess({ permissions: deps.permissions, kosipa: { links, kosipa, grants, grantAdmins } }, { userId: g.ctx.userId, roleId: g.ctx.roleId, canSwitchBranch: g.ctx.canSwitchBranch });
  return { actor: { userId: g.ctx.userId, kosipaUserId: access.kosipaUserId, capabilities: access.capabilities, requestId: randomUUID() }, ports: deps.ports };
}

function failure(services: AuthServices, deps: KosipaCommandDeps, error: unknown): Response {
  if (error instanceof KosipaError) return json(STATUS[error.code] ?? 400, { error: error.code }, error.code === 'BUSY_RETRY' ? { 'Retry-After': '1' } : {});
  if (error instanceof Error && error.name !== 'AuthError') { (deps.log ?? services.deps.log)('kosipa_command_failed', {}); return json(503, { error: 'KOSIPA_UNAVAILABLE' }); }
  return errorResponse(services, error);
}

const ok = <R>(status: number, outcome: CommandOutcome<R>) => json(outcome.replayed ? 200 : status, { success: true, replayed: outcome.replayed, data: outcome.result });
const commandPorts = (ports: KosipaCommandPorts, deps: KosipaCommandDeps) => ({ ...ports, log: deps.log });

/** GET /api/kosipa/master/[type] */
export async function handleListMaster(services: AuthServices, request: Request, rawType: string, deps: KosipaCommandDeps): Promise<Response> {
  try {
    const a = await actorFor(services, request, deps, false);
    if ('response' in a) return a.response;
    const data = await listMaster(a.ports, a.actor, rawType);
    return json(200, { type: data.definition.type, rows: data.rows, canManage: data.canManage, writable: data.writable, legacy: data.legacy });
  } catch (error) { return failure(services, deps, error); }
}

/** POST /api/kosipa/master/[type]  { idempotencyKey, ...fields of the master } */
export async function handleCreateMaster(services: AuthServices, request: Request, rawType: string, deps: KosipaCommandDeps): Promise<Response> {
  try {
    const a = await actorFor(services, request, deps, true);
    if ('response' in a) return a.response;
    return ok(201, await createMaster(commandPorts(a.ports, deps), a.actor, rawType, await readJson(request, BODY_LIMIT)));
  } catch (error) { return failure(services, deps, error); }
}

/** PATCH /api/kosipa/master/[type]/[id]  { idempotencyKey, ...fields, expectedVersion } */
export async function handleUpdateMaster(services: AuthServices, request: Request, rawType: string, rawId: string, deps: KosipaCommandDeps): Promise<Response> {
  try {
    const a = await actorFor(services, request, deps, true);
    if ('response' in a) return a.response;
    return ok(200, await updateMaster(commandPorts(a.ports, deps), a.actor, rawType, rawId, await readJson(request, BODY_LIMIT)));
  } catch (error) { return failure(services, deps, error); }
}

/** POST /api/kosipa/master/[type]/[id]/deactivate|reactivate  { idempotencyKey, expectedVersion, reason } */
export async function handleMasterStatus(services: AuthServices, request: Request, rawType: string, rawId: string, action: string, deps: KosipaCommandDeps): Promise<Response> {
  try {
    if (action !== 'deactivate' && action !== 'reactivate') return json(404, { error: 'NOT_FOUND' });
    const a = await actorFor(services, request, deps, true);
    if ('response' in a) return a.response;
    return ok(200, await setMasterStatus(commandPorts(a.ports, deps), a.actor, rawType, rawId, await readJson(request, BODY_LIMIT), action === 'reactivate'));
  } catch (error) { return failure(services, deps, error); }
}
