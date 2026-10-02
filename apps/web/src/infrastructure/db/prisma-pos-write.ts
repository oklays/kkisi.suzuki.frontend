import { PrismaClient } from '@prisma/client';
import { PosError } from '@koperasi/domain/pos/sale';

/** Local staging only. This does not open section 6.17's non-local DEV/production gates. */
export function validatePosWriteConfig(env: Record<string, string | undefined> = process.env): string {
  const fail = (): never => { throw new PosError('WRITE_NOT_CONFIGURED'); };
  if (env.POS_WRITES_ENABLED !== '1' || !env.POS_WRITE_DATABASE || !/^kkisi_[a-z0-9_]*staging[a-z0-9_]*$/.test(env.POS_WRITE_DATABASE)) return fail();
  let read: URL; let write: URL;
  try { read = new URL(env.DATABASE_URL ?? ''); write = new URL(env.DATABASE_URL_WRITE ?? ''); } catch { return fail(); }
  const local = ['127.0.0.1', 'localhost'];
  if (write.protocol !== 'mysql:' || read.protocol !== 'mysql:' || !local.includes(write.hostname) || !local.includes(read.hostname)) return fail();
  if (write.hostname !== read.hostname || write.port !== read.port || write.pathname !== read.pathname || write.pathname !== `/${env.POS_WRITE_DATABASE}`) return fail();
  let readUser: string; let writeUser: string;
  try { readUser = decodeURIComponent(read.username); writeUser = decodeURIComponent(write.username); } catch { return fail(); }
  if (!writeUser || !write.password || ['root', readUser].includes(writeUser)) return fail();
  return write.href;
}
const holder = globalThis as typeof globalThis & { kkisiPosWrite?: PrismaClient };
export function posWritePrisma(): PrismaClient {
  const url = validatePosWriteConfig();
  return holder.kkisiPosWrite ??= new PrismaClient({ datasources: { db: { url } } });
}
