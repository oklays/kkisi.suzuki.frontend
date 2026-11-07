import { randomUUID } from 'node:crypto';
import { KosipaError, KosipaFieldError } from '@koperasi/domain/kosipa';
import { isProductMasterType } from '@koperasi/domain/kosipa/product-master';
import { resolveConsoleAccess, type KosipaWriteSources, type PermissionSetSource } from '@koperasi/application/console/capabilities';
import type { IdentityPorts } from '@koperasi/application/console/identity-links';
import type { CommandActor, CommandOutcome, WriteOwnership } from '@koperasi/application/kosipa/commands/pipeline';
import { createMaster, listMaster, setMasterStatus, updateMaster, type MasterRepository } from '@koperasi/application/kosipa/commands/master';
import { createProductMaster, listProductMaster, setProductMasterStatus, updateProductMaster, type ProductMasterRepository } from '@koperasi/application/kosipa/commands/product-master';
import { approveSavingsDeposit, createSavingsDeposit, listSavingsDeposits, lookupDepositMember, rejectSavingsDeposit, type SavingsDepositRepository } from '@koperasi/application/kosipa/commands/savings-deposit';
import { changeMemberStatus, getMemberForEdit, registerMember, updateMemberProfile, type MemberRepository } from '@koperasi/application/kosipa/commands/member';
import { errorResponse, guard, json, readJson, type AuthServices } from '../auth/http.ts';

/**
 * HTTP edge of the native KOSIPA commands (TASK-107 `kosipa-command-http`). Order: flags -> session (+ Origin + CSRF token +
 * JSON content type for every state change, SEC-105) -> services present -> server-side capabilities (fresh per request, from the
 * live identity link and explicit grants, SEC-108) -> use case. Responses are code-only (SEC-111) and never cached.
 */
export type KosipaCommandPorts = Pick<IdentityPorts, 'links' | 'kosipa' | 'audit' | 'now'> & KosipaWriteSources & { ownership: WriteOwnership; masters: MasterRepository; members: MemberRepository; products: ProductMasterRepository; deposits: SavingsDepositRepository };
export type KosipaCommandDeps = { enabled: boolean; permissions: PermissionSetSource; ports: KosipaCommandPorts | null; log?: (event: string, fields: Record<string, string | number>) => void };

const STATUS: Record<string, number> = {
  INVALID_INPUT: 400, FIELD_NOT_ALLOWED: 400, IDEMPOTENCY_KEY_INVALID: 400, MASTER_CODE_INVALID: 400, MASTER_NAME_INVALID: 400, MASTER_REMARKS_INVALID: 400, MASTER_ID_INVALID: 400, VERSION_INVALID: 400, REASON_INVALID: 400,
  FORBIDDEN: 403,
  MASTER_TYPE_UNKNOWN: 404, MASTER_NOT_FOUND: 404, MEMBER_NOT_FOUND: 404, MEMBER_STATUS_INVALID: 400,
  STALE: 409, IDEMPOTENCY_CONFLICT: 409, BUSY_RETRY: 409, DOCUMENT_NUMBER_CONFLICT: 409,
  SAVINGS_FIELD_INVALID: 400, SAVINGS_AMOUNT_INVALID: 400, SAVINGS_DATE_INVALID: 400, SAVINGS_DOC_ID_INVALID: 400, NIK_INVALID: 400, SAVINGS_DOC_NOT_FOUND: 404,
  SAVINGS_STATUS_INVALID: 409, SAVINGS_MAKER_CHECKER: 403, SAVINGS_NOT_A_DEPOSIT: 422, SAVINGS_LINES_INVALID: 422, SAVINGS_MEMBER_INACTIVE: 422, SAVINGS_NIK_TOO_LONG: 422, SAVINGS_PRODUCT_INACTIVE: 422,
  PRODUCT_FIELD_INVALID: 400, PRODUCT_COA_INVALID: 422, PRODUCT_COA_DESC_TOO_LONG: 422, PRODUCT_FINANCING_INVALID: 422, PRODUCT_PARENT_INVALID: 422, PRODUCT_FIELD_DUPLICATE: 422,
  MEMBER_NIK_DUPLICATE: 422, MEMBER_MASTER_INVALID: 422, MEMBER_MIRROR_CONFLICT: 422, MEMBER_FIELD_INVALID: 400, MEMBER_ID_INVALID: 400, MEMBER_DATE_INVALID: 400, MEMBER_AMOUNT_INVALID: 400, MEMBER_DEDUCTION_NIK_TOO_LONG: 400,
  MASTER_CODE_DUPLICATE: 422, MASTER_NAME_DUPLICATE: 422, MASTER_REFERENCED: 422, MASTER_FIELD_IMMUTABLE: 422, NO_CHANGE: 422,
  WRITE_DISABLED: 503, WRITE_NOT_CONFIGURED: 503, LEGACY_ACTIVE: 503, MASTER_TOO_LARGE: 503, MEMBER_TOO_LARGE: 503, POSTCONDITION_FAILED: 503,
};
const BODY_LIMIT = 4096;
/** A member form carries ~45 fields incl. two 250-char addresses: well above 4 KiB, still bounded. */
const MEMBER_BODY_LIMIT = 16 * 1024;

