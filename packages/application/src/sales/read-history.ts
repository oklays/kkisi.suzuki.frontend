import { evaluateReprintEligibility, SalesHistoryError, type ReprintFacts, type SalesHistoryQuery } from '@koperasi/domain/sales/history';

export type HistoryWarning = { code: string; field?: string };
export type SalesHistoryItem = {
  saleId: number; salesCode: string; saleDate: string; customerName: string; memberNik: string | null;
  createdBy: string; source: 'pos' | 'nonpos'; salesStatus: string; paymentStatus: string; paymentType: string;
  recordStatus: number; returnBit: string | null; grandTotalSen: number | null; paidSen: number | null;
  registerId: number | null; registerReference: string | null; cashierLabel: string | null; warnings: HistoryWarning[];
};
export type SalesLine = {
  lineId: number; itemId: number; barcode: string; label: string; labelSource: 'description' | 'current_master' | 'fallback';
  description: string; quantity: number; unitPriceSen: number | null; discountSen: number | null;
  taxId: number | null; taxSen: number | null; taxType: string; totalSen: number | null;
  status: number; salesStatus: string;
};
export type SalesDetail = {
  sale: SalesHistoryItem & {
    subtotalSen: number | null; discountSen: number | null; otherChargesInputSen: number | null;
    otherChargesSen: number | null; roundOffLegacySen: number | null;
  };
  lines: SalesLine[];
  linePagination: { page: number; pageSize: number; total: number; hasNext: boolean };
  reprintFacts: ReprintFacts;
  warnings: HistoryWarning[];
};
export type SalePayment = {
  paymentId: number; paymentDate: string; paymentType: string; paymentSen: number | null;
  changeSen: number | null; note: string; createdBy: string; status: number; warnings: HistoryWarning[];
};
export type ReadPage<T> = { rows: T[]; pagination: { page: number; pageSize: number; total: number; hasNext: boolean } };

export interface SalesHistoryRepository {
  list(companyId: number, query: SalesHistoryQuery): Promise<{ items: SalesHistoryItem[]; pagination: ReadPage<never>['pagination'] }>;
  find(companyId: number, saleId: number, linePage: number, linePageSize: number): Promise<SalesDetail | null>;
  payments(companyId: number, saleId: number, page: number, pageSize: number): Promise<ReadPage<SalePayment> | null>;
}

function validCompany(companyId: number): boolean {
  return Number.isSafeInteger(companyId) && companyId > 0 && companyId <= 2_147_483_647;
}

function positiveId(value: string): number {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 2_147_483_647) {
    throw new SalesHistoryError('INVALID_INPUT');
  }
  return Number(value);
}

function positivePage(value: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new SalesHistoryError('INVALID_INPUT');
  return value;
}

export function parseSaleId(value: string): number { return positiveId(value); }

export async function readSalesHistory(repo: SalesHistoryRepository, companyId: number, query: SalesHistoryQuery) {
  if (!validCompany(companyId)) throw new SalesHistoryError('INVALID_INPUT');
  return repo.list(companyId, query);
}

export async function readSaleDetail(repo: SalesHistoryRepository, companyId: number, id: string, linePage = 1, linePageSize = 50) {
  if (!validCompany(companyId)) throw new SalesHistoryError('INVALID_INPUT');
  const saleId = positiveId(id);
  const currentPage = positivePage(linePage, 1_000_001);
  const size = positivePage(linePageSize, 100);
  if ((currentPage - 1) * size > 100_000) throw new SalesHistoryError('INVALID_INPUT');
  const detail = await repo.find(companyId, saleId, currentPage, size);
  if (!detail) throw new SalesHistoryError('NOT_FOUND');
  const { reprintFacts, ...result } = detail;
  return { ...result, printEligibility: evaluateReprintEligibility(reprintFacts) };
}

export async function readSalePayments(repo: SalesHistoryRepository, companyId: number, id: string, currentPage = 1, size = 25) {
  if (!validCompany(companyId)) throw new SalesHistoryError('INVALID_INPUT');
  const saleId = positiveId(id);
  const page = positivePage(currentPage, 1_000_001);
  const pageSize = positivePage(size, 100);
  if ((page - 1) * pageSize > 100_000) throw new SalesHistoryError('INVALID_INPUT');
  const result = await repo.payments(companyId, saleId, page, pageSize);
  if (!result) throw new SalesHistoryError('NOT_FOUND');
  return result;
}
