import { posWritePrisma, validatePosWriteConfig } from '../db/prisma-pos-write.ts';
import { prisma } from '../db/prisma.ts';
import { PrismaPosRepository } from '../repositories/prisma-pos.repository.ts';

export function checkoutAvailable(): boolean {
  try { validatePosWriteConfig(); return true; } catch { return false; }
}
export function checkoutRepository(): PrismaPosRepository {
  return new PrismaPosRepository(prisma, posWritePrisma());
}
