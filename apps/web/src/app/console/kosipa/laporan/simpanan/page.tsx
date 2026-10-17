import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { KosipaError } from '@koperasi/domain/kosipa';
import type { SavingsMovementReport } from '@koperasi/domain/kosipa';
import { readSavingsMovementReport, type OpsPart } from '@koperasi/application/kosipa/reports-ops';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { formatAmount4, qs } from '@/components/console/kosipa/payroll-format';
import { REPORT_REASON } from '@/components/console/kosipa/report-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ringkasan Mutasi Simpanan · KOSIPA · KKISI TB2' };
const UNPLACED: Record<string, string> = { DATE_UNUSABLE: 'Tanggal dokumen kosong / 0000-00-00 / tidak wajar', HEADER_MISSING: 'Header dokumen tidak ditemukan', HEADER_AMBIGUOUS: 'Header dokumen ganda' };

export default async function SavingsMovementReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/kosipa/laporan/simpanan' });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.savings.view')) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  const services = kosipaServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  const params = await searchParams;
  let part: OpsPart<SavingsMovementReport> | null = null; let failed = false; let invalid = false;
  try { part = await readSavingsMovementReport({ reader: services.reports, ops: services.opsReports, audit: services.audit, now: services.now }, { userId: auth.ctx.userId, capabilities: auth.capabilities, requestId: crypto.randomUUID() }, params); }
  catch (error) { if (error instanceof KosipaError && error.code === 'PERIOD_INVALID') invalid = true; else failed = true; }
  const r = part?.state === 'ok' ? part.data : null; const canExport = auth.capabilities.has('kosipa.report.export');

  return (
    <div className="console-page">
      <Link className="console-back" href="/console/kosipa/laporan"><ArrowLeft size={16} aria-hidden="true" />Kembali ke laporan</Link>
      <header className="console-page-head"><h1>Ringkasan mutasi simpanan</h1><p>Jumlah <strong>mutasi tercatat</strong> per bulan dan jenis. Ini bukan saldo: definisi saldo awal belum diverifikasi, dan kolom saldo pada baris mutasi tidak pernah diisi.</p></header>
      {invalid && <section className="console-panel" role="alert"><h2>Tahun tidak valid</h2><p>Tahun harus empat digit antara 2000 dan 2100. Tidak ada data yang dibaca.</p></section>}
      {failed && <section className="console-panel" role="alert"><h2>Ringkasan tidak dapat dibaca</h2><p>Data tidak tersedia saat ini atau berisi nilai yang tidak dapat dibaca. Coba lagi beberapa saat lagi.</p></section>}
      {part?.state === 'unavailable' && <section className="console-panel" role="status"><h2>Ringkasan tidak tersedia</h2><p>{REPORT_REASON[part.reason]}</p></section>}
      {r && (<>
        <p className="console-notice" role="status"><strong>Saldo resmi belum tersedia.</strong> Status dokumen (header) menentukan: APPROVED disetujui, OPEN menunggu, status lain tidak berlaku.</p>
        {canExport && <p><a className="console-more" href={`/api/kosipa/reports/savings-movements/export${qs({ tahun: r.year === null ? '' : String(r.year) })}`} download>Unduh CSV laporan ini</a></p>}
        {r.years.length > 0 && <nav aria-label="Pilih tahun"><ul className="console-year-list">{r.years.map((y) => <li key={y}>{y === r.year ? <strong aria-current="page">{y}</strong> : <Link href={`/console/kosipa/laporan/simpanan${qs({ tahun: String(y) })}`}>{y}</Link>}</li>)}</ul></nav>}
        <section className="console-card" aria-labelledby="sec-bulan">
          <h2 id="sec-bulan">Tahun {r.year ?? '—'}</h2>
          {r.lines.length === 0 ? <p>Tidak ada mutasi bertanggal pada tahun ini.</p> : (
            <table className="console-table">
              <thead><tr><th scope="col">Bulan</th><th scope="col">Jenis</th><th scope="col">Mutasi</th><th scope="col">Kredit disetujui</th><th scope="col">Debit disetujui</th><th scope="col">Jasa disetujui</th><th scope="col">Kredit menunggu</th><th scope="col">Debit menunggu</th><th scope="col">Status lain</th></tr></thead>
              <tbody>{r.lines.map((l) => (
                <tr key={`${l.bucket}|${l.type}`}><td>{l.bucket}</td><td>{l.type}</td><td className="num">{l.rows}</td><td className="num">{formatAmount4(l.posted4.credit)}</td><td className="num">{formatAmount4(l.posted4.debit)}</td><td className="num">{formatAmount4(l.posted4.interest)}</td><td className="num">{formatAmount4(l.pending4.credit)}</td><td className="num">{formatAmount4(l.pending4.debit)}</td><td className="num">{l.voidRows}</td></tr>
              ))}</tbody>
            </table>
          )}
        </section>
        {r.unplaced.length > 0 && (
          <section className="console-card" aria-labelledby="sec-tak">
            <h2 id="sec-tak">Mutasi yang tidak dapat ditempatkan pada bulan (semua tahun)</h2>
            <table className="console-table"><thead><tr><th scope="col">Kondisi</th><th scope="col">Jenis</th><th scope="col">Mutasi</th></tr></thead>
              <tbody>{r.unplaced.map((u) => <tr key={`${u.kind}|${u.type}`}><td>{UNPLACED[u.kind]}</td><td>{u.type}</td><td className="num">{u.rows}</td></tr>)}</tbody></table>
          </section>
        )}
      </>)}
    </div>
  );
}
