import { Prisma, type PrismaClient } from '@prisma/client';
import { toMinorUnits } from '@koperasi/domain/money';
import { KosipaError, nikLookupKeys } from '@koperasi/domain/kosipa';
import type { KosipaMemberReader, LoanHeader, MemberRecordRow, MemberSummary, SavingsAggregate } from '@koperasi/application/kosipa/member-360';
import { kreditReturnedSen } from './sales-return-ledger.ts';

// Anggota 360 reads (spec REQ-022..024) through the existing SELECT-only reader. The 30 Sep 2026 production dump shows only
// primary keys on these tables (current production state is not yet verified), so every statement is time-capped and the
// installment-detail and payroll-matrix tables are deliberately NOT read until the index review (index-proposal.md) is decided.
// Measured on that copy: trans_pinjaman_dtl 1.2M rows (AUTO_INCREMENT 3.6M), trans_potongan_matrix 85k rows (AUTO_INCREMENT 1.2M).
type Num = number | bigint;
const sen = (v: Prisma.Decimal | null) => toMinorUnits((v ?? new Prisma.Decimal(0)).toFixed(2));
const zeroDate = (col: Prisma.Sql) => Prisma.sql`CASE WHEN ${col} IS NULL OR CAST(${col} AS CHAR) LIKE '0000-00-00%' THEN NULL ELSE DATE_FORMAT(${col}, '%Y-%m-%d') END`;
const keysFor = (nik: string) => { try { return nikLookupKeys(nik); } catch (e) { if (e instanceof KosipaError) return [nik]; throw e; } };

type SummaryRow = { id: Num; nik: string | null; name: string | null; grp: string | null; status: string | null; employment: string | null };
const summary = (r: SummaryRow): MemberSummary => ({ id: Number(r.id), nik: r.nik ?? '', name: r.name ?? '', group: r.grp, status: r.status, employment: r.employment });
const SUMMARY = Prisma.sql`id, nik_kar AS nik, nama_kar AS name, kd_group AS grp, status_anggota AS status, status_karyawan AS employment`;

export class PrismaKosipaMemberReader implements KosipaMemberReader {
  private readonly db: PrismaClient;
  constructor(db: PrismaClient) { this.db = db; }

  async search(q: { nikKeys: string[] | null; nameLike: string | null; limit: number }): Promise<MemberSummary[]> {
    const where = q.nikKeys ? Prisma.sql`nik_kar IN (${Prisma.join(q.nikKeys)})` : Prisma.sql`nama_kar LIKE ${`%${q.nameLike}%`}`;
    const rows = await this.db.$queryRaw<SummaryRow[]>`SET STATEMENT max_statement_time=5 FOR SELECT ${SUMMARY} FROM m_anggota WHERE ${where} ORDER BY nama_kar, id LIMIT ${q.limit}`;
    return rows.map(summary);
  }

