import { businessDates } from '@koperasi/domain/pos/sale';
import { parseReturnListQuery } from '@koperasi/domain/sales/return';
import { createSalesReturn, listSalesReturns, readReturnContext, readReturnDocument, type SalesReturnRepository } from '@koperasi/application/sales/returns';
import { guard, json, readJson, type AuthServices } from '../auth/http.ts';
import { posErrorResponse } from '../pos/http-errors.ts';
import { returnWritePrisma } from '../db/prisma-return-write.ts';
export { returnWritesAvailable } from '../db/prisma-return-write.ts';
import { prisma } from '../db/prisma.ts';
import { PrismaSalesReturnRepository } from '../repositories/prisma-sales-return.repository.ts';

export const returnReadRepository = (): SalesReturnRepository => new PrismaSalesReturnRepository();
export const returnWriteRepository = (): SalesReturnRepository => new PrismaSalesReturnRepository(prisma, returnWritePrisma());
const VIEW = ['sales_return_view', 'sales_return_add'] as const;

/** POST /api/sales/{id}/returns — one atomic, idempotent return against a saved sale. */
export async function handleCreateReturn(services: AuthServices, request: Request, saleId: string, repository: () => SalesReturnRepository = returnWriteRepository): Promise<Response> {
  const g = await guard(services, request, { permission: 'sales_return_add', csrf: true });
  if (!g.ok) return g.response;
  try {
    const body = await readJson(request, 16000);
    const created = await createSalesReturn(repository(), g.ctx, saleId, body, services.deps.clock.now());
    if (!created.replayed) services.deps.log('sales_return_created', { returnId: created.returnId, saleId: created.saleId, method: created.refundMethod });
    return json(created.replayed ? 200 : 201, { return: created });
  } catch (error) { return posErrorResponse(services, error); }
}

/** GET /api/sales/{id}/returns — returnable quantities, previous returns and the eligibility verdict. */
export async function handleReturnContext(services: AuthServices, request: Request, saleId: string, repository: () => SalesReturnRepository = returnReadRepository): Promise<Response> {
  const g = await guard(services, request, { permission: VIEW });
  if (!g.ok) return g.response;
  try { return json(200, await readReturnContext(repository(), g.ctx.companyId, saleId, services.deps.clock.now())); }
  catch (error) { return posErrorResponse(services, error); }
}

/** GET /api/sales/returns — branch return list (Jakarta month to date by default). */
export async function handleReturnList(services: AuthServices, request: Request, repository: () => SalesReturnRepository = returnReadRepository): Promise<Response> {
  const g = await guard(services, request, { permission: VIEW });
  if (!g.ok) return g.response;
  try {
    const query = parseReturnListQuery(new URL(request.url).searchParams, businessDates(services.deps.clock.now()).day);
    return json(200, await listSalesReturns(repository(), g.ctx.companyId, query));
  } catch (error) { return posErrorResponse(services, error); }
}

/** GET /api/sales/returns/{id} — one return document of the active branch. */
export async function handleReturnDocument(services: AuthServices, request: Request, returnId: string, repository: () => SalesReturnRepository = returnReadRepository): Promise<Response> {
  const g = await guard(services, request, { permission: VIEW });
  if (!g.ok) return g.response;
  try { return json(200, { return: await readReturnDocument(repository(), g.ctx.companyId, returnId) }); }
  catch (error) { return posErrorResponse(services, error); }
}
