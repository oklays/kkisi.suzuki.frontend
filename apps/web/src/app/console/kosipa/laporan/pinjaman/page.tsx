import { KosipaPageHeader, FeedbackState, FinancialTable, ReportYearFilter, ContextNotice } from '@/components/console/kosipa/KosipaUI';
import { ExportControl } from '@/components/console/kosipa/ExportControl';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { KosipaError } from '@koperasi/domain/kosipa';
import { readLoanReport, type LoanReportResult } from '@koperasi/application/kosipa/reports';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { formatAmount4, qs } from '@/components/console/kosipa/payroll-format';
import { UNUSABLE_DATE_LABEL, YEAR_NOTE } from '@/components/console/kosipa/report-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Laporan Pinjaman · KOSIPA · KKISI TB2' };

export default async function LoanReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/kosipa/laporan/pinjaman' });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.loan.view')) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  const services = kosipaServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  const params = await searchParams;
  let result: LoanReportResult | null = null; let failed = false; let invalid = false;
  try { result = await readLoanReport({ reader: services.reports, audit: services.audit, now: services.now }, { userId: auth.ctx.userId, capabilities: auth.capabilities, requestId: crypto.randomUUID() }, params); }
  catch (error) { if (error instanceof KosipaError && error.code === 'PERIOD_INVALID') invalid = true; else failed = true; }
  const r = result?.report;
  const canExport = auth.capabilities.has('kosipa.report.export');

  return (
    <div className="console-page">
      <Link prefetch={false} className="console-back" href="/console/kosipa/laporan"><ArrowLeft size={16} aria-hidden="true" />Kembali ke laporan</Link>
      <KosipaPageHeader title={<> Laporan pinjaman </>}><p>Pokok pinjaman <strong>tercatat</strong> (rencana) per bulan dokumen. Ini bukan saldo/outstanding.</p></KosipaPageHeader>
      {invalid && <FeedbackState kind="error" title={<> Tahun tidak valid </>} reset="/console/kosipa/laporan/pinjaman"><p>Tahun harus empat digit antara 2000 dan 2100. Tidak ada data yang dibaca.</p></FeedbackState>}
      {failed && <FeedbackState kind="error" title={<> Laporan tidak dapat dibaca </>} reset="/console/kosipa/laporan/pinjaman"><p>Data tidak tersedia saat ini atau berisi nilai yang tidak dapat dibaca. Coba lagi beberapa saat lagi.</p></FeedbackState>}
      {r && (<>
        <ContextNotice title="Pokok tercatat, bukan outstanding resmi" expandable><p>Angka berikut menjumlahkan pokok rencana menurut tanggal dokumen. Saldo resmi belum tersedia karena definisinya belum diverifikasi.</p></ContextNotice>
        {canExport && <ExportControl href={`/api/kosipa/reports/loans/export${qs({ tahun: r.year === null ? '' : String(r.year) })}`} />}
        {canExport && <p className="console-notice">Ekspor berisi ringkasan agregat tanpa nama, NIK atau gaji anggota, dan setiap unduhan dicatat dalam audit.</p>}
        <ReportYearFilter path="/console/kosipa/laporan/pinjaman" year={r.year} years={r.years} />
        {r.year === null ? <FeedbackState kind="empty" title={<> Belum ada pinjaman bertanggal </>} reset="/console/kosipa/laporan/pinjaman"><p>Tidak ada pinjaman dengan tanggal dokumen yang dapat dipakai.</p></FeedbackState> : (
          <section className="console-card" aria-labelledby="sec-bulan">
            <h2 id="sec-bulan">Tahun {r.year}</h2>
            {r.months.length === 0 ? <p>Tidak ada pinjaman pada tahun ini.</p> : (
              <FinancialTable label="Pinjaman per bulan dokumen" columns={[{ label: "Bulan" }, { label: "Dokumen", numeric: true }, { label: "Σ pokok (rencana)", numeric: true }, { label: "Per status (dokumen / pelunasan)" }]}>
                <tbody>{r.months.map((m) => (
                  <tr key={m.bucket}>
                    <td><Link prefetch={false} href={`/console/kosipa/pinjaman${qs({ periode: m.bucket })}`}>{m.bucket}</Link></td><td>{m.count}</td><td className="num">{formatAmount4(m.plan4)}</td>
                    <td>{m.lines.map((l) => `${l.docStatus ?? '—'} / ${l.repayment ?? '—'}: ${l.count} (${formatAmount4(l.plan4)})`).join(' · ')}</td>
                  </tr>
                ))}</tbody>
              </FinancialTable>
            )}
            <p className="console-notice">{YEAR_NOTE}</p>
          </section>
        )}
        {r.unusableDates.length > 0 && (
          <section className="console-card" aria-labelledby="sec-tanggal">
            <h2 id="sec-tanggal">Pinjaman tanpa tanggal yang dapat dipakai (semua tahun)</h2>
            <FinancialTable label="Pinjaman tanpa tanggal yang dapat dipakai" columns={[{ label: "Kondisi" }, { label: "Dokumen", numeric: true }, { label: "Σ pokok (rencana)", numeric: true }]}>
              <tbody>{r.unusableDates.map((u) => <tr key={u.kind}><td>{UNUSABLE_DATE_LABEL[u.kind]}</td><td>{u.count}</td><td className="num">{formatAmount4(u.plan4)}</td></tr>)}</tbody>
            </FinancialTable>
          </section>
        )}
        <p><Link prefetch={false} className="console-more" href="/console/kosipa/laporan/kualitas-data">Lihat diagnostik kualitas data</Link></p>
      </>)}
    </div>
  );
}
