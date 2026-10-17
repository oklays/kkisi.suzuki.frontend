import type { StoreColumnMap } from '@koperasi/domain/kosipa';
import { readDataQuality, readLoanReport, readPayrollReport, type ReportDeps, type ReportReader } from '@koperasi/application/kosipa/reports';
import { json, type AuthServices } from '../auth/http.ts';
import { kosipaActor, kosipaFailure, queryParams, type KosipaApiBase, type KosipaApiDeps, type KosipaActor } from './kosipa-http.ts';

/** Read-only KOSIPA report API (checkpoint 9). GET only; recorded figures and diagnostics, never an official balance. */
export type ReportApiPorts = KosipaApiBase & { reports: ReportReader; storeColumnMap?: StoreColumnMap };
export type ReportApiDeps = KosipaApiDeps<ReportApiPorts>;

async function gate(services: AuthServices, request: Request, deps: ReportApiDeps): Promise<{ response: Response } | { actor: KosipaActor; reports: ReportDeps }> {
  const a = await kosipaActor(services, request, deps);
  if ('response' in a) return a;
  return { actor: a.actor, reports: { reader: a.ports.reports, audit: a.ports.audit, now: a.ports.now, storeColumnMap: a.ports.storeColumnMap } };
}
const fail = (services: AuthServices, error: unknown) => kosipaFailure(services, 'kosipa_reports_failed', error);

/** GET /api/kosipa/reports/loans?tahun=YYYY */
export async function handleLoanReport(services: AuthServices, request: Request, deps: ReportApiDeps): Promise<Response> {
  try { const a = await gate(services, request, deps); if ('response' in a) return a.response; return json(200, await readLoanReport(a.reports, a.actor, queryParams(request))); } catch (error) { return fail(services, error); }
}
/** GET /api/kosipa/reports/payroll?tahun=YYYY */
export async function handlePayrollReport(services: AuthServices, request: Request, deps: ReportApiDeps): Promise<Response> {
  try { const a = await gate(services, request, deps); if ('response' in a) return a.response; return json(200, await readPayrollReport(a.reports, a.actor, queryParams(request))); } catch (error) { return fail(services, error); }
}
/** GET /api/kosipa/reports/data-quality */
export async function handleDataQuality(services: AuthServices, request: Request, deps: ReportApiDeps): Promise<Response> {
  try { const a = await gate(services, request, deps); if ('response' in a) return a.response; return json(200, await readDataQuality(a.reports, a.actor)); } catch (error) { return fail(services, error); }
}
