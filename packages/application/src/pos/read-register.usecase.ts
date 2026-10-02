import type { AuthDeps, OpenRegister } from '@koperasi/application/auth/ports';
import type { AuthContext } from '@koperasi/application/auth/validate-session';

export type RegisterView = {
  open: OpenRegister | null;
  warnings: 'MULTIPLE_OPEN'[];
  kasir: { id: number; noKasir: string }[];
};

/** Read-only (2A): the caller's own open register in the session branch, and the branch's cash registers. */
export async function readRegister(deps: AuthDeps, context: AuthContext): Promise<RegisterView> {
  const [{ register, openCount }, kasir] = await Promise.all([
    deps.registers.findOpen(context.userId, context.companyId, deps.clock.now()),
    deps.registers.listKasir(context.companyId),
  ]);
  return { open: register, warnings: openCount > 1 ? ['MULTIPLE_OPEN'] : [], kasir };
}
