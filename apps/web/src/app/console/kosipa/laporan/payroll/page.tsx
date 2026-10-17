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
const COLUMN_LABEL = { TOKO_TAMBUN: 'Toko Tambun', TOKO_MJ: 'Toko MJ', TOKO_GIIC: 'Toko GIIC' } as const;

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
      <Link className="console-back" href="/console/kosipa/laporan"><ArrowLeft size={16} aria-hidden="true" />Kembali ke laporan</Link>
      <header className="console-page-head"><h1>Laporan payroll</h1><p>Ringkasan batch dan komponen potongan <strong>sebagaimana tercatat</strong>. Periode diambil dari kolom bulan/tahun yang tercatat.</p></header>
      {invalid && <section className="console-panel" role="alert"><h2>Tahun tidak valid</h2><p>Tahun harus empat digit antara 2000 dan 2100. Tidak ada data yang dibaca.</p></section>}
      {failed && <section className="console-panel" role="alert"><h2>Laporan tidak dapat dibaca</h2><p>Data tidak tersedia saat ini atau berisi nilai yang tidak dapat dibaca. Coba lagi beberapa saat lagi.</p></section>}
      {r && (<>
        {canExport && <p><a className="console-more" href={`/api/kosipa/reports/payroll/export${qs({ tahun: r.year === null ? '' : String(r.year) })}`} download>Unduh CSV laporan ini</a></p>}
        {canExport && <p className="console-notice">Ekspor berisi ringkasan agregat tanpa nama, NIK atau gaji anggota, dan setiap unduhan dicatat dalam audit.</p>}
        {r.years.length > 0 && <nav aria-label="Pilih tahun"><ul className="console-year-list">{r.years.map((y) => <li key={y}>{y === r.year ? <strong aria-current="page">{y}</strong> : <Link href={`/console/kosipa/laporan/payroll${qs({ tahun: String(y) })}`}>{y}</Link>}</li>)}</ul></nav>}
        {r.periods.length === 0 ? <section className="console-panel" role="status"><h2>Tidak ada batch</h2><p>Tidak ada batch payroll tercatat{r.year ? ` pada tahun ${r.year}` : ''}.</p></section> : r.periods.map((p) => (
          <section className="console-card" key={p.period} aria-labelledby={`sec-${p.period}`}>
            <h2 id={`sec-${p.period}`}>{p.period === 'UNKNOWN' ? 'Periode tidak dapat dipastikan' : `Periode ${p.period}`}</h2>
            <dl className="console-dl">
              <div><dt>Batch / baris</dt><dd>{p.batches.length} / {p.rows}</dd></div>
              <div><dt>Σ total potongan (baris, tercatat)</dt><dd>{formatAmount4(p.rowsTotal4)}</dd></div>
              <div><dt>Σ total header (tercatat)</dt><dd>{formatAmount4(p.headerTotal4)}</dd></div>
              <div><dt>Batch belum APPROVED</dt><dd>{p.openBatches}</dd></div>
            </dl>
            <table className="console-table">
              <thead><tr><th scope="col">Batch</th><th scope="col">Grup</th><th scope="col">Status</th><th scope="col">Baris</th><th scope="col">Total header</th><th scope="col">Σ baris</th><th scope="col">Catatan</th></tr></thead>
              <tbody>{p.batches.map((b) => (
                <tr key={b.header.docNo}>
                  <td><Link href={`/console/kosipa/payroll/${encodeURIComponent(b.header.docNo)}`}>{b.header.docNo}</Link></td><td>{b.header.group ? (GROUP_LABEL[b.header.group] ?? b.header.group) : '—'}</td><td>{STATUS_LABEL[b.status]}</td>
                  <td>{b.rows}</td><td className="num">{b.headerTotal4 === null ? '—' : formatAmount4(b.headerTotal4)}</td><td className="num">{formatAmount4(b.rowsTotal4)}</td>
                  <td>{b.issues.length ? b.issues.map((i) => BATCH_ISSUE_SHORT[i] ?? i).join(', ') : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
            {p.groups.length > 0 && (
              <table className="console-table" aria-label={`Komponen potongan ${p.period}`}>
                <thead><tr><th scope="col">Kelompok komponen</th><th scope="col">Jumlah tercatat</th></tr></thead>
                <tbody>{p.groups.map((g) => <tr key={g.group}><td>{g.label}</td><td className="num">{formatAmount4(g.amount4)}</td></tr>)}</tbody>
              </table>
            )}
            {canCompare && p.reconcilable && p.batches.length > 0 && <p><Link className="console-more" href={`/console/kosipa/payroll/${encodeURIComponent(p.batches[0].header.docNo)}/rekonsiliasi`}>Bandingkan komponen TOKO dengan belanja Kredit (hanya tinjauan; {Object.entries(p.toko4).map(([c, v]) => `${COLUMN_LABEL[c as keyof typeof COLUMN_LABEL]} ${formatAmount4(v)}`).join(', ')})</Link></p>}
            {!p.reconcilable && <p className="console-notice">Periode tidak dapat dipastikan dari kolom bulan/tahun; perbandingan tidak ditawarkan dan bulan tidak ditebak.</p>}
          </section>
        ))}
        {r.headersWithoutRows > 0 && <p className="console-notice">{r.headersWithoutRows} header tidak memiliki baris potongan.</p>}
        <p><Link className="console-more" href="/console/kosipa/laporan/kualitas-data">Lihat diagnostik kualitas data</Link></p>
      </>)}
    </div>
  );
}
