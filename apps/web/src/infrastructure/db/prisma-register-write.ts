import { PosError } from '@koperasi/domain/pos/sale';
import { PrismaClient } from '@prisma/client';
import { validatePosWriteConfig } from './prisma-pos-write.ts';

export function validateRegisterWriteConfig(env: Record<string, string | undefined> = process.env): string {
  const url = validatePosWriteConfig({ ...env, DATABASE_URL_WRITE: env.DATABASE_URL_REGISTER_WRITE });
  if (env.DATABASE_URL_WRITE) {
    try {
      if (decodeURIComponent(new URL(env.DATABASE_URL_WRITE).username) === decodeURIComponent(new URL(url).username)) throw new PosError('WRITE_NOT_CONFIGURED');
    } catch { throw new PosError('WRITE_NOT_CONFIGURED'); }
  }
  return url;
}
export function registerOpeningAvailable(): boolean {
  try { validateRegisterWriteConfig(); return true; } catch { return false; }
}
const holder = globalThis as typeof globalThis & { kkisiRegisterWrite?: PrismaClient };
export function registerWritePrisma(): PrismaClient {
  const url = validateRegisterWriteConfig();
  return holder.kkisiRegisterWrite ??= new PrismaClient({ datasources: { db: { url } } });
}
