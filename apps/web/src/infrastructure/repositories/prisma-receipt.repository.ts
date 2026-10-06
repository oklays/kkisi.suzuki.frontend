import { Prisma, type PrismaClient } from '@prisma/client';
import { toMinorUnits } from '@koperasi/domain/money';
import { PosError, isPaymentMethod } from '@koperasi/domain/pos/sale';
import { evaluateReprintEligibility, hasAmbiguousLegacyTotals, type ReprintFacts } from '@koperasi/domain/sales/history';
import type { Receipt, ReceiptReadMode } from '@koperasi/domain/pos/receipt';
import type { ReceiptRepository } from '@koperasi/application/pos/receipt';
import { prisma } from '../db/prisma.ts';
import { kreditReturnedSen } from './sales-return-ledger.ts';

type Row = {
  id: number; sales_code: string; sales_date: string; return_bit: string | null; company_name: string; address: string;
  created_by: string; customer_name: string; nik_kar: string | null; member_name: string | null;
  limit_amount: Prisma.Decimal | null; gaji_minus: Prisma.Decimal | null; payment_type: string; subtotal: Prisma.Decimal;
  total_discount: Prisma.Decimal; grand_total: Prisma.Decimal; paid_amount: Prisma.Decimal;
  change_return: Prisma.Decimal; other_charges_input: Prisma.Decimal | null; other_charges_amt: Prisma.Decimal; other_charges_tax_id: number; round_off: Prisma.Decimal;
  sales_status: string; payment_status: string; pos: number; ppob: number; record_status: number;
  line_count: number | bigint; eligible_line_count: number | bigint; foreign_line_count: number | bigint;
  active_payment_count: number | bigint; matching_payment_count: number | bigint; foreign_payment_count: number | bigint;
  line_id: number | null; item_id: number | null; item_name: string | null;
  description: string | null; sales_qty: number | null; price_per_unit: Prisma.Decimal | null;
  discount_amt: Prisma.Decimal | null; tax_id: number | null; tax_amt: Prisma.Decimal | null; tax_type: string | null; total_cost: Prisma.Decimal | null;
  line_status: number | null; line_sales_status: string | null;
};
const money = (value: Prisma.Decimal) => toMinorUnits(value.toFixed(2));
const safeMoney = (value: Prisma.Decimal | null): number | null => {
  if (value === null) return null;
  try { return money(value); } catch { return null; }
};

export class PrismaReceiptRepository implements ReceiptRepository {
  private readonly db: PrismaClient;
  constructor(db: PrismaClient = prisma) { this.db = db; }

