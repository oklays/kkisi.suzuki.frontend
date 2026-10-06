import { PosError, businessDates } from '@koperasi/domain/pos/sale';
import {
  evaluateReturnEligibility, parseReturnRequest, type RefundMethod, type ReturnFacts, type ReturnListQuery,
  type ReturnReason, type ReturnRequest, type ReturnableLine,
} from '@koperasi/domain/sales/return';

export type ReturnActor = { userId: number; companyId: number };

export type ReturnSummary = {
  returnId: number; returnCode: string; returnedAt: string; saleId: number | null; salesCode: string | null;
  refundMethod: string; totalSen: number | null; reason: string; createdBy: string; customerName: string;
};
export type ReturnContextLine = ReturnableLine & { label: string; barcode: string; unitPriceSen: number; unitDiscountSen: number };
export type ReturnContextFacts = {
  sale: {
    saleId: number; salesCode: string; saleDate: string; customerName: string; memberNik: string | null;
    paymentType: string; grandTotalSen: number;
  };
  facts: ReturnFacts;
  lines: ReturnContextLine[];
  returns: ReturnSummary[];
};
export type ReturnContext = Omit<ReturnContextFacts, 'facts'> & {
  eligibility: { allowed: boolean; reasons: ReturnReason[]; refundMethod: RefundMethod | null; deadline: string | null };
};
export type ReturnDocument = ReturnSummary & {
  storeName: string; storeAddress: string; memberNik: string | null; saleDate: string | null; salePaymentType: string | null;
  lines: { itemId: number; label: string; quantity: number; unitPriceSen: number | null; refundSen: number | null }[];
};
export type CreatedReturn = { returnId: number; returnCode: string; saleId: number; totalSen: number; refundMethod: RefundMethod; replayed: boolean };

export interface SalesReturnRepository {
  /** Read-only facts for one sale of the company (ppob excluded); null when absent. */
  context(companyId: number, saleId: number): Promise<ReturnContextFacts | null>;
  /** One atomic return: re-validates every rule on locked rows. */
  create(actor: ReturnActor, saleId: number, request: ReturnRequest, now: Date): Promise<CreatedReturn>;
  list(companyId: number, query: ReturnListQuery): Promise<{ rows: ReturnSummary[]; total: number }>;
  document(companyId: number, returnId: number): Promise<ReturnDocument | null>;
}

const MAX_ID = 2_147_483_647;
function id(value: string, notFound: string): number {
  if (!/^[1-9]\d{0,9}$/.test(value) || Number(value) > MAX_ID) throw new PosError(notFound);
  return Number(value);
}
function company(companyId: number): number {
  if (!Number.isSafeInteger(companyId) || companyId <= 0 || companyId > MAX_ID) throw new PosError('FORBIDDEN');
  return companyId;
}

export async function readReturnContext(repo: SalesReturnRepository, companyId: number, saleId: string, now: Date): Promise<ReturnContext> {
  const found = await repo.context(company(companyId), id(saleId, 'SALE_NOT_FOUND'));
  if (!found) throw new PosError('SALE_NOT_FOUND');
  const { facts, ...context } = found;
  return { ...context, eligibility: evaluateReturnEligibility(facts, businessDates(now).day) };
}

export async function createSalesReturn(repo: SalesReturnRepository, actor: ReturnActor, saleId: string, body: unknown, now: Date): Promise<CreatedReturn> {
  return repo.create({ userId: actor.userId, companyId: company(actor.companyId) }, id(saleId, 'SALE_NOT_FOUND'), parseReturnRequest(body), now);
}

export async function listSalesReturns(repo: SalesReturnRepository, companyId: number, query: ReturnListQuery) {
  const { rows, total } = await repo.list(company(companyId), query);
  const offset = (query.page - 1) * query.pageSize;
  return { rows, pagination: { page: query.page, pageSize: query.pageSize, total, hasNext: offset + rows.length < total } };
}

export async function readReturnDocument(repo: SalesReturnRepository, companyId: number, returnId: string): Promise<ReturnDocument> {
  const document = await repo.document(company(companyId), id(returnId, 'RETURN_NOT_FOUND'));
  if (!document) throw new PosError('RETURN_NOT_FOUND');
  return document;
}
