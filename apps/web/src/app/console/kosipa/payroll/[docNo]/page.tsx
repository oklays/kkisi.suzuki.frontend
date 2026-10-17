import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Search } from 'lucide-react';
import { KosipaError } from '@koperasi/domain/kosipa';
import { readPayrollBatch, type BatchDetail } from '@koperasi/application/kosipa/payroll';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { formatAmount4, formatLegacyDate, GROUP_LABEL, ISSUE_TEXT, qs, STATUS_LABEL } from '@/components/console/kosipa/payroll-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Batch Payroll · KOSIPA · KKISI TB2' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function PayrollBatchPage({ params, searchParams }: { params: Promise<{ docNo: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!consoleEnabled()) notFound();
  const { docNo } = await params;
  const auth = await requireConsoleSession({ next: `/console/kosipa/payroll/${encodeURIComponent(docNo)}` });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.payroll.view')) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  const services = kosipaServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  const sp = await searchParams; const q = one(sp.q); const after = one(sp.after);
  let batch: BatchDetail | null = null; let failed = false;
  try {
    batch = await readPayrollBatch({ reader: services.payroll, audit: services.audit, now: services.now }, { userId: auth.ctx.userId, capabilities: auth.capabilities, requestId: crypto.randomUUID() }, { docNo, q, after });
  } catch (error) { if (error instanceof KosipaError) notFound(); failed = true; }
  if (!failed && !batch) notFound();
  const canReconcile = auth.capabilities.has('kosipa.store-credit.view');
  const base = `/console/kosipa/payroll/${encodeURIComponent(docNo)}`;

  return (
    <div className="console-page">
      <Link className="console-back" href="/console/kosipa/payroll"><ArrowLeft size={16} aria-hidden="true" />Kembali ke daftar batch</Link>
      <header className="console-page-head"><h1>Batch {docNo}</h1><p>Data payroll KOSIPA, baca saja.</p></header>
      {failed && <section className="console-panel" role="alert"><h2>Batch tidak dapat dibaca</h2><p>Data tidak tersedia saat ini. Coba lagi beberapa saat lagi.</p></section>}
      {batch && (<>
        <section className="console-card" aria-labelledby="sec-ringkasan">
          <h2 id="sec-ringkasan">Ringkasan (nilai tercatat)</h2>
          <dl className="console-dl">
            <div><dt>Status</dt><dd>{STATUS_LABEL[batch.header.status]}</dd></div>
            <div><dt>Grup</dt><dd>{batch.header.header.group ? (GROUP_LABEL[batch.header.header.group] ?? batch.header.header.group) : '—'}</dd></div>
            <div><dt>Periode</dt><dd>{batch.header.header.periodYear && batch.header.header.periodMonth ? `${batch.header.header.periodYear}-${batch.header.header.periodMonth}` : '—'}</dd></div>
            <div><dt>Tanggal periode</dt><dd>{formatLegacyDate(batch.header.periodDate)}</dd></div>
            <div><dt>Tanggal dokumen</dt><dd>{batch.header.header.docDate ?? '—'}</dd></div>
            <div><dt>Tanggal cair</dt><dd>{formatLegacyDate(batch.header.cashDate)}</dd></div>
            <div><dt>Total header (tercatat)</dt><dd>{batch.header.headerTotal4 === null ? '—' : formatAmount4(batch.header.headerTotal4)}</dd></div>
            <div><dt>Jumlah seluruh baris (tercatat)</dt><dd>{formatAmount4(batch.integrity.rowsTotal4)}</dd></div>
            <div><dt>Baris / anggota unik</dt><dd>{batch.rowCount} / {batch.distinctNik}</dd></div>
          </dl>
          {batch.integrity.issues.length > 0 && (
            <div className="console-notice" role="status"><strong>Catatan integritas data</strong>
              <ul>{batch.integrity.issues.map((i) => <li key={i}>{ISSUE_TEXT[i] ?? i}{i === 'HEADER_TOTAL_MISMATCH' && batch.integrity.differenceFrom4 !== null ? ` Selisih: ${formatAmount4(batch.integrity.differenceFrom4)}.` : ''}</li>)}</ul>
            </div>
          )}
          <p className="console-notice">Gaji anggota tidak ditampilkan. Tidak ada tombol persetujuan, posting, atau pembuatan matriks di halaman ini.</p>
          {canReconcile && <p><Link className="console-more" href={`${base}/rekonsiliasi`}>Lihat rekonsiliasi kredit toko (hanya tinjauan)</Link></p>}
        </section>

        <section className="console-card" aria-labelledby="sec-komponen">
          <h2 id="sec-komponen">Rincian per kelompok komponen (jumlah tercatat)</h2>
          <table className="console-table">
            <thead><tr><th scope="col">Kelompok</th><th scope="col">Jumlah</th></tr></thead>
            <tbody>
              {batch.totals.groups.map((g) => <tr key={g.group}><td>{g.label}</td><td className="num">{formatAmount4(g.amount4)}</td></tr>)}
              <tr><th scope="row">Jumlah komponen</th><td className="num">{formatAmount4(batch.totals.componentSum4)}</td></tr>
              <tr><th scope="row">Total potongan tercatat</th><td className="num">{formatAmount4(batch.totals.recordedTotal4)}</td></tr>
            </tbody>
          </table>
          {!batch.totals.sumMatchesTotal && <p className="console-notice">Jumlah komponen berbeda dari total tercatat sebesar {formatAmount4(batch.totals.differenceFromTotal4)}; nilai tercatat tidak diubah.</p>}
          {batch.totals.tokoSubtotalMatches === false && <p className="console-notice">Subtotal toko yang tercatat tidak sama dengan jumlah kolom TOKO_*.</p>}
        </section>

        <section className="console-section" aria-labelledby="sec-anggota">
          <h2 id="sec-anggota">Anggota dalam batch</h2>
          <form className="console-search" action={base} method="get" role="search">
            <label htmlFor="payroll-q">NIK atau nama anggota</label>
            <div><input id="payroll-q" name="q" defaultValue={q} maxLength={50} autoComplete="off" /><button type="submit"><Search size={16} aria-hidden="true" />Cari</button></div>
          </form>
          {batch.rows.length === 0 ? <section className="console-panel" role="status"><h3>Tidak ada baris</h3><p>{batch.filterActive ? 'Tidak ada anggota yang cocok dengan pencarian ini.' : 'Batch ini tidak memiliki baris anggota.'}</p></section> : (
            <table className="console-table">
              <thead><tr><th scope="col">NIK</th><th scope="col">Nama</th><th scope="col">Toko Tambun</th><th scope="col">Toko MJ</th><th scope="col">Toko GIIC</th><th scope="col">PPOB</th><th scope="col">Total potongan</th></tr></thead>
              <tbody>{batch.rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`${base}/anggota/${encodeURIComponent(r.nik)}`}>{r.nik}</Link></td><td>{r.name || '—'}</td>
                  <td className="num">{formatAmount4(r.toko4.TOKO_TAMBUN)}</td><td className="num">{formatAmount4(r.toko4.TOKO_MJ)}</td><td className="num">{formatAmount4(r.toko4.TOKO_GIIC)}</td>
                  <td className="num">{formatAmount4(r.ppob4)}</td><td className="num">{formatAmount4(r.total4)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {batch.nextCursor !== null && <p><Link className="console-more" href={`${base}${qs({ q, after: String(batch.nextCursor) })}`}>Muat anggota berikutnya</Link></p>}
        </section>
      </>)}
    </div>
  );
}
