import { notFound } from 'next/navigation';
import { KosipaError } from '@koperasi/domain/kosipa';
import { readLoanReport, type LoanReportResult } from '@koperasi/application/kosipa/reports';
import { FeedbackState } from '@/components/console/kosipa/KosipaUI';
import {
  KosipaLoanReportClient,
  ReportPageHeader,
} from '@/components/console/kosipa/KosipaLoanReportClient';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Laporan Pinjaman · KOSIPA · KKISI TB2' };

const MONTHS_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
] as const;

function formatUpdatedTimestamp(date: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      day: '2-digit',
      month: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const day = get('day');
    const monthIdx = Number(get('month')) - 1;
    const year = get('year');
    const hour = get('hour');
    const minute = get('minute');
    if (day && monthIdx >= 0 && monthIdx < 12 && year && hour && minute) {
      return `${day} ${MONTHS_ID[monthIdx]} ${year}, ${hour}:${minute}`;
    }
  } catch {
    // Fallback if Intl fails
  }
  return '';
}

export default async function LoanReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/kosipa/laporan/pinjaman' });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.loan.view'))
    return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  const services = kosipaServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  const params = await searchParams;
  let result: LoanReportResult | null = null;
  let failed = false;
  let invalid = false;
  try {
    result = await readLoanReport(
      { reader: services.reports, audit: services.audit, now: services.now },
      {
        userId: auth.ctx.userId,
        capabilities: auth.capabilities,
        requestId: crypto.randomUUID(),
      },
      params,
    );
  } catch (error) {
    if (error instanceof KosipaError && error.code === 'PERIOD_INVALID') invalid = true;
    else failed = true;
  }
  const r = result?.report;
  const canExport = auth.capabilities.has('kosipa.report.export');
  const updatedAtLabel = formatUpdatedTimestamp(services.now());

  return (
    <div className="console-page kosipa-lr-page">
      <ReportPageHeader updatedAtLabel={updatedAtLabel} />

      {invalid && (
        <FeedbackState
          kind="error"
          title={<> Tahun tidak valid </>}
          reset="/console/kosipa/laporan/pinjaman"
        >
          <p>Tahun harus empat digit antara 2000 dan 2100. Tidak ada data yang dibaca.</p>
        </FeedbackState>
      )}

      {failed && (
        <FeedbackState
          kind="error"
          title={<> Laporan tidak dapat dibaca </>}
          reset="/console/kosipa/laporan/pinjaman"
        >
          <p>
            Data tidak tersedia saat ini atau berisi nilai yang tidak dapat dibaca. Coba lagi
            beberapa saat lagi.
          </p>
        </FeedbackState>
      )}

      {r && (
        <KosipaLoanReportClient
          report={r}
          canExport={canExport}
        />
      )}
    </div>
  );
}
