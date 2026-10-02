/** Read projections only; these are not verified legacy API response contracts. */
export type PosProduct = {
  id: string;
  companyId: string;
  name: string;
  code: string;
  barcode: string | null;
  categoryId: string;
  categoryName: string;
  imageUrl: string | null;
  /** List price in sen (1 Rp = 100 sen): integer, so amounts never touch floating point. */
  priceSen: number;
  /** Nominal discount per unit in sen. Sold price per unit = priceSen − discountSen. */
  discountSen: number;
  /** Sellable quantity; legacy negative stock is clamped to 0. */
  stock: number;
  stockStatus?: "available" | "empty";
};

export type PosCategory = { id: string; name: string };
/** Max products returned per catalog request (search, category or initial list). */
export const CATALOG_PAGE_SIZE = 24;
