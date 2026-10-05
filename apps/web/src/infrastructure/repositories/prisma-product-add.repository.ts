import { Prisma, type PrismaClient } from '@prisma/client';
import { ProductEditError, productPricing, type ProductCreateInput, type ProductCreateOptions, type ProductCreateResult, type ProductEditOption, type ProductTaxOption } from '@koperasi/domain/inventory';
import type { ProductActor, ProductAddMeta, ProductAddRepository } from '@koperasi/application/inventory';
import { prisma } from '../db/prisma.ts';
import { productWritePrisma } from '../db/prisma-product-write.ts';
import { productWriteTransaction, times } from './prisma-product-edit.repository.ts';

type Db = PrismaClient | Prisma.TransactionClient;
type TaxRow = { id: number; name: string; rate: Prisma.Decimal };
const activeOptions = (db: Db, table: 'db_category' | 'db_brands' | 'db_units', name: string) =>
  db.$queryRaw<ProductEditOption[]>(Prisma.sql`SELECT id,${Prisma.raw(name)} AS name,1 AS active FROM ${Prisma.raw(table)} WHERE status=1 ORDER BY ${Prisma.raw(name)},id`);
const taxes = (db: Db, id?: number) => db.$queryRaw<TaxRow[]>(Prisma.sql`SELECT id,tax_name AS name,CAST(tax AS DECIMAL(18,2)) AS rate FROM db_tax WHERE status=1 ${id ? Prisma.sql`AND id=${id}` : Prisma.empty} ORDER BY id`);
// Legacy Items_model::verify_and_save: item_init + zero-padded (highest branch item id + 1).
const legacyCode = (prefix: string, next: number) => `${prefix}${String(next).padStart(4, '0')}`;

