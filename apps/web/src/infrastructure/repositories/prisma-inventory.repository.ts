import { Prisma, type PrismaClient } from '@prisma/client';
import { InventoryError, calculateStockCount, type StockOpname, type StockOpnameDetail, type StockOpnameLine, type Warehouse, type WarehouseInput, type StockOpnameCreate, type StockOpnameCount } from '@koperasi/domain/inventory';
import type { InventoryContext, InventoryRepository } from '@koperasi/application/inventory';
import { prisma } from '../db/prisma.ts';

type Db = PrismaClient | Prisma.TransactionClient;
type DocumentRow = { id: number; doc_no: string; periode: string; start_date: string | null; end_date: string | null; doc_status: number; doc_remarks: string | null; created_by: string };
type LineRow = { id: number; item_id: number; nama_barang: string; barcode: string; qty_system: number; qty_actual: number; qty_adjust: number; purchase_price: Prisma.Decimal; sub_total: Prisma.Decimal; note: string | null };
type ItemRow = { id: number; item_name: string; custom_barcode: string; stock: number; status: number; status_so: number; type: string; purchase_price: Prisma.Decimal; konsinyasi: number; expire_date: string | null };
const documentFields = Prisma.sql`id,doc_no,periode,DATE_FORMAT(doc_date_start,'%Y-%m-%d') AS start_date,DATE_FORMAT(doc_date_end,'%Y-%m-%d') AS end_date,doc_status,doc_remarks,created_by`;
const lineFields = Prisma.sql`id,item_id,nama_barang,barcode,qty_system,qty_actual,qty_adjust,CAST(purchase_price AS DECIMAL(18,2)) AS purchase_price,CAST(sub_total AS DECIMAL(18,2)) AS sub_total,note`;
const toDocument = (r: DocumentRow): StockOpname => ({ id: r.id, docNo: r.doc_no, period: r.periode, startDate: r.start_date, endDate: r.end_date, status: r.doc_status as 0 | 1, remarks: r.doc_remarks ?? '', createdBy: r.created_by, managed: /^NXT-SO-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(r.doc_no) });
const toLine = (r: LineRow): StockOpnameLine => ({ itemId: r.item_id, name: r.nama_barang, barcode: r.barcode, systemQty: r.qty_system, actualQty: r.qty_actual, adjustmentQty: r.qty_adjust, purchasePrice: r.purchase_price.toFixed(2), subtotal: r.sub_total.toFixed(2), note: r.note ?? '' });
const toDetail = (document: DocumentRow, lines: LineRow[]): StockOpnameDetail => ({ document: toDocument(document), lines: lines.map(toLine) });
const dates = (now: Date) => { const time = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 19).replace('T', ' '); return { time, day: time.slice(0, 10) }; };

