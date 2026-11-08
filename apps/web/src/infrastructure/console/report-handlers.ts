import type { StoreColumnMap } from '@koperasi/domain/kosipa';
import {
  exportDataQuality,
  exportLoanReport,
  exportMembershipReport,
  exportPayrollReport,
  exportSavingsMovement,
  type ExportFile,
  type ExportThrottle,
} from '@koperasi/application/kosipa/report-export';
import { readMembershipReport, readSavingsMovementReport, type OpsReportReader } from '@koperasi/application/kosipa/reports-ops';
import { readDataQuality, readLoanReport, readPayrollReport, type ReportDeps, type ReportReader } from '@koperasi/application/kosipa/reports';
import { json, type AuthServices } from '../auth/http.ts';
import { kosipaActor, kosipaFailure, queryParams, type KosipaApiBase, type KosipaApiDeps, type KosipaActor } from './kosipa-http.ts';

/** Read-only KOSIPA report API (checkpoint 9 + IE-BL-020 multi-format). GET only; recorded figures and diagnostics, never an official balance. */
export type ReportApiPorts = KosipaApiBase & { reports: ReportReader; opsReports?: OpsReportReader; storeColumnMap?: StoreColumnMap; exportThrottle?: ExportThrottle };
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

// ------------------------------------------------------------------------------------------------------------------- export
/** A file download (CSV, XLSX, or PDF). GET (read-only), no-store, attachment, nosniff; cross-site navigations are refused before anything is audited or read. */
const download = (file: ExportFile): Response => {
  const bytes = typeof file.body === 'string' ? new TextEncoder().encode(file.body) : file.body;
  const bodyInit = typeof file.body === 'string' ? file.body : Buffer.from(file.body);
  return new Response(bodyInit, { status: 200, headers: {
    'Content-Type': file.contentType,
    'Content-Disposition': `attachment; filename="${file.filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': String(bytes.byteLength),
  } });
};
const crossSite = (request: Request) => request.headers.get('sec-fetch-site') === 'cross-site';

async function exportGate(services: AuthServices, request: Request, deps: ReportApiDeps): Promise<{ response: Response } | { actor: KosipaActor; reports: ReportDeps & { throttle?: ExportThrottle } }> {
  if (crossSite(request)) return { response: json(403, { error: 'CROSS_SITE' }) };
  const a = await gate(services, request, deps);
  if ('response' in a) return a;
  return { actor: a.actor, reports: { ...a.reports, throttle: deps.ports?.exportThrottle } };
}
/** GET /api/kosipa/reports/loans/export?tahun=YYYY&format=csv|xlsx|pdf */
export async function handleLoanReportExport(services: AuthServices, request: Request, deps: ReportApiDeps): Promise<Response> {
  try { const a = await exportGate(services, request, deps); if ('response' in a) return a.response; return download(await exportLoanReport(a.reports, a.actor, queryParams(request))); } catch (error) { return fail(services, error); }
}
/** GET /api/kosipa/reports/payroll/export?tahun=YYYY&format=csv|xlsx|pdf */
export async function handlePayrollReportExport(services: AuthServices, request: Request, deps: ReportApiDeps): Promise<Response> {
  try { const a = await exportGate(services, request, deps); if ('response' in a) return a.response; return download(await exportPayrollReport(a.reports, a.actor, queryParams(request))); } catch (error) { return fail(services, error); }
}
/** GET /api/kosipa/reports/data-quality/export?format=csv|xlsx|pdf */
export async function handleDataQualityExport(services: AuthServices, request: Request, deps: ReportApiDeps): Promise<Response> {
  try { const a = await exportGate(services, request, deps); if ('response' in a) return a.response; return download(await exportDataQuality(a.reports, a.actor, queryParams(request))); } catch (error) { return fail(services, error); }
}

// ---------------------------------------------------------------------------------------------------- operational reports
const opsDeps = (reports: ReportDeps, ports: ReportApiPorts | null) => ({ ...reports, reader: reports.reader, ops: ports?.opsReports as OpsReportReader });
/** GET /api/kosipa/reports/membership */
export async function handleMembershipReport(services: AuthServices, request: Request, deps: ReportApiDeps): Promise<Response> {
  try { const a = await gate(services, request, deps); if ('response' in a) return a.response; if (!deps.ports?.opsReports) return json(503, { error: 'KOSIPA_UNAVAILABLE' }); return json(200, await readMembershipReport(opsDeps(a.reports, deps.ports), a.actor)); } catch (error) { return fail(services, error); }
}
/** GET /api/kosipa/reports/savings-movements?tahun=YYYY */
export async function handleSavingsMovementReport(services: AuthServices, request: Request, deps: ReportApiDeps): Promise<Response> {
  try { const a = await gate(services, request, deps); if ('response' in a) return a.response; if (!deps.ports?.opsReports) return json(503, { error: 'KOSIPA_UNAVAILABLE' }); return json(200, await readSavingsMovementReport(opsDeps(a.reports, deps.ports), a.actor, queryParams(request))); } catch (error) { return fail(services, error); }
}
/** GET /api/kosipa/reports/membership/export?format=csv|xlsx|pdf */
export async function handleMembershipReportExport(services: AuthServices, request: Request, deps: ReportApiDeps): Promise<Response> {
  try { const a = await exportGate(services, request, deps); if ('response' in a) return a.response; if (!deps.ports?.opsReports) return json(503, { error: 'KOSIPA_UNAVAILABLE' }); return download(await exportMembershipReport({ ...opsDeps(a.reports, deps.ports), throttle: a.reports.throttle }, a.actor, queryParams(request))); } catch (error) { return fail(services, error); }
}
/** GET /api/kosipa/reports/savings-movements/export?tahun=YYYY&format=csv|xlsx|pdf */
export async function handleSavingsMovementExport(services: AuthServices, request: Request, deps: ReportApiDeps): Promise<Response> {
  try { const a = await exportGate(services, request, deps); if ('response' in a) return a.response; if (!deps.ports?.opsReports) return json(503, { error: 'KOSIPA_UNAVAILABLE' }); return download(await exportSavingsMovement({ ...opsDeps(a.reports, deps.ports), throttle: a.reports.throttle }, a.actor, queryParams(request))); } catch (error) { return fail(services, error); }
}
