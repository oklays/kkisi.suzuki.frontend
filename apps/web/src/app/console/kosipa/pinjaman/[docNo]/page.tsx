import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { KosipaError, loanProduct, loanSegment, type LoanView, type ScheduleIntegrity } from '@koperasi/domain/kosipa';
import { readLoan, type LoanDetail } from '@koperasi/application/kosipa/loans';
import { FeedbackState, CursorPagination, FinancialTable, ContextNotice, Provenance } from '@/components/console/kosipa/KosipaUI';
import { ExportControl } from '@/components/console/kosipa/ExportControl';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { LoanFigure, LoanFigureStrip, LoanPageHeader, LoanStageBadge, Money } from '@/components/console/kosipa/LoanUI';
import { LOAN_HUB, LOAN_LIST, LOAN_REASON_TEXT, SCHEDULE_ISSUE_TEXT, STATUS_FLAG_TEXT, count, productHref, productLabel, productOf, shortDate } from '@/components/console/kosipa/loan-format';
import { formatAmount4, formatLegacyDate, qs } from '@/components/console/kosipa/payroll-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Detail Pinjaman · KOSIPA · KKISI TB2' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const day = (d: LoanView['docDate']) => (d.kind === 'date' ? shortDate(d.iso) ?? d.iso : formatLegacyDate(d));

type Step = { label: string; state: 'done' | 'current' | 'todo' | 'stopped'; detail: string };
/** The loan's path as recorded: submitted, approved, disbursed, settled. Contradictory statuses are drawn as recorded and named below. */
function lifecycle(l: LoanView, schedule: ScheduleIntegrity | null): Step[] {
  const h = l.header;
  const approved = h.docStatus === 'APPROVED', rejected = h.docStatus === 'REJECTED', disbursed = h.disbursement === 'APPROVED', settled = h.repayment === 'LUNAS';
  const paid = schedule && schedule.rows > 0 ? `${count(schedule.paidRows)} dari ${count(schedule.rows)} angsuran dibayar` : 'Angsuran berjalan';
  return [
    { label: 'Diajukan', state: 'done', detail: day(l.docDate) },
    { label: rejected ? 'Ditolak' : 'Disetujui', state: rejected ? 'stopped' : approved ? 'done' : 'current', detail: rejected ? 'Dokumen REJECTED' : approved ? 'Dokumen APPROVED' : h.docStatus === 'POSTING' ? 'Menunggu persetujuan (POSTING)' : `Status ${h.docStatus ?? 'tidak tercatat'}` },
    { label: 'Dicairkan', state: disbursed ? 'done' : approved && !rejected ? 'current' : 'todo', detail: disbursed ? `${day(l.disbursedDate)} · ${formatAmount4(l.disbursedAmount4)}` : approved ? 'Belum dicairkan' : 'Setelah disetujui' },
    { label: 'Lunas', state: settled ? 'done' : disbursed && !rejected ? 'current' : 'todo', detail: settled ? (h.settlementStatus && l.settlementDate.kind === 'date' ? `Pelunasan ${day(l.settlementDate)}` : 'Status LUNAS') : disbursed ? paid : 'Setelah dicairkan' },
  ];
}

