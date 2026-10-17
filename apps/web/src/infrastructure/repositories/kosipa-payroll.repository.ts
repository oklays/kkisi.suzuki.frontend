import { Prisma, type PrismaClient } from '@prisma/client';
import { PAYROLL_COMPONENT_COLUMNS, type BatchHeader, type KreditReturnRow, type KreditSaleRow, type PayrollComponentColumn, type PayrollPeriod, type RecordedAmounts, type StoreColumn } from '@koperasi/domain/kosipa';
import type { BatchAggregate, HeaderLookup, HistoryRow, InstallmentDateSummary, InstallmentRow, MatrixFullRow, MatrixListRow, PayrollReader, RecordedStoreRaw } from '@koperasi/application/kosipa/payroll';

// Read-only KOSIPA payroll adapter (spec REQ-025, TASK-027). Runs on the EXISTING SELECT-only reader pool: no new pool, no write.
//  - Every statement is `SET STATEMENT max_statement_time=5 FOR ...` and bounded by LIMIT or by a bounded aggregate.
//  - No statement joins two tables that can repeat (a header and its rows are read by separate statements), so nothing can be
//    counted twice by a join. Duplicates in the data are surfaced by the use cases, never collapsed here.
//  - Legacy dates are read as text (CAST ... AS CHAR) so '0000-00-00' and '9999-12-10' arrive as they are stored.
//  - Decimals leave this file as exact strings with 4 decimals. `gaji_payroll` (salary) is never selected.
//  - Column names are interpolated ONLY from the domain catalog (a closed list checked below); values are always parameters.
//  - trans_potongan_matrix and trans_pinjaman_dtl have no secondary indexes in the 30 Sep 2026 dump (production state is
//    unverified), so reads by periode / nik_kar are scans that the 5 s cap turns into an explicit unavailable state.
type Num = number | bigint;
const dec4 = (v: Prisma.Decimal | null | undefined): string => (v ?? new Prisma.Decimal(0)).toFixed(4);
const dec2 = (v: Prisma.Decimal | null | undefined): string => (v ?? new Prisma.Decimal(0)).toFixed(2);
const txt = (col: string) => Prisma.raw(`CAST(${col} AS CHAR)`);

const SAFE_COLUMN = /^[A-Za-z0-9_]{1,64}$/;
for (const c of PAYROLL_COMPONENT_COLUMNS) if (!SAFE_COLUMN.test(c)) throw new Error(`unsafe payroll column in catalog: ${c}`);
export const AMOUNT_COLUMNS = [...PAYROLL_COMPONENT_COLUMNS, 'total_potongan', 'potongan_toko'] as const;
/** `COALESCE(m.col,0)` as an exact 4-decimal value, aliased c0..cN so the result keys never depend on the legacy casing. */
const amountSelect = Prisma.raw(AMOUNT_COLUMNS.map((c, i) => `CAST(COALESCE(\`${c}\`, 0) AS DECIMAL(24,4)) AS c${i}`).join(', '));
export const sumSelect = Prisma.raw(AMOUNT_COLUMNS.map((c, i) => `CAST(COALESCE(SUM(\`${c}\`), 0) AS DECIMAL(24,4)) AS c${i}`).join(', '));
export type AmountRow = Record<`c${number}`, Prisma.Decimal | null>;
export const amountAt = (r: AmountRow, name: (typeof AMOUNT_COLUMNS)[number]): string => dec4(r[`c${AMOUNT_COLUMNS.indexOf(name)}`]);
const toko = (r: AmountRow): Record<StoreColumn, string> => ({ TOKO_TAMBUN: amountAt(r, 'TOKO_TAMBUN'), TOKO_MJ: amountAt(r, 'TOKO_MJ'), TOKO_GIIC: amountAt(r, 'TOKO_GIIC') });

export type HeaderRow = { id: Num; doc_no: string; grp: string | null; status: string | null; th: string | null; bl: string | null; period_date: string | null; doc_date: string | null; cash_date: string | null; total: Prisma.Decimal | null; cash_total: Prisma.Decimal | null; cd_usr: string | null; ud_usr: string | null };
export const HEADER = Prisma.sql`id, doc_no, kd_group AS grp, doc_status AS status, periode_th AS th, periode_bl AS bl, ${txt('periode_potongan')} AS period_date, ${txt('doc_date')} AS doc_date, ${txt('tgl_cair')} AS cash_date,
  CAST(total AS DECIMAL(24,4)) AS total, CAST(total_cair AS DECIMAL(24,4)) AS cash_total, cd_usr, ud_usr`;
