import { errorResponse, guard, json, type AuthServices } from '../http.ts';

/** GET /api/auth/session: who am I, which branch, and a fresh CSRF token. Role <= 2 also gets the branch list. */
export async function handleSession(services: AuthServices, request: Request): Promise<Response> {
  const g = await guard(services, request);
  if (!g.ok) return g.response;
  try {
    const { ctx } = g;
    const [company, companies] = await Promise.all([
      services.deps.companies.findActive(ctx.companyId),
      ctx.canSwitchBranch ? services.deps.companies.listActive() : Promise.resolve(null),
    ]);
    return json(200, {
      user: { id: ctx.userId, name: ctx.userName, roleId: ctx.roleId },
      company: company ? { id: company.id, name: company.name } : { id: ctx.companyId, name: '' },
      canSwitchBranch: ctx.canSwitchBranch,
      companies,
      csrfToken: services.keys.csrfToken(ctx.sidHash),
    });
  } catch (error) {
    return errorResponse(services, error);
  }
}
