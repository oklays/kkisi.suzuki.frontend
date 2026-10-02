import type { ThrottleKey } from '@koperasi/application/auth/ports';
import { Prisma, type PrismaClient } from '@prisma/client';
import { LOCK_CLOCK_SLACK_MS, LOCK_MS, type ThrottleKind } from '@koperasi/domain/auth/throttle-policy';
import type { FailureRecord, ThrottleStore } from '@koperasi/application/auth/ports';
import { withStoreRetry, type StoreLog } from './store-errors.ts';

/** Dedicated auth connection: auth_throttle. Keys are HMACs: neither usernames nor IPs are readable from the table. */
export class PrismaThrottleStore implements ThrottleStore {
  private readonly db: PrismaClient;
  private readonly log: StoreLog;
  constructor(db: PrismaClient, log: StoreLog) { this.db = db; this.log = log; }

  activeLocks(keys: ThrottleKey[], now: Date): Promise<{ kind: ThrottleKind; lockedUntil: Date }[]> {
    if (keys.length === 0) return Promise.resolve([]);
    return withStoreRetry(this.log, 'throttle_locks', async () => {
      const hashes = keys.map((k) => k.keyHash);
      const rows = await this.db.$queryRaw<{ kind: ThrottleKind; locked_until: Date }[]>(Prisma.sql`SELECT kind, locked_until
        FROM auth_throttle WHERE key_hash IN (${Prisma.join(hashes)}) AND locked_until > ${now}`);
      const cap = new Date(now.getTime() + LOCK_MS + LOCK_CLOCK_SLACK_MS);
      const sane = rows.filter((r) => r.locked_until <= cap);
      if (sane.length !== rows.length) {
        // A lock further away than any lock we can write (clock jump): ignore it and remove it, best effort.
        try { await this.db.$executeRaw(Prisma.sql`DELETE FROM auth_throttle WHERE key_hash IN (${Prisma.join(hashes)}) AND locked_until > ${cap}`); } catch { /* ignore */ }
        this.log('throttle_impossible_lock_ignored');
      }
      return sane.map((r) => ({ kind: r.kind, lockedUntil: r.locked_until }));
    });
  }

  recordFailure(r: FailureRecord): Promise<void> {
    const windowStart = new Date(r.now.getTime() - r.windowMs);
    const lockUntil = new Date(r.now.getTime() + r.lockMs);
    return withStoreRetry(this.log, 'throttle_record', async () => {
      // Two atomic statements (INSERT ... ON DUPLICATE KEY UPDATE needs UPDATE on the key columns, which we do not grant).
      await this.db.$executeRaw`INSERT IGNORE INTO auth_throttle
        (key_hash, kind, failures, first_failure_at, last_failure_at, locked_until, purge_after)
        VALUES (${r.key.keyHash}, ${r.key.kind}, 0, ${r.now}, ${r.now}, NULL, ${r.purgeAfter})`;
      // MariaDB evaluates the assignments left to right: locked_until sees the NEW failures value.
      await this.db.$executeRaw`UPDATE auth_throttle SET
          failures         = IF(first_failure_at < ${windowStart}, 1, failures + 1),
          locked_until     = IF(failures >= ${r.limit}, ${lockUntil}, locked_until),
          first_failure_at = IF(first_failure_at < ${windowStart}, ${r.now}, first_failure_at),
          last_failure_at  = ${r.now},
          purge_after      = ${r.purgeAfter}
        WHERE key_hash = ${r.key.keyHash}`;
    });
  }

  clear(keys: ThrottleKey[]): Promise<void> {
    if (keys.length === 0) return Promise.resolve();
    return withStoreRetry(this.log, 'throttle_clear', async () => {
      await this.db.$executeRaw(Prisma.sql`DELETE FROM auth_throttle WHERE key_hash IN (${Prisma.join(keys.map((k) => k.keyHash))})`);
    });
  }

  purge(now: Date, limit: number): Promise<number> {
    return withStoreRetry(this.log, 'throttle_purge', async () =>
      Number(await this.db.$executeRaw`DELETE FROM auth_throttle WHERE purge_after < ${now} LIMIT ${limit}`));
  }
}
