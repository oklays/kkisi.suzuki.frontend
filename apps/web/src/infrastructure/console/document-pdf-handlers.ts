import {
  exportLoanCardPdf,
  exportMemberSavingsPassbookPdf,
  exportPayrollMemberSlipPdf,
} from '@koperasi/application/kosipa/document-pdf-export';
import type { LoanReader } from '@koperasi/application/kosipa/loans';
import type { KosipaMemberReader } from '@koperasi/application/kosipa/member-360';
import type { PayrollReader } from '@koperasi/application/kosipa/payroll';
import type { ExportFile, ExportThrottle } from '@koperasi/application/kosipa/report-export';
import type { SavingsReader } from '@koperasi/application/kosipa/savings';
import { json, type AuthServices } from '../auth/http.ts';
import { kosipaActor, kosipaFailure, queryParams, type KosipaApiBase, type KosipaApiDeps } from './kosipa-http.ts';

export type DocumentPdfApiPorts = KosipaApiBase & {
  loans?: LoanReader;
  payroll?: PayrollReader;
  members?: Pick<KosipaMemberReader, 'member'>;
  savings?: SavingsReader;
  exportThrottle?: ExportThrottle;
};
export type DocumentPdfApiDeps = KosipaApiDeps<DocumentPdfApiPorts>;

const crossSite = (request: Request) => request.headers.get('sec-fetch-site') === 'cross-site';
const fail = (services: AuthServices, error: unknown) => kosipaFailure(services, 'kosipa_document_pdf_failed', error);

function pdfResponse(file: ExportFile): Response {
  const bytes = typeof file.body === 'string' ? new TextEncoder().encode(file.body) : file.body;
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Length': String(bytes.byteLength),
    },
  });
}

/** GET /api/kosipa/loans/[docNo]/pdf */
export async function handleLoanCardPdfExport(
  services: AuthServices,
  request: Request,
  deps: DocumentPdfApiDeps,
  params: { docNo: string },
): Promise<Response> {
  try {
    if (crossSite(request)) return json(403, { error: 'CROSS_SITE' });
    const a = await kosipaActor(services, request, deps);
    if ('response' in a) return a.response;
    if (!a.ports.loans) return json(503, { error: 'KOSIPA_UNAVAILABLE' });
    const file = await exportLoanCardPdf(
      { reader: a.ports.loans, audit: a.ports.audit, now: a.ports.now, throttle: a.ports.exportThrottle },
      a.actor,
      { docNo: params.docNo },
    );
    return pdfResponse(file);
  } catch (error) {
    return fail(services, error);
  }
}

/** GET /api/kosipa/payroll/[docNo]/anggota/[nik]/pdf */
export async function handlePayrollMemberSlipPdfExport(
  services: AuthServices,
  request: Request,
  deps: DocumentPdfApiDeps,
  params: { docNo: string; nik: string },
): Promise<Response> {
  try {
    if (crossSite(request)) return json(403, { error: 'CROSS_SITE' });
    const a = await kosipaActor(services, request, deps);
    if ('response' in a) return a.response;
    if (!a.ports.payroll) return json(503, { error: 'KOSIPA_UNAVAILABLE' });
    const file = await exportPayrollMemberSlipPdf(
      { reader: a.ports.payroll, audit: a.ports.audit, now: a.ports.now, throttle: a.ports.exportThrottle },
      a.actor,
      { docNo: params.docNo, nik: params.nik },
    );
    return pdfResponse(file);
  } catch (error) {
    return fail(services, error);
  }
}

/** GET /api/kosipa/savings/[memberId]/pdf */
export async function handleMemberSavingsPassbookPdfExport(
  services: AuthServices,
  request: Request,
  deps: DocumentPdfApiDeps,
  params: { memberId: string },
): Promise<Response> {
  try {
    if (crossSite(request)) return json(403, { error: 'CROSS_SITE' });
    const a = await kosipaActor(services, request, deps);
    if ('response' in a) return a.response;
    if (!a.ports.savings || !a.ports.members) return json(503, { error: 'KOSIPA_UNAVAILABLE' });
    const file = await exportMemberSavingsPassbookPdf(
      { savings: a.ports.savings, members: a.ports.members, audit: a.ports.audit, now: a.ports.now, throttle: a.ports.exportThrottle },
      a.actor,
      { memberId: params.memberId, params: queryParams(request) },
    );
    return pdfResponse(file);
  } catch (error) {
    return fail(services, error);
  }
}