  async find(companyId: number, saleId: number, mode: ReceiptReadMode = 'checkout'): Promise<Receipt | null> {
    // Scope the sale, every line, and the current item label to the signed-in company.
    const rows = await this.db.$queryRaw<Row[]>(Prisma.sql`SELECT s.id, s.sales_code, DATE_FORMAT(s.sales_date,'%Y-%m-%d') AS sales_date, ${mode === 'checkout' ? Prisma.sql`COALESCE(s.return_bit,'0')` : Prisma.sql`s.return_bit`} AS return_bit,
      c.company_name, c.address, s.created_by, s.customer_name, s.nik_kar,
      ${mode === 'checkout' ? Prisma.sql`m.nama_kar AS member_name,
        CAST(COALESCE(m.limit_toko,0) AS DECIMAL(18,2)) AS limit_amount,
        CAST(COALESCE(m.gaji_minus,0) AS DECIMAL(18,2)) AS gaji_minus` : Prisma.sql`NULL AS member_name, NULL AS limit_amount, NULL AS gaji_minus`}, s.payment_type,
      CAST(s.subtotal AS DECIMAL(18,2)) AS subtotal,
      CAST(${mode === 'checkout' ? Prisma.sql`COALESCE(s.tot_discount_to_all_amt,0)` : Prisma.sql`s.tot_discount_to_all_amt`} AS DECIMAL(18,2)) AS total_discount,
      CAST(s.grand_total AS DECIMAL(18,2)) AS grand_total,
      CAST(s.paid_amount AS DECIMAL(18,2)) AS paid_amount,
      CAST(CASE WHEN s.payment_type='Cash' THEN CAST(s.paid_amount AS DECIMAL(18,2))-CAST(s.grand_total AS DECIMAL(18,2)) ELSE 0 END AS DECIMAL(18,2)) AS change_return,
      CAST(s.other_charges_input AS DECIMAL(18,2)) AS other_charges_input,
      CAST(${mode === 'checkout' ? Prisma.sql`COALESCE(s.other_charges_amt,0)` : Prisma.sql`s.other_charges_amt`} AS DECIMAL(18,2)) AS other_charges_amt, COALESCE(s.other_charges_tax_id,0) AS other_charges_tax_id,
      CAST(s.round_off AS DECIMAL(18,2)) AS round_off,
      s.sales_status, s.payment_status, s.pos, s.ppob, s.status AS record_status,
      (SELECT COUNT(*) FROM db_salesitems all_si WHERE all_si.sales_id=s.id) AS line_count,
      (SELECT SUM(CASE WHEN eligible_si.company_id=${companyId} AND eligible_si.status=1 AND eligible_si.sales_status='Final' THEN 1 ELSE 0 END) FROM db_salesitems eligible_si WHERE eligible_si.sales_id=s.id) AS eligible_line_count,
      (SELECT SUM(CASE WHEN foreign_si.company_id<>${companyId} OR foreign_si.company_id IS NULL THEN 1 ELSE 0 END) FROM db_salesitems foreign_si WHERE foreign_si.sales_id=s.id) AS foreign_line_count,
      (SELECT SUM(CASE WHEN pay.company_id=${companyId} AND pay.status=1 THEN 1 ELSE 0 END) FROM db_salespayments pay WHERE pay.sales_id=s.id) AS active_payment_count,
      (SELECT SUM(CASE WHEN pay.company_id=${companyId} AND pay.status=1 AND pay.payment>0 AND pay.payment_type=s.payment_type THEN 1 ELSE 0 END) FROM db_salespayments pay WHERE pay.sales_id=s.id) AS matching_payment_count,
      (SELECT SUM(CASE WHEN pay.company_id<>${companyId} OR pay.company_id IS NULL THEN 1 ELSE 0 END) FROM db_salespayments pay WHERE pay.sales_id=s.id) AS foreign_payment_count,
      si.id AS line_id, si.item_id, i.item_name, si.description, si.sales_qty,
      CAST(si.price_per_unit AS DECIMAL(18,2)) AS price_per_unit,
      CAST(si.discount_amt AS DECIMAL(18,2)) AS discount_amt,
      si.tax_id, CAST(si.tax_amt AS DECIMAL(18,2)) AS tax_amt, si.tax_type,
      CAST(si.total_cost AS DECIMAL(18,2)) AS total_cost, si.status AS line_status, si.sales_status AS line_sales_status
      FROM db_sales s JOIN db_company c ON c.id = s.company_id AND c.status = 1
      ${mode === 'checkout' ? Prisma.sql`LEFT JOIN m_anggota m ON m.id = s.customer_id AND m.nik_kar = s.nik_kar` : Prisma.empty}
      LEFT JOIN db_salesitems si ON si.sales_id = s.id AND si.company_id = ${companyId} ${mode === 'checkout' ? Prisma.sql`AND si.sales_status = 'Final'` : Prisma.empty}
      LEFT JOIN db_items i ON i.id = si.item_id AND i.company_id = ${companyId}
      WHERE s.id = ${saleId} AND s.company_id = ${companyId} ${mode === 'checkout' ? Prisma.sql`AND s.sales_status = 'Final'` : Prisma.empty}
      ORDER BY si.id ${mode === 'reprint' ? Prisma.sql`LIMIT 201` : Prisma.empty}`);
    if (!rows.length) return null;
    const first = rows[0];
    if (!isPaymentMethod(first.payment_type) || (mode === 'checkout' && first.return_bit !== '0')) throw new PosError('RECEIPT_UNSUPPORTED');
    let taxTotalSen: number | null = null;
    if (mode === 'reprint') {
      const headerAmounts = [first.subtotal, first.total_discount, first.grand_total, first.paid_amount, first.other_charges_amt, first.round_off];
      const lines = rows.filter((row) => row.line_id !== null);
      const lineAmounts = lines.flatMap((row) => [row.price_per_unit, row.discount_amt, row.total_cost]);
      const taxAmounts = lines.map((row) => safeMoney(row.tax_amt));
      const mappedAmounts = [...headerAmounts, ...lineAmounts].map((value) => value === null ? null : safeMoney(value));
      const validMoney = mappedAmounts.every((value) => value !== null && Number.isSafeInteger(value) && value >= 0)
        && (first.other_charges_input == null || safeMoney(first.other_charges_input) !== null)
        && lines.every((row, index) => row.tax_amt === null || (taxAmounts[index] !== null && Number.isSafeInteger(taxAmounts[index]) && taxAmounts[index]! >= 0))
        && rows.every((row) => row.line_id === null || (row.sales_qty !== null && row.sales_qty > 0));
      const amount = safeMoney;
      const lineTotal = lines.filter((line) => line.line_status === 1 && line.line_sales_status === 'Final')
        .reduce((sum, line) => sum + (amount(line.total_cost) ?? 0), 0);
      if (!Number.isSafeInteger(lineTotal)) throw new PosError('RECEIPT_UNSUPPORTED');
      const taxTotal = taxAmounts.reduce<number>((sum, value) => sum + (value ?? 0), 0);
      taxTotalSen = Number.isSafeInteger(taxTotal) ? taxTotal : null;
      const totalLines = Number(first.line_count ?? 0); const eligibleLines = Number(first.eligible_line_count ?? 0);
      const foreignLines = Number(first.foreign_line_count ?? 0); const foreignPayments = Number(first.foreign_payment_count ?? 0);
      const facts: ReprintFacts = {
        source: first.pos === 1 && first.ppob === 0 ? 'pos' : 'nonpos', salesStatus: first.sales_status,
        paymentStatus: first.payment_status, paymentType: first.payment_type, recordStatus: first.record_status,
        returnBit: first.return_bit, hasItems: totalLines > 0 && totalLines === eligibleLines && foreignLines === 0,
        lineCount: totalLines, itemCount: eligibleLines, validMoney, grandTotalSen: amount(first.grand_total),
        paidSen: amount(first.paid_amount), subtotalSen: amount(first.subtotal), lineTotalSen: lineTotal,
        discountSen: amount(first.total_discount), otherChargesSen: amount(first.other_charges_amt),
        hasAmbiguousTax: hasAmbiguousLegacyTotals({
          paymentType: first.payment_type, grandTotalSen: amount(first.grand_total), paidSen: amount(first.paid_amount),
          otherChargesInputSen: amount(first.other_charges_input), otherChargesTaxId: first.other_charges_tax_id, roundOffSen: amount(first.round_off),
        }) || taxTotalSen === null || lines.some((line) => line.tax_amt === null
          ? Number(line.tax_id ?? 0) !== 0 || Boolean(line.tax_type)
          : (safeMoney(line.tax_amt) ?? 0) !== 0 && !line.tax_type),
        activePaymentCount: Number(first.active_payment_count ?? 0) + foreignPayments,
        paymentTypeMatches: Number(first.active_payment_count ?? 0) === Number(first.matching_payment_count ?? 0) && foreignPayments === 0,
      };
      if (!evaluateReprintEligibility(facts).allowed) throw new PosError('RECEIPT_UNSUPPORTED');
    }
    const nik = first.nik_kar?.trim();
    const memberNik = mode === 'reprint' ? (nik && nik !== '0' ? nik : null) : (nik && nik !== '0' && first.member_name ? nik : null);
    let limitSen: number | null = null, usedLimitSen: number | null = null, remainingLimitSen: number | null = null;
    if (memberNik && mode === 'checkout') {
      const monthStart = `${first.sales_date.slice(0, 7)}-01`;
      const monthEnd = new Date(Date.UTC(Number(first.sales_date.slice(0, 4)), Number(first.sales_date.slice(5, 7)), 1)).toISOString().slice(0, 10);
      // Sum Final Kredit across branches, including this saved sale when paid by Kredit.
      const [spent] = await this.db.$queryRaw<{ amount: Prisma.Decimal }[]>`SELECT CAST(COALESCE(SUM(CAST(grand_total AS DECIMAL(18,2))),0) AS DECIMAL(18,2)) AS amount FROM db_sales
        WHERE nik_kar = ${memberNik} AND payment_type = 'Kredit' AND sales_status = 'Final' AND sales_date >= ${monthStart} AND sales_date < ${monthEnd}`;
      limitSen = money(first.gaji_minus && first.gaji_minus.gt(0) ? first.gaji_minus : first.limit_amount!);
      usedLimitSen = Math.max(0, money(spent.amount) - await kreditReturnedSen(this.db, memberNik, monthStart, monthEnd));
      remainingLimitSen = limitSen - usedLimitSen;
    }
    return {
      saleId: first.id, salesCode: first.sales_code, saleDate: first.sales_date,
      storeName: first.company_name, storeAddress: first.address, cashier: first.created_by,
      customerName: mode === 'reprint' ? first.customer_name?.trim() || 'Nama pelanggan tidak tersimpan' : memberNik ? first.member_name! : 'UMUM', memberNik, paymentType: first.payment_type,
      limitSen, usedLimitSen, remainingLimitSen,
      hasReturns: first.return_bit === '1',
      mode,
      lines: rows.filter((row) => row.line_id !== null).map((row) => ({
        name: row.description?.trim() || row.item_name || `Item #${row.item_id}`, quantity: row.sales_qty!,
        unitPriceSen: money(row.price_per_unit!), discountSen: money(row.discount_amt!),
        totalSen: money(row.total_cost!), taxSen: row.tax_amt == null ? null : safeMoney(row.tax_amt),
      })),
      subtotalSen: money(first.subtotal), discountSen: money(first.total_discount),
      taxTotalSen,
      grandTotalSen: money(first.grand_total), paidSen: money(first.paid_amount), changeSen: money(first.change_return),
    };
  }
}
