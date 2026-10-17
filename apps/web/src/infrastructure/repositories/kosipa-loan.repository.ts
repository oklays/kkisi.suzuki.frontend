import { Prisma, type PrismaClient } from '@prisma/client';
import type { LoanHeaderRaw, LoanListQuery, ScheduleAggregate, ScheduleRowRaw } from '@koperasi/domain/kosipa';
import type { LoanReader } from '@koperasi/application/kosipa/loans';

// Read-only KOSIPA loan adapter (spec REQ-024, TASK-026) on the EXISTING SELECT-only reader pool: no new pool, no write.
// Same rules as the payroll adapter: every statement is `SET STATEMENT max_statement_time=5`, parameterised and LIMITed (or a single
// bounded aggregate); legacy dates are read as text so '0000-00-00' / '9999-12-10' arrive as stored; decimals leave as exact strings;
// headers and installment rows are read by SEPARATE statements so no join can multiply a row. Bank account, salary (gaji_pokok)
// and approver user names are never selected. trans_pinjaman_dtl has no index on doc_no in the 30 Sep 2026 dump (production
// unverified): a per-loan read is a scan that the 5 s cap turns into an explicit unavailable state (measured well under it).
type Num = number | bigint;
const dec2 = (v: Prisma.Decimal | null | undefined): string => (v ?? new Prisma.Decimal(0)).toFixed(2);
const txt = (col: string) => Prisma.raw(`CAST(${col} AS CHAR)`);
const D = (col: string) => Prisma.raw(`CAST(COALESCE(${col}, 0) AS DECIMAL(24,2))`);

type HeaderRow = {
  id: Num; doc_no: string; doc_date: string | null; type: string | null; method: string | null; rate: string | null; nik: string | null; name: string | null; doc_status: string | null; disbursement: string | null; repayment: string | null;
  plan_principal: Prisma.Decimal; actual_principal: Prisma.Decimal; plan_installment: Prisma.Decimal; actual_installment: Prisma.Decimal; plan_months: Num | null; actual_months: Num | null;
  start_date: string | null; end_date: string | null; disbursed_date: string | null; disbursed_amount: Prisma.Decimal; admin_fee: Prisma.Decimal; insurance_fee: Prisma.Decimal; total_deduction: Prisma.Decimal; total_received: Prisma.Decimal;
  settlement_status: string | null; settlement_date: string | null; settlement_total: Prisma.Decimal; roll_over: string | null;
};
const HEADER = Prisma.sql`id, doc_no, ${txt('doc_date')} AS doc_date, jenis_pinjaman AS type, jenis_suku_bunga AS method, biaya_suku_bunga AS rate, nik, nama AS name,
  doc_status, status_pencairan AS disbursement, status_bayar AS repayment,
  ${D('plan_pinjaman')} AS plan_principal, ${D('actual_pinjaman')} AS actual_principal, ${D('plan_angsuran')} AS plan_installment, ${D('actual_angsuran')} AS actual_installment,
  plan_jangka_waktu AS plan_months, actual_jangka_waktu AS actual_months, ${txt('awal_pinjaman')} AS start_date, ${txt('akhir_pinjaman')} AS end_date, ${txt('tgl_pencairan')} AS disbursed_date,
  ${D('nominal_pencairan')} AS disbursed_amount, ${D('biaya_admin')} AS admin_fee, ${D('biaya_asuransi')} AS insurance_fee, ${D('total_potongan')} AS total_deduction, ${D('total_diterima')} AS total_received,
  pelunasan_status AS settlement_status, ${txt('pelunasan_date')} AS settlement_date, ${D('pelunasan_total')} AS settlement_total, status_roll_over AS roll_over`;
const header = (r: HeaderRow): LoanHeaderRaw => ({
  id: Number(r.id), docNo: r.doc_no, docDate: r.doc_date, type: r.type, method: r.method, rate: r.rate, nik: r.nik ?? '', name: r.name, docStatus: r.doc_status, disbursement: r.disbursement, repayment: r.repayment,
  planPrincipal: dec2(r.plan_principal), actualPrincipal: dec2(r.actual_principal), planInstallment: dec2(r.plan_installment), actualInstallment: dec2(r.actual_installment),
  planMonths: r.plan_months === null ? null : Number(r.plan_months), actualMonths: r.actual_months === null ? null : Number(r.actual_months),
  startDate: r.start_date, endDate: r.end_date, disbursedDate: r.disbursed_date, disbursedAmount: dec2(r.disbursed_amount), adminFee: dec2(r.admin_fee), insuranceFee: dec2(r.insurance_fee),
  totalDeduction: dec2(r.total_deduction), totalReceived: dec2(r.total_received), settlementStatus: r.settlement_status, settlementDate: r.settlement_date, settlementTotal: dec2(r.settlement_total), rollOver: r.roll_over,
});

