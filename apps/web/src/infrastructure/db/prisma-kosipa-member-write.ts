import { PrismaClient } from '@prisma/client';
import { KosipaError } from '@koperasi/domain/kosipa';
import { validateKosipaLedgerDatabase, validateKosipaWriterConfig } from './prisma-kosipa-master-write.ts';

/**
 * KOSIPA member writer (FA-03B T04, TASK-115 / SEC-107): its own account (local kosipa_member_w, grants in db/kosipa/006_member_writer_grants.sql.tpl),
 * never the master writer, reader, auth/console store or a TOKO writer. Same FA-01 boundary as the master writer: the ONLY reachable database is
 * the isolated synthetic KOSIPA database on the FA-01 container (loopback, port 3322, kkisi_kfa_synthetic). Production enablement is a later,
 * owner-approved cutover step (11, gates 1-8) and needs this guard extended deliberately.
 */
export function validateKosipaMemberWriteConfig(env: Record<string, string | undefined> = process.env): string {
  return validateKosipaWriterConfig(env, 'KOSIPA_MEMBER_WRITES_ENABLED', 'DATABASE_URL_KOSIPA_MEMBER_WRITE');
}

export function validateKosipaMemberLedgerDatabase(env: Record<string, string | undefined> = process.env): string {
  return validateKosipaLedgerDatabase(env, validateKosipaMemberWriteConfig(env));
}

/** Server-only HMAC key for opaque member versions (a client that cannot read a row cannot forge its version). */
export function validateKosipaMemberVersionSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.KOSIPA_MEMBER_VERSION_SECRET ?? '';
  if (secret.length < 32) throw new KosipaError('WRITE_NOT_CONFIGURED');
  return secret;
}

export function kosipaMemberWritesAvailable(env: Record<string, string | undefined> = process.env): boolean {
  try { validateKosipaMemberLedgerDatabase(env); validateKosipaMemberVersionSecret(env); return true; } catch { return false; }
}

const holder = globalThis as typeof globalThis & { kkisiKosipaMemberWrite?: PrismaClient };
export function kosipaMemberWritePrisma(): PrismaClient {
  const url = validateKosipaMemberWriteConfig();
  return holder.kkisiKosipaMemberWrite ??= new PrismaClient({ datasources: { db: { url } } });
}
