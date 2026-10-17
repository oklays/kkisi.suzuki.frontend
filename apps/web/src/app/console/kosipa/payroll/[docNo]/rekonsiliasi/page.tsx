import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { KosipaError } from '@koperasi/domain/kosipa';
import { readStoreReconciliation, type ReconciliationResult } from '@koperasi/application/kosipa/payroll';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { ANOMALY_LABEL, COMPARABILITY_LABEL, DIFFERENCE_LABEL, formatAmount4, qs, REASON_TEXT } from '@/components/console/kosipa/payroll-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Rekonsiliasi Kredit Toko · Payroll · KKISI TB2' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const COLUMN_LABEL: Record<string, string> = { TOKO_TAMBUN: 'Toko Tambun', TOKO_MJ: 'Toko MJ', TOKO_GIIC: 'Toko GIIC' };

export default async function PayrollReconciliationPage({ params, searchParams }: { params: Promise<{ docNo: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!consoleEnabled()) notFound();
  const { docNo } = await params;
  const auth = await requireConsoleSession({ next: `/console/kosipa/payroll/${encodeURIComponent(docNo)}/rekonsiliasi` });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.payroll.view') || !auth.capabilities.has('kosipa.store-credit.view')) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  const services = kosipaServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  const sp = await searchParams; const after = one(sp.after); const all = one(sp.all) === '1';
  let result: ReconciliationResult | null = null; let failed = false;
  try {
    result = await readStoreReconciliation({ reader: services.payroll, audit: services.audit, now: services.now }, { userId: auth.ctx.userId, capabilities: auth.capabilities, requestId: crypto.randomUUID() }, { docNo, after, all });
  } catch (error) { if (error instanceof KosipaError) notFound(); failed = true; }
  if (!failed && !result) notFound();
  const base = `/console/kosipa/payroll/${encodeURIComponent(docNo)}`;

  return (
    <div className="console-page">
      <Link className="console-back" href={base}><ArrowLeft size={16} aria-hidden="true" />Kembali ke batch {docNo}</Link>
      <header className="console-page-head">
        <h1>Rekonsiliasi kredit toko</h1>
        <p>Tinjauan saja. Tiga angka dipisahkan: <strong>A</strong> nilai payroll yang tercatat, <strong>B</strong> kewajiban Kredit toko turunan (belanja Kredit bulan sumber dikurangi retur), dan <strong>C</strong> selisih A−B. Nilai tercatat tidak pernah diubah.</p>
      </header>
      {failed && <section className="console-panel" role="alert"><h2>Rekonsiliasi tidak dapat dibaca</h2><p>Data tidak tersedia saat ini. Coba lagi beberapa saat lagi.</p></section>}
      {result?.state === 'unavailable' && <section className="console-panel" role="status"><h2>Rekonsiliasi tidak tersedia</h2><p>{REASON_TEXT[result.reason] ?? 'Tidak tersedia.'}</p></section>}
      {result?.state === 'ok' && (() => {
        const d = result.data;
        return (<>
          <section className="console-card" aria-labelledby="sec-konteks">
            <h2 id="sec-konteks">Periode {d.period}</h2>
            <p>Belanja Kredit dibaca dari {d.window.from} sampai sebelum {d.window.toExclusive} (bulan sebelum periode payroll). Batch pada periode ini: {d.batches.map((b) => `${b.docNo} (${b.status})`).join(', ')}.</p>
            <div className="console-notice" role="status"><strong>Hanya untuk ditinjau.</strong> Alasan:
              <ul>{d.comparability.reasons.map((r) => <li key={r}>{COMPARABILITY_LABEL[r] ?? r}</li>)}</ul>
            </div>
          </section>
          <section className="console-card" aria-labelledby="sec-ringkasan">
            <h2 id="sec-ringkasan">Ringkasan per toko</h2>
            <table className="console-table">
              <thead><tr><th scope="col">Kolom toko</th><th scope="col">A · Tercatat di payroll</th><th scope="col">B · Turunan (bersih retur)</th><th scope="col">C · Selisih A−B</th></tr></thead>
              <tbody>{(Object.keys(COLUMN_LABEL) as (keyof typeof COLUMN_LABEL)[]).map((c) => {
                const a = d.summary.recordedTotal4[c as 'TOKO_TAMBUN']; const b = d.summary.derivedTotal4[c as 'TOKO_TAMBUN'];
                return <tr key={c}><td>{COLUMN_LABEL[c]}</td><td className="num">{formatAmount4(a)}</td><td className="num">{formatAmount4(b)}</td><td className="num">{formatAmount4(a - b)}</td></tr>;
              })}</tbody>
            </table>
            <p>{d.summary.compared} pasangan anggota–toko dibandingkan · {d.summary.counts.MATCH} sama · {d.summary.compared - d.summary.counts.MATCH} berbeda atau tidak dapat dibandingkan.</p>
          </section>
          {d.anomalies.length > 0 && (
            <section className="console-card" aria-labelledby="sec-anomali">
              <h2 id="sec-anomali">Anomali data sumber (tidak dibuang)</h2>
              <ul>{d.anomalies.map((a) => <li key={a.code}>{ANOMALY_LABEL[a.code] ?? a.code}: {a.count} baris{a.amount4 ? `, ${formatAmount4(a.amount4)}` : ''}</li>)}</ul>
            </section>
          )}
          <section className="console-section" aria-labelledby="sec-selisih">
            <h2 id="sec-selisih">{d.differencesOnly ? 'Selisih per anggota' : 'Semua pasangan anggota–toko'}</h2>
            <p><Link className="console-more" href={`${base}/rekonsiliasi${d.differencesOnly ? '?all=1' : ''}`}>{d.differencesOnly ? 'Tampilkan juga yang sama' : 'Tampilkan hanya selisih'}</Link></p>
            {d.rows.length === 0 ? <section className="console-panel" role="status"><h3>Tidak ada selisih</h3><p>Semua pasangan yang dapat dibandingkan sama.</p></section> : (
              <table className="console-table">
                <thead><tr><th scope="col">NIK</th><th scope="col">Toko</th><th scope="col">A · Payroll</th><th scope="col">Belanja Kredit</th><th scope="col">Retur</th><th scope="col">B · Turunan</th><th scope="col">C · Selisih</th><th scope="col">Keterangan</th></tr></thead>
                <tbody>{d.rows.map((r) => (
                  <tr key={`${r.nik}|${r.column}`}>
                    <td>{r.nik}{r.recordedRows > 1 ? ` (${r.recordedRows} baris)` : ''}</td><td>{COLUMN_LABEL[r.column]}</td>
                    <td className="num">{formatAmount4(r.recorded4)}</td><td className="num">{formatAmount4(r.sales4)}</td><td className="num">{formatAmount4(r.returns4)}</td><td className="num">{formatAmount4(r.derivedNet4)}</td><td className="num">{formatAmount4(r.difference4)}</td>
                    <td>{DIFFERENCE_LABEL[r.status]}{r.likelyCause === 'RETURN_NOT_DEDUCTED' ? '. Nilai payroll sama dengan belanja Kredit; retur tampaknya tidak ikut dipotong.' : ''}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            {d.nextCursor && <p><Link className="console-more" href={`${base}/rekonsiliasi${qs({ all: all ? '1' : '', after: d.nextCursor })}`}>Muat selisih berikutnya</Link></p>}
          </section>
        </>);
      })()}
    </div>
  );
}
