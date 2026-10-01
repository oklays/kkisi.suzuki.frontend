/** Only what the POS catalog needs. Cost price, tax and pack data deliberately stay server-side. */
export type ItemRead = {
  id: number;
  companyId: number;
  code: string;
  barcode: string;
  name: string;
  /** Exact 2-decimal string, e.g. "4000.10". */
  sellingPrice: string;
  /** Nominal discount per unit, exact 2-decimal string (legacy: line = (price − discount) × qty). */
  discount: string;
  stock: number;
  category: { id: number; name: string } | null;
};

export type ItemSearch = { companyId: number; term: string; limit: number; categoryId?: number };
export type CategoryRead = { id: number; name: string };

export interface ItemRepository {
  search(query: ItemSearch): Promise<ItemRead[]>;
  findByBarcode(query: { companyId: number; barcode: string }): Promise<ItemRead | null>;
  findById(query: { companyId: number; id: number }): Promise<ItemRead | null>;
  listCategories(query: { companyId: number }): Promise<CategoryRead[]>;
}
