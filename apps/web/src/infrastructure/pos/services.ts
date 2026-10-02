import { posWritePrisma, validatePosWriteConfig } from '../db/prisma-pos-write.ts';
import { prisma } from '../db/prisma.ts';
import { PrismaPosRepository } from '../repositories/prisma-pos.repository.ts';

export function checkoutAvailable(): boolean {
  try { validatePosWriteConfig(); return true; } catch { return false; }
}
export function checkoutRepository(): PrismaPosRepository {
  return new PrismaPosRepository(prisma, posWritePrisma());
}

export { registerOpeningAvailable } from '../db/prisma-register-write.ts';
export function ownedOpenRegisters(userId: number, companyId: number): Promise<{ id: number; noref: string }[]> {
  return prisma.$queryRaw`SELECT id,noref FROM db_buka_kasir WHERE user_id=${userId} AND company_id=${companyId} AND status=1 ORDER BY id`;
}
