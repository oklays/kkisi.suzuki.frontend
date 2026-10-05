import { readReceipt, type ReceiptRepository } from '@koperasi/application/pos/receipt';
import { PosError } from '@koperasi/domain/pos/sale';
import { guard, json, type AuthServices } from '../../auth/http.ts';
import { PrismaReceiptRepository } from '../../repositories/prisma-receipt.repository.ts';
import { posErrorResponse } from '../http-errors.ts';

export async function handleReceipt(services: AuthServices, request: Request, id: string, repository: () => ReceiptRepository = () => new PrismaReceiptRepository()): Promise<Response> {
  const auth = await guard(services, request, { permission: ['sales_add', 'sales_view'] });
  if (!auth.ok) return auth.response;
  try {
    const params = new URL(request.url).searchParams;
    const modes = params.getAll('mode');
    if (modes.length > 1 || (modes[0] !== undefined && modes[0] !== 'checkout' && modes[0] !== 'reprint')) return json(400, { error: 'INVALID_INPUT' });
    const canCheckout = await auth.ctx.hasPermission('sales_add');
    const mode = modes[0] === 'reprint' || !canCheckout ? 'reprint' : 'checkout';
    return json(200, { receipt: await readReceipt(repository(), auth.ctx, id, mode) });
  }
  catch (error) {
    if (error instanceof PosError && error.code === 'NOT_FOUND') return json(404, { error: 'NOT_FOUND' });
    return posErrorResponse(services, error);
  }
}
