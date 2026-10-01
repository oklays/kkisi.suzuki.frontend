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
  /** List price in sen (1 Rp = 100 sen): integer, so amounts never touch floating point. */
  priceSen: number;
  /** Nominal discount per unit in sen. Sold price per unit = priceSen − discountSen. */
  discountSen: number;
  /** Sellable quantity; legacy negative stock is clamped to 0. */
  stock: number;
  stockStatus?: "available" | "empty";
};

/** What the POS page knows about the logged-in session. Contains no hash, secret or session id (the CSRF token is derived). */
export type PosSession = {
  userName: string;
  branchName: string;
  companyId: number;
  canSwitchBranch: boolean;
  companies: { id: number; name: string }[];
  csrfToken: string;
  register: { open: { noref: string; noKasir: string | null; openedOn: string; stale: boolean } | null; multiple: boolean };
};

export type PosCategory = { id: string; name: string };
export type PreviewCartLine = { product: PosProduct; quantity: number };
export type PreviewPayment = "Cash" | "Kredit";
export type CatalogStatus = "ready" | "loading" | "error";
/** Max products returned per catalog request (search, category or initial list). */
export const CATALOG_PAGE_SIZE = 24;
export type PosMember = {
  id: string;
  nik: string;
  idCard: string;
  qrCode: string;
  name: string;
  department: string;
  status: "AKTIVE" | "PENSIUN" | "RESIGN";
};