export default async function LoanDetailPage({ params, searchParams }: { params: Promise<{ docNo: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!consoleEnabled()) notFound();
  const { docNo } = await params;
  const auth = await requireConsoleSession({ next: `${LOAN_HUB}/${encodeURIComponent(docNo)}` });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.loan.view')) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  const services = kosipaServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  const sp = await searchParams; const after = one(sp.after); const from = one(sp.dari) === 'daftar' ? 'daftar' : '';
  let detail: LoanDetail | null = null; let failed = false;
  try {
    detail = await readLoan({ reader: services.loans, audit: services.audit, now: services.now }, { userId: auth.ctx.userId, capabilities: auth.capabilities, requestId: crypto.randomUUID() }, { docNo, after });
  } catch (error) { if (error instanceof KosipaError && error.code !== 'AMOUNT_INVALID') notFound(); failed = true; }
  if (!failed && !detail) notFound();
  const base = `${LOAN_HUB}/${encodeURIComponent(docNo)}`;
  const l = detail?.loan; const h = l?.header;
  const product = h ? productOf(h) : null;
  const def = product ? loanProduct(product) : null;
  const segment = h && def ? loanSegment(def, h.type, h.financier) : null;
  const back = from === 'daftar' || !product ? { href: LOAN_LIST, label: 'semua dokumen' } : { href: productHref(product), label: productLabel(product) };
  const schedule = detail?.schedule.state === 'ok' ? detail.schedule : null;
  const integrity = schedule?.integrity ?? null;
  const nextDue = after ? undefined : schedule?.rows.find((r) => r.status === 'Belum Bayar')?.id;   // only the first page knows which unpaid row comes next

  return (
    <div className="console-page kloan-page">
      <Link prefetch={false} className="console-back" href={back.href}><ArrowLeft size={16} aria-hidden="true" />Kembali ke {back.label}</Link>
      <LoanPageHeader title={<> Pinjaman {docNo} </>} tail={[...(product ? [{ label: productLabel(product), href: productHref(product) }] : []), { label: docNo, icon: 'detail' as const }]}>
        <p>{h ? <>{productLabel(product)}{segment ? ` · ${segment}` : ''}{h.method ? ` · metode ${h.method}` : ''}. Data dokumen dan jadwal angsuran sebagaimana tercatat di KOSIPA lama.</> : 'Data dokumen dan jadwal angsuran pinjaman KOSIPA.'}</p>
      </LoanPageHeader>
      {detail && auth.capabilities.has('kosipa.report.export') && <ExportControl href={`/api/kosipa/loans/${encodeURIComponent(docNo)}/pdf`} singlePdfLabel="Unduh Kartu Pinjaman (PDF)" />}
      {failed && <FeedbackState kind="error" title={<> Pinjaman tidak dapat dibaca </>} reset={base}><p>Data tidak tersedia saat ini atau berisi nilai yang tidak dapat dibaca. Coba lagi beberapa saat lagi.</p></FeedbackState>}
      {detail && l && h && (<>
        <section className="kloan-hero" aria-label="Ringkasan dokumen">
          <div className="kloan-hero-who">
            <span className="kloan-hero-name">{h.name || 'Nama tidak tercatat'}</span>
            <span className="kloan-sub">NIK {h.nik || 'tidak tercatat'}</span>
          </div>
          <div className="kloan-hero-stage"><LoanStageBadge h={h} /><small className="kloan-raw" title="Status dokumen · pencairan · pelunasan, sebagaimana tercatat">{[h.docStatus, h.disbursement, h.repayment].map((s) => s || '?').join(' · ')}</small></div>
          <ol className="kloan-steps" aria-label="Tahapan pinjaman">{lifecycle(l, integrity).map((s) => (
            <li key={s.label} data-state={s.state} aria-current={s.state === 'current' ? 'step' : undefined}><span className="kloan-step-dot" aria-hidden="true" /><strong>{s.label}</strong><small>{s.detail}</small></li>
          ))}</ol>
        </section>

        {(l.statusFlags.length > 0 || detail.headerCount > 1) && (
          <ContextNotice title="Data dokumen perlu diperiksa" tone="warning">
            {l.statusFlags.length > 0 && <p>Status saling bertentangan, ditampilkan apa adanya: {l.statusFlags.map((f) => STATUS_FLAG_TEXT[f]).join('; ')}.</p>}
            {detail.headerCount > 1 && <><p>Ada {detail.headerCount} dokumen dengan nomor yang sama. Dokumen lain:</p><ul>{detail.otherHeaders.map((o) => <li key={o.header.id}>id {o.header.id}: {[o.header.docStatus, o.header.disbursement, o.header.repayment].join(' / ')} · pokok {formatAmount4(o.planPrincipal4)}</li>)}</ul></>}
          </ContextNotice>
        )}

        <LoanFigureStrip label="Angka utama pinjaman">
          <LoanFigure lead label="Sisa pokok menurut jadwal" note={integrity ? <>{count(integrity.unpaidRows)} angsuran belum dibayar</> : 'Jadwal tidak dapat dibaca'}>
            {integrity ? <Money units={integrity.recorded.unpaidPrincipal4} /> : <span className="kloan-muted">Tidak tersedia</span>}
          </LoanFigure>
          <LoanFigure label="Pokok pinjaman" note="Rencana pada dokumen"><Money units={l.planPrincipal4} /></LoanFigure>
          <LoanFigure label="Angsuran per bulan" note={h.planMonths ? `Tenor ${h.planMonths} bulan` : 'Tenor tidak tercatat'}><Money units={l.planInstallment4} /></LoanFigure>
          <LoanFigure label="Progres angsuran" note={integrity && integrity.rows > 0 ? `${count(integrity.paidRows)} dari ${count(integrity.rows)} angsuran dibayar` : 'Belum ada jadwal'}>
            {integrity && integrity.rows > 0 ? <span className="kloan-progress"><span>{Math.floor((integrity.paidRows / integrity.rows) * 100)}%</span><span className="kloan-progress-track" aria-hidden="true"><span style={{ inlineSize: `${(integrity.paidRows / integrity.rows) * 100}%` }} /></span></span> : <span className="kloan-muted">Belum ada</span>}
          </LoanFigure>
        </LoanFigureStrip>

        <section className="kloan-facts" aria-labelledby="sec-rincian">
          <header className="kloan-section-head"><h2 id="sec-rincian">Rincian dokumen</h2><Provenance kind="recorded" /></header>
          <div className="kloan-fact-groups">
            <div className="kloan-fact-group"><h3>Pinjaman</h3><dl>
              <div><dt>Produk</dt><dd>{productLabel(product)}{segment ? ` · ${segment}` : ''}</dd></div>
              <div><dt>Jenis tercatat</dt><dd>{h.type || 'Tidak tercatat'}</dd></div>
              <div><dt>Metode / suku bunga</dt><dd>{h.method || 'Tidak tercatat'}{h.rate ? ` · ${h.rate}` : ''}</dd></div>
              <div><dt>Tanggal dokumen</dt><dd>{day(l.docDate)}</dd></div>
              <div><dt>Awal / akhir pinjaman</dt><dd>{day(l.startDate)} / {day(l.endDate)}</dd></div>
              <div><dt>Pokok aktual (kolom legacy)</dt><dd>{formatAmount4(l.actualPrincipal4)}</dd></div>
            </dl></div>
            <div className="kloan-fact-group"><h3>Pencairan dan biaya</h3><dl>
              <div><dt>Tanggal pencairan</dt><dd>{day(l.disbursedDate)}</dd></div>
              <div><dt>Nominal pencairan</dt><dd>{formatAmount4(l.disbursedAmount4)}</dd></div>
              <div><dt>Biaya admin / asuransi</dt><dd>{formatAmount4(l.adminFee4)} / {formatAmount4(l.insuranceFee4)}</dd></div>
              <div><dt>Total potongan</dt><dd>{formatAmount4(l.totalDeduction4)}</dd></div>
              <div><dt>Diterima anggota</dt><dd>{formatAmount4(l.totalReceived4)}</dd></div>
            </dl></div>
            <div className="kloan-fact-group"><h3>Pelunasan</h3><dl>
              <div><dt>Status pelunasan</dt><dd>{h.repayment || 'Tidak tercatat'}</dd></div>
              <div><dt>Pelunasan dipercepat</dt><dd>{h.settlementStatus ? `${h.settlementStatus} · ${day(l.settlementDate)}` : 'Tidak ada'}</dd></div>
              <div><dt>Nilai pelunasan tercatat</dt><dd>{formatAmount4(l.settlementTotal4)}</dd></div>
              <div><dt>Roll over</dt><dd>{h.rollOver || 'Tidak tercatat'}</dd></div>
            </dl></div>
          </div>
        </section>

        {detail.rollovers.state === 'unavailable' ? <p className="console-unavailable" role="status">Tautan roll over tidak dapat dibaca saat ini.</p> : detail.rollovers.rows.length > 0 && (
          <section className="kloan-facts" aria-labelledby="sec-rollover">
            <header className="kloan-section-head"><h2 id="sec-rollover">Roll over</h2></header>
            <ul className="kloan-rollovers">{detail.rollovers.rows.map((r) => {
              const isNew = r.newDocNo === docNo;
              const other = isNew ? r.oldDocNo : r.newDocNo;
              return <li key={r.id}>
                <span>{isNew ? 'Melunasi pinjaman lama' : 'Dilunasi oleh pinjaman baru'}</span>
                {other ? <Link prefetch={false} className="kloan-doc" href={`${LOAN_HUB}/${encodeURIComponent(other)}`}>{other}<ArrowRight size={14} aria-hidden="true" /></Link> : <span className="kloan-muted">Nomor tidak tercatat</span>}
                <small>Sisa {formatAmount4(r.remainingPrincipal4)}{r.remainingInstallments !== null ? ` · ${r.remainingInstallments} angsuran` : ''}{r.oldType ? ` · ${r.oldType}` : ''}</small>
              </li>;
            })}</ul>
          </section>
        )}

        <section className="kloan-facts" aria-labelledby="sec-jadwal">
          <header className="kloan-section-head"><div><h2 id="sec-jadwal">Jadwal angsuran</h2>{integrity && <p>{count(integrity.rows)} baris{integrity.planMonths ? ` untuk tenor ${integrity.planMonths} bulan` : ''} · pokok {formatAmount4(integrity.recorded.principal4)} · bunga {formatAmount4(integrity.recorded.interest4)} · angsuran belum dibayar {formatAmount4(integrity.recorded.unpaidTotal4)}</p>}</div><Provenance kind="recorded" /></header>
          {detail.schedule.state === 'unavailable' ? <p className="console-unavailable" role="status">{LOAN_REASON_TEXT[detail.schedule.reason]}</p> : (() => {
            const s = detail.schedule; const i = s.integrity;
            return (<>
              {i.issues.length > 0 && <ContextNotice title={`${i.issues.length} catatan integritas data jadwal`} tone="warning" expandable><ul>{i.issues.map((x) => <li key={x}>{SCHEDULE_ISSUE_TEXT[x] ?? x}{x === 'PRINCIPAL_SUM_DIFFERS_FROM_PLAN' ? ` Selisih: ${formatAmount4(i.principalDifference4)}.` : ''}{x === 'DUE_DATES_UNUSABLE' ? ` (${i.dueDates.zero} nol, ${i.dueDates.missing} kosong, ${i.dueDates.implausible} tidak wajar)` : ''}</li>)}</ul></ContextNotice>}
              {s.rows.length === 0 ? <p className="kloan-hint">{after ? 'Tidak ada baris lagi.' : 'Pinjaman ini tidak memiliki jadwal angsuran.'}</p> : (
                <FinancialTable label="Jadwal angsuran tercatat" columns={[{ label: 'Ke', numeric: true }, { label: 'Jatuh tempo' }, { label: 'Pokok', numeric: true }, { label: 'Bunga', numeric: true }, { label: 'Angsuran', numeric: true }, { label: 'Status' }]}>
                  <tbody>{s.rows.map((r) => (
                    <tr key={r.id} data-next={r.id === nextDue || undefined} data-paid={r.status === 'Bayar' || undefined}>
                      <td className="num">{r.installmentNo ?? '?'}</td><td>{r.due.kind === 'date' ? r.due.iso : formatLegacyDate(r.due)}{r.id === nextDue && <span className="console-badge" data-state="partial">Berikutnya</span>}</td>
                      <td className="num">{formatAmount4(r.principal4)}</td><td className="num">{formatAmount4(r.interest4)}</td>
                      <td className="num">{formatAmount4(r.total4)}{!r.totalMatches && <span className="console-badge" data-state="partial" title="Angsuran tercatat tidak sama dengan pokok + bunga">≠ pokok + bunga</span>}</td>
                      <td><span className="console-badge" data-state={r.status === 'Bayar' ? 'available' : r.status === 'Belum Bayar' ? 'partial' : 'planned'}>{r.status || 'Tidak tercatat'}</span>
                        {(r.type || r.blocked || r.rollOver) && <small className="kloan-sub">{[r.type, r.blocked ? 'diblokir' : '', r.rollOver ? 'roll over' : ''].filter(Boolean).join(' · ')}</small>}</td>
                    </tr>
                  ))}</tbody>
                </FinancialTable>
              )}
              {i.paidRowsWithoutPaidDate > 0 && <p className="console-notice">{count(i.paidRowsWithoutPaidDate)} angsuran berstatus Bayar tanpa tanggal bayar; KOSIPA lama memang tidak mengisi kolom tanggal bayar.</p>}
              {s.nextCursor !== null && <CursorPagination href={`${base}${qs({ dari: from, after: s.nextCursor })}`}>Muat angsuran berikutnya</CursorPagination>}
            </>);
          })()}
        </section>

        <ContextNotice title="Outstanding resmi belum tersedia" expandable><p>Sisa pokok dan progres dihitung dari jadwal angsuran yang tercatat, bukan saldo outstanding resmi. Definisi saldo resmi belum diverifikasi.</p></ContextNotice>
      </>)}
    </div>
  );
}
