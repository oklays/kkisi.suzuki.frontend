import { Prisma, type PrismaClient } from '@prisma/client';
import { LOAN_PRODUCTS, loanProduct, type LoanHeaderRaw, type LoanListQuery, type LoanProductFilter, type LoanSearch, type PortfolioGroupRaw, type RolloverQuery, type RolloverRaw, type ScheduleAggregate, type ScheduleRowRaw, type SettlementQuery, type SettlementRaw, type SettlementSummaryRaw, type UnpaidScheduleRaw } from '@koperasi/domain/kosipa';
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
  id: Num; doc_no: string; doc_date: string | null; type: string | null; method: string | null; rate: string | null; nik: string | null; name: string | null; financier: string | null; doc_status: string | null; disbursement: string | null; repayment: string | null;
  plan_principal: Prisma.Decimal; actual_principal: Prisma.Decimal; plan_installment: Prisma.Decimal; actual_installment: Prisma.Decimal; plan_months: Num | null; actual_months: Num | null;
  start_date: string | null; end_date: string | null; disbursed_date: string | null; disbursed_amount: Prisma.Decimal; admin_fee: Prisma.Decimal; insurance_fee: Prisma.Decimal; total_deduction: Prisma.Decimal; total_received: Prisma.Decimal;
  settlement_status: string | null; settlement_date: string | null; settlement_total: Prisma.Decimal; roll_over: string | null;
};
const HEADER = Prisma.sql`id, doc_no, ${txt('doc_date')} AS doc_date, jenis_pinjaman AS type, jenis_suku_bunga AS method, biaya_suku_bunga AS rate, nik, nama AS name, bank_pembiaya AS financier,
  doc_status, status_pencairan AS disbursement, status_bayar AS repayment,
  ${D('plan_pinjaman')} AS plan_principal, ${D('actual_pinjaman')} AS actual_principal, ${D('plan_angsuran')} AS plan_installment, ${D('actual_angsuran')} AS actual_installment,
  plan_jangka_waktu AS plan_months, actual_jangka_waktu AS actual_months, ${txt('awal_pinjaman')} AS start_date, ${txt('akhir_pinjaman')} AS end_date, ${txt('tgl_pencairan')} AS disbursed_date,
  ${D('nominal_pencairan')} AS disbursed_amount, ${D('biaya_admin')} AS admin_fee, ${D('biaya_asuransi')} AS insurance_fee, ${D('total_potongan')} AS total_deduction, ${D('total_diterima')} AS total_received,
  pelunasan_status AS settlement_status, ${txt('pelunasan_date')} AS settlement_date, ${D('pelunasan_total')} AS settlement_total, status_roll_over AS roll_over`;
const header = (r: HeaderRow): LoanHeaderRaw => ({
  id: Number(r.id), docNo: r.doc_no, docDate: r.doc_date, type: r.type, method: r.method, rate: r.rate, nik: r.nik ?? '', name: r.name, financier: r.financier, docStatus: r.doc_status, disbursement: r.disbursement, repayment: r.repayment,
  planPrincipal: dec2(r.plan_principal), actualPrincipal: dec2(r.actual_principal), planInstallment: dec2(r.plan_installment), actualInstallment: dec2(r.actual_installment),
  planMonths: r.plan_months === null ? null : Number(r.plan_months), actualMonths: r.actual_months === null ? null : Number(r.actual_months),
  startDate: r.start_date, endDate: r.end_date, disbursedDate: r.disbursed_date, disbursedAmount: dec2(r.disbursed_amount), adminFee: dec2(r.admin_fee), insuranceFee: dec2(r.insurance_fee),
  totalDeduction: dec2(r.total_deduction), totalReceived: dec2(r.total_received), settlementStatus: r.settlement_status, settlementDate: r.settlement_date, settlementTotal: dec2(r.settlement_total), rollOver: r.roll_over,
});

