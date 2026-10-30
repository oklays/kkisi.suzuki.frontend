import { Prisma, type PrismaClient } from '@prisma/client';
import { ConsoleError } from '@koperasi/domain/console/identity-link';
import type { GrantStatus } from '@koperasi/domain/console/kosipa-grants';
import type { KosipaGrant, KosipaGrantStore } from '@koperasi/application/console/kosipa-grants';

type GrantRow = {
  id: bigint | number; console_user_id: number; capability: string; status: GrantStatus; requested_by: number; requested_at: Date; grant_reason: string;
  expires_at: Date; decided_by: number | null; decided_at: Date | null; revoked_by: number | null; revoked_at: Date | null;
};
const toGrant = (r: GrantRow): KosipaGrant => ({
  id: Number(r.id), consoleUserId: Number(r.console_user_id), capability: r.capability, status: r.status, requestedBy: Number(r.requested_by), requestedAt: r.requested_at,
  reason: r.grant_reason, expiresAt: r.expires_at, decidedBy: r.decided_by === null ? null : Number(r.decided_by), decidedAt: r.decided_at,
  revokedBy: r.revoked_by === null ? null : Number(r.revoked_by), revokedAt: r.revoked_at,
});
const columns = Prisma.sql`id, console_user_id, capability, status, requested_by, requested_at, grant_reason, expires_at, decided_by, decided_at, revoked_by, revoked_at`;
const dbErrno = (e: unknown): string | null => { const m = /\b(1062|4025|1644)\b/.exec(String((e as { message?: string })?.message ?? '')); return m ? m[1] : null; };

/**
 * console_kosipa_grant (db/console/004_kosipa_grants.sql). The console account may INSERT/SELECT and UPDATE the decision and revocation columns
 * only; triggers enforce the allowed transitions; CHECKs forbid self-requests and an approval by the requester or the beneficiary.
 */
export class PrismaKosipaGrantStore implements KosipaGrantStore {
  private readonly db: PrismaClient;
  constructor(db: PrismaClient) { this.db = db; }

  async activeCapabilities(consoleUserId: number): Promise<string[]> {
    const rows = await this.db.$queryRaw<{ capability: string }[]>`SELECT capability FROM console_kosipa_grant WHERE console_user_id = ${consoleUserId} AND status = 'active' LIMIT 64`;
    return rows.map((r) => r.capability);
  }
  async find(id: number) { const [r] = await this.db.$queryRaw<GrantRow[]>`SELECT ${columns} FROM console_kosipa_grant WHERE id = ${id}`; return r ? toGrant(r) : null; }
  async openFor(consoleUserId: number, capability: string, now: Date) {
    await this.db.$executeRaw`UPDATE console_kosipa_grant SET status = 'expired' WHERE console_user_id = ${consoleUserId} AND capability = ${capability} AND status = 'pending' AND expires_at <= ${now}`;
    const [r] = await this.db.$queryRaw<GrantRow[]>`SELECT ${columns} FROM console_kosipa_grant
      WHERE console_user_id = ${consoleUserId} AND capability = ${capability} AND status IN ('pending','active') LIMIT 1`;
    return r ? toGrant(r) : null;
  }
  async listOpen() { return (await this.db.$queryRaw<GrantRow[]>`SELECT ${columns} FROM console_kosipa_grant WHERE status IN ('pending','active') ORDER BY requested_at DESC LIMIT 500`).map(toGrant); }

  async request(r: { consoleUserId: number; capability: string; requestedBy: number; requestedAt: Date; expiresAt: Date; reason: string }): Promise<number> {
    try {
      return await this.db.$transaction(async (tx) => {
        await tx.$executeRaw`INSERT INTO console_kosipa_grant (console_user_id, capability, status, requested_by, requested_at, grant_reason, expires_at)
          VALUES (${r.consoleUserId}, ${r.capability}, 'pending', ${r.requestedBy}, ${r.requestedAt}, ${r.reason}, ${r.expiresAt})`;
        const [row] = await tx.$queryRaw<{ id: bigint }[]>`SELECT LAST_INSERT_ID() AS id`;
        return Number(row.id);
      });
    } catch (e) {
      const errno = dbErrno(e);
      if (errno === '1062') throw new ConsoleError('ALREADY_GRANTED');   // concurrent duplicate caught by the open-key unique index
      if (errno === '4025') throw new ConsoleError('SELF_GRANT');        // CHECK ck_grant_not_self
      throw e;
    }
  }

  /** The WHERE clause repeats every decision rule, so a concurrent or replayed decision affects 0 rows; the CHECK/trigger stop the rest. */
  async decide(id: number, to: 'active' | 'rejected', by: number, at: Date, note: string | null): Promise<boolean> {
    try {
      const n = to === 'active'
        ? await this.db.$executeRaw`UPDATE console_kosipa_grant SET status = 'active', decided_by = ${by}, decided_at = ${at}
            WHERE id = ${id} AND status = 'pending' AND expires_at > ${at} AND requested_by <> ${by} AND console_user_id <> ${by}`
        : await this.db.$executeRaw`UPDATE console_kosipa_grant SET status = 'rejected', decided_by = ${by}, decided_at = ${at}, decision_note = ${note}
            WHERE id = ${id} AND status = 'pending' AND console_user_id <> ${by}`;
      return n === 1;
    } catch (e) {
      if (['4025', '1644'].includes(dbErrno(e) ?? '')) return false;
      throw e;
    }
  }

  async revoke(id: number, by: number, at: Date, reason: string): Promise<boolean> {
    return (await this.db.$executeRaw`UPDATE console_kosipa_grant SET status = 'revoked', revoked_by = ${by}, revoked_at = ${at}, revoke_reason = ${reason}
      WHERE id = ${id} AND status = 'active'`) === 1;
  }
}
