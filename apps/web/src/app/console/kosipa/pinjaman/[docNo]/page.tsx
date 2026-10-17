import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { KosipaError } from '@koperasi/domain/kosipa';
import { readLoan, type LoanDetail } from '@koperasi/application/kosipa/loans';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { LOAN_REASON_TEXT, SCHEDULE_ISSUE_TEXT, STATUS_FLAG_TEXT } from '@/components/console/kosipa/loan-format';
import { formatAmount4, formatLegacyDate, qs } from '@/components/console/kosipa/payroll-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Detail Pinjaman · KOSIPA · KKISI TB2' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function LoanDetailPage({ params, searchParams }: { params: Promise<{ docNo: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!consoleEnabled()) notFound();
  const { docNo } = await params;
  const auth = await requireConsoleSession({ next: `/console/kosipa/pinjaman/${encodeURIComponent(docNo)}` });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.loan.view')) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  const services = kosipaServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  const after = one((await searchParams).after);
  let detail: LoanDetail | null = null; let failed = false;
  try {
    detail = await readLoan({ reader: services.loans, audit: services.audit, now: services.now }, { userId: auth.ctx.userId, capabilities: auth.capabilities, requestId: crypto.randomUUID() }, { docNo, after });
  } catch (error) { if (error instanceof KosipaError && error.code !== 'AMOUNT_INVALID') notFound(); failed = true; }
  if (!failed && !detail) notFound();
  const base = `/console/kosipa/pinjaman/${encodeURIComponent(docNo)}`;
  const l = detail?.loan; const h = l?.header;

  return (
    <div className="console-page">
      <Link className="console-back" href="/console/kosipa/pinjaman"><ArrowLeft size={16} aria-hidden="true" />Kembali ke daftar pinjaman</Link>
      <header className="console-page-head"><h1>Pinjaman {docNo}</h1><p>Data pinjaman KOSIPA, baca saja. Nilai di bawah adalah nilai yang tercatat.</p></header>
      {failed && <section className="console-panel" role="alert"><h2>Pinjaman tidak dapat dibaca</h2><p>Data tidak tersedia saat ini atau berisi nilai yang tidak dapat dibaca. Coba lagi beberapa saat lagi.</p></section>}
      {detail && l && h && (<>
        <section className="console-card" aria-labelledby="sec-pinjaman">
          <h2 id="sec-pinjaman">Dokumen pinjaman (tercatat)</h2>
          <dl className="console-dl">
            <div><dt>Anggota</dt><dd>{h.name || '—'} · NIK {h.nik || '—'}</dd></div>
            <div><dt>Jenis / metode bunga</dt><dd>{[h.type, h.method].filter(Boolean).join(' · ') || '—'}{h.rate ? ` · suku bunga tercatat ${h.rate}` : ''}</dd></div>
            <div><dt>Status dokumen / pencairan / pelunasan</dt><dd>{[h.docStatus, h.disbursement, h.repayment].map((s) => s ?? '—').join(' / ')}</dd></div>
            <div><dt>Tanggal dokumen</dt><dd>{formatLegacyDate(l.docDate)}</dd></div>
            <div><dt>Pokok (rencana)</dt><dd>{formatAmount4(l.planPrincipal4)}</dd></div>
            <div><dt>Pokok (aktual, kolom legacy)</dt><dd>{formatAmount4(l.actualPrincipal4)}</dd></div>
            <div><dt>Angsuran (rencana)</dt><dd>{formatAmount4(l.planInstallment4)}</dd></div>
            <div><dt>Tenor (rencana)</dt><dd>{h.planMonths ? `${h.planMonths} bulan` : '—'}</dd></div>
            <div><dt>Awal / akhir pinjaman</dt><dd>{formatLegacyDate(l.startDate)} / {formatLegacyDate(l.endDate)}</dd></div>
            <div><dt>Pencairan</dt><dd>{formatLegacyDate(l.disbursedDate)} · {formatAmount4(l.disbursedAmount4)}</dd></div>
            <div><dt>Biaya admin / asuransi</dt><dd>{formatAmount4(l.adminFee4)} / {formatAmount4(l.insuranceFee4)}</dd></div>
            <div><dt>Total potongan / diterima</dt><dd>{formatAmount4(l.totalDeduction4)} / {formatAmount4(l.totalReceived4)}</dd></div>
            <div><dt>Pelunasan (tercatat)</dt><dd>{h.settlementStatus || '—'} · {formatLegacyDate(l.settlementDate)} · {formatAmount4(l.settlementTotal4)}</dd></div>
          </dl>
          {l.statusFlags.length > 0 && <div className="console-notice" role="status"><strong>Status saling bertentangan (ditampilkan apa adanya)</strong><ul>{l.statusFlags.map((f) => <li key={f}>{STATUS_FLAG_TEXT[f]}</li>)}</ul></div>}
          {detail.headerCount > 1 && (
            <div className="console-notice" role="status"><strong>Ada {detail.headerCount} dokumen dengan nomor yang sama.</strong> Dokumen lain:
              <ul>{detail.otherHeaders.map((o) => <li key={o.header.id}>id {o.header.id}: {[o.header.docStatus, o.header.disbursement, o.header.repayment].join(' / ')} · pokok {formatAmount4(o.planPrincipal4)}</li>)}</ul>
            </div>
          )}
          <p className="console-notice" role="status">{LOAN_REASON_TEXT.OFFICIAL_BALANCE_UNVERIFIED}</p>
        </section>

        <section className="console-card" aria-labelledby="sec-jadwal">
          <h2 id="sec-jadwal">Jadwal angsuran (tercatat)</h2>
          {detail.schedule.state === 'unavailable' ? <p className="console-unavailable" role="status">{LOAN_REASON_TEXT[detail.schedule.reason]}</p> : (() => {
            const s = detail.schedule; const i = s.integrity;
            return (<>
              <dl className="console-dl">
                <div><dt>Baris angsuran</dt><dd>{i.rows}{i.planMonths ? ` dari tenor ${i.planMonths}` : ''}</dd></div>
                <div><dt>Sudah dibayar / belum</dt><dd>{i.paidRows} / {i.unpaidRows}</dd></div>
                <div><dt>Σ pokok jadwal</dt><dd>{formatAmount4(i.recorded.principal4)}</dd></div>
                <div><dt>Σ bunga jadwal</dt><dd>{formatAmount4(i.recorded.interest4)}</dd></div>
                <div><dt>Σ pokok belum dibayar (jadwal)</dt><dd>{formatAmount4(i.recorded.unpaidPrincipal4)}</dd></div>
                <div><dt>Σ angsuran belum dibayar (jadwal)</dt><dd>{formatAmount4(i.recorded.unpaidTotal4)}</dd></div>
              </dl>
              <p className="console-notice">Σ pada jadwal bukan saldo resmi (lihat catatan di atas).</p>
              {i.issues.length > 0 && <div className="console-notice" role="status"><strong>Catatan integritas data</strong><ul>{i.issues.map((x) => <li key={x}>{SCHEDULE_ISSUE_TEXT[x] ?? x}{x === 'PRINCIPAL_SUM_DIFFERS_FROM_PLAN' ? ` Selisih: ${formatAmount4(i.principalDifference4)}.` : ''}{x === 'DUE_DATES_UNUSABLE' ? ` (${i.dueDates.zero} nol, ${i.dueDates.missing} kosong, ${i.dueDates.implausible} tidak wajar)` : ''}</li>)}</ul></div>}
              {i.paidRowsWithoutPaidDate > 0 && <p className="console-notice">{i.paidRowsWithoutPaidDate} angsuran berstatus Bayar tidak mencatat tanggal bayar (kolom tanggal bayar legacy memang tidak diisi).</p>}
              {s.rows.length === 0 ? <p>{after ? 'Tidak ada baris lagi.' : 'Pinjaman ini tidak memiliki jadwal angsuran.'}</p> : (
                <table className="console-table">
                  <thead><tr><th scope="col">Ke</th><th scope="col">Jatuh tempo</th><th scope="col">Pokok</th><th scope="col">Bunga</th><th scope="col">Angsuran</th><th scope="col">Status</th></tr></thead>
                  <tbody>{s.rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.installmentNo ?? '—'}</td><td>{formatLegacyDate(r.due)}</td>
                      <td className="num">{formatAmount4(r.principal4)}</td><td className="num">{formatAmount4(r.interest4)}</td>
                      <td className="num">{formatAmount4(r.total4)}{!r.totalMatches && <span className="console-badge" data-state="partial"> ≠ pokok + bunga</span>}</td>
                      <td>{[r.status, r.type].filter(Boolean).join(' · ') || '—'}{r.blocked ? ' · diblokir' : ''}{r.rollOver ? ' · roll-over' : ''}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
              {s.nextCursor !== null && <p><Link className="console-more" href={`${base}${qs({ after: s.nextCursor })}`}>Muat angsuran berikutnya</Link></p>}
            </>);
          })()}
        </section>
      </>)}
    </div>
  );
}
