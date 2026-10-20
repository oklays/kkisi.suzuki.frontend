import { KosipaPageHeader, FeedbackState, StatusBadge, FinancialTable, ReportYearFilter, ContextNotice } from '@/components/console/kosipa/KosipaUI';
import { ExportControl } from '@/components/console/kosipa/ExportControl';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { KosipaError } from '@koperasi/domain/kosipa';
import { readPayrollReport } from '@koperasi/application/kosipa/reports';
import type { PayrollReport } from '@koperasi/domain/kosipa';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { formatAmount4, GROUP_LABEL, qs, STATUS_LABEL } from '@/components/console/kosipa/payroll-format';
import { BATCH_ISSUE_SHORT } from '@/components/console/kosipa/report-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Laporan Payroll · KOSIPA · KKISI TB2' };

export default async function PayrollReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/kosipa/laporan/payroll' });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.payroll.view')) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  const services = kosipaServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  const params = await searchParams;
  let r: PayrollReport | null = null; let failed = false; let invalid = false;
  try { r = await readPayrollReport({ reader: services.reports, audit: services.audit, now: services.now }, { userId: auth.ctx.userId, capabilities: auth.capabilities, requestId: crypto.randomUUID() }, params); }
  catch (error) { if (error instanceof KosipaError && error.code === 'PERIOD_INVALID') invalid = true; else failed = true; }
  const canCompare = auth.capabilities.has('kosipa.store-credit.view');
  const canExport = auth.capabilities.has('kosipa.report.export');

  return (
    <div className="console-page">
      <Link prefetch={false} className="console-back" href="/console/kosipa/laporan"><ArrowLeft size={16} aria-hidden="true" />Kembali ke laporan</Link>
      <KosipaPageHeader title={<> Laporan payroll </>}><p>Ringkasan batch dan komponen potongan <strong>sebagaimana tercatat</strong>. Periode diambil dari kolom bulan/tahun yang tercatat.</p></KosipaPageHeader>
      {invalid && <FeedbackState kind="error" title={<> Tahun tidak valid </>} reset="/console/kosipa/laporan/payroll"><p>Tahun harus empat digit antara 2000 dan 2100. Tidak ada data yang dibaca.</p></FeedbackState>}
      {failed && <FeedbackState kind="error" title={<> Laporan tidak dapat dibaca </>} reset="/console/kosipa/laporan/payroll"><p>Data tidak tersedia saat ini atau berisi nilai yang tidak dapat dibaca. Coba lagi beberapa saat lagi.</p></FeedbackState>}
      {r && (<>
        <ContextNotice title="Nilai payroll tercatat" expandable><p>Total header dan jumlah baris dipertahankan apa adanya. Perbedaan ditampilkan untuk tinjauan; perbandingan kredit toko bukan penetapan kewajiban resmi.</p></ContextNotice>
        {canExport && <ExportControl href={`/api/kosipa/reports/payroll/export${qs({ tahun: r.year === null ? '' : String(r.year) })}`} />}
        {canExport && <p className="console-notice">Ekspor berisi ringkasan agregat tanpa nama, NIK atau gaji anggota, dan setiap unduhan dicatat dalam audit.</p>}
        <ReportYearFilter path="/console/kosipa/laporan/payroll" year={r.year} years={r.years} />
        {r.periods.length === 0 ? <FeedbackState kind="empty" title={<> Tidak ada batch </>} reset="/console/kosipa/laporan/payroll"><p>Tidak ada batch payroll tercatat{r.year ? ` pada tahun ${r.year}` : ''}.</p></FeedbackState> : r.periods.map((p) => (
          <section className="console-card" key={p.period} aria-labelledby={`sec-${p.period}`}>
            <h2 id={`sec-${p.period}`}>{p.period === 'UNKNOWN' ? 'Periode tidak dapat dipastikan' : `Periode ${p.period}`}</h2>
            <dl className="console-dl">
              <div><dt>Batch / baris</dt><dd>{p.batches.length} / {p.rows}</dd></div>
              <div><dt>Σ total potongan (baris, tercatat)</dt><dd>{formatAmount4(p.rowsTotal4)}</dd></div>
              <div><dt>Σ total header (tercatat)</dt><dd>{formatAmount4(p.headerTotal4)}</dd></div>
              <div><dt>Batch belum APPROVED</dt><dd>{p.openBatches}</dd></div>
            </dl>
            <FinancialTable label="Batch payroll per periode" columns={[{ label: "Batch" }, { label: "Grup" }, { label: "Status" }, { label: "Baris", numeric: true }, { label: "Total header", numeric: true }, { label: "Σ baris", numeric: true }, { label: "Catatan" }]}>
              <tbody>{p.batches.map((b) => (
                <tr key={b.header.docNo}>
                  <td><Link prefetch={false} href={`/console/kosipa/payroll/${encodeURIComponent(b.header.docNo)}`}>{b.header.docNo}</Link></td><td>{b.header.group ? (GROUP_LABEL[b.header.group] ?? b.header.group) : '—'}</td><td><StatusBadge value={b.status} label={STATUS_LABEL[b.status]} /></td>
                  <td>{b.rows}</td><td className="num">{b.headerTotal4 === null ? 'Tidak tersedia' : formatAmount4(b.headerTotal4)}</td><td className="num">{formatAmount4(b.rowsTotal4)}</td>
                  <td>{b.issues.length ? b.issues.map((i) => BATCH_ISSUE_SHORT[i] ?? i).join(', ') : '—'}</td>
                </tr>
              ))}</tbody>
            </FinancialTable>
            {p.groups.length > 0 && (
              <FinancialTable label="Komponen potongan per periode" columns={[{ label: "Kelompok komponen" }, { label: "Jumlah tercatat", numeric: true }]}>
                <tbody>{p.groups.map((g) => <tr key={g.group}><td>{g.label}</td><td className="num">{formatAmount4(g.amount4)}</td></tr>)}</tbody>
              </FinancialTable>
            )}
            {canCompare && p.reconcilable && p.batches.length > 0 && <p><Link prefetch={false} className="console-more" href={`/console/kosipa/payroll/${encodeURIComponent(p.batches[0].header.docNo)}/rekonsiliasi`}>Bandingkan kredit toko — untuk tinjauan</Link></p>}
            {!p.reconcilable && <p className="console-notice">Periode tidak dapat dipastikan dari kolom bulan/tahun; perbandingan tidak ditawarkan dan bulan tidak ditebak.</p>}
          </section>
        ))}
        {r.headersWithoutRows > 0 && <p className="console-notice">{r.headersWithoutRows} header tidak memiliki baris potongan.</p>}
        <p><Link prefetch={false} className="console-more" href="/console/kosipa/laporan/kualitas-data">Lihat diagnostik kualitas data</Link></p>
      </>)}
    </div>
  );
}
