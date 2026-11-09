import { PrismaClient } from '@prisma/client';
import { validateKosipaLedgerDatabase, validateKosipaWriterConfig } from './prisma-kosipa-master-write.ts';

/**
 * KOSIPA loan writer (FA-04 loan decision): its own account (local kosipa_loan_w, grants db/kosipa/008_loan_writer_grants.sql.tpl), never shared with
 * any other account. Same boundary as the other KOSIPA writers: the synthetic stack, or the owner-approved local copy of production when
 * KOSIPA_LOCAL_STAGING_WRITES is exactly "true"; never production (the shared guard refuses it whatever the flags say).
 */
export function validateKosipaLoanWriteConfig(env: Record<string, string | undefined> = process.env): string {
  return validateKosipaWriterConfig(env, 'KOSIPA_LOAN_WRITES_ENABLED', 'DATABASE_URL_KOSIPA_LOAN_WRITE');
}
export function validateKosipaLoanLedgerDatabase(env: Record<string, string | undefined> = process.env): string {
  return validateKosipaLedgerDatabase(env, validateKosipaLoanWriteConfig(env));
}
export function kosipaLoanWritesAvailable(env: Record<string, string | undefined> = process.env): boolean {
  try { validateKosipaLoanLedgerDatabase(env); return true; } catch { return false; }
}
const holder = globalThis as typeof globalThis & { kkisiKosipaLoanWrite?: PrismaClient };
export function kosipaLoanWritePrisma(): PrismaClient {
  const url = validateKosipaLoanWriteConfig();
  return holder.kkisiKosipaLoanWrite ??= new PrismaClient({ datasources: { db: { url } } });
}
