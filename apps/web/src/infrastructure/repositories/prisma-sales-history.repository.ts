import { Prisma, type PrismaClient } from '@prisma/client';
import { toMinorUnits } from '@koperasi/domain/money';
import { escapeSqlLike, hasAmbiguousLegacyTotals, type ReprintFacts, type SalesHistoryQuery } from '@koperasi/domain/sales/history';
import type { SalesExportBundle, SalesExportScope } from '@koperasi/domain/sales/export';
import type { SalesExportRepository } from '@koperasi/application/sales/export';
import type { ReadPage, SalePayment, SalesDetail, SalesHistoryItem, SalesHistoryRepository, SalesLine } from '@koperasi/application/sales/history';
import { prisma } from '../db/prisma.ts';

type HeaderRow = {
  id: number | bigint; sales_code: string; sales_date: string; customer_name: string | null; nik_kar: string | null;
  created_by: string; pos: number; sales_status: string; payment_status: string; payment_type: string;
  record_status: number; return_bit: string | null; grand_total: Prisma.Decimal | null; paid_amount: Prisma.Decimal | null;
  subtotal: Prisma.Decimal | null; discount: Prisma.Decimal | null; other_charges_input: Prisma.Decimal | null;
  other_charges_amt: Prisma.Decimal | null; other_charges_tax_id: number | null; round_off: Prisma.Decimal | null; register_id: number | bigint | null;
  register_reference: string | null; cashier_label: string | null;
};
type LineRow = {
  id: number | bigint; item_id: number; barcode: string | null; description: string | null; item_name: string | null;
  sales_qty: number; price_per_unit: Prisma.Decimal | null; discount_amt: Prisma.Decimal | null;
  tax_id: number | null; tax_amt: Prisma.Decimal | null; tax_type: string | null; total_cost: Prisma.Decimal | null;
  status: number; sales_status: string;
};
type MoneyRow = { total: Prisma.Decimal | null; incomplete_count: number | bigint | null; ambiguous_tax_count: number | bigint | null };
type CountRow = { total: number | bigint };
const integer = (value: number | bigint | null): number | null => value === null ? null : Number(value);

function money(value: Prisma.Decimal | null, warnings: { code: string; field?: string }[], field: string): number | null {
  if (value === null) return null;
  try { return toMinorUnits(value.toFixed(2)); }
  catch { warnings.push({ code: 'INVALID_MONEY', field }); return null; }
}

