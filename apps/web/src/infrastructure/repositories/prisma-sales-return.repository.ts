import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { toMinorUnits } from '@koperasi/domain/money';
import { businessDates, decimalAmount, isPaymentMethod, PosError } from '@koperasi/domain/pos/sale';
import { evaluateReturnEligibility, priceReturn, type ReturnFacts, type ReturnListQuery, type ReturnRequest, type ReturnableLine } from '@koperasi/domain/sales/return';
import type { CreatedReturn, ReturnActor, ReturnContextFacts, ReturnContextLine, ReturnDocument, ReturnSummary, SalesReturnRepository } from '@koperasi/application/sales/returns';
import { prisma } from '../db/prisma.ts';
import { sessionRefunds } from './sales-return-ledger.ts';

type Decimal = Prisma.Decimal;
type SaleRow = {
  id: number; sales_code: string; sales_date: string; customer_id: number | null; customer_name: string | null; nik_kar: string | null;
  payment_type: string; payment_status: string; sales_status: string; record_status: number; pos: number;
  grand_total: Decimal | null; subtotal: Decimal | null; discount: Decimal | null; paid_amount: Decimal | null; other_charges_tax_id: number | null;
};
type LineRow = {
  item_id: number; barcode: string | null; label: string | null; sold: bigint | number | null; total: Decimal | null;
  price: Decimal | null; discount: Decimal | null; purchase_price: Decimal | null; tax_id: number | null; tax_type: string | null; item_type: string | null;
  foreign_rows: bigint | number; inactive_rows: bigint | number; invalid_rows: bigint | number; tax: Decimal | null;
};
type ReturnedRow = { item_id: number; qty: bigint | number | null; amount: Decimal | null };
type SummaryRow = {
  id: number; return_code: string; returned_at: string; sales_id: number | null; sales_code: string | null; payment_type: string;
  grand_total: Decimal | null; return_note: string | null; created_by: string; customer_name: string | null;
};

const money = (value: Decimal | null): number | null => {
  if (value === null) return null;
  try { return toMinorUnits(value.toFixed(2)); } catch { return null; }
};
const n = (value: bigint | number | null) => Number(value ?? 0);
const localTime = (now: Date) => new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 19).replace('T', ' ');

const saleColumns = Prisma.sql`s.id, s.sales_code, DATE_FORMAT(s.sales_date,'%Y-%m-%d') AS sales_date, s.customer_id, s.customer_name, s.nik_kar,
  s.payment_type, s.payment_status, s.sales_status, s.status AS record_status, s.pos,
  CAST(s.grand_total AS DECIMAL(18,2)) AS grand_total, CAST(s.subtotal AS DECIMAL(18,2)) AS subtotal,
  CAST(s.tot_discount_to_all_amt AS DECIMAL(18,2)) AS discount, CAST(s.paid_amount AS DECIMAL(18,2)) AS paid_amount, s.other_charges_tax_id`;

