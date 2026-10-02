import type { ItemRead, CategoryRead } from '@koperasi/domain/inventory';

export type ItemSearch = { companyId: number; term: string; limit: number; categoryId?: number };

export interface ItemRepository {
  search(query: ItemSearch): Promise<ItemRead[]>;
  findByBarcode(query: { companyId: number; barcode: string }): Promise<ItemRead | null>;
  findById(query: { companyId: number; id: number }): Promise<ItemRead | null>;
  listCategories(query: { companyId: number }): Promise<CategoryRead[]>;
}
