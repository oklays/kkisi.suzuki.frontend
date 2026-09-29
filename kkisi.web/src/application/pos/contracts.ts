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
  /** Optional stable presentation mapping, separate from DB category identity. */
  illustrationIndex?: 1 | 2 | 3 | 4 | 5 | 6;
  unitPriceRp: number;
  stock: number;
  stockStatus?: "available" | "low" | "empty";
};

export type PosCategory = { id: string; name: string };
export type PreviewCartLine = { product: PosProduct; quantity: number };
export type PreviewPayment = "Cash" | "Kredit";
export type CatalogStatus = "ready" | "loading" | "error";
export type PosMember = {
  id: string;
  nik: string;
  idCard: string;
  qrCode: string;
  name: string;
  department: string;
  status: "AKTIVE" | "PENSIUN" | "RESIGN";
};