/** Sale rows grouped per item. Rows of another branch, inactive or invalid rows make the sale unsupported. */
function lineQuery(companyId: number, saleId: number) {
  return Prisma.sql`SELECT si.item_id, MIN(si.barcode) AS barcode,
    MIN(COALESCE(NULLIF(TRIM(si.description),''), i.item_name)) AS label, SUM(si.sales_qty) AS sold,
    CAST(SUM(CAST(si.total_cost AS DECIMAL(18,2))) AS DECIMAL(18,2)) AS total,
    CAST(MAX(si.price_per_unit) AS DECIMAL(18,2)) AS price, CAST(MAX(si.discount_amt) AS DECIMAL(18,2)) AS discount,
    CAST(MAX(si.purchase_price) AS DECIMAL(18,2)) AS purchase_price, MAX(si.tax_id) AS tax_id, MAX(si.tax_type) AS tax_type, MAX(si.item_type) AS item_type,
    SUM(CASE WHEN si.company_id <> ${companyId} THEN 1 ELSE 0 END) AS foreign_rows,
    SUM(CASE WHEN si.status <> 1 OR si.sales_status <> 'Final' THEN 1 ELSE 0 END) AS inactive_rows,
    SUM(CASE WHEN si.sales_qty IS NULL OR si.sales_qty <= 0 OR si.total_cost IS NULL OR si.total_cost < 0 OR si.total_cost > 90071992547409.91 THEN 1 ELSE 0 END) AS invalid_rows,
    CAST(SUM(COALESCE(si.tax_amt,0)) AS DECIMAL(18,2)) AS tax
    FROM db_salesitems si LEFT JOIN db_items i ON i.id = si.item_id AND i.company_id = ${companyId}
    WHERE si.sales_id = ${saleId} GROUP BY si.item_id ORDER BY si.item_id`;
}
/** Every return row of the sale counts, whatever wrote it, so a unit is never refunded twice. */
const returnedQuery = (saleId: number) => Prisma.sql`SELECT item_id, SUM(return_qty) AS qty,
  CAST(SUM(CAST(COALESCE(total_cost,0) AS DECIMAL(18,2))) AS DECIMAL(18,2)) AS amount FROM db_salesitemsreturn WHERE sales_id = ${saleId} GROUP BY item_id`;

function facts(sale: SaleRow, lines: LineRow[], returned: ReturnedRow[]): { facts: ReturnFacts; lines: (ReturnableLine & { row: LineRow })[] } {
  const byItem = new Map(returned.map((row) => [Number(row.item_id), row]));
  let lineTotal = 0; let consistent = lines.length > 0;
  const mapped = lines.map((row) => {
    const totalSen = money(row.total); const back = byItem.get(Number(row.item_id)); const returnedSen = back ? money(back.amount) : 0;
    if (totalSen === null || returnedSen === null || n(row.foreign_rows) || n(row.inactive_rows) || n(row.invalid_rows) || money(row.tax) !== 0) consistent = false;
    lineTotal += totalSen ?? 0;
    return { itemId: Number(row.item_id), soldQty: n(row.sold), returnedQty: n(back?.qty ?? 0), totalSen: totalSen ?? 0, returnedSen: returnedSen ?? 0, row };
  });
  // Items returned that are not on the sale mean the history was written by something else: do not reason about it.
  if (returned.some((row) => !lines.some((line) => Number(line.item_id) === Number(row.item_id)))) consistent = false;
  const grand = money(sale.grand_total), subtotal = money(sale.subtotal), discount = money(sale.discount), paid = money(sale.paid_amount);
  if (grand === null || grand <= 0 || subtotal !== lineTotal || grand !== subtotal || discount !== 0 || paid === null || paid < grand || Number(sale.other_charges_tax_id ?? 0) !== 0) consistent = false;
  return {
    facts: {
      salesStatus: sale.sales_status, recordStatus: Number(sale.record_status), paymentType: sale.payment_type, paymentStatus: sale.payment_status,
      saleDate: sale.sales_date, customerId: Number(sale.customer_id ?? 0), consistentTotals: consistent,
      lines: mapped.map(({ itemId, soldQty, returnedQty, totalSen, returnedSen }) => ({ itemId, soldQty, returnedQty, totalSen, returnedSen })),
    },
    lines: mapped,
  };
}

function summary(row: SummaryRow): ReturnSummary {
  return {
    returnId: Number(row.id), returnCode: row.return_code, returnedAt: row.returned_at, saleId: row.sales_id ? Number(row.sales_id) : null,
    salesCode: row.sales_code, refundMethod: row.payment_type, totalSen: money(row.grand_total), reason: row.return_note ?? '',
    createdBy: row.created_by, customerName: row.customer_name?.trim() || 'Pelanggan tidak tersimpan',
  };
}
const summaryColumns = Prisma.sql`h.id, h.return_code, DATE_FORMAT(h.return_date,'%Y-%m-%d %H:%i:%s') AS returned_at, h.sales_id, s.sales_code,
  h.payment_type, CAST(h.grand_total AS DECIMAL(18,2)) AS grand_total, h.return_note, h.created_by, s.customer_name`;