async function actorFor(services: AuthServices, request: Request, deps: KosipaCommandDeps, write: boolean): Promise<{ response: Response } | { actor: CommandActor; ports: KosipaCommandPorts }> {
  if (!deps.enabled) return { response: json(404, { error: 'NOT_FOUND' }) };
  const g = await guard(services, request, write ? { csrf: true } : {});
  if (!g.ok) return { response: g.response };
  if (!deps.ports) return { response: json(503, { error: 'KOSIPA_UNAVAILABLE' }) };
  const access = await resolveConsoleAccess({ permissions: deps.permissions, kosipa: deps.ports }, { userId: g.ctx.userId, roleId: g.ctx.roleId, canSwitchBranch: g.ctx.canSwitchBranch });
  if (write && access.kosipaWriteUnavailable) return { response: json(503, { error: 'KOSIPA_UNAVAILABLE' }) };
  return { actor: { userId: g.ctx.userId, kosipaUserId: access.kosipaUserId, capabilities: access.capabilities, requestId: randomUUID() }, ports: deps.ports };
}

function failure(services: AuthServices, deps: KosipaCommandDeps, error: unknown): Response {
  // A field error names the field (a column name, never a value) so the form can point at it.
  if (error instanceof KosipaFieldError) return json(STATUS[error.code] ?? 400, { error: error.code, field: error.field });
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
    if (isProductMasterType(rawType)) {
      const product = await listProductMaster(a.ports, a.actor, rawType);
      return json(200, { type: product.definition.type, rows: product.rows, facts: product.facts, canManage: product.canManage, writable: product.writable, legacy: product.legacy });
    }
    const data = await listMaster(a.ports, a.actor, rawType);
    return json(200, { type: data.definition.type, rows: data.rows, canManage: data.canManage, writable: data.writable, legacy: data.legacy });
  } catch (error) { return failure(services, deps, error); }
}

/** POST /api/kosipa/master/[type]  { idempotencyKey, ...fields of the master } */
export async function handleCreateMaster(services: AuthServices, request: Request, rawType: string, deps: KosipaCommandDeps): Promise<Response> {
  try {
    const a = await actorFor(services, request, deps, true);
    if ('response' in a) return a.response;
    const body = await readJson(request, BODY_LIMIT);
    return ok(201, isProductMasterType(rawType) ? await createProductMaster(commandPorts(a.ports, deps), a.actor, rawType, body) : await createMaster(commandPorts(a.ports, deps), a.actor, rawType, body));
  } catch (error) { return failure(services, deps, error); }
}

/** PATCH /api/kosipa/master/[type]/[id]  { idempotencyKey, ...fields, expectedVersion } */
export async function handleUpdateMaster(services: AuthServices, request: Request, rawType: string, rawId: string, deps: KosipaCommandDeps): Promise<Response> {
  try {
    const a = await actorFor(services, request, deps, true);
    if ('response' in a) return a.response;
    const body = await readJson(request, BODY_LIMIT);
    return ok(200, isProductMasterType(rawType) ? await updateProductMaster(commandPorts(a.ports, deps), a.actor, rawType, rawId, body) : await updateMaster(commandPorts(a.ports, deps), a.actor, rawType, rawId, body));
  } catch (error) { return failure(services, deps, error); }
}

/** POST /api/kosipa/master/[type]/[id]/deactivate|reactivate  { idempotencyKey, expectedVersion, reason } */
export async function handleMasterStatus(services: AuthServices, request: Request, rawType: string, rawId: string, action: string, deps: KosipaCommandDeps): Promise<Response> {
  try {
    if (action !== 'deactivate' && action !== 'reactivate') return json(404, { error: 'NOT_FOUND' });
    const a = await actorFor(services, request, deps, true);
    if ('response' in a) return a.response;
    const body = await readJson(request, BODY_LIMIT);
    return ok(200, isProductMasterType(rawType) ? await setProductMasterStatus(commandPorts(a.ports, deps), a.actor, rawType, rawId, body, action === 'reactivate') : await setMasterStatus(commandPorts(a.ports, deps), a.actor, rawType, rawId, body, action === 'reactivate'));
  } catch (error) { return failure(services, deps, error); }
}

