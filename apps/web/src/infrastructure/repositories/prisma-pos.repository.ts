import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { toMinorUnits } from '@koperasi/domain/money';
import { businessDates, decimalAmount, memberCredit, PosError, type CheckoutInput, type CheckoutResult, type MemberCredit, type MemberRecord } from '@koperasi/domain/pos/sale';
import type { MemberLookupKind, PosContext, PosRepository } from '@koperasi/application/pos/checkout';
import { prisma } from '../db/prisma.ts';

type Db = PrismaClient | Prisma.TransactionClient;
type MemberRow = { id: number; nik: string | null; name: string | null; status: string | null; employment: string | null; exit_on: Date | null; limit_amount: Prisma.Decimal; gaji_minus: Prisma.Decimal };
const memberRecord = (r: MemberRow): MemberRecord => ({ id: r.id, nik: r.nik ?? '', name: r.name ?? '', status: r.status ?? '', employment: r.employment ?? '', exitOn: r.exit_on?.toISOString().slice(0, 10) ?? null, limitSen: toMinorUnits(r.limit_amount.toFixed(2)), gajiMinusSen: toMinorUnits(r.gaji_minus.toFixed(2)) });
const memberFields = Prisma.sql`m.id, m.nik_kar AS nik, m.nama_kar AS name, m.status_anggota AS status, m.status_karyawan AS employment, m.tgl_keluar AS exit_on, CAST(COALESCE(m.limit_toko,0) AS DECIMAL(18,2)) AS limit_amount, CAST(m.gaji_minus AS DECIMAL(18,2)) AS gaji_minus`;

async function credit(db: Db, row: MemberRow, now: Date): Promise<MemberCredit> {
  const dates = businessDates(now);
  // R3: deliberately all branches. Scoping this aggregate to session.companyId would permit excess credit.
  const [spent] = await db.$queryRaw<{ amount: Prisma.Decimal }[]>`SELECT CAST(COALESCE(SUM(CAST(grand_total AS DECIMAL(18,2))),0) AS DECIMAL(18,2)) AS amount FROM db_sales
    WHERE nik_kar = ${row.nik} AND payment_type = 'Kredit' AND sales_status = 'Final' AND sales_date >= ${dates.monthStart} AND sales_date < ${dates.monthEnd}`;
  return memberCredit(memberRecord(row), toMinorUnits(spent.amount.toFixed(2)), now);
}

type SavedRow = { id: number; sales_code: string; grand_total: Prisma.Decimal; paid_amount: Prisma.Decimal; change_return: Prisma.Decimal; payment_type: 'Cash' | 'Kredit'; sales_note: string | null };
const result = (row: SavedRow): CheckoutResult => ({ saleId: row.id, salesCode: row.sales_code, grandTotalSen: toMinorUnits(row.grand_total.toFixed(2)), paidSen: toMinorUnits(row.paid_amount.toFixed(2)), changeSen: toMinorUnits(row.change_return.toFixed(2)), paymentType: row.payment_type });

export class PrismaPosRepository implements PosRepository {
  private readonly read: PrismaClient;
  private readonly write?: PrismaClient;
  constructor(read: PrismaClient = prisma, write?: PrismaClient) { this.read = read; this.write = write; }

  async member(context: PosContext, identifier: string, now: Date, kind: MemberLookupKind = 'identifier'): Promise<MemberCredit> {
    if (!['identifier', 'nik', 'card', 'id'].includes(kind)) throw new PosError('INVALID_INPUT');
    if (kind === 'id' && (!/^[1-9]\d{0,9}$/.test(identifier) || Number(identifier) > 2147483647)) throw new PosError('INVALID_INPUT');
    const find = (field: Exclude<MemberLookupKind, 'identifier'>) => {
      const condition = field === 'id' ? Prisma.sql`m.id = ${Number(identifier)}`
        : field === 'nik' ? Prisma.sql`m.nik_kar = ${identifier}` : Prisma.sql`m.id_card = ${identifier}`;
      return this.read.$queryRaw<MemberRow[]>(Prisma.sql`SELECT ${memberFields} FROM m_anggota m
        JOIN db_company c ON c.id = ${context.companyId} AND c.status = 1
        WHERE ${condition} ORDER BY m.id LIMIT 2`);
    };
    // Compatibility for old callers: exact NIK first, card fallback only if no NIK matches.
    // Never combine identity namespaces: another member's card may equal this member's NIK.
    let rows = await find(kind === 'identifier' ? 'nik' : kind);
    if (kind === 'identifier' && !rows.length) rows = await find('card');
    if (!rows.length) throw new PosError('MEMBER_NOT_FOUND');
    if (rows.length > 1) throw new PosError('MEMBER_AMBIGUOUS');
    return credit(this.read, rows[0], now);
  }

