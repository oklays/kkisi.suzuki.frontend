import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { SheetTrigger, SheetClose } from '@/components/overlay/Sheet';
import { EmptyState, Note, SectionHeading, Skeleton, StatusBadge, UnavailableState } from '@/components/feedback/States';
import { PrivacyToggle, Sensitive } from '@/providers/PrivacyProvider';
import { rupiah4, rupiahSen } from '@/lib/utils/money';
import { INSTALLMENT_LABEL, installmentWindow, type ApplicationItem, type InstallmentItem } from '../services/loans';
import { getActiveLoan, getLoanApplications, getLoanHistory } from '../services/loans.server';

const TIMELINE_ICON = { paid: 'check', waiting: 'clock', overdue: 'clock', scheduled: 'calendar' } as const;
const TONE = { paid: 'success', waiting: 'waiting', overdue: 'danger', scheduled: 'muted' } as const;

function InstallmentRow({ i }: { i: InstallmentItem }) {
  return (
    <li className={`installment ${i.status}`}>
      <span className="timeline-icon"><Icon name={TIMELINE_ICON[i.status]} /></span>
      <div className="installment-body">
        <div className="installment-heading">
          <div><h3>Angsuran ke-{i.no ?? '?'}</h3><p>{i.month}</p></div>
          <div className="installment-total"><strong><Sensitive>{rupiah4(i.total4)}</Sensitive></strong><StatusBadge tone={TONE[i.status]}>{INSTALLMENT_LABEL[i.status]}</StatusBadge></div>
        </div>
        <div className="installment-breakdown">
          <span>Pokok <b><Sensitive>{rupiah4(i.principal4)}</Sensitive></b></span><span>Jasa <b><Sensitive>{rupiah4(i.interest4)}</Sensitive></b></span>
        </div>
      </div>
    </li>
  );
}

