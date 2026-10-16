import { Prisma, type PrismaClient } from '@prisma/client';
import { ConsoleError } from '@koperasi/domain/console/identity-link';
import type { AuditEvent, AuditLog, IdentityLink, IdentityLinkStore } from '@koperasi/application/console/identity-links';

type LinkRow = { id: bigint | number; console_user_id: number; external_user_id: number; status: 'active' | 'revoked'; linked_by: number; linked_at: Date; revoked_by: number | null; revoked_at: Date | null };
const toLink = (r: LinkRow): IdentityLink => ({ id: Number(r.id), consoleUserId: Number(r.console_user_id), externalUserId: Number(r.external_user_id), status: r.status, linkedBy: Number(r.linked_by), linkedAt: r.linked_at, revokedBy: r.revoked_by === null ? null : Number(r.revoked_by), revokedAt: r.revoked_at });
/** MariaDB error number inside a Prisma raw-query error (P2010), without exposing the message. */
const dbErrno = (e: unknown): string | null => { const m = /\b(1062|4025|1644)\b/.exec(String((e as { message?: string })?.message ?? '')); return m ? m[1] : null; };

/** kkisi_console store. The account can INSERT/SELECT and UPDATE only the revocation columns; triggers forbid the rest. */
export class PrismaIdentityLinkStore implements IdentityLinkStore {
  private readonly db: PrismaClient;
  constructor(db: PrismaClient) { this.db = db; }
  private async one(filter: Prisma.Sql): Promise<IdentityLink | null> {
    const rows = await this.db.$queryRaw<LinkRow[]>`SELECT id, console_user_id, external_user_id, status, linked_by, linked_at, revoked_by, revoked_at
      FROM console_identity_link WHERE system = 'kosipa' AND ${filter} ORDER BY id DESC LIMIT 1`;
    return rows[0] ? toLink(rows[0]) : null;
  }
  activeForConsoleUser(id: number) { return this.one(Prisma.sql`console_user_id = ${id} AND status = 'active'`); }
  activeForKosipaUser(id: number) { return this.one(Prisma.sql`external_user_id = ${id} AND status = 'active'`); }
  find(id: number) { return this.one(Prisma.sql`id = ${id}`); }
  async listActive(): Promise<IdentityLink[]> {
    return (await this.db.$queryRaw<LinkRow[]>`SELECT id, console_user_id, external_user_id, status, linked_by, linked_at, revoked_by, revoked_at
      FROM console_identity_link WHERE system = 'kosipa' AND status = 'active' ORDER BY linked_at DESC LIMIT 500`).map(toLink);
  }
  async create(l: { consoleUserId: number; externalUserId: number; linkedBy: number; linkedAt: Date }): Promise<number> {
    try {
      return await this.db.$transaction(async (tx) => {
        await tx.$executeRaw`INSERT INTO console_identity_link (console_user_id, system, external_user_id, status, linked_by, linked_at)
          VALUES (${l.consoleUserId}, 'kosipa', ${l.externalUserId}, 'active', ${l.linkedBy}, ${l.linkedAt})`;
        const [row] = await tx.$queryRaw<{ id: bigint }[]>`SELECT LAST_INSERT_ID() AS id`;
        return Number(row.id);
      });
    } catch (e) {
      const errno = dbErrno(e);
      if (errno === '1062') throw new ConsoleError('ALREADY_LINKED');   // concurrent duplicate caught by the unique keys
      if (errno === '4025') throw new ConsoleError('SELF_LINK');        // CHECK ck_link_not_self
      throw e;
    }
  }
  async revoke(id: number, by: number, at: Date, reason: string): Promise<boolean> {
    const n = await this.db.$executeRaw`UPDATE console_identity_link SET status = 'revoked', revoked_by = ${by}, revoked_at = ${at}, revoke_reason = ${reason}
      WHERE id = ${id} AND status = 'active'`;
    return n === 1;
  }
}

export class PrismaAuditLog implements AuditLog {
  private readonly db: PrismaClient;
  constructor(db: PrismaClient) { this.db = db; }
  async append(e: AuditEvent & { occurredAt: Date }): Promise<void> {
    const detail = e.detail && Object.keys(e.detail).length ? JSON.stringify(e.detail) : null;
    await this.db.$executeRaw`INSERT INTO console_audit_event (occurred_at, actor_user_id, action, subject_type, subject_id, outcome, request_id, detail)
      VALUES (${e.occurredAt}, ${e.actorUserId}, ${e.action}, ${e.subjectType}, ${e.subjectId.slice(0, 64)}, ${e.outcome}, ${e.requestId.slice(0, 40)}, ${detail})`;
  }
}