/** POST /api/kosipa/members  { idempotencyKey, fields, initialDeductions } */
export async function handleRegisterMember(services: AuthServices, request: Request, deps: KosipaCommandDeps): Promise<Response> {
  try {
    const a = await actorFor(services, request, deps, true);
    if ('response' in a) return a.response;
    return ok(201, await registerMember(commandPorts(a.ports, deps), a.actor, await readJson(request, MEMBER_BODY_LIMIT)));
  } catch (error) { return failure(services, deps, error); }
}

/** GET /api/kosipa/members/[id]  edit view: fields + opaque version + what the caller may do (private, never cached) */
export async function handleGetMemberForEdit(services: AuthServices, request: Request, rawId: string, deps: KosipaCommandDeps): Promise<Response> {
  try {
    const a = await actorFor(services, request, deps, false);
    if ('response' in a) return a.response;
    return json(200, await getMemberForEdit(a.ports, a.actor, rawId));
  } catch (error) { return failure(services, deps, error); }
}

/** PATCH /api/kosipa/members/[id]  { idempotencyKey, fields, expectedVersion, reason? } */
export async function handleUpdateMemberProfile(services: AuthServices, request: Request, rawId: string, deps: KosipaCommandDeps): Promise<Response> {
  try {
    const a = await actorFor(services, request, deps, true);
    if ('response' in a) return a.response;
    return ok(200, await updateMemberProfile(commandPorts(a.ports, deps), a.actor, rawId, await readJson(request, MEMBER_BODY_LIMIT)));
  } catch (error) { return failure(services, deps, error); }
}

/** POST /api/kosipa/members/[id]/status  { idempotencyKey, status, reason, expectedVersion } */
export async function handleChangeMemberStatus(services: AuthServices, request: Request, rawId: string, deps: KosipaCommandDeps): Promise<Response> {
  try {
    const a = await actorFor(services, request, deps, true);
    if ('response' in a) return a.response;
    return ok(200, await changeMemberStatus(commandPorts(a.ports, deps), a.actor, rawId, await readJson(request, BODY_LIMIT)));
  } catch (error) { return failure(services, deps, error); }
}

/** GET /api/kosipa/savings/deposits?status=&month=  (savings + member view; private, never cached) */
export async function handleListDeposits(services: AuthServices, request: Request, deps: KosipaCommandDeps): Promise<Response> {
  try {
    const a = await actorFor(services, request, deps, false);
    if ('response' in a) return a.response;
    const url = new URL(request.url);
    return json(200, await listSavingsDeposits(a.ports, a.actor, { status: url.searchParams.get('status') ?? undefined, month: url.searchParams.get('month') ?? undefined }));
  } catch (error) { return failure(services, deps, error); }
}

/** POST /api/kosipa/savings/deposits/member  { nik }  — member facts for the deposit form (POST so the NIK never appears in a URL or log). */
export async function handleDepositMember(services: AuthServices, request: Request, deps: KosipaCommandDeps): Promise<Response> {
  try {
    const a = await actorFor(services, request, deps, true);
    if ('response' in a) return a.response;
    const body = await readJson(request, 512) as { nik?: unknown } | null;
    return json(200, await lookupDepositMember(a.ports, a.actor, body?.nik));
  } catch (error) { return failure(services, deps, error); }
}

/** POST /api/kosipa/savings/deposits  { idempotencyKey, memberId, docDate, paymentType, amount, bankName, bankAccount, remarks } */
export async function handleCreateDeposit(services: AuthServices, request: Request, deps: KosipaCommandDeps): Promise<Response> {
  try {
    const a = await actorFor(services, request, deps, true);
    if ('response' in a) return a.response;
    return ok(201, await createSavingsDeposit(commandPorts(a.ports, deps), a.actor, await readJson(request, BODY_LIMIT)));
  } catch (error) { return failure(services, deps, error); }
}

/** POST /api/kosipa/savings/deposits/[id]/approve|reject  { idempotencyKey, expectedVersion, reason? } */
export async function handleDecideDeposit(services: AuthServices, request: Request, rawId: string, action: string, deps: KosipaCommandDeps): Promise<Response> {
  try {
    if (action !== 'approve' && action !== 'reject') return json(404, { error: 'NOT_FOUND' });
    const a = await actorFor(services, request, deps, true);
    if ('response' in a) return a.response;
    const body = await readJson(request, BODY_LIMIT);
    return ok(200, action === 'approve' ? await approveSavingsDeposit(commandPorts(a.ports, deps), a.actor, rawId, body) : await rejectSavingsDeposit(commandPorts(a.ports, deps), a.actor, rawId, body));
  } catch (error) { return failure(services, deps, error); }
}