  async checkout(context: PosContext, input: CheckoutInput, now: Date): Promise<CheckoutResult> {
    if (!this.write) throw new PosError('WRITE_NOT_CONFIGURED');
    // Retries restart the ENTIRE transaction. A lost commit response is handled by the same persisted reference.
    for (let attempt = 0; ; attempt++) {
      try { return await this.write.$transaction((tx) => this.finalize(tx, context, input, now), { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 15000, timeout: 15000 }); }
      catch (error) {
        const e = error as { code?: string; meta?: { code?: string } };
        if (attempt >= 2 || !(e.code === 'P2034' || (e.code === 'P2010' && ['1205', '1213'].includes(String(e.meta?.code))))) throw error;
      }
    }
  }

  private async finalize(tx: Prisma.TransactionClient, context: PosContext, input: CheckoutInput, now: Date): Promise<CheckoutResult> {
    const { companyId, userId } = context;
    const dates = businessDates(now);
    // ponytail: branch mutex serializes Next checkouts; use a dedicated counter if measured throughput requires it.
    const [company] = await tx.$queryRaw<{ sales_init: string }[]>`SELECT sales_init FROM db_company WHERE id = ${companyId} AND status = 1 FOR UPDATE`;
    if (!company) throw new PosError('FORBIDDEN');
    const [user] = await tx.$queryRaw<{ username: string }[]>`SELECT u.username FROM db_users u JOIN db_roles r ON r.id = u.role_id AND r.status = 1
      WHERE u.id = ${userId} AND u.status = 1 AND (u.role_id <= 2 OR u.company_id = ${companyId})
      AND EXISTS(SELECT 1 FROM db_permissions p WHERE p.role_id = u.role_id AND p.permissions = 'sales_add') FOR UPDATE`;
    if (!user) throw new PosError('FORBIDDEN');
    const reference = `NXT-${createHash('sha256').update(`${companyId}:${userId}:${input.idempotencyKey}`).digest('hex').slice(0, 40)}`;
    const digest = `next-pos:v1:${createHash('sha256').update(JSON.stringify({ items: input.items, memberId: input.memberId, paymentType: input.paymentType, paidSen: input.paidSen })).digest('hex')}`;
    const saved = await tx.$queryRaw<SavedRow[]>`SELECT id, sales_code, CAST(grand_total AS DECIMAL(18,2)) AS grand_total, paid_amount,
      CAST(other_charges_amt AS DECIMAL(18,2)) AS change_return, payment_type, sales_note FROM db_sales WHERE company_id = ${companyId} AND reference_no = ${reference} AND sales_status = 'Final' LIMIT 2`;
    if (saved.length) {
      if (saved.length !== 1 || saved[0].sales_note !== digest) throw new PosError('IDEMPOTENCY_CONFLICT');
      return result(saved[0]);
    }
    const registers = await tx.$queryRaw<{ id: number; id_kasir: number; opened_on: string; kasir_status: number | null }[]>`SELECT b.id, b.id_kasir, DATE_FORMAT(b.tgl_buka,'%Y-%m-%d') AS opened_on, k.status AS kasir_status
      FROM db_buka_kasir b LEFT JOIN db_kasir k ON k.id = b.id_kasir AND k.company_id = ${companyId}
      WHERE b.company_id = ${companyId} AND b.user_id = ${userId} AND b.status = 1 ORDER BY b.id FOR UPDATE`;
    if (!registers.length) throw new PosError('REGISTER_CLOSED');
    if (registers.length !== 1) throw new PosError('REGISTER_AMBIGUOUS');
    const register = registers[0];
    if (register.opened_on !== dates.day) throw new PosError('REGISTER_STALE');
    if (register.kasir_status !== 1) throw new PosError('REGISTER_CLOSED');

    let member: MemberCredit | null = null;
    if (input.memberId !== null) {
      // Global row lock: concurrent Kredit checkouts from DIFFERENT companies must serialize on the same member.
      const rows = await tx.$queryRaw<MemberRow[]>(Prisma.sql`SELECT ${memberFields} FROM m_anggota m WHERE m.id = ${input.memberId} FOR UPDATE`);
      if (!rows[0]) throw new PosError('MEMBER_NOT_FOUND');
      member = await credit(tx, rows[0], now);
      const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM m_anggota WHERE nik_kar = ${member.nik}`;
      if (Number(n) !== 1) throw new PosError('MEMBER_AMBIGUOUS');
    }
    if (input.paymentType === 'Kredit' && !member) throw new PosError('MEMBER_REQUIRED');

    type ItemRow = { id: number; custom_barcode: string; sales_price: Prisma.Decimal; purchase_price: Prisma.Decimal; discount: Prisma.Decimal; stock: number; status: number; status_so: number; type: string };
    const rows = await tx.$queryRaw<ItemRow[]>(Prisma.sql`SELECT id, custom_barcode, CAST(sales_price AS DECIMAL(18,2)) AS sales_price,
      CAST(purchase_price AS DECIMAL(18,2)) AS purchase_price, CAST(discount AS DECIMAL(18,2)) AS discount, stock, status, status_so, type FROM db_items
      WHERE company_id = ${companyId} AND id IN (${Prisma.join(input.items.map((i) => i.itemId))}) ORDER BY id FOR UPDATE`);
    if (rows.length !== input.items.length) throw new PosError('ITEM_UNAVAILABLE');
    let total = 0; let hpp = 0; let discounts = 0;
    const lines = input.items.map((line, index) => {
      const item = rows[index];
      if (item.id !== line.itemId || item.status !== 1) throw new PosError('ITEM_UNAVAILABLE');
      if (item.status_so === 1) throw new PosError('STOCK_OPNAME');
      if (item.type !== 'Produk Jadi' || item.custom_barcode === 'SALDOPPOB') throw new PosError('PPOB_UNSUPPORTED');
      if (item.stock < line.quantity) throw new PosError('INSUFFICIENT_STOCK');
      const price = toMinorUnits(item.sales_price.toFixed(2));
      const cost = toMinorUnits(item.purchase_price.toFixed(2));
      const discount = toMinorUnits(item.discount.toFixed(2));
      if (price <= 0 || cost < 0 || discount < 0 || discount >= price) throw new PosError('INVALID_PRICE');
      const net = price - discount;
      total += net * line.quantity; hpp += cost * line.quantity; discounts += discount * line.quantity;
      return { ...line, item, price, cost, discount, net };
    });
    if (![total, hpp, discounts].every(Number.isSafeInteger) || total > 999_999_999_900) throw new PosError('INVALID_AMOUNT');
    const paid = input.paymentType === 'Cash' ? input.paidSen : total;
    if (input.paymentType === 'Kredit' && total % 100 !== 0) throw new PosError('PAYMENT_PRECISION');
    if (paid < total) throw new PosError('INSUFFICIENT_PAYMENT');
    if (input.paymentType === 'Kredit' && member!.remainingSen < total) throw new PosError('CREDIT_LIMIT');
    const change = input.paymentType === 'Cash' ? paid - total : 0;

    if (!company.sales_init || !/^[A-Za-z0-9-]{1,20}$/.test(company.sales_init)) throw new PosError('INVOICE_CONFIG');
    const prefix = `${company.sales_init}${dates.monthCode}`;
    const [{ maximum }] = await tx.$queryRaw<{ maximum: number | null }[]>`SELECT MAX(CAST(RIGHT(sales_code,5) AS UNSIGNED)) AS maximum FROM db_sales
      WHERE company_id = ${companyId} AND sales_code LIKE ${`${prefix}%`} AND CHAR_LENGTH(sales_code) = ${company.sales_init.length + 11}`;
    const sequence = Number(maximum ?? 0) + 1;
    if (sequence > 99999) throw new PosError('INVOICE_EXHAUSTED');
    const salesCode = `${company.sales_init}${dates.dayCode}${String(sequence).padStart(5, '0')}`;
    const [{ n: collision }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM db_sales WHERE company_id = ${companyId} AND sales_code = ${salesCode}`;
    if (Number(collision)) throw new PosError('INVOICE_CONFLICT');
    const customerId = member?.id ?? 0; const nik = member?.nik ?? '0';
    await tx.$executeRaw`INSERT INTO db_sales
      (sales_code, customer_id, nik_kar, customer_name, paid_amount, grand_total, sales_status, sales_date, tot_discount_to_all_amt,
       other_charges_input, other_charges_amt, subtotal_hpp, subtotal, round_off, created_date, created_by, system_ip, system_name,
       pos, status, payment_status, return_bit, reference_no, sales_note, company_id, payment_type, id_kasir, id_buka_kasir, type_order, ppob, admin, jw, in_proses)
      VALUES (${salesCode},${customerId},${nik},${member?.name ?? 'UMUM'},${decimalAmount(paid)},${decimalAmount(total)},'Final',${dates.day},0,
       ${decimalAmount(change)},${decimalAmount(change)},${decimalAmount(hpp)},${decimalAmount(total)},${decimalAmount(Math.floor((total + 50) / 100) * 100)},${dates.day},${user.username},'','Next.js POS',
       1,1,'Paid','0',${reference},${digest},${companyId},${input.paymentType},${register.id_kasir},${register.id},0,0,0,0,0)`;
    const [{ id }] = await tx.$queryRaw<{ id: bigint }[]>`SELECT LAST_INSERT_ID() AS id`;
    const saleId = Number(id);
    const values = lines.map((line) => Prisma.sql`(${saleId},${customerId},${line.itemId},${line.item.custom_barcode.slice(0, 50)},${salesCode},'Final',${line.quantity},'',${decimalAmount(line.cost)},0,
      ${decimalAmount(line.price)},0,0,0,'','',0,${decimalAmount(line.discount)},${decimalAmount(line.net)},${decimalAmount(line.net * line.quantity)},1,${companyId},'Produk Jadi',${register.id_kasir},${register.id})`);
    await tx.$executeRaw(Prisma.sql`INSERT INTO db_salesitems (sales_id,customer_id,item_id,barcode,sales_code,sales_status,sales_qty,description,purchase_price,purchase_price_pack,
      price_per_unit,price_per_pack,tax_id,tax_amt,tax_type,discount_type,discount_input,discount_amt,unit_total_cost,total_cost,status,company_id,item_type,id_kasir,id_buka_kasir) VALUES ${Prisma.join(values)}`);
    await tx.$executeRaw`INSERT INTO db_salespayments (sales_id,customer_id,payment,payment_date,payment_type,payment_note,created_date,created_by,system_ip,system_name,change_return,status,company_id)
      VALUES (${saleId},${customerId},${decimalAmount(paid)},${dates.day},${input.paymentType},${`Dibayar By ${input.paymentType}`},${dates.day},${user.username},'','Next.js POS',${decimalAmount(change)},1,${companyId})`;
    for (const line of lines) {
      const changed = await tx.$executeRaw`UPDATE db_items SET stock = stock - ${line.quantity} WHERE id = ${line.itemId} AND company_id = ${companyId} AND status = 1 AND status_so = 0 AND stock >= ${line.quantity}`;
      if (changed !== 1) throw new PosError('INSUFFICIENT_STOCK');
    }
    // db_cart has NO company/user columns. Ownership comes from its draft sale and current cashier register.
    // Ambiguous code-only legacy cart rows are preserved instead of deleting another branch's cart.
    await tx.$executeRaw`DELETE cart FROM db_cart cart JOIN db_sales draft ON
      (cart.sales_id = draft.id OR (cart.sales_id IS NULL AND cart.sales_code = draft.sales_code AND NOT EXISTS (SELECT 1 FROM db_sales duplicate WHERE duplicate.sales_code = draft.sales_code AND duplicate.id <> draft.id)))
      WHERE draft.company_id = ${companyId} AND draft.id_buka_kasir = ${register.id} AND draft.id_kasir = ${register.id_kasir}
      AND draft.created_by = ${user.username} AND draft.sales_status = 'Quotation'`;
    return { saleId, salesCode, grandTotalSen: total, paidSen: paid, changeSen: change, paymentType: input.paymentType };
  }
}
