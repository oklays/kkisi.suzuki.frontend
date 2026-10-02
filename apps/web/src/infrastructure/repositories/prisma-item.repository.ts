import { Prisma, PrismaClient } from '@prisma/client';
import type { CategoryRead, ItemRead } from '@koperasi/domain/inventory';
import type { ItemRepository, ItemSearch } from '@koperasi/application/inventory';
import { ProductReadError } from '@koperasi/domain/inventory';
import { prisma } from '../db/prisma.ts';

const itemSelect = {
  id: true,
  companyId: true,
  itemCode: true,
  customBarcode: true,
  itemName: true,
  salesPrice: true,
  discount: true,
  stock: true,
  category: { select: { id: true, categoryName: true } },
} satisfies Prisma.ItemSelect;

type ItemRow = Prisma.ItemGetPayload<{ select: typeof itemSelect }>;

/** db_items.type of sellable goods. PPOB items are out of scope until D11 is decided. */
const SELLABLE_TYPE = 'Produk Jadi';

/** Prisma does not escape LIKE wildcards in `contains`; without this "_" or "%" would match every row. */
const escapeLike = (term: string): string => term.replace(/[\\%_]/g, '\\$&');

// DOUBLE(18,2) round-trips through toFixed(2) without loss, so amounts leave as exact decimal strings.
const money = (value: number): string => value.toFixed(2);

function toRead(row: ItemRow): ItemRead {
  return {
    id: row.id,
    companyId: row.companyId,
    code: row.itemCode,
    barcode: row.customBarcode,
    name: row.itemName,
    sellingPrice: money(row.salesPrice),
    discount: money(row.discount),
    stock: row.stock,
    category: row.category ? { id: row.category.id, name: row.category.categoryName } : null,
  };
}

function mapError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    throw new ProductReadError('DB_UNAVAILABLE');
  }
  const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code
    : undefined;
  if (code && ['P1000', 'P1001', 'P1002', 'P1003', 'P1011', 'P1017'].includes(code)) {
    throw new ProductReadError('DB_UNAVAILABLE');
  }
  throw new ProductReadError('UNEXPECTED');
}

export class PrismaItemRepository implements ItemRepository {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient = prisma) { this.db = db; }

  async search({ companyId, term, limit, categoryId }: ItemSearch): Promise<ItemRead[]> {
    try {
      const where: Prisma.ItemWhereInput = { companyId, status: 1, type: SELLABLE_TYPE };
      if (categoryId !== undefined) where.categoryId = categoryId;
      // Browsing (no term) lists only items that can be sold: ~70% of branch items have stock 0, which
      // would otherwise fill the first page. A text search still returns them so "Stok habis" is visible.
      if (!term) where.stock = { gt: 0 };
      if (term) {
        const like = escapeLike(term);
        where.OR = [
          { itemName: { contains: like } },
          { itemCode: { contains: like } },
          { customBarcode: { contains: like } },
          { customBarcodePack: { contains: like } },
        ];
      }
      const rows = await this.db.item.findMany({
        where,
        select: itemSelect,
        take: limit,
        // Browsing is alphabetical (walks idx_items_name, ~0.1 ms). A text search orders by id instead:
        // measured 1–7 ms vs 6–15 ms because MariaDB would otherwise scan the whole name index.
        orderBy: term ? [{ id: 'asc' }] : [{ itemName: 'asc' }, { id: 'asc' }],
      });
      return rows.map(toRead);
    } catch (error) { return mapError(error); }
  }

  /** Exact scanner match: the unit barcode wins over the pack barcode; lowest id wins a tie (4 legacy duplicates). */
  async findByBarcode({ companyId, barcode }: { companyId: number; barcode: string }): Promise<ItemRead | null> {
    try {
      const base = { companyId, status: 1, type: SELLABLE_TYPE };
      const row = await this.db.item.findFirst({
        where: { ...base, customBarcode: barcode }, select: itemSelect, orderBy: { id: 'asc' },
      }) ?? await this.db.item.findFirst({
        where: { ...base, customBarcodePack: barcode }, select: itemSelect, orderBy: { id: 'asc' },
      });
      return row ? toRead(row) : null;
    } catch (error) { return mapError(error); }
  }

  async findById({ companyId, id }: { companyId: number; id: number }): Promise<ItemRead | null> {
    try {
      const row = await this.db.item.findFirst({ where: { companyId, id }, select: itemSelect });
      return row ? toRead(row) : null;
    } catch (error) { return mapError(error); }
  }

  /** Categories are global in db_category; list only those this branch actually sells. */
  async listCategories({ companyId }: { companyId: number }): Promise<CategoryRead[]> {
    try {
      const used = await this.db.item.groupBy({
        by: ['categoryId'],
        where: { companyId, status: 1, type: SELLABLE_TYPE, categoryId: { not: null } },
      });
      const ids = used.flatMap((group) => group.categoryId === null ? [] : [group.categoryId]);
      if (ids.length === 0) return [];
      const rows = await this.db.category.findMany({
        where: { id: { in: ids }, status: 1 },
        select: { id: true, categoryName: true },
        orderBy: { categoryName: 'asc' },
      });
      return rows.map((row) => ({ id: row.id, name: row.categoryName }));
    } catch (error) { return mapError(error); }
  }
}