export const header = (r: HeaderRow): BatchHeader => ({
  id: Number(r.id), docNo: r.doc_no, group: r.grp, status: r.status, periodYear: r.th, periodMonth: r.bl, periodDate: r.period_date, docDate: r.doc_date, cashDate: r.cash_date,
  headerTotal: r.total === null ? null : dec4(r.total), cashTotal: r.cash_total === null ? null : dec4(r.cash_total), createdBy: r.cd_usr, updatedBy: r.ud_usr,
});
const inList = (values: readonly string[]) => Prisma.join(values);

export class PrismaKosipaPayrollReader implements PayrollReader {
  private readonly db: PrismaClient;
  constructor(db: PrismaClient) { this.db = db; }

  async listBatches(q: { period: PayrollPeriod | null; status: string | null; group: string | null; afterId: number | null }, limit: number): Promise<BatchHeader[]> {
    const where: Prisma.Sql[] = [];
    if (q.period) where.push(Prisma.sql`periode_th = ${String(q.period.year)} AND periode_bl = ${String(q.period.month).padStart(2, '0')}`);
    if (q.status) where.push(Prisma.sql`doc_status = ${q.status}`);
    if (q.group) where.push(Prisma.sql`kd_group = ${q.group}`);
    if (q.afterId !== null) where.push(Prisma.sql`id < ${q.afterId}`);
    const rows = await this.db.$queryRaw<HeaderRow[]>`SET STATEMENT max_statement_time=5 FOR SELECT ${HEADER} FROM trans_potongan_bulanan
      ${where.length ? Prisma.sql`WHERE ${Prisma.join(where, ' AND ')}` : Prisma.empty} ORDER BY id DESC LIMIT ${limit}`;
    return rows.map(header);
  }

  async batchHeader(docNo: string): Promise<BatchHeader | null> {
    const rows = await this.db.$queryRaw<HeaderRow[]>`SET STATEMENT max_statement_time=5 FOR SELECT ${HEADER} FROM trans_potongan_bulanan WHERE doc_no = ${docNo} ORDER BY id LIMIT 1`;
    return rows[0] ? header(rows[0]) : null;
  }