export class PrismaKosipaLoanReader implements LoanReader {
  private readonly db: PrismaClient;
  constructor(db: PrismaClient) { this.db = db; }

  async listLoans(q: Pick<LoanListQuery, 'docStatus' | 'disbursement' | 'repayment' | 'search' | 'afterId'>, limit: number): Promise<LoanHeaderRaw[]> {
    const where: Prisma.Sql[] = [];
    if (q.docStatus) where.push(Prisma.sql`doc_status = ${q.docStatus}`);
    if (q.disbursement) where.push(Prisma.sql`status_pencairan = ${q.disbursement}`);
    if (q.repayment) where.push(Prisma.sql`status_bayar = ${q.repayment}`);
    if (q.afterId !== null) where.push(Prisma.sql`id < ${q.afterId}`);
    if (q.search?.nikKeys) where.push(Prisma.sql`nik IN (${Prisma.join(q.search.nikKeys)})`);
    // LIKE's default escape is the backslash: user wildcards (% _ \) were escaped by the domain; a document prefix may contain '_' which is escaped here.
    else if (q.search?.docNoPrefix) where.push(Prisma.sql`doc_no LIKE ${`${q.search.docNoPrefix.replace(/[_%\\]/g, (c) => `\\${c}`)}%`}`);
    else if (q.search?.nameLike) where.push(Prisma.sql`nama LIKE ${`%${q.search.nameLike}%`}`);
    const rows = await this.db.$queryRaw<HeaderRow[]>`SET STATEMENT max_statement_time=5 FOR SELECT ${HEADER} FROM trans_pinjaman
      ${where.length ? Prisma.sql`WHERE ${Prisma.join(where, ' AND ')}` : Prisma.empty} ORDER BY id DESC LIMIT ${limit}`;
    return rows.map(header);
  }

  async loanHeaders(docNo: string, limit: number): Promise<LoanHeaderRaw[]> {
    const rows = await this.db.$queryRaw<HeaderRow[]>`SET STATEMENT max_statement_time=5 FOR SELECT ${HEADER} FROM trans_pinjaman WHERE doc_no = ${docNo} ORDER BY id LIMIT ${limit}`;
    return rows.map(header);
  }

