import { Prisma, type PrismaClient } from '@prisma/client';
import { PAYROLL_COMPONENT_COLUMNS, type BatchHeader, type InstallmentDocRaw, type LoanBucketRaw, type LoanDocRaw, type PayrollAggregateRaw, type PayrollComponentColumn } from '@koperasi/domain/kosipa';
import type { DateProblemCounts, DuplicateBatchNik, DuplicateLoanRef, LoanStatusConflictCounts, LoanStatusConflictRow, ReportReader, RowTotalsRaw } from '@koperasi/application/kosipa/reports';
import { HEADER, amountAt, header, sumSelect, type AmountRow, type HeaderRow } from './kosipa-payroll.repository.ts';

// Read-only KOSIPA report and data-quality adapter (checkpoint 9) on the EXISTING SELECT-only reader pool: no new pool, no write, no index DDL.
// Every statement is `SET STATEMENT max_statement_time=5`, parameterised and either a single aggregate or LIMITed. NO statement joins two
// financial tables: orphan and header/detail comparisons are done in memory by the application over separately read, capped sets, so a join
// can neither multiply a row nor hide one. Column names come only from the domain catalog. trans_pinjaman_dtl and trans_potongan_matrix have
// no secondary index in the 30 Sep 2026 dump (production unverified): the table-wide diagnostics are scans that the cap turns into an explicit
// "unavailable" for that one section.
type Num = number | bigint;
const n = (v: Num | null | undefined) => Number(v ?? 0);
const dec2 = (v: Prisma.Decimal | null | undefined): string => (v ?? new Prisma.Decimal(0)).toFixed(2);
const COMPONENT_SUM = Prisma.raw(`(${PAYROLL_COMPONENT_COLUMNS.map((c) => `COALESCE(\`${c}\`, 0)`).join(' + ')})`);

/** Date columns: zero (stored as 0000-00-00), NULL and implausible (<1990 or >=2101, e.g. the 9999-12-10 placeholder) are counted apart. */
const dateCounts = (col: string, table: string) => Prisma.raw(`SELECT COUNT(*) AS total, SUM(${col} IS NULL) AS missing, SUM(${col} IS NOT NULL AND CAST(${col} AS CHAR) LIKE '0000-00-00%') AS zero_,
  SUM(${col} IS NOT NULL AND CAST(${col} AS CHAR) NOT LIKE '0000-00-00%' AND (${col} < '1990-01-01' OR ${col} >= '2101-01-01')) AS implausible FROM ${table}`);

export class PrismaKosipaReportReader implements ReportReader {
  private readonly db: PrismaClient;
  constructor(db: PrismaClient) { this.db = db; }

  async loanYears(): Promise<number[]> {
    const rows = await this.db.$queryRaw<{ y: Num }[]>`SET STATEMENT max_statement_time=5 FOR SELECT YEAR(doc_date) AS y FROM trans_pinjaman WHERE doc_date >= '2000-01-01' AND doc_date < '2101-01-01' GROUP BY YEAR(doc_date) ORDER BY y DESC LIMIT 60`;
    return rows.map((r) => Number(r.y));
  }

  async loanBuckets(year: number | null): Promise<LoanBucketRaw[]> {
    const scope = year === null ? Prisma.sql`1 = 1`
      : Prisma.sql`((doc_date >= ${`${year}-01-01`} AND doc_date < ${`${year + 1}-01-01`}) OR doc_date IS NULL OR doc_date < '1990-01-01' OR doc_date >= '2101-01-01')`;
    const rows = await this.db.$queryRaw<{ bucket: string; doc_status: string | null; repayment: string | null; n: Num; plan: Prisma.Decimal }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT CASE WHEN doc_date IS NULL THEN 'MISSING' WHEN CAST(doc_date AS CHAR) LIKE '0000-00-00%' THEN 'ZERO' WHEN doc_date < '1990-01-01' OR doc_date >= '2101-01-01' THEN 'IMPLAUSIBLE' ELSE DATE_FORMAT(doc_date, '%Y-%m') END AS bucket,
        doc_status, status_bayar AS repayment, COUNT(*) AS n, CAST(COALESCE(SUM(plan_pinjaman), 0) AS DECIMAL(24,2)) AS plan
      FROM trans_pinjaman WHERE ${scope} GROUP BY 1, 2, 3 LIMIT 600`;
    return rows.map((r) => ({ bucket: r.bucket, docStatus: r.doc_status, repayment: r.repayment, count: n(r.n), planPrincipal: dec2(r.plan) }));
  }

  async payrollYears(): Promise<number[]> {
    const rows = await this.db.$queryRaw<{ y: string }[]>`SET STATEMENT max_statement_time=5 FOR SELECT periode_th AS y FROM trans_potongan_bulanan WHERE periode_th REGEXP '^[0-9]{4}$' GROUP BY periode_th ORDER BY periode_th DESC LIMIT 60`;
    return rows.map((r) => Number(r.y));
  }

  async payrollHeadersForYear(year: number, limit: number): Promise<BatchHeader[]> {
    const rows = await this.db.$queryRaw<HeaderRow[]>`SET STATEMENT max_statement_time=5 FOR SELECT ${HEADER} FROM trans_potongan_bulanan WHERE periode_th = ${String(year)} ORDER BY id DESC LIMIT ${limit}`;
    return rows.map(header);
  }

  private aggregate(r: AmountRow & { doc_no: string | null; n: Num; niks: Num }): PayrollAggregateRaw {
    const componentTotals: Partial<Record<PayrollComponentColumn, string>> = {};
    for (const c of PAYROLL_COMPONENT_COLUMNS) componentTotals[c] = amountAt(r, c);
    return { docNo: r.doc_no ?? '', rowCount: n(r.n), distinctNik: n(r.niks), rowsTotal: amountAt(r, 'total_potongan'), potonganToko: amountAt(r, 'potongan_toko'), componentTotals };
  }
  async payrollAggregates(docNos: readonly string[]): Promise<PayrollAggregateRaw[]> {
    if (docNos.length === 0) return [];
    const rows = await this.db.$queryRaw<(AmountRow & { doc_no: string | null; n: Num; niks: Num })[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT periode AS doc_no, COUNT(*) AS n, COUNT(DISTINCT nik_kar) AS niks, ${sumSelect} FROM trans_potongan_matrix WHERE periode IN (${Prisma.join(docNos)}) GROUP BY periode LIMIT 500`;
    return rows.map((r) => this.aggregate(r));
  }
  async payrollAggregatesAll(cap: number): Promise<PayrollAggregateRaw[]> {
    const rows = await this.db.$queryRaw<(AmountRow & { doc_no: string | null; n: Num; niks: Num })[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT periode AS doc_no, COUNT(*) AS n, COUNT(DISTINCT nik_kar) AS niks, ${sumSelect} FROM trans_potongan_matrix GROUP BY periode ORDER BY periode LIMIT ${cap}`;
    return rows.map((r) => this.aggregate(r));
  }
  async payrollHeadersAll(cap: number): Promise<BatchHeader[]> {
    const rows = await this.db.$queryRaw<HeaderRow[]>`SET STATEMENT max_statement_time=5 FOR SELECT ${HEADER} FROM trans_potongan_bulanan ORDER BY id DESC LIMIT ${cap}`;
    return rows.map(header);
  }

  async duplicateLoanRefs(cap: number): Promise<DuplicateLoanRef[]> {
    const rows = await this.db.$queryRaw<{ doc_no: string | null; c: Num; combos: Num }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT doc_no, COUNT(*) AS c, COUNT(DISTINCT CONCAT(COALESCE(doc_status, ''), '/', COALESCE(status_pencairan, ''), '/', COALESCE(status_bayar, ''))) AS combos
      FROM trans_pinjaman GROUP BY doc_no HAVING COUNT(*) > 1 ORDER BY c DESC, doc_no LIMIT ${cap}`;
    return rows.map((r) => ({ docNo: r.doc_no ?? '', count: n(r.c), statusCombinations: n(r.combos) }));
  }

  async loanStatusConflicts(sampleLimit: number): Promise<{ counts: LoanStatusConflictCounts; sample: LoanStatusConflictRow[] }> {
    const [c] = await this.db.$queryRaw<{ a: Num | null; b: Num | null; c: Num | null; d: Num | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT SUM(doc_status = 'REJECTED' AND status_bayar = 'LUNAS') AS a, SUM(doc_status = 'REJECTED' AND status_pencairan = 'APPROVED') AS b,
        SUM(COALESCE(doc_status, '') NOT IN ('APPROVED', 'REJECTED') AND status_bayar = 'LUNAS') AS c, SUM(COALESCE(doc_status, '') NOT IN ('APPROVED', 'REJECTED') AND status_pencairan = 'APPROVED') AS d FROM trans_pinjaman`;
    const rows = await this.db.$queryRaw<{ doc_no: string | null; doc_status: string | null; disbursement: string | null; repayment: string | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT doc_no, doc_status, status_pencairan AS disbursement, status_bayar AS repayment FROM trans_pinjaman
      WHERE (doc_status = 'REJECTED' AND (status_bayar = 'LUNAS' OR status_pencairan = 'APPROVED')) OR (COALESCE(doc_status, '') NOT IN ('APPROVED', 'REJECTED') AND (status_bayar = 'LUNAS' OR status_pencairan = 'APPROVED'))
      ORDER BY id DESC LIMIT ${sampleLimit}`;
    return { counts: { rejectedSettled: n(c?.a), rejectedDisbursed: n(c?.b), settledNotApproved: n(c?.c), disbursedNotApproved: n(c?.d) }, sample: rows.map((r) => ({ docNo: r.doc_no ?? '', docStatus: r.doc_status, disbursement: r.disbursement, repayment: r.repayment })) };
  }

  private async dates(sql: Prisma.Sql): Promise<DateProblemCounts> {
    const [r] = await this.db.$queryRaw<{ total: Num; missing: Num | null; zero_: Num | null; implausible: Num | null }[]>(Prisma.sql`SET STATEMENT max_statement_time=5 FOR ${sql}`);
    return { total: n(r?.total), zero: n(r?.zero_), missing: n(r?.missing), implausible: n(r?.implausible) };
  }
  loanDateProblems(): Promise<DateProblemCounts> { return this.dates(dateCounts('doc_date', 'trans_pinjaman')); }
  installmentDateProblems(): Promise<DateProblemCounts> { return this.dates(dateCounts('tgl_cicilan', 'trans_pinjaman_dtl')); }

  async installmentDocs(cap: number): Promise<InstallmentDocRaw[]> {
    const rows = await this.db.$queryRaw<{ doc_no: string | null; c: Num }[]>`SET STATEMENT max_statement_time=5 FOR SELECT doc_no, COUNT(*) AS c FROM trans_pinjaman_dtl GROUP BY doc_no ORDER BY doc_no LIMIT ${cap}`;
    return rows.map((r) => ({ docNo: r.doc_no ?? '', rows: n(r.c) }));
  }
  async loanDocs(cap: number): Promise<LoanDocRaw[]> {
    const rows = await this.db.$queryRaw<{ doc_no: string | null; doc_status: string | null }[]>`SET STATEMENT max_statement_time=5 FOR SELECT doc_no, doc_status FROM trans_pinjaman ORDER BY id LIMIT ${cap}`;
    return rows.map((r) => ({ docNo: r.doc_no ?? '', docStatus: r.doc_status }));
  }

  async payrollRowTotals(sampleLimit: number): Promise<RowTotalsRaw> {
    const [c] = await this.db.$queryRaw<{ rows_: Num; differs: Num | null; half: Num | null; maxdiff: Prisma.Decimal | null; nocomp: Num | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT COUNT(*) AS rows_, SUM(ABS(COALESCE(total_potongan, 0) - ${COMPONENT_SUM}) >= 0.00005) AS differs, SUM(ABS(COALESCE(total_potongan, 0) - ${COMPONENT_SUM}) >= 0.005) AS half,
        CAST(COALESCE(MAX(ABS(COALESCE(total_potongan, 0) - ${COMPONENT_SUM})), 0) AS DECIMAL(24,4)) AS maxdiff, SUM(COALESCE(total_potongan, 0) > 0 AND ${COMPONENT_SUM} = 0) AS nocomp FROM trans_potongan_matrix`;
    const rows = await this.db.$queryRaw<{ periode: string | null; nik: string | null; total: Prisma.Decimal | null; comp: Prisma.Decimal | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT periode, nik_kar AS nik, CAST(COALESCE(total_potongan, 0) AS DECIMAL(24,4)) AS total, CAST(${COMPONENT_SUM} AS DECIMAL(24,4)) AS comp FROM trans_potongan_matrix
      WHERE ABS(COALESCE(total_potongan, 0) - ${COMPONENT_SUM}) >= 0.005 ORDER BY id DESC LIMIT ${sampleLimit}`;
    return { rows: n(c?.rows_), totalDiffersFromComponents: n(c?.differs), totalDiffersByHalfSenOrMore: n(c?.half), maxDifference: (c?.maxdiff ?? new Prisma.Decimal(0)).toFixed(4), totalWithoutComponents: n(c?.nocomp), sample: rows.map((r) => ({ docNo: r.periode ?? '', nik: r.nik ?? '', total: (r.total ?? new Prisma.Decimal(0)).toFixed(4), componentSum: (r.comp ?? new Prisma.Decimal(0)).toFixed(4) })) };
  }

  async duplicateBatchNik(cap: number): Promise<DuplicateBatchNik[]> {
    const rows = await this.db.$queryRaw<{ periode: string | null; nik: string | null; c: Num }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT periode, nik_kar AS nik, COUNT(*) AS c FROM trans_potongan_matrix GROUP BY periode, nik_kar HAVING COUNT(*) > 1 ORDER BY c DESC, periode, nik_kar LIMIT ${cap}`;
    return rows.map((r) => ({ docNo: r.periode ?? '', nik: r.nik ?? '', count: n(r.c) }));
  }
}
