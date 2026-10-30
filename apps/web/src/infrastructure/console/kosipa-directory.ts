import type { PrismaClient } from '@prisma/client';
import type { ConsoleUserDirectory, KosipaDirectory } from '@koperasi/application/console/identity-links';

// Business-database reads through the existing SELECT-only reader (DATABASE_URL); no new pool. Every statement is
// time-capped so a slow plan on the shared production server cannot hold a connection.
type Num = number | bigint;
const n = (v: Num | null) => Number(v ?? 0);

export class PrismaKosipaDirectory implements KosipaDirectory, ConsoleUserDirectory {
  private readonly db: PrismaClient;
  constructor(db: PrismaClient) { this.db = db; }

  async kosipaUser(id: number) {
    const rows = await this.db.$queryRaw<{ id: Num; username: string | null; name: string | null; status: Num | null; groups: Num }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT u.id_ref_user AS id, u.username, u.nama_lengkap AS name, u.status,
        (SELECT COUNT(*) FROM ref_group_akses ga JOIN ref_group g ON g.id = ga.id_group WHERE ga.id_user = u.id_ref_user AND ga.status = 1 AND g.status = 1) AS \`groups\`
      FROM ref_users u WHERE u.id_ref_user = ${id} LIMIT 1`;
    const r = rows[0];
    return r ? { id: n(r.id), username: r.username ?? '', fullName: r.name ?? '', active: n(r.status) === 1, activeGroups: n(r.groups) } : null;
  }

  /** The controllers this KOSIPA account may open (legacy cekstatushakakses), plus active menu-access rows. */
  async allowedMenuUrls(kosipaUserId: number): Promise<string[]> {
    const rows = await this.db.$queryRaw<{ url: string }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT DISTINCT LOWER(TRIM(m.url)) AS url FROM ref_group_akses ga
        JOIN ref_group g ON g.id = ga.id_group AND g.status = 1
        JOIN ref_menu_akses ma ON ma.id_group = ga.id_group JOIN ref_menu m ON m.id = ma.id_menu
      WHERE ga.id_user = ${kosipaUserId} AND ga.status = 1 AND ma.status = 1 AND m.status = 1 AND m.url IS NOT NULL`;
    return rows.map((r) => r.url);
  }

  /** Same activity rule as validateSession: user, role and home branch active. */
  async consoleUser(id: number) {
    const rows = await this.db.$queryRaw<{ id: Num; ok: Num; role_id: Num | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT u.id, u.role_id, (u.status = 1 AND r.status = 1 AND c.status = 1) AS ok FROM db_users u
        LEFT JOIN db_roles r ON r.id = u.role_id LEFT JOIN db_company c ON c.id = u.company_id WHERE u.id = ${id} LIMIT 1`;
    return rows[0] ? { id: n(rows[0].id), active: n(rows[0].ok) === 1, roleId: rows[0].role_id === null ? undefined : n(rows[0].role_id) } : null;
  }

  async listKosipaUsers(): Promise<{ id: number; username: string; fullName: string; active: boolean }[]> {
    const rows = await this.db.$queryRaw<{ id: Num; username: string | null; name: string | null; status: Num | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT id_ref_user AS id, username, nama_lengkap AS name, status FROM ref_users ORDER BY nama_lengkap LIMIT 500`;
    return rows.map((r) => ({ id: n(r.id), username: r.username ?? '', fullName: r.name ?? '', active: n(r.status) === 1 }));
  }

  async listConsoleUsers(): Promise<{ id: number; username: string; fullName: string; branch: string }[]> {
    const rows = await this.db.$queryRaw<{ id: Num; username: string; name: string | null; branch: string | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT u.id, u.username, u.fullname AS name, c.company_name AS branch FROM db_users u
        JOIN db_roles r ON r.id = u.role_id AND r.status = 1 JOIN db_company c ON c.id = u.company_id AND c.status = 1
      WHERE u.status = 1 ORDER BY u.fullname LIMIT 500`;
    return rows.map((r) => ({ id: n(r.id), username: r.username, fullName: r.name ?? '', branch: r.branch ?? '' }));
  }
}