export class PrismaSalesReturnRepository implements SalesReturnRepository {
  private readonly read: PrismaClient;
  private readonly write?: PrismaClient;
  constructor(read: PrismaClient = prisma, write?: PrismaClient) { this.read = read; this.write = write; }

  async context(companyId: number, saleId: number): Promise<ReturnContextFacts | null> {
    const [sale] = await this.read.$queryRaw<SaleRow[]>(Prisma.sql`SELECT ${saleColumns} FROM db_sales s WHERE s.id = ${saleId} AND s.company_id = ${companyId} AND s.ppob = 0 LIMIT 1`);
    if (!sale) return null;
    const [lineRows, returnedRows, returns] = await Promise.all([
      this.read.$queryRaw<LineRow[]>(lineQuery(companyId, saleId)),
      this.read.$queryRaw<ReturnedRow[]>(returnedQuery(saleId)),
      this.read.$queryRaw<SummaryRow[]>(Prisma.sql`SELECT ${summaryColumns} FROM db_salesreturn h LEFT JOIN db_sales s ON s.id = h.sales_id AND s.company_id = h.company_id
        WHERE h.sales_id = ${saleId} AND h.company_id = ${companyId} ORDER BY h.id`),
    ]);
    const derived = facts(sale, lineRows, returnedRows);
    const nik = sale.nik_kar?.trim();
    return {
      sale: { saleId: Number(sale.id), salesCode: sale.sales_code, saleDate: sale.sales_date, customerName: sale.customer_name?.trim() || 'Pelanggan tidak tersimpan',
        memberNik: nik && nik !== '0' ? nik : null, paymentType: sale.payment_type, grandTotalSen: money(sale.grand_total) ?? 0 },
      facts: derived.facts,
      lines: derived.lines.map(({ row, ...line }): ReturnContextLine => ({ ...line, label: row.label?.trim() || `Item #${row.item_id}`, barcode: row.barcode ?? '',
        unitPriceSen: money(row.price) ?? 0, unitDiscountSen: money(row.discount) ?? 0 })),
      returns: returns.map(summary),
    };
  }