export async function ActiveLoanSection() {
  const r = await getActiveLoan();
  if (r.state !== 'ok') return <UnavailableState what="Pinjaman aktif" compact={false} />;
  const loan = r.data;
  if (!loan) return <EmptyState icon="loan" title="Tidak ada pinjaman aktif">Pinjaman yang sudah disetujui dan dicairkan akan tampil di sini.</EmptyState>;
  const ticks = Math.min(loan.rows, 60);
  const currentIdx = loan.installments.findIndex((x) => x.status !== 'paid');
  const simulation = (
    <>
      <p className="detail-copy">Rincian dari jadwal angsuran {loan.title} yang tercatat di koperasi.</p>
      <dl className="detail-values">
        <div><dt>Pokok pinjaman</dt><dd><Sensitive>{rupiah4(loan.principal4)}</Sensitive></dd></div>
        <div><dt>Tenor</dt><dd>{loan.months ?? loan.rows} bulan</dd></div>
        <div><dt>Metode jasa</dt><dd>{loan.method ?? 'Tidak tercatat'}</dd></div>
        {loan.current ? <><div><dt>Pokok per bulan</dt><dd><Sensitive>{rupiah4(loan.current.principal4)}</Sensitive></dd></div>
          <div><dt>Jasa per bulan</dt><dd><Sensitive>{rupiah4(loan.current.interest4)}</Sensitive></dd></div>
          <div className="total"><dt>Angsuran per bulan</dt><dd><Sensitive>{rupiah4(loan.current.total4)}</Sensitive></dd></div></> : null}
      </dl>
      <p className="detail-note">Untuk menghitung pinjaman baru, gunakan simulasi di halaman Ajukan pinjaman.</p>
      <SheetClose>Kembali ke Pinjaman</SheetClose>
    </>
  );
  return (
    <>
      <section className="loan-card" aria-labelledby="loan-title">
        <div className="loan-top"><h2 id="loan-title">{loan.title}</h2><StatusBadge tone="success" dot>Aktif</StatusBadge></div>
        <div className="loan-label">Angsuran per bulan<PrivacyToggle what="nominal pinjaman" /></div>
        <div className="amount"><Sensitive>{rupiah4(loan.installment4)}</Sensitive></div>
        <div className="repayment-progress" role="progressbar" aria-label="Angsuran lunas" aria-valuemin={0} aria-valuemax={loan.rows} aria-valuenow={loan.paidRows}
          aria-valuetext={`${loan.paidRows} dari ${loan.rows} angsuran lunas; sisa ${loan.unpaidRows} bulan`}>
          {Array.from({ length: ticks }, (_, i) => <span key={i} className={`tick${i < loan.paidRows ? ' paid' : i === currentIdx ? ' current' : ''}`} />)}
        </div>
        <div className="progress-caption"><span><strong>{loan.paidRows} dari {loan.rows}</strong> angsuran lunas</span><span>Sisa <strong>{loan.unpaidRows} bulan</strong></span></div>
        <dl className="loan-details">
          <div><dt>Pokok pinjaman</dt><dd><Sensitive>{rupiah4(loan.principal4)}</Sensitive></dd></div>
          <div><dt>Sisa pokok (jadwal)</dt><dd><Sensitive>{rupiah4(loan.remainingPrincipal4)}</Sensitive></dd></div>
          <div><dt>Tenor</dt><dd>{loan.months ?? loan.rows} bulan</dd></div>
          <div><dt>Sisa kewajiban (jadwal)</dt><dd><Sensitive>{rupiah4(loan.remainingTotal4)}</Sensitive></dd></div>
        </dl>
        <div className="loan-footer">
          <span><i className="current-dot" />{loan.current ? `Angsuran ke-${loan.current.no} ${INSTALLMENT_LABEL[loan.current.status].toLowerCase()}` : 'Semua angsuran terbayar'}</span>
          <span className="chip-dark">{loan.docNo}</span>
        </div>
      </section>
      {loan.scheduleIssues.length ? <Note tone="warning" title="Jadwal angsuran perlu dicek koperasi">Jadwal yang tercatat tidak sepenuhnya cocok dengan dokumen pinjaman. Angka ditampilkan apa adanya; hubungi pengurus untuk konfirmasi.</Note> : null}
      <section aria-labelledby="rincian-angsuran">
        <SectionHeading id="rincian-angsuran" title="Rincian angsuran" subtitle="Pokok dan jasa per bulan." />
        <ol className="list-card">{installmentWindow(loan.installments).map((i) => <InstallmentRow key={i.id} i={i} />)}</ol>
        {loan.installments.length > 3 ? (
          <details className="all-installments">
            <summary>Lihat semua {loan.installments.length} angsuran</summary>
            <ol className="list-card">{loan.installments.map((i) => <InstallmentRow key={i.id} i={i} />)}</ol>
          </details>
        ) : null}
      </section>
      <div className="actions">
        <SheetTrigger className="secondary" title="Rincian angsuran" subtitle={loan.title} content={simulation}><Icon name="calculator" />Simulasi</SheetTrigger>
        <Link className="primary" href="/pinjaman/ajukan">Ajukan pinjaman</Link>
      </div>
    </>
  );
}
/** Same footprint as the loaded card + installment timeline, so streaming the data does not push content around (CLS). */
export const ActiveLoanSkeleton = () => (
  <div aria-busy="true" aria-label="Memuat pinjaman">
    <section className="loan-card" style={{ minHeight: 344, paddingBottom: 18 }}>
      <Skeleton onBlue height={18} width={150} /><Skeleton onBlue height={14} width={120} style={{ marginTop: 24 }} /><Skeleton onBlue height={36} width={190} style={{ marginTop: 8 }} />
      <Skeleton onBlue height={8} style={{ marginTop: 22 }} /><Skeleton onBlue height={110} style={{ marginTop: 26 }} />
    </section>
    <div className="section-heading"><div><Skeleton height={20} width={150} /><Skeleton height={12} width={120} style={{ marginTop: 6 }} /></div></div>
    <div className="list-card">{[0, 1, 2].map((i) => <div key={i} className="installment" style={{ minHeight: 118 }}><Skeleton height={30} width={30} /><div style={{ flex: 1 }}><Skeleton height={14} width="60%" /><Skeleton height={40} style={{ marginTop: 14 }} /></div></div>)}</div>
  </div>
);

