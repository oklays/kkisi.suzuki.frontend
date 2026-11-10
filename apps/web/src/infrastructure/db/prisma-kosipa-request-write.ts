import { PrismaClient } from '@prisma/client';
import { validateKosipaLedgerDatabase, validateKosipaWriterConfig } from './prisma-kosipa-master-write.ts';

/**
 * KOSIPA member-request writer (P1: PWA intake, mobile loan request rejection, deduction-change decisions): its own account (local kosipa_request_w,
 * grants db/kosipa/009_request_writer_grants.sql.tpl), never shared with any other account. Same boundary as the other KOSIPA writers: the synthetic
 * stack, or the owner-approved local copy of production when KOSIPA_LOCAL_STAGING_WRITES is exactly "true"; never production (the shared guard
 * refuses it whatever the flags say). KOSIPA_REQUEST_WRITES_ENABLED gates the account; the features are gated by their own flags (kosipa-ownership.ts).
 */
export function validateKosipaRequestWriteConfig(env: Record<string, string | undefined> = process.env): string {
  return validateKosipaWriterConfig(env, 'KOSIPA_REQUEST_WRITES_ENABLED', 'DATABASE_URL_KOSIPA_REQUEST_WRITE');
}
export function validateKosipaRequestLedgerDatabase(env: Record<string, string | undefined> = process.env): string {
  return validateKosipaLedgerDatabase(env, validateKosipaRequestWriteConfig(env));
}
export function kosipaRequestWritesAvailable(env: Record<string, string | undefined> = process.env): boolean {
  try { validateKosipaRequestLedgerDatabase(env); return true; } catch { return false; }
}
const holder = globalThis as typeof globalThis & { kkisiKosipaRequestWrite?: PrismaClient };
export function kosipaRequestWritePrisma(): PrismaClient {
  const url = validateKosipaRequestWriteConfig();
  return holder.kkisiKosipaRequestWrite ??= new PrismaClient({ datasources: { db: { url } } });
}