  async list(companyId: number, query: ReturnListQuery): Promise<{ rows: ReturnSummary[]; total: number }> {
    const after = new Date(Date.parse(`${query.to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const clauses = [Prisma.sql`h.company_id = ${companyId}`, Prisma.sql`h.return_date >= ${query.from}`, Prisma.sql`h.return_date < ${after}`];
    if (query.q) {
      const pattern = `%${query.q.replace(/[!%_]/g, (char) => `!${char}`)}%`;
      clauses.push(Prisma.sql`(h.return_code LIKE ${pattern} ESCAPE '!' OR s.sales_code LIKE ${pattern} ESCAPE '!' OR s.customer_name LIKE ${pattern} ESCAPE '!')`);
    }
    const where = Prisma.join(clauses, ' AND ');
    const from = Prisma.sql`FROM db_salesreturn h LEFT JOIN db_sales s ON s.id = h.sales_id AND s.company_id = h.company_id WHERE ${where}`;
    const [count, rows] = await Promise.all([
      this.read.$queryRaw<{ total: bigint | number }[]>(Prisma.sql`SELECT COUNT(*) AS total ${from}`),
      this.read.$queryRaw<SummaryRow[]>(Prisma.sql`SELECT ${summaryColumns} ${from} ORDER BY h.return_date DESC, h.id DESC LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`),
    ]);
    return { rows: rows.map(summary), total: n(count[0]?.total ?? 0) };
  }

  async document(companyId: number, returnId: number): Promise<ReturnDocument | null> {
    const [header] = await this.read.$queryRaw<(SummaryRow & { company_name: string; address: string | null; nik_kar: string | null; sales_date: string | null; sale_payment_type: string | null })[]>(Prisma.sql`SELECT ${summaryColumns},
      c.company_name, c.address, s.nik_kar, DATE_FORMAT(s.sales_date,'%Y-%m-%d') AS sales_date, s.payment_type AS sale_payment_type
      FROM db_salesreturn h JOIN db_company c ON c.id = h.company_id LEFT JOIN db_sales s ON s.id = h.sales_id AND s.company_id = h.company_id
      WHERE h.id = ${returnId} AND h.company_id = ${companyId} LIMIT 1`);
    if (!header) return null;
    const lines = await this.read.$queryRaw<{ item_id: number; label: string | null; return_qty: number; price: Decimal | null; total: Decimal | null }[]>`SELECT r.item_id,
      COALESCE(NULLIF(TRIM(r.description),''), i.item_name) AS label, r.return_qty, CAST(r.price_per_unit AS DECIMAL(18,2)) AS price,
      CAST(r.total_cost AS DECIMAL(18,2)) AS total FROM db_salesitemsreturn r LEFT JOIN db_items i ON i.id = r.item_id AND i.company_id = ${companyId}
      WHERE r.return_id = ${returnId} AND r.company_id = ${companyId} ORDER BY r.id LIMIT 201`;
    const nik = header.nik_kar?.trim();
    return {
      ...summary(header), storeName: header.company_name, storeAddress: header.address ?? '', memberNik: nik && nik !== '0' ? nik : null,
      saleDate: header.sales_date, salePaymentType: header.sale_payment_type,
      lines: lines.map((line) => ({ itemId: Number(line.item_id), label: line.label?.trim() || `Item #${line.item_id}`, quantity: Number(line.return_qty),
        unitPriceSen: money(line.price), refundSen: money(line.total) })),
    };
  }

  async create(actor: ReturnActor, saleId: number, request: ReturnRequest, now: Date): Promise<CreatedReturn> {
    if (!this.write) throw new PosError('WRITE_NOT_CONFIGURED');
    // Retries restart the ENTIRE transaction; a lost commit response is answered from the persisted reference.
    for (let attempt = 0; ; attempt++) {
      try { return await this.write.$transaction((tx) => this.persist(tx, actor, saleId, request, now), { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 15000, timeout: 15000 }); }
      catch (error) {
        const e = error as { code?: string; meta?: { code?: string } };
        if (attempt >= 2 || !(e.code === 'P2034' || (e.code === 'P2010' && ['1205', '1213'].includes(String(e.meta?.code))))) throw error;
      }
    }
  }

  private async persist(tx: Prisma.TransactionClient, actor: ReturnActor, saleId: number, request: ReturnRequest, now: Date): Promise<CreatedReturn> {
    const { companyId, userId } = actor;
    const dates = businessDates(now);
    // Branch mutex, same order as checkout and register close: company -> user -> documents.
    const [company] = await tx.$queryRaw<{ sales_return_init: string | null }[]>`SELECT sales_return_init FROM db_company WHERE id = ${companyId} AND status = 1 FOR UPDATE`;
    if (!company) throw new PosError('FORBIDDEN');
    const [user] = await tx.$queryRaw<{ username: string }[]>`SELECT u.username FROM db_users u JOIN db_roles r ON r.id = u.role_id AND r.status = 1
      WHERE u.id = ${userId} AND u.status = 1 AND (u.role_id <= 2 OR u.company_id = ${companyId})
      AND EXISTS(SELECT 1 FROM db_permissions p WHERE p.role_id = u.role_id AND p.permissions = 'sales_return_add') FOR UPDATE`;
    if (!user) throw new PosError('FORBIDDEN');

    const reference = `NXR-${createHash('sha256').update(`${companyId}:${userId}:${request.idempotencyKey}`).digest('hex').slice(0, 40)}`;
    const saved = await tx.$queryRaw<{ id: number; return_code: string; sales_id: number; payment_type: string; grand_total: Decimal }[]>`SELECT id, return_code, sales_id, payment_type,
      CAST(grand_total AS DECIMAL(18,2)) AS grand_total FROM db_salesreturn WHERE company_id = ${companyId} AND reference_no = ${reference} LIMIT 2`;
    if (saved.length) {
      const savedLines = await tx.$queryRaw<{ item_id: number; return_qty: number }[]>`SELECT item_id, return_qty FROM db_salesitemsreturn WHERE return_id = ${saved[0].id} ORDER BY item_id`;
      const same = saved.length === 1 && Number(saved[0].sales_id) === saleId && savedLines.length === request.items.length
        && savedLines.every((line, index) => Number(line.item_id) === request.items[index].itemId && Number(line.return_qty) === request.items[index].quantity);
      if (!same || (saved[0].payment_type !== 'Cash' && saved[0].payment_type !== 'Kredit')) throw new PosError('IDEMPOTENCY_CONFLICT');
      return { returnId: Number(saved[0].id), returnCode: saved[0].return_code, saleId, totalSen: toMinorUnits(saved[0].grand_total.toFixed(2)), refundMethod: saved[0].payment_type, replayed: true };
    }

    // Row lock on the sale serializes every return of it, so remaining quantities cannot be refunded twice.
    const [sale] = await tx.$queryRaw<SaleRow[]>(Prisma.sql`SELECT ${saleColumns} FROM db_sales s WHERE s.id = ${saleId} AND s.company_id = ${companyId} AND s.ppob = 0 FOR UPDATE`);
    if (!sale) throw new PosError('SALE_NOT_FOUND');
    const lineRows = await tx.$queryRaw<LineRow[]>(lineQuery(companyId, saleId));
    const returnedRows = await tx.$queryRaw<ReturnedRow[]>(returnedQuery(saleId));
    const derived = facts(sale, lineRows, returnedRows);
    const eligibility = evaluateReturnEligibility(derived.facts, dates.day);
    if (!eligibility.allowed || !eligibility.refundMethod || !isPaymentMethod(sale.payment_type)) {
      const order = ['NON_FINAL', 'INACTIVE_RECORD', 'PAYMENT_METHOD_UNSUPPORTED', 'PAYMENT_NOT_SETTLED', 'LEGACY_TOTALS_UNSUPPORTED', 'SALE_DATE_INVALID', 'CREDIT_PERIOD_CLOSED', 'RETURN_WINDOW_EXPIRED', 'MEMBER_MISSING', 'FULLY_RETURNED'];
      throw new PosError(order.find((code) => (eligibility.reasons as string[]).includes(code)) ?? 'RETURN_NOT_ALLOWED');
    }
    const refundMethod = eligibility.refundMethod;
    const priced = priceReturn(derived.facts.lines, request.items);

    // The refund is handled at the counter: the cashier's own open session of today records it (id_kasir is mandatory).
    const registers = await tx.$queryRaw<{ id: number; id_kasir: number; opened_on: string; opened_at: string; saldo_awal: Decimal; kasir_status: number | null }[]>`SELECT b.id, b.id_kasir,
      DATE_FORMAT(b.tgl_buka,'%Y-%m-%d') AS opened_on, DATE_FORMAT(b.tgl_buka,'%Y-%m-%d %H:%i:%s') AS opened_at, b.saldo_awal, k.status AS kasir_status
      FROM db_buka_kasir b LEFT JOIN db_kasir k ON k.id = b.id_kasir AND k.company_id = ${companyId}
      WHERE b.company_id = ${companyId} AND b.user_id = ${userId} AND b.status = 1 ORDER BY b.id FOR UPDATE`;
    if (!registers.length) throw new PosError('REGISTER_CLOSED');
    if (registers.length !== 1) throw new PosError('REGISTER_AMBIGUOUS');
    const register = registers[0];
    if (register.opened_on !== dates.day) throw new PosError('REGISTER_STALE');
    if (register.kasir_status !== 1) throw new PosError('REGISTER_CLOSED');
    if (refundMethod === 'Cash') {
      // Cash handed back must physically be in this drawer: opening balance + Cash sales - Cash refunds of the session.
      const [cash] = await tx.$queryRaw<{ amount: Decimal }[]>`SELECT CAST(COALESCE(SUM(CAST(grand_total AS DECIMAL(18,2))),0) AS DECIMAL(18,2)) AS amount FROM db_sales
        WHERE company_id = ${companyId} AND id_buka_kasir = ${register.id} AND sales_status = 'Final' AND payment_type = 'Cash'`;
      const refunded = await sessionRefunds(tx, { companyId, idKasir: register.id_kasir, username: user.username, openedAt: register.opened_at });
      const available = toMinorUnits(register.saldo_awal.toFixed(2)) + toMinorUnits(cash.amount.toFixed(2)) - refunded.cashSen;
      if (priced.totalSen > available) throw new PosError('DRAWER_INSUFFICIENT');
    }

    const itemIds = priced.lines.map((line) => line.itemId);
    const items = await tx.$queryRaw<{ id: number; status_so: number }[]>(Prisma.sql`SELECT id, status_so FROM db_items
      WHERE company_id = ${companyId} AND id IN (${Prisma.join(itemIds)}) ORDER BY id FOR UPDATE`);
    if (items.length !== itemIds.length) throw new PosError('ITEM_UNAVAILABLE');
    if (items.some((item) => Number(item.status_so) === 1)) throw new PosError('STOCK_OPNAME');

    const init = company.sales_return_init ?? '';
    if (!/^[A-Za-z0-9-]{1,20}$/.test(init)) throw new PosError('RETURN_CODE_CONFIG');
    // Monthly per-branch sequence: init + yyMMdd + 5 digits. Legacy codes are init + 4 digits, so lengths never collide.
    const [{ maximum }] = await tx.$queryRaw<{ maximum: number | bigint | null }[]>`SELECT MAX(CAST(RIGHT(return_code,5) AS UNSIGNED)) AS maximum FROM db_salesreturn
      WHERE company_id = ${companyId} AND return_code LIKE ${`${init}${dates.monthCode}%`} AND CHAR_LENGTH(return_code) = ${init.length + 11}`;
    const sequence = Number(maximum ?? 0) + 1;
    if (sequence > 99999) throw new PosError('RETURN_CODE_EXHAUSTED');
    const returnCode = `${init}${dates.dayCode}${String(sequence).padStart(5, '0')}`;
    const [{ n: collision }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM db_salesreturn WHERE company_id = ${companyId} AND return_code = ${returnCode}`;
    if (Number(collision)) throw new PosError('RETURN_CODE_CONFLICT');

    const at = localTime(now); const total = decimalAmount(priced.totalSen); const customerId = Number(sale.customer_id ?? 0);
    // Every NOT NULL column without a default is written explicitly (the server runs STRICT_TRANS_TABLES).
    await tx.$executeRaw`INSERT INTO db_salesreturn (return_code, return_date, customer_id, reference_no, grand_total, paid_amount, sales_id, other_charges_amt,
      tot_discount_to_all_amt, return_status, pos, payment_status, other_charges_input, other_charges_tax_id, discount_to_all_input, subtotal, return_note, round_off,
      created_by, created_date, system_ip, system_name, status, company_id, discount_to_all_type, payment_type, id_kasir)
      VALUES (${returnCode}, ${at}, ${customerId}, ${reference}, ${total}, ${total}, ${saleId}, 0, 0, 'Return', ${String(Number(sale.pos))}, 1, NULL, NULL, 0, ${total},
      ${request.reason}, 0, ${user.username}, ${dates.day}, '', 'Next.js POS', 1, ${companyId}, '', ${refundMethod}, ${register.id_kasir})`;
    const [{ id }] = await tx.$queryRaw<{ id: bigint }[]>`SELECT LAST_INSERT_ID() AS id`;
    const returnId = Number(id);
    const values = priced.lines.map((line) => {
      const row = derived.lines.find((candidate) => candidate.itemId === line.itemId)!.row;
      const price = money(row.price) ?? 0, discount = money(row.discount) ?? 0, cost = money(row.purchase_price) ?? 0;
      const refund = decimalAmount(line.refundSen);
      return Prisma.sql`(${saleId}, ${returnId}, ${reference}, ${at}, 'Return', ${customerId}, ${decimalAmount(price)}, ${decimalAmount(cost)}, 0, 0, 0, 0, '', 0, ${refund},
        ${decimalAmount(discount * line.quantity)}, ${decimalAmount(discount)}, 'Fixed', 0, ${row.tax_type ?? ''}, ${Number(row.tax_id ?? 0)}, 0,
        ${decimalAmount(Math.floor(line.refundSen / line.quantity))}, ${refund}, ${refund}, '', ${line.quantity}, ${line.itemId}, ${companyId},
        ${(row.label ?? '').slice(0, 250)}, 1, ${row.item_type || 'Produk Jadi'})`;
    });
    await tx.$executeRaw(Prisma.sql`INSERT INTO db_salesitemsreturn (sales_id, return_id, reference_no, return_date, return_status, customer_id, price_per_unit, purchase_price,
      other_charges_input, other_charges_tax_id, other_charges_amt, discount_to_all_input, discount_to_all_type, tot_discount_to_all_amt, subtotal,
      discount_amt, discount_input, discount_type, tax_amt, tax_type, tax_id, round_off, unit_total_cost, total_cost, grand_total, return_note, return_qty, item_id, company_id,
      description, status, item_type) VALUES ${Prisma.join(values)}`);
    const note = refundMethod === 'Cash' ? `Refund tunai retur ${returnCode}` : `Pengurangan tagihan kredit retur ${returnCode}`;
    await tx.$executeRaw`INSERT INTO db_salespaymentsreturn (return_id, sales_id, payment_date, payment_type, payment, payment_note, created_date, created_by, system_ip, system_name, status, company_id)
      VALUES (${returnId}, ${saleId}, ${at}, ${refundMethod}, ${total}, ${note}, ${dates.day}, ${user.username}, '', 'Next.js POS', 1, ${companyId})`;
    // Legacy stock = opening + purchases + sales returns - purchase returns - sales (Pos_model::update_items_quantity):
    // the rows above already count in that ledger, so the cached stock moves by the same amount.
    for (const line of priced.lines) {
      const changed = await tx.$executeRaw`UPDATE db_items SET stock = stock + ${line.quantity} WHERE id = ${line.itemId} AND company_id = ${companyId} AND status_so = 0`;
      if (changed !== 1) throw new PosError('ITEM_UNAVAILABLE');
    }
    const flagged = await tx.$executeRaw`UPDATE db_sales SET return_bit = '1' WHERE id = ${saleId} AND company_id = ${companyId}`;
    if (flagged !== 1) {
      // MariaDB reports 0 affected rows when the flag was already '1' (an earlier partial return).
      const [{ flag }] = await tx.$queryRaw<{ flag: string }[]>`SELECT return_bit AS flag FROM db_sales WHERE id = ${saleId} AND company_id = ${companyId}`;
      if (flag !== '1') throw new PosError('POS_UNAVAILABLE');
    }
    return { returnId, returnCode, saleId, totalSen: priced.totalSen, refundMethod, replayed: false };
  }
}
