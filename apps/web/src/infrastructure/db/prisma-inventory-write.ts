import { PrismaClient } from '@prisma/client';
import { InventoryError } from '@koperasi/domain/inventory';
import { validatePosWriteConfig } from './prisma-pos-write.ts';

export function validateInventoryWriteConfig(env: Record<string, string | undefined> = process.env): string {
  try {
    const url = validatePosWriteConfig({ ...env, POS_WRITES_ENABLED: env.INVENTORY_WRITES_ENABLED, DATABASE_URL_WRITE: env.DATABASE_URL_INVENTORY_WRITE });
    const user = decodeURIComponent(new URL(url).username);
    for (const other of [env.DATABASE_URL_WRITE, env.DATABASE_URL_REGISTER_WRITE]) {
      if (other && decodeURIComponent(new URL(other).username) === user) throw new InventoryError('WRITE_NOT_CONFIGURED');
    }
    return url;
  } catch { throw new InventoryError('WRITE_NOT_CONFIGURED'); }
}
export function inventoryWritesAvailable(): boolean {
  try { validateInventoryWriteConfig(); return true; } catch { return false; }
}
const holder = globalThis as typeof globalThis & { kkisiInventoryWrite?: PrismaClient };
export function inventoryWritePrisma(): PrismaClient {
  const url = validateInventoryWriteConfig();
  return holder.kkisiInventoryWrite ??= new PrismaClient({ datasources: { db: { url } } });
}
