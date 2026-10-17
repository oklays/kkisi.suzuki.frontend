import type { StoreColumnMap } from '@koperasi/domain/kosipa';
import { listPayrollBatches, readPayrollBatch, readPayrollMember, readStoreReconciliation, type PayrollDeps, type PayrollReader } from '@koperasi/application/kosipa/payroll';
import { json, type AuthServices } from '../auth/http.ts';
import { kosipaActor, kosipaFailure, notFound, queryParams, type KosipaApiBase, type KosipaApiDeps, type KosipaActor } from './kosipa-http.ts';

/**
 * Read-only payroll API (spec REQ-025, TASK-027). GET only: no write verb exists. Gate and error mapping are shared (kosipa-http.ts).
 */
export type PayrollApiPorts = KosipaApiBase & { payroll: PayrollReader; storeColumnMap?: StoreColumnMap };
export type PayrollApiDeps = KosipaApiDeps<PayrollApiPorts>;

async function gate(services: AuthServices, request: Request, deps: PayrollApiDeps): Promise<{ response: Response } | { actor: KosipaActor; payroll: PayrollDeps }> {
  const a = await kosipaActor(services, request, deps);
  if ('response' in a) return a;
  return { actor: a.actor, payroll: { reader: a.ports.payroll, audit: a.ports.audit, now: a.ports.now, storeColumnMap: a.ports.storeColumnMap } };
}
const fail = (services: AuthServices, error: unknown) => kosipaFailure(services, 'kosipa_payroll_failed', error);

/** GET /api/kosipa/payroll?periode=YYYY-MM&status=OPEN|APPROVED&grup=ANGGOTA|BMP|KOPERASI&after=<id> */
export async function handlePayrollList(services: AuthServices, request: Request, deps: PayrollApiDeps): Promise<Response> {
  try {
    const a = await gate(services, request, deps); if ('response' in a) return a.response;
    return json(200, await listPayrollBatches(a.payroll, a.actor, queryParams(request)));
  } catch (error) { return fail(services, error); }
}

/** GET /api/kosipa/payroll/{docNo}?q=<nik or name>&after=<row id> */
export async function handlePayrollBatch(services: AuthServices, request: Request, docNo: string, deps: PayrollApiDeps): Promise<Response> {
  try {
    const a = await gate(services, request, deps); if ('response' in a) return a.response;
    const q = queryParams(request);
    const batch = await readPayrollBatch(a.payroll, a.actor, { docNo, q: q.q, after: q.after });
    return batch ? json(200, batch) : notFound();
  } catch (error) { return fail(services, error); }
}

/** GET /api/kosipa/payroll/{docNo}/anggota/{nik}: one member inside one batch (deduction breakdown + installment references). */
export async function handlePayrollMember(services: AuthServices, request: Request, docNo: string, nik: string, deps: PayrollApiDeps): Promise<Response> {
  try {
    const a = await gate(services, request, deps); if ('response' in a) return a.response;
    const member = await readPayrollMember(a.payroll, a.actor, { docNo, nik });
    return member ? json(200, member) : notFound();
  } catch (error) { return fail(services, error); }
}

/** GET /api/kosipa/payroll/{docNo}/store-reconciliation?after=<cursor>&all=1: review-only recorded-vs-derived evidence. */
export async function handlePayrollReconciliation(services: AuthServices, request: Request, docNo: string, deps: PayrollApiDeps): Promise<Response> {
  try {
    const a = await gate(services, request, deps); if ('response' in a) return a.response;
    const q = queryParams(request);
    const result = await readStoreReconciliation(a.payroll, a.actor, { docNo, after: q.after, all: q.all === '1' });
    return result ? json(200, result) : notFound();
  } catch (error) { return fail(services, error); }
}
