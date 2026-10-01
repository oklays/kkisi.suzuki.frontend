// Read-only summary of the auth store (counts only; no usernames, IPs or hashes). Alarm reference: 50,000 warn / 100,000 alarm.
import { authPrisma } from '../src/infrastructure/db/prisma-auth.ts';

const n = (v: unknown): number => Number(v ?? 0);

async function main() {
  const db = authPrisma();
  const [s] = await db.$queryRaw<{ total: bigint; valid: bigint; revoked: bigint; oldest_purge: Date | null }[]>`SELECT COUNT(*) AS total,
      SUM(revoked_at IS NULL AND idle_expires_at > UTC_TIMESTAMP() AND abs_expires_at > UTC_TIMESTAMP()) AS valid,
      SUM(revoked_at IS NOT NULL) AS revoked, MIN(purge_after) AS oldest_purge FROM kkisi_auth_staging.auth_session`;
  const kinds = await db.$queryRaw<{ kind: string; c: bigint; locked: bigint }[]>`SELECT kind, COUNT(*) AS c, SUM(locked_until > UTC_TIMESTAMP()) AS locked
      FROM kkisi_auth_staging.auth_throttle GROUP BY kind ORDER BY kind`;
  const top = await db.$queryRaw<{ user_id: number; c: bigint }[]>`SELECT user_id, COUNT(*) AS c FROM kkisi_auth_staging.auth_session GROUP BY user_id ORDER BY c DESC LIMIT 5`;
  const rows = n(s.total);
  console.log(JSON.stringify({
    sessions: { rows, valid: n(s.valid), revoked: n(s.revoked), oldestPurgeAfter: s.oldest_purge },
    throttle: kinds.map((k) => ({ kind: k.kind, rows: n(k.c), locked: n(k.locked) })),
    topUsersByRows: top.map((t) => ({ userId: t.user_id, rows: n(t.c) })),
    level: rows >= 100_000 ? 'ALARM' : rows >= 50_000 ? 'WARN' : 'ok',
  }, null, 2));
  await db.$disconnect();
}

main().catch(() => { console.error('status failed (see configuration and database availability)'); process.exitCode = 1; });
