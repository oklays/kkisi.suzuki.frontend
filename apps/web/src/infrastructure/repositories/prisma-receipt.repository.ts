import { Prisma, type PrismaClient } from '@prisma/client';
import { toMinorUnits } from '@koperasi/domain/money';
import { PosError } from '@koperasi/domain/pos/sale';
import type { Receipt } from '@koperasi/domain/pos/receipt';
import type { ReceiptRepository } from '@koperasi/application/pos/receipt';
import { prisma } from '../db/prisma.ts';

type Row = {
  id: number; sales_code: string; sales_date: string; return_bit: string; company_name: string; address: string;
  created_by: string; customer_name: string; nik_kar: string | null; member_name: string | null;
  limit_amount: Prisma.Decimal | null; gaji_minus: Prisma.Decimal | null; payment_type: string; subtotal: Prisma.Decimal;
  total_discount: Prisma.Decimal; grand_total: Prisma.Decimal; paid_amount: Prisma.Decimal;
  change_return: Prisma.Decimal; line_id: number | null; item_name: string | null;
  description: string | null; sales_qty: number | null; price_per_unit: Prisma.Decimal | null;
  discount_amt: Prisma.Decimal | null; total_cost: Prisma.Decimal | null;
};
const money = (value: Prisma.Decimal) => toMinorUnits(value.toFixed(2));

export class PrismaReceiptRepository implements ReceiptRepository {
  private readonly db: PrismaClient;
  constructor(db: PrismaClient = prisma) { this.db = db; }

  async find(companyId: number, saleId: number): Promise<Receipt | null> {
    // Scope the sale, every line, and the current item label to the signed-in company.
    const rows = await this.db.$queryRaw<Row[]>(Prisma.sql`SELECT s.id, s.sales_code, DATE_FORMAT(s.sales_date,'%Y-%m-%d') AS sales_date, COALESCE(s.return_bit,'0') AS return_bit,
      c.company_name, c.address, s.created_by, s.customer_name, s.nik_kar, m.nama_kar AS member_name,
      CAST(COALESCE(m.limit_toko,0) AS DECIMAL(18,2)) AS limit_amount,
      CAST(COALESCE(m.gaji_minus,0) AS DECIMAL(18,2)) AS gaji_minus, s.payment_type,
      CAST(s.subtotal AS DECIMAL(18,2)) AS subtotal,
      CAST(COALESCE(s.tot_discount_to_all_amt,0) AS DECIMAL(18,2)) AS total_discount,
      CAST(s.grand_total AS DECIMAL(18,2)) AS grand_total,
      CAST(s.paid_amount AS DECIMAL(18,2)) AS paid_amount,
      CAST(CASE WHEN s.payment_type='Cash' THEN CAST(s.paid_amount AS DECIMAL(18,2))-CAST(s.grand_total AS DECIMAL(18,2)) ELSE 0 END AS DECIMAL(18,2)) AS change_return,
      si.id AS line_id, i.item_name, si.description, si.sales_qty,
      CAST(si.price_per_unit AS DECIMAL(18,2)) AS price_per_unit,
      CAST(si.discount_amt AS DECIMAL(18,2)) AS discount_amt,
      CAST(si.total_cost AS DECIMAL(18,2)) AS total_cost
      FROM db_sales s JOIN db_company c ON c.id = s.company_id AND c.status = 1
      LEFT JOIN m_anggota m ON m.id = s.customer_id AND m.nik_kar = s.nik_kar
      LEFT JOIN db_salesitems si ON si.sales_id = s.id AND si.company_id = ${companyId} AND si.sales_status = 'Final'
      LEFT JOIN db_items i ON i.id = si.item_id AND i.company_id = ${companyId}
      WHERE s.id = ${saleId} AND s.company_id = ${companyId} AND s.sales_status = 'Final'
      ORDER BY si.id`);
    if (!rows.length) return null;
    const first = rows[0];
    if (!['Cash', 'Kredit'].includes(first.payment_type) || first.return_bit !== '0') throw new PosError('RECEIPT_UNSUPPORTED');
    const memberNik = first.nik_kar?.trim() && first.member_name ? first.nik_kar : null;
    let limitSen: number | null = null, usedLimitSen: number | null = null, remainingLimitSen: number | null = null;
    if (memberNik) {
      const monthStart = `${first.sales_date.slice(0, 7)}-01`;
      const monthEnd = new Date(Date.UTC(Number(first.sales_date.slice(0, 4)), Number(first.sales_date.slice(5, 7)), 1)).toISOString().slice(0, 10);
      // Sum Final Kredit across branches, including this saved sale when paid by Kredit.
      const [spent] = await this.db.$queryRaw<{ amount: Prisma.Decimal }[]>`SELECT CAST(COALESCE(SUM(CAST(grand_total AS DECIMAL(18,2))),0) AS DECIMAL(18,2)) AS amount FROM db_sales
        WHERE nik_kar = ${memberNik} AND payment_type = 'Kredit' AND sales_status = 'Final' AND sales_date >= ${monthStart} AND sales_date < ${monthEnd}`;
      limitSen = money(first.gaji_minus && first.gaji_minus.gt(0) ? first.gaji_minus : first.limit_amount!);
      usedLimitSen = money(spent.amount);
      remainingLimitSen = limitSen - usedLimitSen;
    }
    return {
      saleId: first.id, salesCode: first.sales_code, saleDate: first.sales_date,
      storeName: first.company_name, storeAddress: first.address, cashier: first.created_by,
      customerName: memberNik ? first.member_name! : 'UMUM', memberNik, paymentType: first.payment_type === 'Kredit' ? 'Kredit' : 'Cash',
      limitSen, usedLimitSen, remainingLimitSen,
      lines: rows.filter((row) => row.line_id !== null).map((row) => ({
        name: row.item_name || row.description || 'Item', quantity: row.sales_qty!,
        unitPriceSen: money(row.price_per_unit!), discountSen: money(row.discount_amt!), totalSen: money(row.total_cost!),
      })),
      subtotalSen: money(first.subtotal), discountSen: money(first.total_discount),
      grandTotalSen: money(first.grand_total), paidSen: money(first.paid_amount), changeSen: money(first.change_return),
    };
  }
}
