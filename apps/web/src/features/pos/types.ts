import type { PosProduct as CatalogProduct } from '@koperasi/application/pos/contracts';
import type { PreviewCartLine as DomainPreviewCartLine } from '@koperasi/domain/pos/preview';
export { CATALOG_PAGE_SIZE, type PosCategory } from '@koperasi/application/pos/contracts';

/** UI-only illustration mapping, separate from the catalog projection. */
export type PosProduct = CatalogProduct & { illustrationIndex?: 1 | 2 | 3 | 4 | 5 | 6 };

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

export type PreviewCartLine = DomainPreviewCartLine<PosProduct>;
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
