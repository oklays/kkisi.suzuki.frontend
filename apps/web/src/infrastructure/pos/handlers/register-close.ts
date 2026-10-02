import { PosError } from '@koperasi/domain/pos/sale';
import { guard, json, readJson, type AuthServices } from '../../auth/http.ts';
import { registerRepository } from '../../repositories/prisma-register.repository.ts';
import { posErrorResponse } from '../http-errors.ts';
export async function handleRegisterClose(services: AuthServices, request: Request, repository = registerRepository): Promise<Response> {
  const g = await guard(services, request, { permission: 'sales_add', csrf: true });
  if (!g.ok) return g.response;
  try {
    const body = await readJson(request, 2000) as { registerId?: unknown };
    if (!body || !Number.isSafeInteger(body.registerId) || Number(body.registerId)<=0 || Number(body.registerId)>2147483647) throw new PosError('INVALID_INPUT');
    return json(200, { register: await repository().close(g.ctx,Number(body.registerId),services.deps.clock.now()) });
  } catch(error) { return posErrorResponse(services,error); }
}
