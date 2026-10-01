import type { AuthDeps, OpenRegister } from '../../auth/ports.ts';
import type { AuthContext } from '../../auth/validate-session.usecase.ts';

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
