import { PrismaClient } from '@prisma/client';
import { validateKosipaLedgerDatabase, validateKosipaWriterConfig } from './prisma-kosipa-master-write.ts';

/**
 * KOSIPA savings writer (FA-03C T07): its own account (local kosipa_savings_w, grants db/kosipa/007_savings_writer_grants.sql.tpl), never shared with
 * any other account. Same boundary as the other KOSIPA writers: the synthetic stack, or the owner-approved local copy of production when
 * KOSIPA_LOCAL_STAGING_WRITES is exactly "true"; never production (the shared guard refuses it whatever the flags say).
 */
export function validateKosipaSavingsWriteConfig(env: Record<string, string | undefined> = process.env): string {
  return validateKosipaWriterConfig(env, 'KOSIPA_SAVINGS_WRITES_ENABLED', 'DATABASE_URL_KOSIPA_SAVINGS_WRITE');
}
export function validateKosipaSavingsLedgerDatabase(env: Record<string, string | undefined> = process.env): string {
  return validateKosipaLedgerDatabase(env, validateKosipaSavingsWriteConfig(env));
}
export function kosipaSavingsWritesAvailable(env: Record<string, string | undefined> = process.env): boolean {
  try { validateKosipaSavingsLedgerDatabase(env); return true; } catch { return false; }
}
const holder = globalThis as typeof globalThis & { kkisiKosipaSavingsWrite?: PrismaClient };
export function kosipaSavingsWritePrisma(): PrismaClient {
  const url = validateKosipaSavingsWriteConfig();
  return holder.kkisiKosipaSavingsWrite ??= new PrismaClient({ datasources: { db: { url } } });
}