  async batchAggregate(docNo: string): Promise<BatchAggregate> {
    const [r] = await this.db.$queryRaw<(AmountRow & { n: Num; niks: Num })[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT COUNT(*) AS n, COUNT(DISTINCT nik_kar) AS niks, ${sumSelect} FROM trans_potongan_matrix WHERE periode = ${docNo}`;
    if (!r) return { rowCount: 0, distinctNik: 0, rowsTotal: dec4(null), potonganToko: dec4(null), componentTotals: {} };
    const componentTotals: Partial<Record<PayrollComponentColumn, string>> = {};
    for (const c of PAYROLL_COMPONENT_COLUMNS) componentTotals[c] = amountAt(r, c);
    return { rowCount: Number(r.n), distinctNik: Number(r.niks), rowsTotal: amountAt(r, 'total_potongan'), potonganToko: amountAt(r, 'potongan_toko'), componentTotals };
  }

  async batchRows(docNo: string, search: { nikKeys: string[] | null; nameLike: string | null } | null, afterId: number | null, limit: number): Promise<MatrixListRow[]> {
    const where: Prisma.Sql[] = [Prisma.sql`periode = ${docNo}`];
    if (afterId !== null) where.push(Prisma.sql`id > ${afterId}`);
    if (search?.nikKeys) where.push(Prisma.sql`nik_kar IN (${inList(search.nikKeys)})`);
    // MariaDB's default LIKE escape is the backslash the domain already applied to % _ and \
    else if (search?.nameLike) where.push(Prisma.sql`nama LIKE ${`%${search.nameLike}%`}`);
    const rows = await this.db.$queryRaw<(AmountRow & { id: Num; nik: string | null; name: string | null; grp: string | null })[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT id, nik_kar AS nik, nama AS name, kd_group AS grp, ${amountSelect} FROM trans_potongan_matrix WHERE ${Prisma.join(where, ' AND ')} ORDER BY id LIMIT ${limit}`;
    return rows.map((r) => ({ id: Number(r.id), nik: r.nik ?? '', name: r.name ?? '', group: r.grp ?? '', total: amountAt(r, 'total_potongan'), potonganToko: amountAt(r, 'potongan_toko'), ppob: amountAt(r, 'PPOB'), toko: toko(r) }));
  }

  /** All recorded rows of one member in one batch (more than one means duplicate rows, shown separately). Bounded: a skewed member cannot flood the page. */
  async memberRows(docNo: string, nikKeys: string[]): Promise<MatrixFullRow[]> {
    const rows = await this.db.$queryRaw<(AmountRow & { id: Num; nik: string | null; name: string | null; grp: string | null })[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT id, nik_kar AS nik, nama AS name, kd_group AS grp, ${amountSelect} FROM trans_potongan_matrix WHERE periode = ${docNo} AND nik_kar IN (${inList(nikKeys)}) ORDER BY id LIMIT 20`;
    return rows.map((r) => {
      const amounts: Record<string, string> = {};
      for (const c of AMOUNT_COLUMNS) amounts[c] = amountAt(r, c);
      return { id: Number(r.id), nik: r.nik ?? '', name: r.name ?? '', group: r.grp ?? '', amounts: amounts as unknown as RecordedAmounts };
    });
  }

  async periodBatches(period: PayrollPeriod): Promise<BatchHeader[]> {
    const rows = await this.db.$queryRaw<HeaderRow[]>`SET STATEMENT max_statement_time=5 FOR SELECT ${HEADER} FROM trans_potongan_bulanan
      WHERE periode_th = ${String(period.year)} AND periode_bl = ${String(period.month).padStart(2, '0')} ORDER BY id LIMIT 50`;
    return rows.map(header);
  }

  /** Recorded store columns per NIK across the given batches (a member can appear in two batches of one period). Grouping is by the stored NIK string only. */
  async periodRecordedStore(docNos: readonly string[]): Promise<RecordedStoreRaw[]> {
    if (docNos.length === 0) return [];
    const rows = await this.db.$queryRaw<{ nik: string | null; n: Num; t0: Prisma.Decimal | null; t1: Prisma.Decimal | null; t2: Prisma.Decimal | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT nik_kar AS nik, COUNT(*) AS n, CAST(COALESCE(SUM(TOKO_TAMBUN), 0) AS DECIMAL(24,4)) AS t0, CAST(COALESCE(SUM(TOKO_MJ), 0) AS DECIMAL(24,4)) AS t1, CAST(COALESCE(SUM(TOKO_GIIC), 0) AS DECIMAL(24,4)) AS t2
      FROM trans_potongan_matrix WHERE periode IN (${inList(docNos)}) GROUP BY nik_kar ORDER BY nik_kar LIMIT 60000`;
    return rows.map((r) => ({ nik: r.nik ?? '', rows: Number(r.n), amounts: { TOKO_TAMBUN: dec4(r.t0), TOKO_MJ: dec4(r.t1), TOKO_GIIC: dec4(r.t2) } }));
  }

  /** Kredit, Final sales of the source month (all branches). One extra row tells the caller the cap was hit; the caller then refuses to compare. */
  async kreditSales(window: { from: string; toExclusive: string }, cap: number): Promise<{ rows: KreditSaleRow[]; truncated: boolean }> {
    const rows = await this.db.$queryRaw<{ id: Num; nik: string | null; company_id: Num; total: Prisma.Decimal | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT id, nik_kar AS nik, company_id, CAST(grand_total AS DECIMAL(18,2)) AS total FROM db_sales
      WHERE payment_type = 'Kredit' AND sales_status = 'Final' AND sales_date >= ${window.from} AND sales_date < ${window.toExclusive} ORDER BY id LIMIT ${cap + 1}`;
    return { rows: rows.slice(0, cap).map((r) => ({ saleId: Number(r.id), nik: r.nik, companyId: Number(r.company_id), grandTotal: dec2(r.total) })), truncated: rows.length > cap };
  }

  /** Kredit returns against those same sales (matched on sale id AND company, exactly like the POS offset). The join key is unique on the sale side. */
  async kreditReturns(window: { from: string; toExclusive: string }, cap: number): Promise<{ rows: KreditReturnRow[]; truncated: boolean }> {
    const rows = await this.db.$queryRaw<{ id: Num; sales_id: Num; amount: Prisma.Decimal | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT r.id, r.sales_id, CAST(r.grand_total AS DECIMAL(18,2)) AS amount FROM db_salesreturn r JOIN db_sales s ON s.id = r.sales_id AND s.company_id = r.company_id
      WHERE s.payment_type = 'Kredit' AND s.sales_status = 'Final' AND s.sales_date >= ${window.from} AND s.sales_date < ${window.toExclusive}
        AND r.payment_type = 'Kredit' AND r.return_status = 'Return' AND r.status = 1 ORDER BY r.id LIMIT ${cap + 1}`;
    return { rows: rows.slice(0, cap).map((r) => ({ returnId: Number(r.id), saleId: Number(r.sales_id), amount: dec2(r.amount) })), truncated: rows.length > cap };
  }

  /** Newest recorded rows of a member (keyset on the row id, bounded). Headers are looked up separately so a missing or duplicated header never drops or doubles a row. */
  async memberHistory(nikKeys: string[], beforeId: number | null, limit: number): Promise<HistoryRow[]> {
    const rows = await this.db.$queryRaw<(AmountRow & { id: Num; doc_no: string | null })[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT id, periode AS doc_no, ${amountSelect} FROM trans_potongan_matrix WHERE nik_kar IN (${inList(nikKeys)})
      ${beforeId !== null ? Prisma.sql`AND id < ${beforeId}` : Prisma.empty} ORDER BY id DESC LIMIT ${limit}`;
    return rows.map((r) => ({ id: Number(r.id), docNo: r.doc_no ?? '', total: amountAt(r, 'total_potongan'), toko: toko(r) }));
  }

  async headersByDocNo(docNos: readonly string[]): Promise<HeaderLookup[]> {
    if (docNos.length === 0) return [];
    const rows = await this.db.$queryRaw<HeaderRow[]>`SET STATEMENT max_statement_time=5 FOR SELECT ${HEADER} FROM trans_potongan_bulanan WHERE doc_no IN (${inList(docNos)}) ORDER BY id LIMIT ${docNos.length * 5}`;
    return docNos.map((docNo) => { const mine = rows.filter((r) => r.doc_no === docNo); return { docNo, headerCount: mine.length, header: mine[0] ? header(mine[0]) : null }; });
  }

  /** Installment references due inside the batch month (zero/NULL/implausible due dates cannot satisfy a date range, so they are counted by `memberInstallmentSummary`, never guessed into a month). */
  async memberInstallments(nikKeys: string[], window: { from: string; toExclusive: string }, limit: number): Promise<InstallmentRow[]> {
    const rows = await this.db.$queryRaw<{ id: Num; doc_no: string | null; ke: Num | null; due: string | null; pokok: Prisma.Decimal | null; bunga: Prisma.Decimal | null; angsuran: Prisma.Decimal | null; status: string | null; type: string | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT id, doc_no, ke_cicilan AS ke, ${txt('tgl_cicilan')} AS due, pokok_cicilan AS pokok, bunga_cicilan AS bunga, angsuran_cicilan AS angsuran, status_cicilan AS status, type_cicilan AS type
      FROM trans_pinjaman_dtl WHERE nik_kar IN (${inList(nikKeys)}) AND tgl_cicilan >= ${window.from} AND tgl_cicilan < ${window.toExclusive} ORDER BY tgl_cicilan, id LIMIT ${limit}`;
    return rows.map((r) => ({ id: Number(r.id), loanDocNo: r.doc_no ?? '', installmentNo: r.ke === null ? null : Number(r.ke), dueRaw: r.due, principal: dec4(r.pokok), interest: dec4(r.bunga), total: dec4(r.angsuran), status: r.status, type: r.type }));
  }

  async memberInstallmentSummary(nikKeys: string[]): Promise<InstallmentDateSummary> {
    const [r] = await this.db.$queryRaw<{ total: Num; unpaid: Num | null; zero_due: Num | null; missing_due: Num | null; implausible_due: Num | null }[]>`SET STATEMENT max_statement_time=5 FOR
      SELECT COUNT(*) AS total, SUM(status_cicilan = 'Belum Bayar') AS unpaid,
        SUM(tgl_cicilan IS NOT NULL AND CAST(tgl_cicilan AS CHAR) LIKE '0000-00-00%') AS zero_due, SUM(tgl_cicilan IS NULL) AS missing_due,
        SUM(tgl_cicilan IS NOT NULL AND CAST(tgl_cicilan AS CHAR) NOT LIKE '0000-00-00%' AND CAST(SUBSTRING(CAST(tgl_cicilan AS CHAR), 1, 4) AS UNSIGNED) NOT BETWEEN 1990 AND 2100) AS implausible_due
      FROM trans_pinjaman_dtl WHERE nik_kar IN (${inList(nikKeys)})`;
    return { total: Number(r?.total ?? 0), unpaid: Number(r?.unpaid ?? 0), zeroDue: Number(r?.zero_due ?? 0), missingDue: Number(r?.missing_due ?? 0), implausibleDue: Number(r?.implausible_due ?? 0) };
  }

  /** Which loan parents exist. A child whose parent is absent is an orphan (the use case reports it; nothing is dropped). */
  async loanHeadersPresent(docNos: readonly string[]): Promise<Set<string>> {
    if (docNos.length === 0) return new Set();
    const rows = await this.db.$queryRaw<{ doc_no: string }[]>`SET STATEMENT max_statement_time=5 FOR SELECT DISTINCT doc_no FROM trans_pinjaman WHERE doc_no IN (${inList(docNos)}) LIMIT ${docNos.length}`;
    return new Set(rows.map((r) => r.doc_no));
  }
}