function ApplicationCard({ a }: { a: ApplicationItem }) {
  const detail = (
    <>
      <dl className="detail-values">
        <div><dt>Jenis</dt><dd>{a.title}</dd></div>
        <div><dt>Tanggal pengajuan</dt><dd>{a.date}</dd></div>
        <div><dt>Nominal</dt><dd><Sensitive>{rupiahSen(a.amountSen)}</Sensitive></dd></div>
        <div><dt>Tenor</dt><dd>{a.months ? `${a.months} bulan` : 'Tidak tercatat'}</dd></div>
        <div><dt>Status</dt><dd>{a.status.label}</dd></div>
      </dl>
      {a.note ? <p className="detail-note">Keterangan koperasi: {a.note}</p> : null}
      <SheetClose>Kembali ke Pinjaman</SheetClose>
    </>
  );
  return (
    <SheetTrigger className="application-card" title={a.title} subtitle="Pengajuan pinjaman" content={detail}>
      <span className="application-top"><span className="type-icon yellow"><Icon name="document" /></span><span className="application-name"><strong>{a.title}</strong><small>{a.date}</small></span><Icon name="chevronRight" /></span>
      <span className="application-amount"><b><Sensitive>{rupiahSen(a.amountSen)}</Sensitive></b>{a.months ? <small>untuk {a.months} bulan</small> : null}</span>
      <span className="application-footer"><StatusBadge tone={a.status.tone}>{a.status.label}</StatusBadge><span className="detail-link">Lihat rincian</span></span>
    </SheetTrigger>
  );
}

export async function LatestApplication() {
  const r = await getLoanApplications();
  if (r.state !== 'ok' || r.data.length === 0) return null;
  return (
    <section aria-labelledby="latest-title">
      <SectionHeading id="latest-title" title="Pengajuan terbaru" action={<Link className="text-link" href="/pinjaman?tab=pengajuan" replace scroll={false}>Lihat semua</Link>} />
      <ApplicationCard a={r.data[0]} />
    </section>
  );
}

export async function ApplicationsPanel() {
  const [apps, history] = await Promise.all([getLoanApplications(), getLoanHistory()]);
  return (
    <>
      <SectionHeading title="Pengajuan pinjaman" subtitle="Pantau status pengajuanmu di sini." />
      {apps.state !== 'ok' ? <UnavailableState what="Pengajuan pinjaman" />
        : apps.data.length === 0 ? <EmptyState compact icon="document" title="Belum ada pengajuan">Pengajuan pinjaman yang kamu buat akan tampil di sini.</EmptyState>
          : apps.data.map((a) => <ApplicationCard key={a.id} a={a} />)}
      {apps.state === 'ok' && apps.data.some((a) => a.status.tone === 'waiting') ? <Note title="Menunggu konfirmasi">Pengajuan sedang ditinjau pengurus koperasi.</Note> : null}
      <SectionHeading title="Riwayat pinjaman" subtitle="Dokumen pinjaman yang tercatat." />
      {history.state !== 'ok' ? <UnavailableState what="Riwayat pinjaman" />
        : history.data.length === 0 ? <EmptyState compact icon="loan" title="Belum ada riwayat pinjaman" />
          : <ul className="list-card">{history.data.map((h) => (
            <li key={h.docNo} className="history-row"><div><strong>{h.title}</strong><small>{h.date} · {h.docNo}</small></div>
              <div className="right"><b><Sensitive>{rupiah4(h.principal4)}</Sensitive></b><StatusBadge tone={h.status.tone}>{h.status.label}</StatusBadge></div></li>
          ))}</ul>}
      <Link className="primary" href="/pinjaman/ajukan">Ajukan pinjaman</Link>
    </>
  );
}