export class PrismaProductAddRepository implements ProductAddRepository {
  private readonly read: PrismaClient;
  private readonly write?: PrismaClient;
  constructor(read: PrismaClient = prisma, write?: PrismaClient) { this.read = read; this.write = write; }
  async options(ctx: ProductActor): Promise<ProductCreateOptions> {
    const [categories, brands, units, taxRows, company] = await Promise.all([
      activeOptions(this.read, 'db_category', 'category_name'), activeOptions(this.read, 'db_brands', 'brand_name'), activeOptions(this.read, 'db_units', 'unit_name'), taxes(this.read),
      this.read.$queryRaw<{ prefix: string }[]>`SELECT item_init AS prefix FROM db_company WHERE id=${ctx.companyId} AND status=1`,
    ]);
    if (!company.length) throw new ProductEditError('FORBIDDEN');
    const normalize = (values: ProductEditOption[]) => values.map(v => ({ ...v, active: true }));
    return { categories: normalize(categories), brands: normalize(brands), units: normalize(units), taxes: taxRows.map((t): ProductTaxOption => ({ id: t.id, name: t.name, rate: t.rate.toFixed(2) })), codePrefix: company[0].prefix };
  }
  async add(ctx: ProductActor, input: ProductCreateInput, meta: ProductAddMeta): Promise<ProductCreateResult> {
    return productWriteTransaction(this.write, ctx, 'items_add', async (tx, username) => {
      // The company row lock taken by the transaction serialises adds per branch, so duplicate checks below cannot race.
      for (const [table, id] of [['db_category', input.categoryId], ['db_units', input.unitId], ['db_brands', input.brandId]] as const) {
        if (id === null) continue;
        const found = await tx.$queryRaw<{ id: number }[]>(Prisma.sql`SELECT id FROM ${Prisma.raw(table)} WHERE id=${id} AND status=1 LIMIT 1`);
        if (!found.length) throw new ProductEditError('INVALID_INPUT');
      }
      const [tax] = await taxes(tx, input.taxId);
      if (!tax) throw new ProductEditError('INVALID_INPUT');
      for (const code of [input.barcode, input.packBarcode].filter(Boolean)) {
        const same = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM db_items WHERE company_id=${ctx.companyId} AND (custom_barcode=${code} OR custom_barcode_pack=${code}) LIMIT 1`;
        if (same.length) throw new ProductEditError('IDENTIFIER_EXISTS');
      }
      if (input.sku) {
        const same = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM db_items WHERE company_id=${ctx.companyId} AND sku=${input.sku} LIMIT 1`;
        if (same.length) throw new ProductEditError('IDENTIFIER_EXISTS');
      }
      let code = input.code;
      if (code) {
        const same = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM db_items WHERE company_id=${ctx.companyId} AND item_code=${code} LIMIT 1`;
        if (same.length) throw new ProductEditError('IDENTIFIER_EXISTS');
      } else {
        const [{ prefix }] = await tx.$queryRaw<{ prefix: string }[]>`SELECT item_init AS prefix FROM db_company WHERE id=${ctx.companyId}`;
        const [{ next }] = await tx.$queryRaw<{ next: bigint | number }[]>`SELECT COALESCE(MAX(id),0)+1 AS next FROM db_items WHERE company_id=${ctx.companyId}`;
        // Codes edited by hand can occupy the legacy sequence; step past them instead of failing the add.
        for (let n = Number(next), attempts = 0; ; n++, attempts++) {
          if (attempts > 50) throw new ProductEditError('IDENTIFIER_EXISTS');
          const candidate = legacyCode(prefix, n);
          if (candidate.length > 100) throw new ProductEditError('INVALID_INPUT');
          const same = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM db_items WHERE company_id=${ctx.companyId} AND item_code=${candidate} LIMIT 1`;
          if (!same.length) { code = candidate; break; }
        }
      }
      const { purchasePrice, profitMargin, discountPercent } = productPricing(input, tax.rate.toFixed(2));
      const { day, time } = times(meta.now);
      await tx.$executeRaw`INSERT INTO db_items (item_code,custom_barcode_pack,custom_barcode,item_name,category_id,expire,item_image,unit_id,brand_id,description,sku,hsn,
        system_ip,system_name,created_date,created_time,created_by,type,unit_perpack,price,price_pack,purchase_price,purchase_price_pack,sales_price,sales_price_pack,
        profit_margin,profit_margin_pack,alert_qty,stock,stock_in,stock_out,expire_date,tax_type,tax_id,company_id,konsinyasi,discount,discount_persen,status,
        lot_number,tax_amt,tax_persen,type_order,status_so)
        VALUES (${code},${input.packBarcode},${input.barcode},${input.name},${input.categoryId},0,'',${input.unitId},${input.brandId},${input.description},${input.sku},'',
        ${meta.ip},${meta.ip},${day},${time},${username},${input.type},${input.packQuantity},${input.basePrice},0,${purchasePrice},0,${input.sellingPrice},0,
        ${profitMargin},0,${input.alertQty},${input.openingStock},0,0,${input.expiryDate},${input.taxType},${input.taxId},${ctx.companyId},${input.consignment ? 1 : 0},${input.discount},${discountPercent},${input.active ? 1 : 0},
        '',0,0,0,0)`;
      const [{ id }] = await tx.$queryRaw<{ id: bigint | number }[]>`SELECT LAST_INSERT_ID() AS id`;
      const itemId = Number(id);
      if (!itemId) throw new Error('Inserted product id unavailable');
      // Legacy records the opening stock as one 'Stok Awal' ledger row; for a brand-new item the recomputed stock equals it.
      if (input.openingStock > 0) await tx.$executeRaw`INSERT INTO db_stockentry (entry_date,item_id,qty,expire_date,company_id,status,note) VALUES (${time},${itemId},${input.openingStock},${input.expiryDate},${ctx.companyId},1,'Stok Awal')`;
      return { id: itemId, code, name: input.name, stock: input.openingStock };
    });
  }
}
export function productAddRepository(write = false): PrismaProductAddRepository { return new PrismaProductAddRepository(prisma, write ? productWritePrisma() : undefined); }
