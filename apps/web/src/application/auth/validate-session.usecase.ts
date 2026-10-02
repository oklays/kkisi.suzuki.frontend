import { AuthError } from '../../domain/auth/errors.ts';
import { isSessionValid, isWellFormedSid, passwordFingerprint, sidToHash, slidIdleDeadline, TOUCH_INTERVAL_MS } from '../../domain/auth/session.ts';
import type { AuthDeps } from './ports.ts';

export type AuthContext = {
  sidHash: Buffer;
  userId: number;
  userName: string;
  roleId: number;
  companyId: number;               // session.cid: the ONLY branch source for every POS query
  homeCompanyId: number;           // db_users.company_id
  canSwitchBranch: boolean;        // role <= 2
  hasPermission(slug: string): Promise<boolean>;
};

/** role <= 2 (Administrator, Admin Koperasi) may choose a branch; everyone else is fixed to db_users.company_id. */
export const canChooseBranch = (roleId: number): boolean => roleId <= 2;

/**
 * Re-validates EVERYTHING from the databases on every protected request: session row (auth store), then user, role,
 * branch and password fingerprint (legacy, SELECT-only). Any store error propagates (-> 503): access is never granted
 * when a database cannot answer. Revocation reasons are written best-effort.
 */
export async function validateSession(deps: AuthDeps, sid: string | null | undefined): Promise<AuthContext> {
  if (!isWellFormedSid(sid)) throw new AuthError('UNAUTHENTICATED');
  const now = deps.clock.now();
  const sidHash = sidToHash(sid);
  const session = await deps.sessions.find(sidHash);
  if (!session || !isSessionValid(session, now)) throw new AuthError('UNAUTHENTICATED');

  const user = await deps.users.findById(session.userId);
  const revoke = async (reason: 'user_disabled' | 'password_changed') => {
    try { await deps.sessions.revoke(sidHash, reason, now); } catch { deps.log('housekeeping_failed', { task: 'revoke' }); }
  };
  if (!user || user.status !== 1 || user.roleStatus !== 1 || user.companyStatus !== 1) { await revoke('user_disabled'); throw new AuthError('UNAUTHENTICATED'); }
  if (passwordFingerprint(user.passwordHash) !== session.pwf) { await revoke('password_changed'); throw new AuthError('UNAUTHENTICATED'); }

  const chooser = canChooseBranch(user.roleId);
  if (!chooser && session.companyId !== user.companyId) throw new AuthError('UNAUTHENTICATED');   // role > 2 is fixed to its branch
  if (chooser && session.companyId !== user.companyId) {
    if (!(await deps.companies.findActive(session.companyId))) throw new AuthError('UNAUTHENTICATED');   // chosen branch got disabled
  }

  if (now.getTime() - session.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS) {
    try { await deps.sessions.touch(sidHash, now, slidIdleDeadline(now), new Date(now.getTime() - TOUCH_INTERVAL_MS)); }
    catch { deps.log('housekeeping_failed', { task: 'touch' }); }
  }

  const roleId = user.roleId;
  return {
    sidHash, userId: user.id, userName: user.fullName, roleId, companyId: session.companyId, homeCompanyId: user.companyId,
    canSwitchBranch: chooser,
    hasPermission: (slug) => deps.permissions.has(roleId, slug),   // no user-id bypass (S2-5); a DB failure throws -> 503
  };
}

/** Permission gate: a database failure surfaces as an error (503) and is never read as "allowed". */
export async function requirePermission(context: AuthContext, slug: string): Promise<void> {
  if (!(await context.hasPermission(slug))) throw new AuthError('FORBIDDEN');
}