/** The legacy menu filter of one product (loan-products.ts), or `lainnya` = no legacy filter matches. COALESCE keeps NULL jenis in `lainnya`. */
function productSql(product: LoanProductFilter): Prisma.Sql {
  const one = (p: (typeof LOAN_PRODUCTS)[number]) => Prisma.sql`(COALESCE(jenis_pinjaman, '') IN (${Prisma.join(p.types)})${p.financier ? Prisma.sql` AND COALESCE(bank_pembiaya, '') = ${p.financier}` : Prisma.empty})`;
  if (product === 'lainnya') return Prisma.sql`NOT (${Prisma.join(LOAN_PRODUCTS.map(one), ' OR ')})`;
  return one(loanProduct(product)!);
}
const monthRange = (col: string, period: { year: number; month: number }) => {
  const next = period.month === 12 ? { y: period.year + 1, m: 1 } : { y: period.year, m: period.month + 1 };
  return Prisma.sql`${Prisma.raw(col)} >= ${`${period.year}-${String(period.month).padStart(2, '0')}-01`} AND ${Prisma.raw(col)} < ${`${next.y}-${String(next.m).padStart(2, '0')}-01`}`;
};
// LIKE's default escape is the backslash: user wildcards (% _ \) were escaped by the domain; a document prefix may contain '_' which is escaped here.
const prefix = (v: string) => `${v.replace(/[_%\\]/g, (c) => `\\${c}`)}%`;
function searchSql(search: LoanSearch, docCols: readonly string[]): Prisma.Sql {
  if (search.nikKeys) return Prisma.sql`nik IN (${Prisma.join(search.nikKeys)})`;
  if (search.docNoPrefix) return Prisma.sql`(${Prisma.join(docCols.map((c) => Prisma.sql`${Prisma.raw(c)} LIKE ${prefix(search.docNoPrefix!)}`), ' OR ')})`;
  return Prisma.sql`nama LIKE ${`%${search.nameLike}%`}`;
}
const where = (parts: Prisma.Sql[]) => (parts.length ? Prisma.sql`WHERE ${Prisma.join(parts, ' AND ')}` : Prisma.empty);
const ACTIVE = Prisma.sql`doc_status = 'APPROVED' AND status_pencairan = 'APPROVED' AND status_bayar = 'BELUM LUNAS'`;

export class PrismaKosipaLoanReader implements LoanReader {
  private readonly db: PrismaClient;
  constructor(db: PrismaClient) { this.db = db; }

  async listLoans(q: Pick<LoanListQuery, 'docStatus' | 'disbursement' | 'repayment' | 'search' | 'afterId' | 'period' | 'product' | 'segment'>, limit: number): Promise<LoanHeaderRaw[]> {
    const parts: Prisma.Sql[] = [];
    if (q.docStatus) parts.push(Prisma.sql`doc_status = ${q.docStatus}`);
    if (q.disbursement) parts.push(Prisma.sql`status_pencairan = ${q.disbursement}`);
    if (q.repayment) parts.push(Prisma.sql`status_bayar = ${q.repayment}`);
    if (q.afterId !== null) parts.push(Prisma.sql`id < ${q.afterId}`);
    // document-date month as a half-open range: zero / NULL / implausible dates cannot satisfy it and are never guessed into a month
    if (q.period) parts.push(monthRange('doc_date', q.period));
    if (q.product) parts.push(productSql(q.product));
    if (q.product && q.product !== 'lainnya' && q.segment) parts.push(loanProduct(q.product)!.segmentBy === 'type' ? Prisma.sql`jenis_pinjaman = ${q.segment}` : Prisma.sql`bank_pembiaya = ${q.segment}`);
    if (q.search) parts.push(searchSql(q.search, ['doc_no']));
    const rows = await this.db.$queryRaw<HeaderRow[]>`SET STATEMENT max_statement_time=5 FOR SELECT ${HEADER} FROM trans_pinjaman ${where(parts)} ORDER BY id DESC LIMIT ${limit}`;
    return rows.map(header);
  }