function dateAfter(value: string): string {
  return new Date(Date.parse(`${value}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);
}

function filters(companyId: number, query: SalesHistoryQuery): Prisma.Sql[] {
  const clauses: Prisma.Sql[] = [Prisma.sql`s.company_id = ${companyId}`, Prisma.sql`s.ppob = 0`, Prisma.sql`s.sales_date >= ${query.from}`, Prisma.sql`s.sales_date < ${dateAfter(query.to)}`];
  if (query.source === 'pos') clauses.push(Prisma.sql`s.pos = 1`);
  if (query.source === 'nonpos') clauses.push(Prisma.sql`s.pos = 0`);
  if (query.salesStatus !== 'all') clauses.push(Prisma.sql`s.sales_status = ${query.salesStatus}`);
  if (query.paymentStatus !== 'all') clauses.push(Prisma.sql`s.payment_status = ${query.paymentStatus}`);
  if (query.paymentType !== 'all') clauses.push(Prisma.sql`s.payment_type = ${query.paymentType}`);
  if (query.createdBy) clauses.push(Prisma.sql`s.created_by = ${query.createdBy}`);
  if (query.registerId !== null) clauses.push(Prisma.sql`s.id_buka_kasir = ${query.registerId}`);
  if (query.q) {
    const pattern = `%${escapeSqlLike(query.q)}%`;
    clauses.push(Prisma.sql`(s.sales_code LIKE ${pattern} ESCAPE '!' OR s.nik_kar LIKE ${pattern} ESCAPE '!' OR s.customer_name LIKE ${pattern} ESCAPE '!')`);
  }
  return clauses;
}

function filtersForCompanies(companyIds: readonly number[], query: SalesHistoryQuery): Prisma.Sql[] {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`s.company_id IN (${Prisma.join(companyIds)})`,
    Prisma.sql`s.ppob = 0`,
    Prisma.sql`s.sales_date >= ${query.from}`,
    Prisma.sql`s.sales_date < ${dateAfter(query.to)}`,
  ];
  if (query.source === 'pos') clauses.push(Prisma.sql`s.pos = 1`);
  if (query.source === 'nonpos') clauses.push(Prisma.sql`s.pos = 0`);
  if (query.salesStatus !== 'all') clauses.push(Prisma.sql`s.sales_status = ${query.salesStatus}`);
  if (query.paymentStatus !== 'all') clauses.push(Prisma.sql`s.payment_status = ${query.paymentStatus}`);
  if (query.paymentType !== 'all') clauses.push(Prisma.sql`s.payment_type = ${query.paymentType}`);
  if (query.createdBy) clauses.push(Prisma.sql`s.created_by = ${query.createdBy}`);
  if (query.registerId !== null) clauses.push(Prisma.sql`s.id_buka_kasir = ${query.registerId}`);
  if (query.q) {
    const pattern = `%${escapeSqlLike(query.q)}%`;
    clauses.push(Prisma.sql`(s.sales_code LIKE ${pattern} ESCAPE '!' OR s.nik_kar LIKE ${pattern} ESCAPE '!' OR s.customer_name LIKE ${pattern} ESCAPE '!')`);
  }
  return clauses;
}

function mapHeader(row: HeaderRow, warnings: { code: string; field?: string }[]): SalesHistoryItem & {
  subtotalSen: number | null; discountSen: number | null; otherChargesInputSen: number | null;
  otherChargesSen: number | null; roundOffLegacySen: number | null;
} {
  const customer = row.customer_name?.trim();
  const nik = row.nik_kar?.trim();
  if (!row.register_reference) warnings.push({ code: 'SESSION_UNAVAILABLE', field: 'register' });
  return {
    saleId: Number(row.id), salesCode: row.sales_code, saleDate: row.sales_date, customerName: customer || 'Nama pelanggan tidak tersimpan',
    memberNik: nik && nik !== '0' ? nik : null, createdBy: row.created_by, source: Number(row.pos) === 1 ? 'pos' : 'nonpos',
    salesStatus: row.sales_status, paymentStatus: row.payment_status, paymentType: row.payment_type,
    recordStatus: Number(row.record_status), returnBit: row.return_bit,
    grandTotalSen: money(row.grand_total, warnings, 'grandTotal'), paidSen: money(row.paid_amount, warnings, 'paidAmount'),
    subtotalSen: money(row.subtotal, warnings, 'subtotal'), discountSen: money(row.discount, warnings, 'discount'),
    otherChargesInputSen: money(row.other_charges_input, warnings, 'otherChargesInput'),
    otherChargesSen: money(row.other_charges_amt, warnings, 'otherCharges'),
    roundOffLegacySen: money(row.round_off, warnings, 'roundOff'),
    registerId: integer(row.register_id),
    registerReference: row.register_reference, cashierLabel: row.cashier_label, warnings,
  };
}

export class PrismaSalesHistoryRepository implements SalesHistoryRepository, SalesExportRepository {
  private readonly db: PrismaClient;
  constructor(db: PrismaClient = prisma) { this.db = db; }

  async list(companyId: number, query: SalesHistoryQuery): Promise<{ items: SalesHistoryItem[]; pagination: ReadPage<never>['pagination'] }> {
    const where = Prisma.join(filters(companyId, query), ' AND ');
    const offset = (query.page - 1) * query.pageSize;
    const [countRows, rows] = await Promise.all([
      this.db.$queryRaw<CountRow[]>(Prisma.sql`SELECT COUNT(*) AS total FROM db_sales s WHERE ${where}`),
      this.db.$queryRaw<HeaderRow[]>(Prisma.sql`SELECT s.id, s.sales_code, DATE_FORMAT(s.sales_date,'%Y-%m-%d') AS sales_date,
        s.customer_name, s.nik_kar, s.created_by, s.pos, s.sales_status, s.payment_status, s.payment_type, s.status AS record_status,
        s.return_bit, CAST(s.grand_total AS DECIMAL(18,2)) AS grand_total, CAST(s.paid_amount AS DECIMAL(18,2)) AS paid_amount,
        CAST(s.subtotal AS DECIMAL(18,2)) AS subtotal, CAST(s.tot_discount_to_all_amt AS DECIMAL(18,2)) AS discount,
        CAST(s.other_charges_input AS DECIMAL(18,2)) AS other_charges_input,
        CAST(s.other_charges_amt AS DECIMAL(18,2)) AS other_charges_amt, s.other_charges_tax_id,
        CAST(s.round_off AS DECIMAL(18,2)) AS round_off,
        s.id_buka_kasir AS register_id, r.noref AS register_reference, k.no_kasir AS cashier_label
        FROM db_sales s
        LEFT JOIN db_buka_kasir r ON r.id = s.id_buka_kasir AND r.company_id = ${companyId}
        LEFT JOIN db_kasir k ON k.id = s.id_kasir AND k.company_id = ${companyId}
        WHERE ${where} ORDER BY s.sales_date ${query.sort === 'oldest' ? Prisma.raw('ASC') : Prisma.raw('DESC')}, s.id ${query.sort === 'oldest' ? Prisma.raw('ASC') : Prisma.raw('DESC')} LIMIT ${query.pageSize} OFFSET ${offset}`),
    ]);
    const total = Number(countRows[0]?.total ?? 0);
    const items = rows.map((row) => mapHeader(row, []));
    return { items, pagination: { page: query.page, pageSize: query.pageSize, total, hasNext: offset + rows.length < total } };
  }

  async find(companyId: number, saleId: number, linePage: number, linePageSize: number): Promise<SalesDetail | null> {
    const parentRows = await this.db.$queryRaw<HeaderRow[]>(Prisma.sql`SELECT s.id, s.sales_code, DATE_FORMAT(s.sales_date,'%Y-%m-%d') AS sales_date,
      s.customer_name, s.nik_kar, s.created_by, s.pos, s.sales_status, s.payment_status, s.payment_type, s.status AS record_status,
      s.return_bit, CAST(s.grand_total AS DECIMAL(18,2)) AS grand_total, CAST(s.paid_amount AS DECIMAL(18,2)) AS paid_amount,
      CAST(s.subtotal AS DECIMAL(18,2)) AS subtotal, CAST(s.tot_discount_to_all_amt AS DECIMAL(18,2)) AS discount,
      CAST(s.other_charges_input AS DECIMAL(18,2)) AS other_charges_input,
      CAST(s.other_charges_amt AS DECIMAL(18,2)) AS other_charges_amt, s.other_charges_tax_id,
      CAST(s.round_off AS DECIMAL(18,2)) AS round_off,
      s.id_buka_kasir AS register_id, r.noref AS register_reference, k.no_kasir AS cashier_label
      FROM db_sales s LEFT JOIN db_buka_kasir r ON r.id = s.id_buka_kasir AND r.company_id = ${companyId}
      LEFT JOIN db_kasir k ON k.id = s.id_kasir AND k.company_id = ${companyId}
      WHERE s.id = ${saleId} AND s.company_id = ${companyId} AND s.ppob = 0 LIMIT 1`);
    const header = parentRows[0];
    if (!header) return null;
    const lineOffset = (linePage - 1) * linePageSize;
    const [counts, aggregate, lineRows, paymentFacts] = await Promise.all([
      this.db.$queryRaw<{ all_count: number | bigint; scoped_count: number | bigint; eligible_count: number | bigint }[]>`SELECT COUNT(*) AS all_count,
        SUM(CASE WHEN company_id = ${companyId} THEN 1 ELSE 0 END) AS scoped_count,
        SUM(CASE WHEN company_id = ${companyId} AND status = 1 AND sales_status = 'Final' THEN 1 ELSE 0 END) AS eligible_count
        FROM db_salesitems WHERE sales_id = ${saleId}`,
      this.db.$queryRaw<MoneyRow[]>(Prisma.sql`SELECT CAST(COALESCE(SUM(total_cost),0) AS DECIMAL(18,2)) AS total,
        SUM(CASE WHEN price_per_unit IS NULL OR discount_amt IS NULL OR total_cost IS NULL OR sales_qty IS NULL OR sales_qty <= 0
          OR price_per_unit < 0 OR discount_amt < 0 OR total_cost < 0 OR tax_amt < 0
          OR price_per_unit > 90071992547409.91 OR discount_amt > 90071992547409.91 OR total_cost > 90071992547409.91 OR tax_amt > 90071992547409.91
          THEN 1 ELSE 0 END) AS incomplete_count,
        SUM(CASE WHEN (tax_amt IS NULL AND (COALESCE(tax_id,0)<>0 OR COALESCE(tax_type,'')<>'')) OR (COALESCE(tax_amt,0)<>0 AND COALESCE(tax_type,'')='') THEN 1 ELSE 0 END) AS ambiguous_tax_count
        FROM db_salesitems
        WHERE sales_id = ${saleId} AND company_id = ${companyId} AND status = 1 AND sales_status = 'Final'`),
      this.db.$queryRaw<LineRow[]>(Prisma.sql`SELECT si.id, si.item_id, si.barcode, si.description, i.item_name,
        si.sales_qty, CAST(si.price_per_unit AS DECIMAL(18,2)) AS price_per_unit,
        CAST(si.discount_amt AS DECIMAL(18,2)) AS discount_amt, si.tax_id,
        CAST(si.tax_amt AS DECIMAL(18,2)) AS tax_amt, si.tax_type,
        CAST(si.total_cost AS DECIMAL(18,2)) AS total_cost, si.status, si.sales_status
        FROM db_salesitems si LEFT JOIN db_items i ON i.id = si.item_id AND i.company_id = ${companyId}
        WHERE si.sales_id = ${saleId} AND si.company_id = ${companyId}
        ORDER BY si.id ASC LIMIT ${linePageSize} OFFSET ${lineOffset}`),
      this.db.$queryRaw<{ active_count: number | bigint; matching_count: number | bigint; foreign_count: number | bigint }[]>`SELECT
        SUM(CASE WHEN company_id = ${companyId} AND status = 1 THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN company_id = ${companyId} AND status = 1 AND payment > 0 AND payment_type = ${header.payment_type} THEN 1 ELSE 0 END) AS matching_count,
        SUM(CASE WHEN company_id <> ${companyId} OR company_id IS NULL THEN 1 ELSE 0 END) AS foreign_count
        FROM db_salespayments WHERE sales_id = ${saleId}`,
    ]);
    const warningList: { code: string; field?: string }[] = [];
    const sale = mapHeader(header, warningList);
    const count = counts[0];
    const allCount = Number(count?.all_count ?? 0); const scopedCount = Number(count?.scoped_count ?? 0); const eligibleCount = Number(count?.eligible_count ?? 0);
    if (allCount !== scopedCount) warningList.push({ code: 'DATA_INCOMPLETE', field: 'items' });
    const lines: SalesLine[] = lineRows.map((row) => {
      const lineWarnings: { code: string; field?: string }[] = [];
      const description = row.description?.trim() ?? '';
      const currentName = row.item_name?.trim() ?? '';
      const labelSource = description ? 'description' : currentName ? 'current_master' : 'fallback';
      const fields = ['unitPrice', 'discount', 'tax', 'total'] as const;
      const amounts = [row.price_per_unit, row.discount_amt, row.tax_amt, row.total_cost].map((value, index) => money(value, lineWarnings, fields[index]));
      warningList.push(...lineWarnings);
      return {
        lineId: Number(row.id), itemId: Number(row.item_id), barcode: row.barcode ?? '',
        label: description || currentName || `Item #${row.item_id}`, labelSource, description,
        quantity: Number(row.sales_qty), unitPriceSen: amounts[0], discountSen: amounts[1], taxId: integer(row.tax_id),
        taxSen: amounts[2], taxType: row.tax_type ?? '', totalSen: amounts[3],
        status: Number(row.status), salesStatus: row.sales_status,
      };
    });
    const lineTotalRows = aggregate[0];
    const lineTotalWarnings: { code: string; field?: string }[] = [];
    const lineTotalSen = money(lineTotalRows?.total ?? null, lineTotalWarnings, 'lineTotal');
    warningList.push(...lineTotalWarnings);
    const payments = paymentFacts[0];
    const paymentRowCount = Number(payments?.active_count ?? 0);
    const paymentMatchingCount = Number(payments?.matching_count ?? 0);
    const facts: ReprintFacts = {
      source: Number(header.pos) === 1 ? 'pos' : 'nonpos', salesStatus: header.sales_status, paymentStatus: header.payment_status,
      paymentType: header.payment_type, recordStatus: Number(header.record_status), returnBit: header.return_bit,
      hasItems: eligibleCount > 0 && eligibleCount === allCount, lineCount: allCount, itemCount: eligibleCount,
      validMoney: !warningList.some((warning) => warning.code === 'INVALID_MONEY') && Number(lineTotalRows?.incomplete_count ?? 0) === 0,
      grandTotalSen: sale.grandTotalSen, paidSen: sale.paidSen, subtotalSen: sale.subtotalSen, lineTotalSen,
      discountSen: sale.discountSen, otherChargesSen: sale.otherChargesSen,
      hasAmbiguousTax: Number(lineTotalRows?.ambiguous_tax_count ?? 0) > 0 || hasAmbiguousLegacyTotals({
        paymentType: sale.paymentType, grandTotalSen: sale.grandTotalSen, paidSen: sale.paidSen,
        otherChargesInputSen: sale.otherChargesInputSen, otherChargesTaxId: Number(header.other_charges_tax_id ?? 0), roundOffSen: sale.roundOffLegacySen,
      }),
      activePaymentCount: paymentRowCount + Number(payments?.foreign_count ?? 0), paymentTypeMatches: paymentMatchingCount === paymentRowCount && Number(payments?.foreign_count ?? 0) === 0,
    };
    if (Number(payments?.foreign_count ?? 0) > 0) warningList.push({ code: 'DATA_INCOMPLETE', field: 'payments' });
    return {
      sale: { ...sale, warnings: warningList }, lines,
      linePagination: { page: linePage, pageSize: linePageSize, total: scopedCount, hasNext: lineOffset + lines.length < scopedCount },
      reprintFacts: facts, warnings: warningList,
    };
  }

  async payments(companyId: number, saleId: number, page: number, pageSize: number): Promise<ReadPage<SalePayment> | null> {
    const parents = await this.db.$queryRaw<{ id: number }[]>`SELECT id FROM db_sales WHERE id = ${saleId} AND company_id = ${companyId} AND ppob = 0 LIMIT 1`;
    if (!parents.length) return null;
    const offset = (page - 1) * pageSize;
    const [counts, rows] = await Promise.all([
      this.db.$queryRaw<CountRow[]>`SELECT COUNT(*) AS total FROM db_salespayments WHERE sales_id = ${saleId} AND company_id = ${companyId}`,
      this.db.$queryRaw<{ id: number | bigint; payment_date: string; payment_type: string; payment: Prisma.Decimal | null;
        change_return: Prisma.Decimal | null; payment_note: string | null; created_by: string; status: number }[]>(Prisma.sql`SELECT id,
        DATE_FORMAT(payment_date,'%Y-%m-%d') AS payment_date, payment_type, CAST(payment AS DECIMAL(18,2)) AS payment,
        CAST(change_return AS DECIMAL(18,2)) AS change_return, payment_note, created_by, status
        FROM db_salespayments WHERE sales_id = ${saleId} AND company_id = ${companyId}
        ORDER BY payment_date ASC, id ASC LIMIT ${pageSize} OFFSET ${offset}`),
    ]);
    const mapped = rows.map((row) => {
      const warnings: { code: string; field?: string }[] = [];
      const paymentSen = money(row.payment, warnings, 'payment'); const changeSen = money(row.change_return, warnings, 'changeReturn');
      return { paymentId: Number(row.id), paymentDate: row.payment_date, paymentType: row.payment_type, paymentSen,
        changeSen, note: row.payment_note ?? '', createdBy: row.created_by, status: Number(row.status), warnings };
    });
    const total = Number(counts[0]?.total ?? 0);
    return { rows: mapped, pagination: { page, pageSize, total, hasNext: offset + rows.length < total } };
  }

  async exportBundle(companyId: number, scope: SalesExportScope, query: SalesHistoryQuery, now: Date): Promise<SalesExportBundle> {
    const storeRows = await this.db.$queryRaw<{ id: number | bigint; company_name: string; company_code: string | null }[]>(
      scope === 'all'
        ? Prisma.sql`SELECT id, company_name, COALESCE(company_code, '') AS company_code FROM db_company WHERE status = 1 ORDER BY id ASC`
        : Prisma.sql`SELECT id, company_name, COALESCE(company_code, '') AS company_code FROM db_company WHERE id = ${companyId} LIMIT 1`,
    );
    const stores = storeRows.length > 0
      ? storeRows.map((s) => ({ id: Number(s.id), name: s.company_name.trim(), code: (s.company_code ?? '').trim() || `C${s.id}` }))
      : [{ id: companyId, name: `Cabang #${companyId}`, code: `C${companyId}` }];
    const companyIds = stores.map((s) => s.id);
    const where = Prisma.join(filtersForCompanies(companyIds, query), ' AND ');
    const orderDir = query.sort === 'oldest' ? Prisma.raw('ASC') : Prisma.raw('DESC');

    type ExportHeaderRow = HeaderRow & { company_id: number | bigint };
    type ReturnRow = {
      id: number | bigint; company_id: number | bigint; return_code: string; return_date: string;
      sales_code: string | null; customer_name: string | null; nik_kar: string | null;
      payment_type: string | null; grand_total: Prisma.Decimal | null; created_by: string | null; return_note: string | null;
    };
    type StoreItemRow = {
      company_id: number | bigint; line_count: number | bigint; unique_items: number | bigint;
      total_qty: Prisma.Decimal | null; total_revenue: Prisma.Decimal | null; est_cogs: Prisma.Decimal | null;
    };
    type CatRow = {
      category_id: number | bigint; category_name: string; unique_items: number | bigint; tx_count: number | bigint;
      total_qty: Prisma.Decimal | null; total_revenue: Prisma.Decimal | null; est_cogs: Prisma.Decimal | null;
    };
    type TopItemRow = {
      item_id: number | bigint; item_code: string | null; barcode: string | null; item_name: string;
      category_name: string; unit_price: Prisma.Decimal | null; purchase_price: Prisma.Decimal | null;
      tx_count: number | bigint; total_qty: Prisma.Decimal | null; total_revenue: Prisma.Decimal | null;
    };

    const [salesRows, returnRows, storeItemRows, catRows, topItemRows] = await Promise.all([
      this.db.$queryRaw<ExportHeaderRow[]>(Prisma.sql`SELECT s.id, s.company_id, s.sales_code, DATE_FORMAT(s.sales_date,'%Y-%m-%d') AS sales_date,
        s.customer_name, s.nik_kar, s.created_by, s.pos, s.sales_status, s.payment_status, s.payment_type, s.status AS record_status,
        s.return_bit, CAST(s.grand_total AS DECIMAL(18,2)) AS grand_total, CAST(s.paid_amount AS DECIMAL(18,2)) AS paid_amount,
        CAST(s.subtotal AS DECIMAL(18,2)) AS subtotal, CAST(s.tot_discount_to_all_amt AS DECIMAL(18,2)) AS discount,
        CAST(s.other_charges_input AS DECIMAL(18,2)) AS other_charges_input,
        CAST(s.other_charges_amt AS DECIMAL(18,2)) AS other_charges_amt, s.other_charges_tax_id,
        CAST(s.round_off AS DECIMAL(18,2)) AS round_off,
        s.id_buka_kasir AS register_id, r.noref AS register_reference, k.no_kasir AS cashier_label
        FROM db_sales s
        LEFT JOIN db_buka_kasir r ON r.id = s.id_buka_kasir AND r.company_id = s.company_id
        LEFT JOIN db_kasir k ON k.id = s.id_kasir AND k.company_id = s.company_id
        WHERE ${where}
        ORDER BY s.sales_date ${orderDir}, s.id ${orderDir}
        LIMIT 15000`),
      this.db.$queryRaw<ReturnRow[]>(Prisma.sql`SELECT sr.id, sr.company_id, sr.return_code, DATE_FORMAT(sr.return_date,'%Y-%m-%d') AS return_date,
        sr.sales_code, sr.customer_name, sr.nik_kar, sr.payment_type, CAST(sr.grand_total AS DECIMAL(18,2)) AS grand_total,
        sr.created_by, sr.return_note
        FROM db_salesreturn sr
        WHERE sr.company_id IN (${Prisma.join(companyIds)}) AND sr.return_date >= ${query.from} AND sr.return_date < ${dateAfter(query.to)}
        ORDER BY sr.return_date ASC, sr.id ASC`),
      this.db.$queryRaw<StoreItemRow[]>(Prisma.sql`SELECT s.company_id, COUNT(si.id) AS line_count, COUNT(DISTINCT si.item_id) AS unique_items,
        CAST(COALESCE(SUM(si.sales_qty),0) AS DECIMAL(18,2)) AS total_qty,
        CAST(COALESCE(SUM(si.total_cost),0) AS DECIMAL(18,2)) AS total_revenue,
        CAST(COALESCE(SUM(si.sales_qty * COALESCE(i.purchase_price, si.price_per_unit, 0)),0) AS DECIMAL(18,2)) AS est_cogs
        FROM db_salesitems si
        INNER JOIN db_sales s ON s.id = si.sales_id AND s.company_id = si.company_id
        LEFT JOIN db_items i ON i.id = si.item_id AND i.company_id = si.company_id
        WHERE ${where} AND s.sales_status = 'Final' AND s.status = 1 AND si.status = 1
        GROUP BY s.company_id`),
      this.db.$queryRaw<CatRow[]>(Prisma.sql`SELECT COALESCE(c.id, 0) AS category_id, COALESCE(c.category_name, 'TANPA KATEGORI') AS category_name,
        COUNT(DISTINCT si.item_id) AS unique_items, COUNT(DISTINCT si.sales_id) AS tx_count,
        CAST(COALESCE(SUM(si.sales_qty),0) AS DECIMAL(18,2)) AS total_qty,
        CAST(COALESCE(SUM(si.total_cost),0) AS DECIMAL(18,2)) AS total_revenue,
        CAST(COALESCE(SUM(si.sales_qty * COALESCE(i.purchase_price, si.price_per_unit, 0)),0) AS DECIMAL(18,2)) AS est_cogs
        FROM db_salesitems si
        INNER JOIN db_sales s ON s.id = si.sales_id AND s.company_id = si.company_id
        LEFT JOIN db_items i ON i.id = si.item_id AND i.company_id = si.company_id
        LEFT JOIN db_category c ON c.id = i.category_id AND c.company_id = si.company_id
        WHERE ${where} AND s.sales_status = 'Final' AND s.status = 1 AND si.status = 1
        GROUP BY COALESCE(c.id, 0), COALESCE(c.category_name, 'TANPA KATEGORI')
        ORDER BY total_revenue DESC`),
      this.db.$queryRaw<TopItemRow[]>(Prisma.sql`SELECT si.item_id, COALESCE(i.item_code, '') AS item_code,
        COALESCE(i.custom_barcode, si.barcode, '') AS barcode,
        COALESCE(NULLIF(TRIM(i.item_name),''), NULLIF(TRIM(si.description),''), CONCAT('Item #', si.item_id)) AS item_name,
        COALESCE(c.category_name, 'TANPA KATEGORI') AS category_name,
        CAST(COALESCE(i.price, MAX(si.price_per_unit), 0) AS DECIMAL(18,2)) AS unit_price,
        CAST(COALESCE(i.purchase_price, 0) AS DECIMAL(18,2)) AS purchase_price,
        COUNT(DISTINCT si.sales_id) AS tx_count,
        CAST(COALESCE(SUM(si.sales_qty),0) AS DECIMAL(18,2)) AS total_qty,
        CAST(COALESCE(SUM(si.total_cost),0) AS DECIMAL(18,2)) AS total_revenue
        FROM db_salesitems si
        INNER JOIN db_sales s ON s.id = si.sales_id AND s.company_id = si.company_id
        LEFT JOIN db_items i ON i.id = si.item_id AND i.company_id = si.company_id
        LEFT JOIN db_category c ON c.id = i.category_id AND c.company_id = si.company_id
        WHERE ${where} AND s.sales_status = 'Final' AND s.status = 1 AND si.status = 1
        GROUP BY si.item_id, i.item_code, i.custom_barcode, si.barcode, i.item_name, si.description, c.category_name, i.price, i.purchase_price
        ORDER BY total_revenue DESC
        LIMIT 100`),
    ]);

    const distinctNiks = [...new Set(salesRows.map((r) => r.nik_kar?.trim()).filter((n): n is string => !!n && n !== '0'))];
    const nikMap = new Map<string, string>();
    if (distinctNiks.length > 0) {
      const memberRows = await this.db.$queryRaw<{ nik: string | null; nama: string | null }[]>(
        Prisma.sql`SELECT nik, nama FROM m_anggota WHERE nik IN (${Prisma.join(distinctNiks)})`,
      );
      for (const m of memberRows) {
        const k = m.nik?.trim();
        const v = m.nama?.trim();
        if (k && v) nikMap.set(k, v);
      }
    }

    const sales = salesRows.map((row) => {
      const mapped = mapHeader(row, []);
      return {
        companyId: Number(row.company_id ?? companyId),
        saleId: mapped.saleId,
        salesCode: mapped.salesCode,
        saleDate: mapped.saleDate,
        customerName: mapped.customerName,
        memberNik: mapped.memberNik,
        memberMasterName: mapped.memberNik ? (nikMap.get(mapped.memberNik) ?? null) : null,
        createdBy: mapped.createdBy,
        source: mapped.source,
        salesStatus: mapped.salesStatus,
        paymentStatus: mapped.paymentStatus,
        paymentType: mapped.paymentType,
        recordStatus: mapped.recordStatus,
        returnBit: mapped.returnBit,
        grandTotalSen: mapped.grandTotalSen,
        paidSen: mapped.paidSen,
        registerId: mapped.registerId,
        registerReference: mapped.registerReference,
        cashierLabel: mapped.cashierLabel,
      };
    });

    const returns = returnRows.map((rt) => {
      const w: { code: string; field?: string }[] = [];
      const nik = rt.nik_kar?.trim();
      return {
        companyId: Number(rt.company_id ?? companyId),
        returnId: Number(rt.id),
        returnCode: rt.return_code,
        returnDate: rt.return_date,
        salesCode: rt.sales_code?.trim() || '',
        customerName: rt.customer_name?.trim() || 'Pelanggan Umum',
        memberNik: nik && nik !== '0' ? nik : null,
        refundMethod: rt.payment_type?.trim() || 'Cash',
        totalSen: money(rt.grand_total, w, 'returnTotal'),
        createdBy: rt.created_by?.trim() || '',
        note: rt.return_note?.trim() || '',
      };
    });

    const toNum = (d: Prisma.Decimal | null): number => (d === null ? 0 : Number(d.toString()));

    return {
      scope,
      query,
      generatedAt: now,
      stores,
      sales,
      returns,
      categories: catRows.map((c) => ({
        categoryId: Number(c.category_id),
        categoryName: c.category_name,
        uniqueItems: Number(c.unique_items),
        txCount: Number(c.tx_count),
        totalQty: toNum(c.total_qty),
        totalRevenueRp: toNum(c.total_revenue),
        estCogsRp: toNum(c.est_cogs),
      })),
      topItems: topItemRows.map((it) => ({
        itemId: Number(it.item_id),
        itemCode: it.item_code ?? '',
        barcode: it.barcode ?? '',
        itemName: it.item_name,
        categoryName: it.category_name,
        unitPriceRp: toNum(it.unit_price),
        purchasePriceRp: toNum(it.purchase_price),
        txCount: Number(it.tx_count),
        totalQty: toNum(it.total_qty),
        totalRevenueRp: toNum(it.total_revenue),
      })),
      storeItemTotals: storeItemRows.map((st) => ({
        companyId: Number(st.company_id),
        lineCount: Number(st.line_count),
        uniqueItems: Number(st.unique_items),
        totalQty: toNum(st.total_qty),
        totalRevenueRp: toNum(st.total_revenue),
        estCogsRp: toNum(st.est_cogs),
      })),
    };
  }
}
