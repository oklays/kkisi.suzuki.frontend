import { randomUUID } from 'node:crypto';
import { KosipaError } from '@koperasi/domain/kosipa';
import { resolveConsoleAccess, type PermissionSetSource } from '@koperasi/application/console/capabilities';
import type { IdentityPorts } from '@koperasi/application/console/identity-links';
import { listPayrollBatches, readPayrollBatch, readPayrollMember, readStoreReconciliation, type PayrollActor, type PayrollDeps, type PayrollReader } from '@koperasi/application/kosipa/payroll';
import { errorResponse, guard, json, type AuthServices } from '../auth/http.ts';

/**
 * Read-only payroll API (spec REQ-025, TASK-027). GET only: no write verb exists. Order of checks: feature flag -> session ->
 * services present -> server-side capabilities -> use case (which re-checks, audits BEFORE reading, then reads bounded pages).
 * Failures are code-only; database detail never leaves the server.
 */
export type PayrollApiPorts = Pick<IdentityPorts, 'links' | 'kosipa' | 'audit' | 'now'> & { payroll: PayrollReader };
export type PayrollApiDeps = { enabled: boolean; permissions: PermissionSetSource; ports: PayrollApiPorts | null };

const STATUS: Record<string, number> = {
  FORBIDDEN: 403, PERIOD_INVALID: 400, FILTER_INVALID: 400, CURSOR_INVALID: 400, DOC_NO_INVALID: 400, NIK_INVALID: 400,
};

async function actorFor(services: AuthServices, request: Request, deps: PayrollApiDeps): Promise<{ response: Response } | { actor: PayrollActor; payroll: PayrollDeps }> {
  if (!deps.enabled) return { response: json(404, { error: 'NOT_FOUND' }) };
  const g = await guard(services, request);            // GET: session required, no CSRF token (nothing is written)
  if (!g.ok) return { response: g.response };
  if (!deps.ports) return { response: json(503, { error: 'KOSIPA_UNAVAILABLE' }) };
  const { payroll, links, kosipa, audit, now } = deps.ports;
  const access = await resolveConsoleAccess({ permissions: deps.permissions, kosipa: { links, kosipa } }, { userId: g.ctx.userId, roleId: g.ctx.roleId, canSwitchBranch: g.ctx.canSwitchBranch });
  return { actor: { userId: g.ctx.userId, capabilities: access.capabilities, requestId: randomUUID() }, payroll: { reader: payroll, audit, now } };
}

function failure(services: AuthServices, error: unknown): Response {
  if (error instanceof KosipaError) return json(STATUS[error.code] ?? 400, { error: error.code });
  if (error instanceof Error && error.name !== 'AuthError') { services.deps.log('kosipa_payroll_failed', {}); return json(503, { error: 'KOSIPA_UNAVAILABLE' }); }
  return errorResponse(services, error);
}

const params = (request: Request) => { const q: Record<string, string> = {}; for (const [k, v] of new URL(request.url).searchParams) if (!(k in q)) q[k] = v; return q; };
const notFound = () => json(404, { error: 'NOT_FOUND' });

/** GET /api/kosipa/payroll?periode=YYYY-MM&status=OPEN|APPROVED&grup=ANGGOTA|BMP|KOPERASI&after=<id> */
export async function handlePayrollList(services: AuthServices, request: Request, deps: PayrollApiDeps): Promise<Response> {
  try {
    const a = await actorFor(services, request, deps); if ('response' in a) return a.response;
    return json(200, await listPayrollBatches(a.payroll, a.actor, params(request)));
  } catch (error) { return failure(services, error); }
}

/** GET /api/kosipa/payroll/{docNo}?q=<nik or name>&after=<row id> */
export async function handlePayrollBatch(services: AuthServices, request: Request, docNo: string, deps: PayrollApiDeps): Promise<Response> {
  try {
    const a = await actorFor(services, request, deps); if ('response' in a) return a.response;
    const q = params(request);
    const batch = await readPayrollBatch(a.payroll, a.actor, { docNo, q: q.q, after: q.after });
    return batch ? json(200, batch) : notFound();
  } catch (error) { return failure(services, error); }
}

/** GET /api/kosipa/payroll/{docNo}/anggota/{nik}: one member inside one batch (deduction breakdown + installment references). */
export async function handlePayrollMember(services: AuthServices, request: Request, docNo: string, nik: string, deps: PayrollApiDeps): Promise<Response> {
  try {
    const a = await actorFor(services, request, deps); if ('response' in a) return a.response;
    const member = await readPayrollMember(a.payroll, a.actor, { docNo, nik });
    return member ? json(200, member) : notFound();
  } catch (error) { return failure(services, error); }
}

/** GET /api/kosipa/payroll/{docNo}/store-reconciliation?after=<cursor>&all=1: review-only recorded-vs-derived evidence. */
export async function handlePayrollReconciliation(services: AuthServices, request: Request, docNo: string, deps: PayrollApiDeps): Promise<Response> {
  try {
    const a = await actorFor(services, request, deps); if ('response' in a) return a.response;
    const q = params(request);
    const result = await readStoreReconciliation(a.payroll, a.actor, { docNo, after: q.after, all: q.all === '1' });
    return result ? json(200, result) : notFound();
  } catch (error) { return failure(services, error); }
}
