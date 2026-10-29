import { ALL_CAPABILITIES, type Capability, type CapabilitySet } from '@koperasi/domain/console/capabilities';
import { canPerform, type PssAction, type PssRole } from '@koperasi/domain/kosipa/savings-access';
import type { AuthContext } from '@koperasi/application/auth/validate-session';
import type { AuthServices } from '../auth/http.ts';

/** Explicit deployment mapping only. Existing view/admin capabilities never imply a PSS staff role. */
export type PublicSavingsOperatorPolicy = {
  branchesByCompanyId: Readonly<Record<number, string>>;
  rolesByRoleId: Readonly<Record<number, readonly PssRole[]>>;
  capabilitiesByAction: Readonly<Partial<Record<PssAction, readonly Capability[]>>>;
};
export type PublicSavingsOperatorActor = {
  actorRef: string; userId: number; roleId: number; branch: string;
  roles: readonly PssRole[]; branches: readonly string[];
};
export type PublicSavingsOperatorTarget = { branch?: string; makerRef?: string; reason?: string };
export type PublicSavingsOperatorResult = { actor: PublicSavingsOperatorActor } | { response: Response };
type Subject = Pick<AuthContext, 'userId' | 'roleId' | 'companyId' | 'canSwitchBranch'>;
type Dependencies = {
  policy: PublicSavingsOperatorPolicy;
  guard(request: Request, options: { csrf: boolean }): Promise<{ ok: true; ctx: Subject } | { ok: false; response: Response }>;
  capabilities(subject: Subject): Promise<CapabilitySet>;
};
const READ_ACTIONS: readonly PssAction[] = ['VIEW_SUBMISSIONS', 'VIEW_ESCALATIONS', 'VIEW_AUDIT'];
const ROLES: readonly PssRole[] = ['MEMBER', 'STAFF_VIEWER', 'STAFF_OPERATOR', 'MEMBERSHIP_VERIFIER', 'KOSIPA_SUPERVISOR', 'LEGACY_APPROVER', 'SYSTEM_ADMIN', 'AUDITOR'];
const failure = (status: number, code: string): PublicSavingsOperatorResult => ({ response: Response.json({ error: { code } }, { status, headers: { 'Cache-Control': 'no-store' } }) });

/** Target branch must come from a server lookup; all list operations use actor.branch in their database predicate. */
export function createPublicSavingsOperatorAuthorizer(deps: Dependencies) {
  return async (request: Request, action: PssAction, target: PublicSavingsOperatorTarget = {}): Promise<PublicSavingsOperatorResult> => {
    try {
      const session = await deps.guard(request, { csrf: !READ_ACTIONS.includes(action) || !['GET', 'HEAD'].includes(request.method) });
      if (!session.ok) return { response: session.response };
      if (action === 'APPROVE_DEDUCTION') return failure(403, 'LEGACY_CI2_ONLY');
      const ctx = session.ctx;
      if (!Number.isSafeInteger(ctx.userId) || ctx.userId <= 0 || !Number.isSafeInteger(ctx.companyId) || ctx.companyId <= 0) return failure(403, 'FORBIDDEN');
      const roles = Object.hasOwn(deps.policy.rolesByRoleId, ctx.roleId) ? deps.policy.rolesByRoleId[ctx.roleId] : undefined;
      if (!roles?.length || roles.some(role => !ROLES.includes(role))) return failure(403, 'FORBIDDEN');
      const required = Object.hasOwn(deps.policy.capabilitiesByAction, action) ? deps.policy.capabilitiesByAction[action] : undefined;
      if (!required?.length || required.some(cap => !ALL_CAPABILITIES.includes(cap))) return failure(503, 'OPERATOR_AUTHORIZATION_UNCONFIGURED');
      const capabilities = await deps.capabilities(ctx);
      if (!required.every(cap => capabilities.has(cap))) return failure(403, 'FORBIDDEN');
      const branch = deps.policy.branchesByCompanyId && Object.hasOwn(deps.policy.branchesByCompanyId, ctx.companyId) ? deps.policy.branchesByCompanyId[ctx.companyId] : undefined;
      if (typeof branch !== 'string' || !branch.trim() || branch !== branch.trim() || branch.length > 64) return failure(503, 'OPERATOR_AUTHORIZATION_UNCONFIGURED');
      const actor: PublicSavingsOperatorActor = { actorRef: `console:${ctx.userId}`, userId: ctx.userId, roleId: ctx.roleId, branch, roles: [...roles], branches: [branch] };
      const allowed = canPerform(actor, action, { ...target, branch: target.branch ?? branch });
      return allowed.ok ? { actor } : failure(403, allowed.error.code);
    } catch { return failure(503, 'OPERATOR_AUTHORIZATION_UNAVAILABLE'); }
  };
}

