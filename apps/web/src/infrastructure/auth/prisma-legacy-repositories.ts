import type { PrismaClient } from '@prisma/client';
import type { Company, CompanyRepository, OpenRegister, PermissionRepository, RegisterRepository, UserRecord, UserRepository } from '../../application/auth/ports.ts';
import { withStoreRetry, type StoreLog } from './store-errors.ts';

// Legacy reads only, through the SELECT-only account (DATABASE_URL). No statement here can write: the account cannot.
type UserRow = {
  id: number | bigint; username: string; fullname: string; role_id: number | bigint; company_id: number | bigint; status: number | bigint;
  password: string; role_status: number | bigint | null; company_status: number | bigint | null;
};
const num = (v: number | bigint | null): number | null => (v === null ? null : Number(v));
const toUser = (r: UserRow): UserRecord => ({
  id: Number(r.id), username: r.username, fullName: r.fullname ?? '', roleId: Number(r.role_id), companyId: Number(r.company_id),
  status: Number(r.status), roleStatus: num(r.role_status), companyStatus: num(r.company_status), passwordHash: String(r.password ?? ''),
});

export class PrismaUserRepository implements UserRepository {
  private readonly db: PrismaClient; private readonly log: StoreLog;
  constructor(db: PrismaClient, log: StoreLog) { this.db = db; this.log = log; }

  findByUsername(username: string): Promise<UserRecord | null> {
    return withStoreRetry(this.log, 'user_by_name', async () => {
      const rows = await this.db.$queryRaw<UserRow[]>`SELECT u.id, u.username, u.fullname, u.role_id, u.company_id, u.status, u.password,
          r.status AS role_status, c.status AS company_status
        FROM db_users u LEFT JOIN db_roles r ON r.id = u.role_id LEFT JOIN db_company c ON c.id = u.company_id
        WHERE u.username = ${username} LIMIT 1`;
      return rows[0] ? toUser(rows[0]) : null;
    });
  }

  findById(id: number): Promise<UserRecord | null> {
    return withStoreRetry(this.log, 'user_by_id', async () => {
      const rows = await this.db.$queryRaw<UserRow[]>`SELECT u.id, u.username, u.fullname, u.role_id, u.company_id, u.status, u.password,
          r.status AS role_status, c.status AS company_status
        FROM db_users u LEFT JOIN db_roles r ON r.id = u.role_id LEFT JOIN db_company c ON c.id = u.company_id
        WHERE u.id = ${id} LIMIT 1`;
      return rows[0] ? toUser(rows[0]) : null;
    });
  }
}

export class PrismaPermissionRepository implements PermissionRepository {
  private readonly db: PrismaClient; private readonly log: StoreLog;
  constructor(db: PrismaClient, log: StoreLog) { this.db = db; this.log = log; }
  has(roleId: number, slug: string): Promise<boolean> {
    return withStoreRetry(this.log, 'permission', async () => {
      const rows = await this.db.$queryRaw<{ n: number | bigint }[]>`SELECT COUNT(*) AS n FROM db_permissions WHERE role_id = ${roleId} AND permissions = ${slug}`;
      return Number(rows[0]?.n ?? 0) >= 1;
    });
  }
}

export class PrismaCompanyRepository implements CompanyRepository {
  private readonly db: PrismaClient; private readonly log: StoreLog;
  constructor(db: PrismaClient, log: StoreLog) { this.db = db; this.log = log; }
  findActive(id: number): Promise<Company | null> {
    return withStoreRetry(this.log, 'company', async () => {
      const rows = await this.db.$queryRaw<{ id: number | bigint; company_name: string }[]>`SELECT id, company_name FROM db_company WHERE id = ${id} AND status = 1 LIMIT 1`;
      return rows[0] ? { id: Number(rows[0].id), name: rows[0].company_name } : null;
    });
  }
  listActive(): Promise<Company[]> {
    return withStoreRetry(this.log, 'company_list', async () => {
      const rows = await this.db.$queryRaw<{ id: number | bigint; company_name: string }[]>`SELECT id, company_name FROM db_company WHERE status = 1 ORDER BY id`;
      return rows.map((r) => ({ id: Number(r.id), name: r.company_name }));
    });
  }
}

/** Legacy stores tgl_buka as PHP (Asia/Bangkok) wall-clock time; Prisma returns those digits as if UTC. */
const bangkokDate = (instant: Date): string => new Date(instant.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);

export class PrismaRegisterRepository implements RegisterRepository {
  private readonly db: PrismaClient; private readonly log: StoreLog;
  constructor(db: PrismaClient, log: StoreLog) { this.db = db; this.log = log; }

  findOpen(userId: number, companyId: number, now: Date): Promise<{ register: OpenRegister | null; openCount: number }> {
    return withStoreRetry(this.log, 'register_open', async () => {
      const [rows, count] = await Promise.all([
        this.db.$queryRaw<{ id: number | bigint; noref: string; id_kasir: number | bigint; tgl_buka: Date; no_kasir: string | null }[]>`SELECT b.id, b.noref, b.id_kasir, b.tgl_buka, k.no_kasir
          FROM db_buka_kasir b LEFT JOIN db_kasir k ON k.id = b.id_kasir
          WHERE b.user_id = ${userId} AND b.company_id = ${companyId} AND b.status = 1 ORDER BY b.id DESC LIMIT 1`,
        this.db.$queryRaw<{ n: number | bigint }[]>`SELECT COUNT(*) AS n FROM db_buka_kasir WHERE user_id = ${userId} AND company_id = ${companyId} AND status = 1`,
      ]);
      const r = rows[0];
      const openedOn = r ? r.tgl_buka.toISOString().slice(0, 10) : '';
      return {
        register: r ? { id: Number(r.id), noref: r.noref, idKasir: Number(r.id_kasir), noKasir: r.no_kasir, openedOn, stale: openedOn < bangkokDate(now) } : null,
        openCount: Number(count[0]?.n ?? 0),
      };
    });
  }

  hasOpenOutside(userId: number, companyId: number): Promise<boolean> {
    return withStoreRetry(this.log, 'register_outside', async () => {
      const rows = await this.db.$queryRaw<{ n: number | bigint }[]>`SELECT COUNT(*) AS n FROM db_buka_kasir WHERE user_id = ${userId} AND status = 1 AND company_id IS NOT NULL AND company_id <> ${companyId}`;
      return Number(rows[0]?.n ?? 0) > 0;
    });
  }

  listKasir(companyId: number): Promise<{ id: number; noKasir: string }[]> {
    return withStoreRetry(this.log, 'kasir_list', async () => {
      const rows = await this.db.$queryRaw<{ id: number | bigint; no_kasir: string }[]>`SELECT id, no_kasir FROM db_kasir WHERE company_id = ${companyId} AND status = 1 ORDER BY no_kasir`;
      return rows.map((r) => ({ id: Number(r.id), noKasir: r.no_kasir }));
    });
  }
}