async function documentRow(db: Db, ctx: InventoryContext, id: number, lock = false): Promise<DocumentRow | undefined> {
  const rows = await db.$queryRaw<DocumentRow[]>(Prisma.sql`SELECT ${documentFields} FROM db_inventory_so WHERE company_id = ${ctx.companyId} AND id = ${id} ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`);
  return rows[0];
}
async function documentLines(db: Db, id: number, lock = false): Promise<LineRow[]> {
  const rows = await db.$queryRaw<LineRow[]>(Prisma.sql`SELECT ${lineFields} FROM db_inventory_so_dtl WHERE so_id = ${id} ORDER BY item_id,id LIMIT 501 ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`);
  if (rows.length > 500) throw new InventoryError('INVALID_INPUT');
  return rows;
}
function owned(document: DocumentRow, username: string, draft = true): void {
  if (!toDocument(document).managed || (draft && document.doc_status !== 0)) throw new InventoryError('DOCUMENT_IMMUTABLE');
  if (document.created_by !== username) throw new InventoryError('FORBIDDEN');
}
function uniqueLines(lines: LineRow[]): void {
  if (new Set(lines.map((l) => l.item_id)).size !== lines.length || lines.some((l) => !Number.isInteger(l.item_id) || l.item_id <= 0)) throw new InventoryError('INVALID_INPUT');
}
async function lockedItems(tx: Prisma.TransactionClient, ctx: InventoryContext, ids: number[]): Promise<ItemRow[]> {
  if (!ids.length) return [];
  return tx.$queryRaw<ItemRow[]>(Prisma.sql`SELECT id,item_name,custom_barcode,stock,status,status_so,type,CAST(purchase_price AS DECIMAL(18,2)) AS purchase_price,konsinyasi,DATE_FORMAT(expire_date,'%Y-%m-%d') AS expire_date
    FROM db_items WHERE company_id = ${ctx.companyId} AND id IN (${Prisma.join([...ids].sort((a, b) => a - b))}) ORDER BY id FOR UPDATE`);
}
function activeItem(item: ItemRow | undefined): asserts item is ItemRow {
  if (!item || item.status !== 1 || item.type !== 'Produk Jadi' || item.custom_barcode === 'SALDOPPOB') throw new InventoryError('NOT_FOUND');
}
async function checkCompeting(tx: Prisma.TransactionClient, ctx: InventoryContext, id: number, ids: number[]): Promise<void> {
  if (!ids.length) return;
  const conflicts = await tx.$queryRaw<{ so_id: number }[]>(Prisma.sql`SELECT d.so_id FROM db_inventory_so_dtl d JOIN db_inventory_so s ON s.id = d.so_id
    WHERE s.company_id = ${ctx.companyId} AND s.doc_status = 0 AND s.id <> ${id} AND d.item_id IN (${Prisma.join([...ids].sort((a, b) => a - b))}) ORDER BY d.item_id,s.id LIMIT 1 FOR UPDATE`);
  if (conflicts.length) throw new InventoryError('STOCK_LOCKED');
}

