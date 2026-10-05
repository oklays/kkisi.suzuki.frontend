import { Prisma, type PrismaClient } from '@prisma/client';
import type { MasterProduct, MasterProductPage, MasterProductQuery } from '@koperasi/domain/inventory';
import type { MasterProductRepository } from '@koperasi/application/inventory';
import { prisma } from '../db/prisma.ts';

type Row = Omit<MasterProduct, 'active' | 'locked' | 'sellingPrice' | 'purchasePrice' | 'discount'> & { status: number; statusSo: number; sellingPrice: Prisma.Decimal; purchasePrice: Prisma.Decimal; discount: Prisma.Decimal };
type Counts = { total: bigint; active: bigint | null; low: bigint | null; empty: bigint | null; locked: bigint | null };
const joins = Prisma.sql`LEFT JOIN db_category c ON c.id=a.category_id LEFT JOIN db_brands b ON b.id=a.brand_id LEFT JOIN db_units u ON u.id=a.unit_id LEFT JOIN db_tax t ON t.id=a.tax_id`;
const fields = Prisma.sql`a.id,a.item_code AS code,a.sku,a.custom_barcode AS barcode,a.custom_barcode_pack AS packBarcode,a.item_name AS name,
 c.category_name AS category,b.brand_name AS brand,u.unit_name AS unit,a.type,
 CAST(a.sales_price AS DECIMAL(18,2)) AS sellingPrice,CAST(a.purchase_price AS DECIMAL(18,2)) AS purchasePrice,CAST(a.discount AS DECIMAL(18,2)) AS discount,
 a.stock,a.alert_qty AS alertQty,a.status,a.status_so AS statusSo,t.tax_name AS tax,a.tax_type AS taxType,a.unit_perpack AS packQuantity,DATE_FORMAT(a.expire_date,'%Y-%m-%d') AS expiryDate`;

export class PrismaMasterProductRepository implements MasterProductRepository {
  private readonly db: PrismaClient;
  constructor(db: PrismaClient = prisma) { this.db = db; }
  async list(query: MasterProductQuery): Promise<MasterProductPage> {
    const clauses = [Prisma.sql`a.company_id=${query.companyId}`];
    if (query.term) {
      const like = `%${query.term.replace(/[\\%_]/g, '\\$&')}%`;
      clauses.push(Prisma.sql`(a.sku LIKE ${like} OR a.item_name LIKE ${like} OR a.item_code LIKE ${like} OR a.custom_barcode LIKE ${like} OR a.custom_barcode_pack LIKE ${like} OR c.category_name LIKE ${like} OR b.brand_name LIKE ${like})`);
    }
    if (query.categoryId !== undefined) clauses.push(Prisma.sql`a.category_id=${query.categoryId}`);
    if (query.brandId !== undefined) clauses.push(Prisma.sql`a.brand_id=${query.brandId}`);
    if (query.status !== 'all') clauses.push(Prisma.sql`a.status=${query.status === 'active' ? 1 : 0}`);
    if (query.stock === 'empty') clauses.push(Prisma.sql`a.stock<=0`);
    if (query.stock === 'low') clauses.push(Prisma.sql`a.stock>0 AND a.stock<=a.alert_qty`);
    if (query.stock === 'available') clauses.push(Prisma.sql`a.stock>0 AND a.stock>a.alert_qty`);
    if (query.stock === 'locked') clauses.push(Prisma.sql`a.status_so=1`);
    const where = Prisma.join(clauses, ' AND ');
    const order = { newest: Prisma.sql`a.id DESC`, name: Prisma.sql`a.item_name ASC,a.id ASC`, stock: Prisma.sql`a.stock ASC,a.id ASC`, price: Prisma.sql`a.sales_price ASC,a.id ASC` }[query.sort];
    // Read transaction: totals and page share a snapshot; only SELECT statements.
    return this.db.$transaction(async tx => {
      const [counts] = await tx.$queryRaw<Counts[]>(Prisma.sql`SELECT COUNT(*) AS total,SUM(a.status=1) AS active,SUM(a.stock>0 AND a.stock<=a.alert_qty) AS low,SUM(a.stock<=0) AS empty,SUM(a.status_so=1) AS locked FROM db_items a ${joins} WHERE ${where}`);
      const total = Number(counts.total);
      const page = Math.min(query.page, Math.max(1, Math.ceil(total / query.pageSize)));
      const items = await tx.$queryRaw<Row[]>(Prisma.sql`SELECT ${fields} FROM db_items a ${joins} WHERE ${where} ORDER BY ${order} LIMIT ${query.pageSize} OFFSET ${(page - 1) * query.pageSize}`);
      const categories = await tx.$queryRaw<{ id: number; name: string }[]>(Prisma.sql`SELECT DISTINCT c.id,c.category_name AS name FROM db_items a JOIN db_category c ON c.id=a.category_id WHERE a.company_id=${query.companyId} ORDER BY c.category_name,c.id`);
      const brands = await tx.$queryRaw<{ id: number; name: string }[]>(Prisma.sql`SELECT DISTINCT b.id,b.brand_name AS name FROM db_items a JOIN db_brands b ON b.id=a.brand_id WHERE a.company_id=${query.companyId} ORDER BY b.brand_name,b.id`);
      return { items: items.map(({ status, statusSo, ...r }) => ({ ...r, sellingPrice: r.sellingPrice.toFixed(2), purchasePrice: r.purchasePrice.toFixed(2), discount: r.discount.toFixed(2), active: status === 1, locked: statusSo === 1 })),
        total, page, pageSize: query.pageSize, summary: { total, active: Number(counts.active ?? 0), low: Number(counts.low ?? 0), empty: Number(counts.empty ?? 0), locked: Number(counts.locked ?? 0) }, categories, brands };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
