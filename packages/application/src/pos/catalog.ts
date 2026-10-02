import type { ItemRead } from '@koperasi/domain/inventory';
import { toMinorUnits } from '@koperasi/domain/money';
import { ProductReadError } from '@koperasi/domain/inventory';
import type { ReadProductsUseCase } from '@koperasi/application/inventory';
import { CATALOG_PAGE_SIZE, type PosCategory, type PosProduct } from './contracts.ts';

/** Branch products without a category (most of branches 1 and 3) only appear under "Semua". */
const UNCATEGORISED = { id: '0', name: 'Tanpa kategori' };

export function toPosProduct(item: ItemRead): PosProduct {
  const stock = Math.max(0, item.stock);
  return {
    id: String(item.id),
    companyId: String(item.companyId),
    name: item.name.trim(),
    code: item.code,
    barcode: item.barcode || null,
    categoryId: item.category ? String(item.category.id) : UNCATEGORISED.id,
    categoryName: item.category?.name ?? UNCATEGORISED.name,
    imageUrl: null,
    priceSen: toMinorUnits(item.sellingPrice),
    discountSen: toMinorUnits(item.discount),
    stock,
    stockStatus: stock > 0 ? 'available' : 'empty',
  };
}

export async function searchCatalog(
  reader: ReadProductsUseCase,
  input: { companyId: number; term?: string; categoryId?: number },
): Promise<PosProduct[]> {
  const items = await reader.search({ ...input, limit: CATALOG_PAGE_SIZE });
  return items.map(toPosProduct);
}

/** Exact scanner lookup; an unknown barcode is an empty result, not an error. */
export async function findCatalogBarcode(
  reader: ReadProductsUseCase,
  input: { companyId: number; barcode: string },
): Promise<PosProduct[]> {
  try {
    return [toPosProduct(await reader.findByBarcode(input))];
  } catch (error) {
    if (error instanceof ProductReadError && error.code === 'NOT_FOUND') return [];
    throw error;
  }
}

export async function listCatalogCategories(
  reader: ReadProductsUseCase,
  input: { companyId: number },
): Promise<PosCategory[]> {
  return (await reader.categories(input)).map((category) => ({ id: String(category.id), name: category.name }));
}
