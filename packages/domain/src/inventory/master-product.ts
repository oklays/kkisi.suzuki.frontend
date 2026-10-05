/** Existing master data, distinct from the POS sellability projection. */
export type MasterProduct = {
  id: number; code: string; sku: string; barcode: string; packBarcode: string; name: string;
  category: string | null; brand: string | null; unit: string | null; type: string;
  sellingPrice: string; purchasePrice: string; discount: string;
  stock: number; alertQty: number; active: boolean; locked: boolean;
  tax: string | null; taxType: string; packQuantity: number; expiryDate: string | null;
};
export type MasterProductQuery = {
  companyId: number; term: string; page: number; pageSize: number;
  categoryId?: number; brandId?: number;
  status: 'all' | 'active' | 'inactive';
  stock: 'all' | 'available' | 'low' | 'empty' | 'locked';
  sort: 'newest' | 'name' | 'stock' | 'price';
};
export type MasterProductPage = {
  items: MasterProduct[]; total: number; page: number; pageSize: number;
  summary: { total: number; active: number; low: number; empty: number; locked: number };
  categories: { id: number; name: string }[]; brands: { id: number; name: string }[];
};
