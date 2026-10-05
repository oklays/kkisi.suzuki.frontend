import { authPrisma } from '../db/prisma-auth.ts';

export type AuthStoreStatus = { database: string | null; tables: number; serverHostname: string; serverPort: string; grants: string[] };

/**
 * Lightweight, read-only auth-store probe: selected database, server identity, presence of the two auth tables and the
 * account's own grants (normalized, without quoting). No writes.
 */
export async function authStoreStatus(): Promise<AuthStoreStatus> {
  const db = authPrisma();
  const rows = await db.$queryRaw<{ db: string | null; n: number | bigint; h: string; p: number | bigint }[]>`SELECT DATABASE() AS db,
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('auth_session', 'auth_throttle')) AS n,
    @@hostname AS h, @@port AS p`;
  const grants = (await db.$queryRaw<Record<string, string>[]>`SHOW GRANTS`).map((row) => String(Object.values(row)[0] ?? '').replace(/[`\\]/g, ''));
  return { database: rows[0]?.db ?? null, tables: Number(rows[0]?.n ?? 0), serverHostname: String(rows[0]?.h ?? '').toLowerCase(), serverPort: String(rows[0]?.p ?? ''), grants };
}

export async function pingAuthStore(): Promise<void> {
  await authPrisma().$queryRaw`SELECT 1`;
}
