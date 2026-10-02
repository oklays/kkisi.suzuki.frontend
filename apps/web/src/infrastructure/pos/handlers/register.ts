import { readRegister } from '../../../application/pos/use-cases/read-register.usecase.ts';
import { errorResponse, guard, json, type AuthServices } from '../../auth/http.ts';

/** GET /api/pos/register (read-only in 2A): the caller's own open register in the SESSION branch. */
export async function handleRegister(services: AuthServices, request: Request): Promise<Response> {
  const g = await guard(services, request, { permission: 'sales_add' });
  if (!g.ok) return g.response;
  try { return json(200, await readRegister(services.deps, g.ctx)); }
  catch (error) { return errorResponse(services, error); }
}
