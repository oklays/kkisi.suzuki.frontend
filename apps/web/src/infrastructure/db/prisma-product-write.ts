import { PrismaClient } from '@prisma/client';
import { ProductEditError } from '@koperasi/domain/inventory';
import { validatePosWriteConfig } from './prisma-pos-write.ts';
import { isProduction } from './deployment-guard.ts';
export function validateProductWriteConfig(env: Record<string,string|undefined> = process.env): string {
  try {
    const url = validatePosWriteConfig({ ...env, POS_WRITES_ENABLED: env.PRODUCTS_WRITES_ENABLED, DATABASE_URL_WRITE: env.DATABASE_URL_PRODUCT_WRITE });
    const target = new URL(url), user = decodeURIComponent(target.username);
    // Local: pinned to the replicated Docker copy. Production: the allowlist already enforced by validatePosWriteConfig.
    if (!isProduction(env) && (target.port !== '3307' || target.pathname !== '/kkisi_staging')) throw new Error();
    for (const other of [env.DATABASE_URL_WRITE,env.DATABASE_URL_REGISTER_WRITE,env.DATABASE_URL_INVENTORY_WRITE,env.DATABASE_URL_AUTH]) {
      if (other && decodeURIComponent(new URL(other).username) === user) throw new Error();
    }
    return url;
  } catch { throw new ProductEditError('WRITE_NOT_CONFIGURED'); }
}
export function productWritesAvailable(): boolean { try { validateProductWriteConfig(); return true; } catch { return false; } }
const holder = globalThis as typeof globalThis & { kkisiProductWrite?: PrismaClient };
export function productWritePrisma(): PrismaClient {
  const url = validateProductWriteConfig();
  return holder.kkisiProductWrite ??= new PrismaClient({ datasources: { db: { url } } });
}