export class PrismaInventoryRepository implements InventoryRepository {
  private readonly read: PrismaClient;
  private readonly write?: PrismaClient;
  constructor(read: PrismaClient = prisma, write?: PrismaClient) { this.read = read; this.write = write; }
  async list(ctx: InventoryContext): Promise<StockOpname[]> {
    const rows = await this.read.$queryRaw<DocumentRow[]>(Prisma.sql`SELECT ${documentFields} FROM db_inventory_so WHERE company_id = ${ctx.companyId} ORDER BY id DESC LIMIT 50`);
    return rows.map(toDocument);
  }
  async detail(ctx: InventoryContext, id: number): Promise<StockOpnameDetail> {
    const document = await documentRow(this.read, ctx, id);
    if (!document) throw new InventoryError('NOT_FOUND');
    return toDetail(document, await documentLines(this.read, id));
  }
  async items(ctx: InventoryContext, term: string) {
    const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
    const rows = await this.read.$queryRaw<{ id: number; item_name: string; custom_barcode: string; stock: number; status_so: number }[]>(Prisma.sql`SELECT id,item_name,custom_barcode,stock,status_so FROM db_items
      WHERE company_id = ${ctx.companyId} AND status = 1 AND type = 'Produk Jadi' AND custom_barcode <> 'SALDOPPOB'
      ${term ? Prisma.sql`AND (item_name LIKE ${like} OR item_code LIKE ${like} OR custom_barcode LIKE ${like} OR custom_barcode_pack LIKE ${like})` : Prisma.empty}
      ORDER BY item_name,id LIMIT 25`);
    return rows.map((r) => ({ id: r.id, name: r.item_name, barcode: r.custom_barcode, stock: r.stock, locked: r.status_so !== 0 }));
  }
  async warehouses(ctx: InventoryContext): Promise<Warehouse[]> {
    if (!ctx.canSwitchBranch) throw new InventoryError('FORBIDDEN');
    return this.read.$queryRaw<Warehouse[]>`SELECT id,warehouse_name AS name,mobile,email,status FROM db_warehouse ORDER BY warehouse_name,id LIMIT 50`;
  }
  private async transaction<T>(ctx: InventoryContext, global: boolean, operation: (tx: Prisma.TransactionClient, username: string) => Promise<T>): Promise<T> {
    if (!this.write) throw new InventoryError('WRITE_NOT_CONFIGURED');
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.write.$transaction(async (tx) => {
          // ponytail: serialize global name checks on the first active company; dedicated mutex only if contention warrants it.
          if (global) {
            const [mutex] = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM db_company WHERE status = 1 ORDER BY id LIMIT 1 FOR UPDATE`;
            if (!mutex) throw new InventoryError('FORBIDDEN');
          }
          const [company] = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM db_company WHERE id = ${ctx.companyId} AND status = 1 FOR UPDATE`;
          if (!company) throw new InventoryError('FORBIDDEN');
          const [user] = await tx.$queryRaw<{ username: string }[]>(Prisma.sql`SELECT u.username FROM db_users u JOIN db_roles r ON r.id = u.role_id AND r.status = 1
            WHERE u.id = ${ctx.userId} AND u.status = 1 AND (u.role_id <= 2 OR u.company_id = ${ctx.companyId})
            ${global ? Prisma.sql`AND u.role_id <= 2` : Prisma.empty}
            AND EXISTS(SELECT 1 FROM db_permissions p WHERE p.role_id = u.role_id AND p.permissions = ${global ? 'inventory_view' : 'inventory_so'}) FOR UPDATE`);
          if (!user || (global && !ctx.canSwitchBranch)) throw new InventoryError('FORBIDDEN');
          return operation(tx, user.username);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 15000, timeout: 15000 });
      } catch (error) {
        const e = error as { code?: string; meta?: { code?: string } };
        if (attempt >= 2 || !(e.code === 'P2034' || (e.code === 'P2010' && ['1205', '1213'].includes(String(e.meta?.code))))) throw error;
      }
    }
  }
  async saveWarehouse(ctx: InventoryContext, input: WarehouseInput): Promise<Warehouse> {
    return this.transaction(ctx, true, async (tx) => {
      const sameName = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM db_warehouse WHERE LOWER(warehouse_name) = LOWER(${input.name}) AND id <> ${input.id ?? 0} LIMIT 1 FOR UPDATE`;
      if (sameName.length) throw new InventoryError('NAME_EXISTS');
      let id = input.id;
      if (id !== undefined) {
        const [existing] = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM db_warehouse WHERE id = ${id} FOR UPDATE`;
        if (!existing) throw new InventoryError('NOT_FOUND');
        await tx.$executeRaw`UPDATE db_warehouse SET warehouse_name = ${input.name},mobile = ${input.mobile},email = ${input.email},status = ${input.status} WHERE id = ${id}`;
      } else {
        await tx.$executeRaw`INSERT INTO db_warehouse (warehouse_name,mobile,email,status) VALUES (${input.name},${input.mobile},${input.email},${input.status})`;
        const [inserted] = await tx.$queryRaw<{ id: bigint }[]>`SELECT LAST_INSERT_ID() AS id`; id = Number(inserted.id);
      }
      return { id, name: input.name, mobile: input.mobile, email: input.email, status: input.status };
    });
  }
  async create(ctx: InventoryContext, input: StockOpnameCreate, now: Date): Promise<StockOpname> {
    return this.transaction(ctx, false, async (tx, username) => {
      const docNo = `NXT-SO-${input.requestKey}`;
      const saved = await tx.$queryRaw<DocumentRow[]>(Prisma.sql`SELECT ${documentFields} FROM db_inventory_so WHERE company_id = ${ctx.companyId} AND doc_no = ${docNo} LIMIT 2 FOR UPDATE`);
      if (saved.length) {
        const r = saved[0];
        if (saved.length !== 1 || r.created_by !== username || r.doc_status !== 0 || r.periode !== input.period || r.start_date !== input.startDate || r.end_date !== input.endDate || (r.doc_remarks ?? '') !== input.remarks) throw new InventoryError('REQUEST_CONFLICT');
        return toDocument(r);
      }
      const { day, time } = dates(now);
      await tx.$executeRaw`INSERT INTO db_inventory_so (doc_no,periode,periode_bl,periode_th,doc_date_start,doc_date_end,doc_status,doc_remarks,company_id,created_by,created_date,created_time)
        VALUES (${docNo},${input.period},${input.startDate.slice(5, 7)},${Number(input.startDate.slice(0, 4))},${input.startDate},${input.endDate},0,${input.remarks},${ctx.companyId},${username},${day},${time})`;
      const [inserted] = await tx.$queryRaw<{ id: bigint }[]>`SELECT LAST_INSERT_ID() AS id`;
      return { id: Number(inserted.id), docNo, period: input.period, startDate: input.startDate, endDate: input.endDate, remarks: input.remarks, status: 0, createdBy: username, managed: true };
    });
  }
  async count(ctx: InventoryContext, input: StockOpnameCount, now: Date): Promise<StockOpnameDetail> {
    return this.transaction(ctx, false, async (tx, username) => {
      const document = await documentRow(tx, ctx, input.id, true);
      if (!document) throw new InventoryError('NOT_FOUND');
      owned(document, username);
      const lines = await documentLines(tx, input.id, true); uniqueLines(lines);
      const line = lines.find((l) => l.item_id === input.itemId);
      if (!line && lines.length >= 500) throw new InventoryError('INVALID_INPUT');
      const ids = [...new Set([...lines.map((l) => l.item_id), input.itemId])];
      const items = await lockedItems(tx, ctx, ids);
      if (items.length !== ids.length) throw new InventoryError('NOT_FOUND');
      const item = items.find((i) => i.id === input.itemId); activeItem(item);
      await checkCompeting(tx, ctx, input.id, [input.itemId]);
      if ((line && item.status_so !== 1) || (!line && item.status_so !== 0)) throw new InventoryError('STOCK_LOCKED');
      if (line && item.stock !== line.qty_system) throw new InventoryError('STOCK_CHANGED');
      const systemQty = line?.qty_system ?? item.stock, purchasePrice = (line?.purchase_price ?? item.purchase_price).toFixed(2);
      const { adjustmentQty, subtotal } = calculateStockCount(systemQty, input.actualQty, purchasePrice);
      if (line) {
        await tx.$executeRaw`UPDATE db_inventory_so_dtl SET qty_actual = ${input.actualQty},qty_adjust = ${adjustmentQty},sub_total = ${subtotal},note = ${input.note} WHERE id = ${line.id} AND so_id = ${input.id}`;
        Object.assign(line, { qty_actual: input.actualQty, qty_adjust: adjustmentQty, sub_total: new Prisma.Decimal(subtotal), note: input.note });
      } else {
        const { day, time } = dates(now), barcode = item.custom_barcode.slice(0, 50), expiry = item.expire_date ?? '9999-12-31';
        await tx.$executeRaw`INSERT INTO db_inventory_so_dtl (so_id,item_id,barcode,nama_barang,qty_system,qty_actual,qty_adjust,purchase_price,sub_total,note,created_by,created_date,created_time,status,konsinyasi,expire,item_type)
          VALUES (${input.id},${item.id},${barcode},${item.item_name},${systemQty},${input.actualQty},${adjustmentQty},${purchasePrice},${subtotal},${input.note},${username},${day},${time},1,${item.konsinyasi},${expiry},${item.type})`;
        const changed = await tx.$executeRaw`UPDATE db_items SET status_so = 1 WHERE company_id = ${ctx.companyId} AND id = ${item.id} AND status_so = 0`;
        if (changed !== 1) throw new InventoryError('STOCK_LOCKED');
        lines.push({ id: 0, item_id: item.id, nama_barang: item.item_name, barcode, qty_system: systemQty, qty_actual: input.actualQty, qty_adjust: adjustmentQty, purchase_price: new Prisma.Decimal(purchasePrice), sub_total: new Prisma.Decimal(subtotal), note: input.note });
        lines.sort((a, b) => a.item_id - b.item_id);
      }
      return toDetail(document, lines);
    });
  }
  async approve(ctx: InventoryContext, id: number, now: Date): Promise<StockOpnameDetail> {
    return this.transaction(ctx, false, async (tx, username) => {
      const document = await documentRow(tx, ctx, id, true);
      if (!document) throw new InventoryError('NOT_FOUND');
      owned(document, username, false);
      const lines = await documentLines(tx, id, true);
      if (document.doc_status === 1) return toDetail(document, lines);
      if (document.doc_status !== 0) throw new InventoryError('DOCUMENT_IMMUTABLE');
      if (!lines.length) throw new InventoryError('EMPTY_DOCUMENT');
      uniqueLines(lines);
      const items = await lockedItems(tx, ctx, lines.map((l) => l.item_id));
      const byId = new Map(items.map((i) => [i.id, i]));
      await checkCompeting(tx, ctx, id, lines.map((l) => l.item_id));
      const prepared = lines.map((line) => {
        const item = byId.get(line.item_id); activeItem(item);
        if (item.status_so !== 1) throw new InventoryError('STOCK_LOCKED');
        if (item.stock !== line.qty_system) throw new InventoryError('STOCK_CHANGED');
        const calculated = calculateStockCount(line.qty_system, line.qty_actual, line.purchase_price.toFixed(2));
        if (calculated.adjustmentQty !== line.qty_adjust || calculated.subtotal !== line.sub_total.toFixed(2)) throw new InventoryError('INVALID_INPUT');
        return { line, item };
      });
      const { time } = dates(now);
      for (const { line, item } of prepared) {
        const changed = await tx.$executeRaw`UPDATE db_items SET stock = ${line.qty_actual},status_so = 0 WHERE company_id = ${ctx.companyId} AND id = ${item.id} AND status_so = 1 AND stock = ${line.qty_system}`;
        if (changed !== 1) throw new InventoryError('STOCK_CHANGED');
        await tx.$executeRaw`INSERT INTO db_stockentry (entry_date,item_id,qty,expire_date,company_id,status,note) VALUES (${time},${item.id},${line.qty_adjust},${item.expire_date},${ctx.companyId},1,'Penyesuaian')`;
      }
      await tx.$executeRaw`UPDATE db_inventory_so SET doc_status = 1 WHERE id = ${id} AND company_id = ${ctx.companyId} AND doc_status = 0`;
      document.doc_status = 1;
      return toDetail(document, lines);
    });
  }
  async cancel(ctx: InventoryContext, id: number): Promise<void> {
    return this.transaction(ctx, false, async (tx, username) => {
      const document = await documentRow(tx, ctx, id, true);
      if (!document) return;
      owned(document, username);
      const lines = await documentLines(tx, id, true); uniqueLines(lines);
      const items = await lockedItems(tx, ctx, lines.map((l) => l.item_id));
      if (items.length !== lines.length) throw new InventoryError('NOT_FOUND');
      await checkCompeting(tx, ctx, id, lines.map((l) => l.item_id));
      if (items.some((item) => item.status_so !== 1)) throw new InventoryError('STOCK_LOCKED');
      for (const item of items) {
        const changed = await tx.$executeRaw`UPDATE db_items SET status_so = 0 WHERE company_id = ${ctx.companyId} AND id = ${item.id} AND status_so = 1`;
        if (changed !== 1) throw new InventoryError('STOCK_LOCKED');
      }
      await tx.$executeRaw`DELETE FROM db_inventory_so_dtl WHERE so_id = ${id}`;
      await tx.$executeRaw`DELETE FROM db_inventory_so WHERE id = ${id} AND company_id = ${ctx.companyId} AND doc_status = 0`;
    });
  }
}
