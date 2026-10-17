import { listLoans, readLoan, type LoanReader } from '@koperasi/application/kosipa/loans';
import { json, type AuthServices } from '../auth/http.ts';
import { kosipaActor, kosipaFailure, notFound, queryParams, type KosipaApiBase, type KosipaApiDeps } from './kosipa-http.ts';

/** Read-only loan API (spec REQ-024, TASK-026). GET only. The official outstanding balance is never part of any response. */
export type LoanApiPorts = KosipaApiBase & { loans: LoanReader };
export type LoanApiDeps = KosipaApiDeps<LoanApiPorts>;
const fail = (services: AuthServices, error: unknown) => kosipaFailure(services, 'kosipa_loans_failed', error);

/** GET /api/kosipa/loans?q=<NIK | document prefix | name>&status=&cair=&bayar=&after=<id> */
export async function handleLoanList(services: AuthServices, request: Request, deps: LoanApiDeps): Promise<Response> {
  try {
    const a = await kosipaActor(services, request, deps); if ('response' in a) return a.response;
    return json(200, await listLoans({ reader: a.ports.loans, audit: a.ports.audit, now: a.ports.now }, a.actor, queryParams(request)));
  } catch (error) { return fail(services, error); }
}

/** GET /api/kosipa/loans/{docNo}?after=<installment cursor> */
export async function handleLoanDetail(services: AuthServices, request: Request, docNo: string, deps: LoanApiDeps): Promise<Response> {
  try {
    const a = await kosipaActor(services, request, deps); if ('response' in a) return a.response;
    const detail = await readLoan({ reader: a.ports.loans, audit: a.ports.audit, now: a.ports.now }, a.actor, { docNo, after: queryParams(request).after });
    return detail ? json(200, detail) : notFound();
  } catch (error) { return fail(services, error); }
}
