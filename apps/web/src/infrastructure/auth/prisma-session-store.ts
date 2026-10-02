import { Prisma, type PrismaClient } from '@prisma/client';
import { MAX_ACTIVE_SESSIONS, MAX_ROWS_PER_USER, type RevokeReason, type StoredSession } from '../../domain/auth/session.ts';
import type { NewSession, SessionStore } from '../../application/auth/ports.ts';
import { withStoreRetry, type StoreLog } from './store-errors.ts';

type Row = {
  user_id: number | bigint; company_id: number | bigint; pwf: string; created_at: Date; last_seen_at: Date;
  idle_expires_at: Date; abs_expires_at: Date; revoked_at: Date | null; revoked_reason: RevokeReason | null;
};

const WARN_ROWS = 50_000;
const ALARM_ROWS = 100_000;
const GROWTH_CHECK_MS = 10 * 60 * 1000;
const ALARM_REPEAT_MS = 60 * 60 * 1000;

/** Writes only through the `kkisi_auth` account: kkisi_auth_staging.auth_session. Raw, parameterised SQL. */
export class PrismaSessionStore implements SessionStore {
  private readonly db: PrismaClient;
  private readonly log: StoreLog;
  private lastGrowthCheck = 0;
  private lastAlarm = 0;

  constructor(db: PrismaClient, log: StoreLog) { this.db = db; this.log = log; }

  create(s: NewSession): Promise<void> {
    return withStoreRetry(this.log, 'session_create', async () => {
      await this.db.$transaction(async (tx) => {
        // Serialise logins of one user (avoids the deadlocks measured without it), then insert.
        await tx.$queryRaw`SELECT sid_hash FROM kkisi_auth_staging.auth_session WHERE user_id = ${s.userId} FOR UPDATE`;
        await tx.$executeRaw`INSERT INTO kkisi_auth_staging.auth_session
          (sid_hash, user_id, company_id, pwf, created_at, last_seen_at, idle_expires_at, abs_expires_at, purge_after)
          VALUES (${s.sidHash}, ${s.userId}, ${s.companyId}, UNHEX(${s.pwf}), ${s.now}, ${s.now}, ${s.idleExpiresAt}, ${s.absExpiresAt}, ${s.purgeAfter})`;
        // valid = un-revoked, not idle-expired, not absolute-expired. Keep the 5 most recently ACTIVE valid sessions.
        await tx.$executeRaw`UPDATE kkisi_auth_staging.auth_session SET revoked_at = ${s.now}, revoked_reason = 'superseded'
          WHERE user_id = ${s.userId} AND revoked_at IS NULL AND idle_expires_at > ${s.now} AND abs_expires_at > ${s.now}
            AND sid_hash NOT IN (SELECT sid_hash FROM (
              SELECT sid_hash FROM kkisi_auth_staging.auth_session
               WHERE user_id = ${s.userId} AND revoked_at IS NULL AND idle_expires_at > ${s.now} AND abs_expires_at > ${s.now}
               ORDER BY last_seen_at DESC, created_at DESC LIMIT ${MAX_ACTIVE_SESSIONS}) keep)`;
        // Row cap per user: trim ONLY dead rows (revoked or expired); a still-valid session is never deleted here.
        await tx.$executeRaw`DELETE FROM kkisi_auth_staging.auth_session
          WHERE user_id = ${s.userId} AND (revoked_at IS NOT NULL OR idle_expires_at <= ${s.now} OR abs_expires_at <= ${s.now})
            AND sid_hash NOT IN (SELECT sid_hash FROM (
              SELECT sid_hash FROM kkisi_auth_staging.auth_session WHERE user_id = ${s.userId}
               ORDER BY (revoked_at IS NULL AND idle_expires_at > ${s.now} AND abs_expires_at > ${s.now}) DESC, created_at DESC
               LIMIT ${MAX_ROWS_PER_USER}) keep)`;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 10000 });
    });
  }

