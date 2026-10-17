import { Prisma, type PrismaClient } from '@prisma/client';
import type { MembershipGroupRaw, MembershipRaw, SavingsDocAggregateRaw, SavingsHeaderRaw } from '@koperasi/domain/kosipa';
import type { OpsReportReader } from '@koperasi/application/kosipa/reports-ops';

// Read-only operational report adapter (checkpoint 10) on the EXISTING SELECT-only reader pool: no new pool, no write. 5 s cap, parameterised,
// one aggregate or LIMIT per statement, NO join across tables (savings headers are matched to movement aggregates in memory). No member name,
// NIK, salary or contact column is ever selected: only counts and status/group labels.
type Num = number | bigint;
const n = (v: Num | null | undefined) => Number(v ?? 0);
const dec2 = (v: Prisma.Decimal | null | undefined): string => (v ?? new Prisma.Decimal(0)).toFixed(2);

export class PrismaKosipaOpsReportReader implements OpsReportReader {
  private readonly db: PrismaClient;
  constructor(db: PrismaClient) { this.db = db; }

  async membershipCounts(today: string): Promise<MembershipRaw[]> {
    const rows = await this.db.$queryRaw<{ status: string | null; employment: string | null; c: Num; with_exit: Num | null; before_today: Num | null; no_nik: Num | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT status_anggota AS status, status_karyawan AS employment, COUNT(*) AS c,
        SUM(tgl_keluar IS NOT NULL AND CAST(tgl_keluar AS CHAR) NOT LIKE '0000-00-00%') AS with_exit,
        SUM(tgl_keluar IS NOT NULL AND CAST(tgl_keluar AS CHAR) NOT LIKE '0000-00-00%' AND tgl_keluar < ${today}) AS before_today,
        SUM(nik_kar IS NULL OR nik_kar = '') AS no_nik
      FROM m_anggota GROUP BY status_anggota, status_karyawan ORDER BY c DESC, status_anggota, status_karyawan LIMIT 201`;
    return rows.map((r) => ({ status: r.status, employment: r.employment, members: n(r.c), withExitDate: n(r.with_exit), exitDateBeforeToday: n(r.before_today), withoutNik: n(r.no_nik) }));
  }
  async membershipGroups(cap: number): Promise<MembershipGroupRaw[]> {
    const rows = await this.db.$queryRaw<{ grp: string | null; c: Num }[]>`SET STATEMENT max_statement_time=5 FOR SELECT kd_group AS grp, COUNT(*) AS c FROM m_anggota GROUP BY kd_group ORDER BY c DESC, kd_group LIMIT ${cap}`;
    return rows.map((r) => ({ group: r.grp, members: n(r.c) }));
  }
  async savingsDocAggregates(cap: number): Promise<SavingsDocAggregateRaw[]> {
    const rows = await this.db.$queryRaw<{ doc_no: string | null; type: string; c: Num; credit: Prisma.Decimal | null; debit: Prisma.Decimal | null; interest: Prisma.Decimal | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT doc_no, COALESCE(jenis_simpanan, '(tanpa jenis)') AS type, COUNT(*) AS c,
        CAST(COALESCE(SUM(COALESCE(kredit, 0) + COALESCE(kredit_cash, 0)), 0) AS DECIMAL(24,2)) AS credit, CAST(COALESCE(SUM(COALESCE(debit, 0)), 0) AS DECIMAL(24,2)) AS debit, CAST(COALESCE(SUM(COALESCE(jasa_kredit, 0)), 0) AS DECIMAL(24,2)) AS interest
      FROM trans_simpanan_dtl GROUP BY doc_no, COALESCE(jenis_simpanan, '(tanpa jenis)') ORDER BY doc_no, type LIMIT ${cap}`;
    return rows.map((r) => ({ docNo: r.doc_no ?? '', type: r.type, rows: n(r.c), credit: dec2(r.credit), debit: dec2(r.debit), interest: dec2(r.interest) }));
  }
  async savingsHeaders(cap: number): Promise<SavingsHeaderRaw[]> {
    const rows = await this.db.$queryRaw<{ doc_no: string | null; doc_date: string | null; doc_status: string | null }[]>`SET STATEMENT max_statement_time=5 FOR SELECT doc_no, CAST(doc_date AS CHAR) AS doc_date, doc_status FROM trans_simpanan ORDER BY id LIMIT ${cap}`;
    return rows.map((r) => ({ docNo: r.doc_no ?? '', docDate: r.doc_date, status: r.doc_status }));
  }
}
