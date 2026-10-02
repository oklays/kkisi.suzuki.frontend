import { readReceipt, type ReceiptRepository } from '@koperasi/application/pos/receipt';
import { PosError } from '@koperasi/domain/pos/sale';
import { guard, json, type AuthServices } from '../../auth/http.ts';
import { PrismaReceiptRepository } from '../../repositories/prisma-receipt.repository.ts';
import { posErrorResponse } from '../http-errors.ts';

export async function handleReceipt(services: AuthServices, request: Request, id: string, repository: () => ReceiptRepository = () => new PrismaReceiptRepository()): Promise<Response> {
  const auth = await guard(services, request, { permission: 'sales_add' });
  if (!auth.ok) return auth.response;
  try { return json(200, { receipt: await readReceipt(repository(), auth.ctx, id) }); }
  catch (error) {
    if (error instanceof PosError && error.code === 'NOT_FOUND') return json(404, { error: 'NOT_FOUND' });
    return posErrorResponse(services, error);
  }
}