/** Real adapter: existing DB-validated console session, CSRF and server-derived console capabilities. */
export async function authorizePublicSavingsOperator(request: Request, action: PssAction, target: PublicSavingsOperatorTarget = {}, policy?: PublicSavingsOperatorPolicy): Promise<PublicSavingsOperatorResult> {
  if (!policy) return failure(503, 'OPERATOR_AUTHORIZATION_UNCONFIGURED');
  try {
    const [{ getContainer }, { guard }, { resolveConsoleAccess }, { kosipaServices }] = await Promise.all([
      import('../auth/container.ts'), import('../auth/http.ts'), import('@koperasi/application/console/capabilities'), import('../console/services.ts'),
    ]);
    const container = getContainer();
    const services: AuthServices = container.services;
    return createPublicSavingsOperatorAuthorizer({
      policy,
      guard: (req, options) => guard(services, req, options),
      capabilities: async subject => (await resolveConsoleAccess({ permissions: container.capabilities, kosipa: kosipaServices() }, subject)).capabilities,
    })(request, action, target);
  } catch { return failure(503, 'OPERATOR_AUTHORIZATION_UNAVAILABLE'); }
}

/** Private operator policy is reread for every authorization, so removing a grant takes effect immediately. */
export async function loadPublicSavingsOperatorPolicy(file: string | undefined = process.env.PSS_OPERATOR_POLICY_FILE): Promise<PublicSavingsOperatorPolicy> {
  const [{ open, lstat }, { constants }, { isAbsolute }] = await Promise.all([import('node:fs/promises'), import('node:fs'), import('node:path')]);
  const invalid = () => new Error('OPERATOR_AUTHORIZATION_UNCONFIGURED');
  if (!file || !isAbsolute(file)) throw invalid();
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw invalid();
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.size > 32768 || (process.getuid && stat.uid !== process.getuid())) throw invalid();
    const value: unknown = JSON.parse(await handle.readFile('utf8'));
    const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
    if (!object(value) || Object.keys(value).sort().join(',') !== 'branchesByCompanyId,capabilitiesByAction,rolesByRoleId' || !object(value.branchesByCompanyId) || !object(value.rolesByRoleId) || !object(value.capabilitiesByAction)) throw invalid();
    const actions: readonly string[] = ['VIEW_SUBMISSIONS','ISSUE_LINK','REISSUE_LINK','REVOKE_LINK','VERIFY_CONTACT','REBIND_CONTACT_MAKE','REBIND_CONTACT_CHECK','APPROVE_EXCEPTION','VIEW_ESCALATIONS','VIEW_AUDIT','CONFIGURE_SYSTEM'];
    if (Object.entries(value.branchesByCompanyId).some(([id, branch]) => !/^[1-9]\d{0,8}$/.test(id) || typeof branch !== 'string' || !branch.trim() || branch !== branch.trim() || branch.length > 64)) throw invalid();
    if (Object.entries(value.rolesByRoleId).some(([id, roles]) => !/^[1-9]\d{0,8}$/.test(id) || !Array.isArray(roles) || !roles.length || roles.some(role => !ROLES.includes(role)) || new Set(roles).size !== roles.length)) throw invalid();
    if (Object.entries(value.capabilitiesByAction).some(([action, caps]) => !actions.includes(action) || !Array.isArray(caps) || !caps.length || caps.some(cap => !ALL_CAPABILITIES.includes(cap)) || new Set(caps).size !== caps.length)) throw invalid();
    if (!Object.keys(value.branchesByCompanyId).length || !Object.keys(value.rolesByRoleId).length || !Object.keys(value.capabilitiesByAction).length) throw invalid();
    return value as PublicSavingsOperatorPolicy;
  } finally { await handle.close(); }
}
