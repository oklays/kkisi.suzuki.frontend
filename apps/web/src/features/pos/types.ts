import type { PosProduct as CatalogProduct } from '@koperasi/application/pos/contracts';
import type { PreviewCartLine as DomainPreviewCartLine } from '@koperasi/domain/pos/preview';
export { CATALOG_PAGE_SIZE, type PosCategory } from '@koperasi/application/pos/contracts';

/** UI-only illustration mapping, separate from the catalog projection. */
export type PosProduct = CatalogProduct & { illustrationIndex?: 1 | 2 | 3 | 4 | 5 | 6 };

/** What the POS page knows about the logged-in session. Contains no hash, secret or session id (the CSRF token is derived). */
export type PosSession = {
  userName: string;
  /** Authenticated login name, supplied only where document ownership controls need it. */
  userLogin?: string;
  branchName: string;
  companyId: number;
  canSwitchBranch: boolean;
  companies: { id: number; name: string }[];
  csrfToken: string;
  checkoutAvailable: boolean;
  registerOpeningAvailable?: boolean;
  kasir?: {id:number;noKasir:string}[];
  ownedRegisters?: {id:number;noref:string}[];
  userId: number;
  canInventory?: boolean;
  register: { open: { noref: string; noKasir: string | null; openedOn: string; stale: boolean } | null; multiple: boolean };
};

export type PreviewCartLine = DomainPreviewCartLine<PosProduct>;
export type { PaymentMethod as PreviewPayment } from "@koperasi/domain/pos/sale";
export type CatalogStatus = "ready" | "loading" | "error";
export type { MemberCredit as PosMember, CheckoutResult } from "@koperasi/domain/pos/sale";