  // ~32k headers on the 30 Sep copy, grouped to < 200 rows (144 ms measured). Implausible years never become the latest date.
  async portfolioGroups(): Promise<PortfolioGroupRaw[]> {
    const rows = await this.db.$queryRaw<{ type: string | null; financier: string | null; doc_status: string | null; disbursement: string | null; repayment: string | null; n: Num; plan: Prisma.Decimal | null; latest: string | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT jenis_pinjaman AS type, bank_pembiaya AS financier, doc_status, status_pencairan AS disbursement, status_bayar AS repayment, COUNT(*) AS n,
        CAST(COALESCE(SUM(plan_pinjaman), 0) AS DECIMAL(24,2)) AS plan,
        MAX(CASE WHEN doc_date > '1900-01-01' AND doc_date < '2101-01-01' THEN CAST(doc_date AS CHAR) END) AS latest
      FROM trans_pinjaman GROUP BY jenis_pinjaman, bank_pembiaya, doc_status, status_pencairan, status_bayar LIMIT 2000`;
    return rows.map((r) => ({ type: r.type, financier: r.financier, docStatus: r.doc_status, disbursement: r.disbursement, repayment: r.repayment, documents: Number(r.n), planPrincipal: dec2(r.plan), latestDocDate: r.latest }));
  }

  // Same semi-join as the dashboard Kas Pinjaman figure (a plain JOIN on the unindexed schedule exceeded 8 s; this is 0.5 s warm, ~4 s cold),
  // grouped per document; the product keys come from a second read of the ~4k active headers and are matched by doc_no here.
  async unpaidSchedule(product?: LoanProductFilter): Promise<UnpaidScheduleRaw[]> {
    const activeWhere = product ? Prisma.sql`${ACTIVE} AND ${productSql(product)}` : ACTIVE;
    const [heads, sums] = await Promise.all([
      this.db.$queryRaw<{ doc_no: string; type: string | null; financier: string | null }[]>`SET STATEMENT max_statement_time=5 FOR
        SELECT doc_no, jenis_pinjaman AS type, bank_pembiaya AS financier FROM trans_pinjaman WHERE ${activeWhere} LIMIT 20000`,
      this.db.$queryRaw<{ doc_no: string; principal: Prisma.Decimal | null; total: Prisma.Decimal | null }[]>`SET STATEMENT max_statement_time=5 FOR
        SELECT b.doc_no, CAST(COALESCE(SUM(b.pokok_cicilan), 0) AS DECIMAL(24,2)) AS principal, CAST(COALESCE(SUM(b.angsuran_cicilan), 0) AS DECIMAL(24,2)) AS total
        FROM trans_pinjaman_dtl b WHERE b.status_cicilan = 'Belum Bayar' AND b.doc_no IN (SELECT doc_no FROM trans_pinjaman WHERE ${activeWhere}) GROUP BY b.doc_no LIMIT 20000`,
    ]);
    const keys = new Map<string, { type: string | null; financier: string | null }>();
    for (const h of heads) if (!keys.has(h.doc_no)) keys.set(h.doc_no, { type: h.type, financier: h.financier });
    return sums.flatMap((r) => { const k = keys.get(r.doc_no); return k ? [{ docNo: r.doc_no, ...k, principal: dec2(r.principal), total: dec2(r.total) }] : []; });
  }

  // Legacy pelunasan_pinjaman_m: `pelunasan = 1 AND remark_pelunasan <> 'ROLLOVER'`, newest first, month of pelunasan_date.
  private settlementWhere(q: Omit<SettlementQuery, 'afterId'> & { afterId?: number | null }): Prisma.Sql {
    const parts: Prisma.Sql[] = [Prisma.sql`pelunasan = 1`, Prisma.sql`remark_pelunasan <> 'ROLLOVER'`];
    if (q.product) parts.push(productSql(q.product));
    if (q.remark) parts.push(Prisma.sql`remark_pelunasan = ${q.remark}`);
    if (q.period) parts.push(monthRange('pelunasan_date', q.period));
    if (q.search) parts.push(searchSql(q.search, ['doc_no']));
    if (q.afterId != null) parts.push(Prisma.sql`id < ${q.afterId}`);
    return where(parts);
  }
  async listSettlements(q: SettlementQuery, limit: number): Promise<SettlementRaw[]> {
    const rows = await this.db.$queryRaw<{ id: Num; doc_no: string; settled_on: string | null; nik: string | null; name: string | null; type: string | null; financier: string | null; remark: string | null; method: string | null; status: string | null; plan: Prisma.Decimal; principal: Prisma.Decimal; admin: Prisma.Decimal; penalty: Prisma.Decimal }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT id, doc_no, ${txt('pelunasan_date')} AS settled_on, nik, nama AS name, jenis_pinjaman AS type, bank_pembiaya AS financier, remark_pelunasan AS remark, metode_pelunasan AS method, pelunasan_status AS status,
        ${D('plan_pinjaman')} AS plan, ${D('pelunasan_pokok')} AS principal, ${D('pelunasan_admin')} AS admin, ${D('pelunasan_pinalty')} AS penalty
      FROM trans_pinjaman ${this.settlementWhere(q)} ORDER BY id DESC LIMIT ${limit}`;
    return rows.map((r) => ({ id: Number(r.id), docNo: r.doc_no, settledOn: r.settled_on, nik: r.nik ?? '', name: r.name, type: r.type, financier: r.financier, remark: r.remark, method: r.method, status: r.status,
      planPrincipal: dec2(r.plan), principal: dec2(r.principal), adminFee: dec2(r.admin), penalty: dec2(r.penalty) }));
  }
  async settlementSummary(q: Omit<SettlementQuery, 'afterId'>): Promise<SettlementSummaryRaw[]> {
    const rows = await this.db.$queryRaw<{ remark: string | null; n: Num; principal: Prisma.Decimal | null; admin: Prisma.Decimal | null; penalty: Prisma.Decimal | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT remark_pelunasan AS remark, COUNT(*) AS n, CAST(COALESCE(SUM(pelunasan_pokok), 0) AS DECIMAL(24,2)) AS principal, CAST(COALESCE(SUM(pelunasan_admin), 0) AS DECIMAL(24,2)) AS admin,
        CAST(COALESCE(SUM(pelunasan_pinalty), 0) AS DECIMAL(24,2)) AS penalty
      FROM trans_pinjaman ${this.settlementWhere(q)} GROUP BY remark_pelunasan LIMIT 50`;
    return rows.map((r) => ({ remark: r.remark, documents: Number(r.n), principal: dec2(r.principal), adminFee: dec2(r.admin), penalty: dec2(r.penalty) }));
  }

  // trans_pinjaman_rollover: ~1k rows, no index besides PRIMARY; read newest first by id, LIMITed.
  private static rollover(r: { id: Num; doc_no: string | null; doc_no_roll_over: string | null; nik: string | null; nama: string | null; type: string | null; remaining: Num | null; principal: Prisma.Decimal; fee: Prisma.Decimal }): RolloverRaw {
    return { id: Number(r.id), newDocNo: r.doc_no, oldDocNo: r.doc_no_roll_over, nik: r.nik ?? '', name: r.nama, oldType: r.type, remainingInstallments: r.remaining === null ? null : Number(r.remaining), remainingPrincipal: dec2(r.principal), fee: dec2(r.fee) };
  }
  private static readonly ROLLOVER = Prisma.sql`id, doc_no, doc_no_roll_over, nik, nama, jenis_pinjaman AS type, sisa_cicilan AS remaining, ${D('sisa_pinjaman')} AS principal, ${D('jasa')} AS fee`;
  async listRollovers(q: RolloverQuery, limit: number): Promise<RolloverRaw[]> {
    const parts: Prisma.Sql[] = [];
    if (q.search) parts.push(searchSql(q.search, ['doc_no', 'doc_no_roll_over']));
    if (q.afterId !== null) parts.push(Prisma.sql`id < ${q.afterId}`);
    const rows = await this.db.$queryRaw<Parameters<typeof PrismaKosipaLoanReader.rollover>[0][]>`SET STATEMENT max_statement_time=5 FOR
      SELECT ${PrismaKosipaLoanReader.ROLLOVER} FROM trans_pinjaman_rollover ${where(parts)} ORDER BY id DESC LIMIT ${limit}`;
    return rows.map(PrismaKosipaLoanReader.rollover);
  }
  async rolloverLinks(docNo: string, limit: number): Promise<RolloverRaw[]> {
    const rows = await this.db.$queryRaw<Parameters<typeof PrismaKosipaLoanReader.rollover>[0][]>`SET STATEMENT max_statement_time=5 FOR
      SELECT ${PrismaKosipaLoanReader.ROLLOVER} FROM trans_pinjaman_rollover WHERE doc_no = ${docNo} OR doc_no_roll_over = ${docNo} ORDER BY id LIMIT ${limit}`;
    return rows.map(PrismaKosipaLoanReader.rollover);
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
