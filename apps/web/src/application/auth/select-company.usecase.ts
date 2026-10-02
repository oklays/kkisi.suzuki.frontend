import { AuthError } from '../../domain/auth/errors.ts';
import type { AuthDeps, Company } from './ports.ts';
import type { AuthContext } from './validate-session.usecase.ts';

/**
 * Role <= 2 may choose a branch (S2-6); role > 2 never. The target must be an active branch, and a user with an
 * open cash register in a branch OTHER than the target may not switch (close it first).
 */
export async function selectCompany(deps: AuthDeps, context: AuthContext, targetCompanyId: number): Promise<Company> {
  if (!context.canSwitchBranch) throw new AuthError('FORBIDDEN');
  if (!Number.isSafeInteger(targetCompanyId) || targetCompanyId < 1) throw new AuthError('BAD_REQUEST');
  const company = await deps.companies.findActive(targetCompanyId);
  if (!company) throw new AuthError('BAD_REQUEST');
  if (targetCompanyId === context.companyId) return company;
  if (await deps.registers.hasOpenOutside(context.userId, targetCompanyId)) throw new AuthError('FORBIDDEN');
  if (!(await deps.sessions.setCompany(context.sidHash, targetCompanyId))) throw new AuthError('UNAUTHENTICATED');
  return company;
}
