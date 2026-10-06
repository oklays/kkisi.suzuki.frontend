import { PrismaClient } from '@prisma/client';
import { PosError } from '@koperasi/domain/pos/sale';
import { validatePosWriteConfig } from './prisma-pos-write.ts';
import { isProduction } from './deployment-guard.ts';

/**
 * Sales return writer: its own account (local kkisi_pos_return, production a dedicated cPanel user) with the exact
 * grant set in scripts/setup-return-write.mjs. It never shares the checkout, register, inventory, product or auth
 * account, so the existing checkout privileges stay unchanged.
 */
export function validateReturnWriteConfig(env: Record<string, string | undefined> = process.env): string {
  try {
    const url = validatePosWriteConfig({ ...env, POS_WRITES_ENABLED: env.SALES_RETURN_WRITES_ENABLED, DATABASE_URL_WRITE: env.DATABASE_URL_RETURN_WRITE });
    const target = new URL(url), user = decodeURIComponent(target.username);
    if (!isProduction(env) && (target.port !== '3307' || target.pathname !== '/kkisi_staging')) throw new Error();
    for (const other of [env.DATABASE_URL_WRITE, env.DATABASE_URL_REGISTER_WRITE, env.DATABASE_URL_INVENTORY_WRITE, env.DATABASE_URL_PRODUCT_WRITE, env.DATABASE_URL_AUTH]) {
      if (other && decodeURIComponent(new URL(other).username) === user) throw new Error();
    }
    return url;
  } catch { throw new PosError('WRITE_NOT_CONFIGURED'); }
}
export function returnWritesAvailable(): boolean { try { validateReturnWriteConfig(); return true; } catch { return false; } }
const holder = globalThis as typeof globalThis & { kkisiReturnWrite?: PrismaClient };
export function returnWritePrisma(): PrismaClient {
  const url = validateReturnWriteConfig();
  return holder.kkisiReturnWrite ??= new PrismaClient({ datasources: { db: { url } } });
}
