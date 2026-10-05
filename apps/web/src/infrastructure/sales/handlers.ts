import { SalesHistoryError, parseSalesHistoryQuery } from '@koperasi/domain/sales/history';
import { readSaleDetail, readSalePayments, readSalesHistory, type SalesHistoryRepository } from '@koperasi/application/sales/history';
import { errorResponse, guard, json, type AuthServices } from '../auth/http.ts';
import { PrismaSalesHistoryRepository } from '../repositories/prisma-sales-history.repository.ts';

function failure(services: AuthServices, error: unknown): Response {
  if (error instanceof SalesHistoryError) {
    if (error.code === 'INVALID_INPUT') return json(400, { error: error.code });
    if (error.code === 'NOT_FOUND') return json(404, { error: error.code });
    if (error.code === 'UNAVAILABLE') return json(503, { error: 'SALES_UNAVAILABLE' }, { 'Retry-After': '5' });
  }
  if (error && typeof error === 'object' && ('code' in error || 'clientVersion' in error)) {
    services.deps.log('sales_history_unavailable');
    return json(503, { error: 'SALES_UNAVAILABLE' }, { 'Retry-After': '5' });
  }
  return errorResponse(services, error);
}

function repository(factory?: () => SalesHistoryRepository): SalesHistoryRepository {
  return factory ? factory() : new PrismaSalesHistoryRepository();
}

function smallPagination(params: URLSearchParams, pageKey: string, sizeKey: string, defaultSize: number) {
  const allowed = new Set([pageKey, sizeKey]);
  for (const key of new Set(params.keys())) if (!allowed.has(key)) throw new SalesHistoryError('INVALID_INPUT');
  const read = (key: string, fallback: number, max: number) => {
    const values = params.getAll(key);
    if (values.length > 1) throw new SalesHistoryError('INVALID_INPUT');
    const raw = values[0];
    if (raw === undefined) return fallback;
    if (!/^\d+$/.test(raw)) throw new SalesHistoryError('INVALID_INPUT');
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new SalesHistoryError('INVALID_INPUT');
    return value;
  };
  const page = read(pageKey, 1, 1_000_001); const pageSize = read(sizeKey, defaultSize, 100);
  if ((page - 1) * pageSize > 100_000) throw new SalesHistoryError('INVALID_INPUT');
  return { page, pageSize };
}

export async function handleSalesHistory(services: AuthServices, request: Request, repo?: () => SalesHistoryRepository): Promise<Response> {
  const auth = await guard(services, request, { permission: 'sales_view' });
  if (!auth.ok) return auth.response;
  try {
    const query = parseSalesHistoryQuery(new URL(request.url).searchParams, services.deps.clock.now());
    return json(200, await readSalesHistory(repository(repo), auth.ctx.companyId, query));
  } catch (error) { return failure(services, error); }
}

export async function handleSalesDetail(services: AuthServices, request: Request, id: string, repo?: () => SalesHistoryRepository): Promise<Response> {
  const auth = await guard(services, request, { permission: 'sales_view' });
  if (!auth.ok) return auth.response;
  try {
    const params = new URL(request.url).searchParams;
    const { page, pageSize } = smallPagination(params, 'linePage', 'linePageSize', 50);
    return json(200, await readSaleDetail(repository(repo), auth.ctx.companyId, id, page, pageSize));
  } catch (error) { return failure(services, error); }
}

export async function handleSalePayments(services: AuthServices, request: Request, id: string, repo?: () => SalesHistoryRepository): Promise<Response> {
  const auth = await guard(services, request, { permission: 'sales_view' });
  if (!auth.ok) return auth.response;
  try {
    if (!(await auth.ctx.hasPermission('sales_payment_view'))) return json(403, { error: 'FORBIDDEN' });
    const params = new URL(request.url).searchParams;
    const { page, pageSize } = smallPagination(params, 'page', 'pageSize', 25);
    return json(200, await readSalePayments(repository(repo), auth.ctx.companyId, id, page, pageSize));
  } catch (error) { return failure(services, error); }
}