  async scheduleAggregate(docNo: string): Promise<ScheduleAggregate> {
    const [r] = await this.db.$queryRaw<{
      n: Num; distinct_no: Num; min_no: Num | null; max_no: Num | null; principal: Prisma.Decimal; interest: Prisma.Decimal; total: Prisma.Decimal; paid_rows: Num | null; unpaid_rows: Num | null; other_rows: Num | null;
      paid_principal: Prisma.Decimal; unpaid_principal: Prisma.Decimal; unpaid_total: Prisma.Decimal; zero_due: Num | null; missing_due: Num | null; implausible_due: Num | null; component_mismatch: Num | null; paid_no_date: Num | null;
    }[]>`SET STATEMENT max_statement_time=5 FOR SELECT COUNT(*) AS n, COUNT(DISTINCT COALESCE(ke_cicilan, 0)) AS distinct_no, MIN(ke_cicilan) AS min_no, MAX(ke_cicilan) AS max_no,
        CAST(COALESCE(SUM(pokok_cicilan), 0) AS DECIMAL(24,2)) AS principal, CAST(COALESCE(SUM(bunga_cicilan), 0) AS DECIMAL(24,2)) AS interest, CAST(COALESCE(SUM(angsuran_cicilan), 0) AS DECIMAL(24,2)) AS total,
        SUM(status_cicilan = 'Bayar') AS paid_rows, SUM(status_cicilan = 'Belum Bayar') AS unpaid_rows, SUM(status_cicilan IS NULL OR status_cicilan NOT IN ('Bayar', 'Belum Bayar')) AS other_rows,
        CAST(COALESCE(SUM(CASE WHEN status_cicilan = 'Bayar' THEN pokok_cicilan END), 0) AS DECIMAL(24,2)) AS paid_principal,
        CAST(COALESCE(SUM(CASE WHEN status_cicilan = 'Belum Bayar' THEN pokok_cicilan END), 0) AS DECIMAL(24,2)) AS unpaid_principal,
        CAST(COALESCE(SUM(CASE WHEN status_cicilan = 'Belum Bayar' THEN angsuran_cicilan END), 0) AS DECIMAL(24,2)) AS unpaid_total,
        SUM(tgl_cicilan IS NOT NULL AND CAST(tgl_cicilan AS CHAR) LIKE '0000-00-00%') AS zero_due, SUM(tgl_cicilan IS NULL) AS missing_due,
        SUM(tgl_cicilan IS NOT NULL AND CAST(tgl_cicilan AS CHAR) NOT LIKE '0000-00-00%' AND CAST(SUBSTRING(CAST(tgl_cicilan AS CHAR), 1, 4) AS UNSIGNED) NOT BETWEEN 1990 AND 2100) AS implausible_due,
        SUM(ROUND(COALESCE(angsuran_cicilan, 0), 2) <> ROUND(COALESCE(pokok_cicilan, 0) + COALESCE(bunga_cicilan, 0), 2)) AS component_mismatch,
        SUM(status_cicilan = 'Bayar' AND (tgl_bayar IS NULL OR CAST(tgl_bayar AS CHAR) LIKE '0000-00-00%')) AS paid_no_date
      FROM trans_pinjaman_dtl WHERE doc_no = ${docNo}`;
    const n = (v: Num | null | undefined) => Number(v ?? 0);
    return {
      rows: n(r?.n), distinctNo: n(r?.distinct_no), minNo: r?.min_no == null ? null : Number(r.min_no), maxNo: r?.max_no == null ? null : Number(r.max_no),
      principalSum: dec2(r?.principal), interestSum: dec2(r?.interest), totalSum: dec2(r?.total), paidRows: n(r?.paid_rows), unpaidRows: n(r?.unpaid_rows), otherStatusRows: n(r?.other_rows),
      paidPrincipal: dec2(r?.paid_principal), unpaidPrincipal: dec2(r?.unpaid_principal), unpaidTotal: dec2(r?.unpaid_total),
      zeroDue: n(r?.zero_due), missingDue: n(r?.missing_due), implausibleDue: n(r?.implausible_due), componentMismatch: n(r?.component_mismatch), paidWithoutPaidDate: n(r?.paid_no_date),
    };
  }

  async scheduleRows(docNo: string, after: { no: number; id: number } | null, limit: number): Promise<ScheduleRowRaw[]> {
    const rows = await this.db.$queryRaw<{ id: Num; ke: Num | null; due: string | null; paid: string | null; principal: Prisma.Decimal; interest: Prisma.Decimal; total: Prisma.Decimal; status: string | null; type: string | null; blocked: Num | null; roll_over: Num | null; cicilan_doc_no: string | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT id, ke_cicilan AS ke, ${txt('tgl_cicilan')} AS due, ${txt('tgl_bayar')} AS paid, ${D('pokok_cicilan')} AS principal, ${D('bunga_cicilan')} AS interest, ${D('angsuran_cicilan')} AS total,
        status_cicilan AS status, type_cicilan AS type, blokir AS blocked, rool_over AS roll_over, doc_no_cicilan AS cicilan_doc_no
      FROM trans_pinjaman_dtl WHERE doc_no = ${docNo}
      ${after ? Prisma.sql`AND (COALESCE(ke_cicilan, 0) > ${after.no} OR (COALESCE(ke_cicilan, 0) = ${after.no} AND id > ${after.id}))` : Prisma.empty}
      ORDER BY COALESCE(ke_cicilan, 0), id LIMIT ${limit}`;
    return rows.map((r) => ({
      id: Number(r.id), installmentNo: r.ke === null ? null : Number(r.ke), dueRaw: r.due, paidRaw: r.paid, principal: dec2(r.principal), interest: dec2(r.interest), total: dec2(r.total),
      status: r.status, type: r.type, blocked: r.blocked === null ? null : Number(r.blocked), rollOver: r.roll_over === null ? null : Number(r.roll_over), cicilanDocNo: r.cicilan_doc_no,
    }));
  }
}