  async member(id: number): Promise<MemberRecordRow | null> {
    const rows = await this.db.$queryRaw<(SummaryRow & { exit_on: string | null; joined_on: string | null; division: string | null; section: string | null; phone: string | null; email: string | null; account: string | null; bank: string | null; limit_toko: Prisma.Decimal; gaji_minus: Prisma.Decimal; limit_ppob: Prisma.Decimal })[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT ${SUMMARY}, ${zeroDate(Prisma.sql`tgl_keluar`)} AS exit_on, ${zeroDate(Prisma.sql`tgl_daftar`)} AS joined_on, divisi AS division, bagian AS section,
        no_telp AS phone, email, no_rek AS account, bank_rek AS bank,
        CAST(COALESCE(limit_toko, 0) AS DECIMAL(18,2)) AS limit_toko, CAST(COALESCE(gaji_minus, 0) AS DECIMAL(18,2)) AS gaji_minus, CAST(COALESCE(limit_ppob, 0) AS DECIMAL(18,2)) AS limit_ppob
      FROM m_anggota WHERE id = ${id} LIMIT 1`;
    const r = rows[0];
    if (!r) return null;
    return { ...summary(r), exitOn: r.exit_on, joinedOn: r.joined_on, division: r.division, section: r.section, phone: r.phone, email: r.email, bankAccount: r.account, bankName: r.bank,
      limitTokoSen: sen(r.limit_toko), gajiMinusSen: sen(r.gaji_minus), limitPpobSen: sen(r.limit_ppob) };
  }

  /**
   * Savings movements per type and HEADER status (legacy updates the detail status only for some flows, so the header is
   * authoritative). Duplicate header doc_no values with conflicting statuses are reported as AMBIGUOUS (counted as void).
   */
  async savings(nik: string): Promise<SavingsAggregate[]> {
    const rows = await this.db.$queryRaw<{ type: string; doc_status: string; credit: Prisma.Decimal; debit: Prisma.Decimal; interest: Prisma.Decimal }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT COALESCE(d.jenis_simpanan, h.jenis_simpanan, '(tanpa jenis)') AS type, COALESCE(h.doc_status, 'MISSING_HEADER') AS doc_status,
        CAST(COALESCE(SUM(COALESCE(d.kredit, 0) + COALESCE(d.kredit_cash, 0)), 0) AS DECIMAL(18,2)) AS credit,
        CAST(COALESCE(SUM(COALESCE(d.debit, 0)), 0) AS DECIMAL(18,2)) AS debit,
        CAST(COALESCE(SUM(COALESCE(d.jasa_kredit, 0)), 0) AS DECIMAL(18,2)) AS interest
      FROM trans_simpanan_dtl d
      LEFT JOIN (SELECT doc_no, MAX(jenis_simpanan) AS jenis_simpanan, IF(COUNT(DISTINCT doc_status) = 1, MAX(doc_status), 'AMBIGUOUS') AS doc_status
                 FROM trans_simpanan GROUP BY doc_no) h ON h.doc_no = d.doc_no
      WHERE d.nik_kar IN (${Prisma.join(keysFor(nik))})
      GROUP BY 1, 2`;
    return rows.map((r) => ({ type: r.type, docStatus: r.doc_status, creditSen: sen(r.credit), debitSen: sen(r.debit), interestSen: sen(r.interest) }));
  }

  async loans(nik: string): Promise<LoanHeader[]> {
    const rows = await this.db.$queryRaw<{ doc_no: string; doc_date: string | null; type: string | null; method: string | null; principal: Prisma.Decimal; months: Num | null; installment: Prisma.Decimal; doc_status: string | null; disbursement: string | null; repayment: string | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT doc_no, ${zeroDate(Prisma.sql`doc_date`)} AS doc_date, jenis_pinjaman AS type, jenis_suku_bunga AS method,
        CAST(COALESCE(plan_pinjaman, 0) AS DECIMAL(18,2)) AS principal, plan_jangka_waktu AS months, CAST(COALESCE(plan_angsuran, 0) AS DECIMAL(18,2)) AS installment,
        doc_status, status_pencairan AS disbursement, status_bayar AS repayment
      FROM trans_pinjaman WHERE nik IN (${Prisma.join(keysFor(nik))}) ORDER BY doc_date DESC, id DESC LIMIT 50`;
    return rows.map((r) => ({ docNo: r.doc_no, docDate: r.doc_date, type: r.type, method: r.method, principalSen: sen(r.principal), months: r.months === null ? null : Number(r.months),
      installmentSen: sen(r.installment), docStatus: r.doc_status, disbursement: r.disbursement, repayment: r.repayment }));
  }

  /** Exactly the POS credit-usage query (all branches, current month) and the same return offset. */
  async storeCredit(nik: string, monthStart: string, monthEnd: string): Promise<{ spentSen: number; returnedSen: number }> {
    const [spent] = await this.db.$queryRaw<{ amount: Prisma.Decimal }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT CAST(COALESCE(SUM(CAST(grand_total AS DECIMAL(18,2))), 0) AS DECIMAL(18,2)) AS amount FROM db_sales
      WHERE nik_kar = ${nik} AND payment_type = 'Kredit' AND sales_status = 'Final' AND sales_date >= ${monthStart} AND sales_date < ${monthEnd}`;
    return { spentSen: sen(spent?.amount ?? null), returnedSen: nik ? await kreditReturnedSen(this.db, nik, monthStart, monthEnd) : 0 };
  }
}
