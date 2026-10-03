import { prisma } from '../db/prisma.ts';
import { inventoryWritePrisma } from '../db/prisma-inventory-write.ts';
import { PrismaInventoryRepository } from '../repositories/prisma-inventory.repository.ts';

export { inventoryWritesAvailable } from '../db/prisma-inventory-write.ts';
export function inventoryRepository(write = false): PrismaInventoryRepository {
  return new PrismaInventoryRepository(prisma, write ? inventoryWritePrisma() : undefined);
}
