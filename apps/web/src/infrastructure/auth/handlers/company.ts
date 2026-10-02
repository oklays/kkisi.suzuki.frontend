import { selectCompany } from '@koperasi/application/auth/select-company';
import { AuthError } from '@koperasi/domain/auth/errors';
import { errorResponse, guard, json, readJson, type AuthServices } from '../http.ts';

/** POST /api/auth/company {companyId}: role <= 2 only; the branch is chosen through the SESSION, never a query/header. */
export async function handleCompany(services: AuthServices, request: Request): Promise<Response> {
  const g = await guard(services, request, { csrf: true, permission: 'sales_add' });
  if (!g.ok) return g.response;
  try {
    const body = await readJson(request, 256) as { companyId?: unknown } | null;
    if (!body || typeof body.companyId !== 'number') throw new AuthError('BAD_REQUEST');
    const company = await selectCompany(services.deps, g.ctx, body.companyId);
    services.deps.log('company_selected', { user: g.ctx.userId, cid: company.id });
    return json(200, { company });
  } catch (error) {
    return errorResponse(services, error);
  }
}