  find(sidHash: Buffer): Promise<StoredSession | null> {
    return withStoreRetry(this.log, 'session_find', async () => {
      const rows = await this.db.$queryRaw<Row[]>`SELECT user_id, company_id, HEX(pwf) AS pwf, created_at, last_seen_at, idle_expires_at,
          abs_expires_at, revoked_at, revoked_reason FROM kkisi_auth_staging.auth_session WHERE sid_hash = ${sidHash}`;
      const r = rows[0];
      if (!r) return null;
      return {
        sidHash, userId: Number(r.user_id), companyId: Number(r.company_id), pwf: String(r.pwf).toLowerCase(),
        createdAt: r.created_at, lastSeenAt: r.last_seen_at, idleExpiresAt: r.idle_expires_at, absExpiresAt: r.abs_expires_at,
        revokedAt: r.revoked_at, revokedReason: r.revoked_reason,
      };
    });
  }

  touch(sidHash: Buffer, now: Date, idleExpiresAt: Date, olderThan: Date): Promise<boolean> {
    return withStoreRetry(this.log, 'session_touch', async () =>
      Number(await this.db.$executeRaw`UPDATE kkisi_auth_staging.auth_session SET last_seen_at = ${now}, idle_expires_at = ${idleExpiresAt}
        WHERE sid_hash = ${sidHash} AND revoked_at IS NULL AND last_seen_at <= ${olderThan}`) > 0);
  }

  revoke(sidHash: Buffer, reason: RevokeReason, now: Date): Promise<boolean> {
    return withStoreRetry(this.log, 'session_revoke', async () =>
      Number(await this.db.$executeRaw`UPDATE kkisi_auth_staging.auth_session SET revoked_at = ${now}, revoked_reason = ${reason}
        WHERE sid_hash = ${sidHash} AND revoked_at IS NULL`) > 0);
  }

  revokeAllForUser(userId: number, reason: RevokeReason, now: Date): Promise<number> {
    return withStoreRetry(this.log, 'session_revoke_all', async () =>
      Number(await this.db.$executeRaw`UPDATE kkisi_auth_staging.auth_session SET revoked_at = ${now}, revoked_reason = ${reason}
        WHERE user_id = ${userId} AND revoked_at IS NULL`));
  }

  setCompany(sidHash: Buffer, companyId: number): Promise<boolean> {
    return withStoreRetry(this.log, 'session_set_company', async () => {
      await this.db.$executeRaw`UPDATE kkisi_auth_staging.auth_session SET company_id = ${companyId}
        WHERE sid_hash = ${sidHash} AND revoked_at IS NULL`;
      const rows = await this.db.$queryRaw<{ n: number | bigint }[]>`SELECT COUNT(*) AS n FROM kkisi_auth_staging.auth_session
        WHERE sid_hash = ${sidHash} AND revoked_at IS NULL AND company_id = ${companyId}`;
      return Number(rows[0]?.n ?? 0) === 1;    // "unchanged" also reports 0 affected rows, so verify by reading
    });
  }

  async purge(now: Date, limit: number): Promise<number> {
    const n = await withStoreRetry(this.log, 'session_purge', async () =>
      Number(await this.db.$executeRaw`DELETE FROM kkisi_auth_staging.auth_session WHERE purge_after < ${now} LIMIT ${limit}`));
    void this.growthAlarm(now);
    return n;
  }

  /** Alarm-only (6.13.11): never blocks or rejects a login. Estimated rows, at most every 10 minutes, alarm once per hour. */
  private async growthAlarm(now: Date): Promise<void> {
    const t = now.getTime();
    if (t - this.lastGrowthCheck < GROWTH_CHECK_MS) return;
    this.lastGrowthCheck = t;
    try {
      const rows = await this.db.$queryRaw<{ t: string; n: number | bigint | null }[]>`SELECT table_name AS t, table_rows AS n
        FROM information_schema.tables WHERE table_schema = 'kkisi_auth_staging' AND table_name IN ('auth_session', 'auth_throttle')`;
      for (const r of rows) {
        const n = Number(r.n ?? 0);
        if (n >= ALARM_ROWS && t - this.lastAlarm >= ALARM_REPEAT_MS) { this.lastAlarm = t; this.log('ALARM_store_rows', { table: r.t, rows: n }); }
        else if (n >= WARN_ROWS) this.log('warn_store_rows', { table: r.t, rows: n });
      }
    } catch { /* alarm-only */ }
  }
}
