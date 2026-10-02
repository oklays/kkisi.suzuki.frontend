import { checkout, type PosRepository } from '@koperasi/application/pos/checkout';
import { guard, json, readJson, type AuthServices } from '../../auth/http.ts';
import { checkoutRepository } from '../services.ts';
import { posErrorResponse } from '../http-errors.ts';

export async function handleCheckout(services: AuthServices, request: Request, repository: () => PosRepository = checkoutRepository): Promise<Response> {
  const g = await guard(services, request, { permission: 'sales_add', csrf: true });
  if (!g.ok) return g.response;
  try {
    const body = await readJson(request, 16000);
    const receipt = await checkout(repository(), g.ctx, body, services.deps.clock.now());
    return json(200, { receipt });
  } catch (error) { return posErrorResponse(services, error); }
}
