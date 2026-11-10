import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { SheetTrigger } from '@/components/overlay/Sheet';
import { EmptyState, Note, SectionHeading, Skeleton, StatusBadge, UnavailableState } from '@/components/feedback/States';
import { PrivacyToggle, Sensitive } from '@/providers/PrivacyProvider';
import { compact4, rupiah4, rupiahSen } from '@/lib/utils/money';
import { cardBreakdown, STATE_LABEL, type MovementItem } from '../services/savings';
import { getActiveDeductions, getDeductionRequests, getMovements, getSavingsSummary, getWithdrawals } from '../services/savings.server';
import type { DeductionItem } from '../services/savings';

const TONE = ['yellow', 'blue', 'slate'] as const;
const typeHref = (type: string) => `/simpanan?jenis=${encodeURIComponent(type)}`;

export async function SavingsHero() {
  const s = await getSavingsSummary();
  if (s.state !== 'ok') return <UnavailableState what="Ringkasan simpanan" compact={false} />;
  return (
    <section className="balance" aria-label="Ringkasan simpanan">
      <div className="balance-top">
        <div><div className="balance-label">Simpanan tercatat<PrivacyToggle /></div><div className="amount"><Sensitive>{rupiah4(s.data.totalRecorded4)}</Sensitive></div></div>
        <span className="balance-emblem" aria-hidden="true"><Icon name="wallet" /></span>
      </div>
      <div className="balance-breakdown">
        {cardBreakdown(s.data).map((t) => <div key={t.type}><small>{t.label.replace(/^Simpanan /, '')}</small><strong><Sensitive>{compact4(t.recorded4)}</Sensitive></strong></div>)}
      </div>
      <div className="balance-footer"><span>{s.data.types.length} jenis simpanan</span><span className="chip-dark">Dari mutasi disetujui</span></div>
    </section>
  );
}
export const SavingsHeroSkeleton = () => (
  <section className="balance" aria-busy="true"><Skeleton onBlue height={14} width={120} /><Skeleton onBlue height={34} width={180} style={{ marginTop: 10 }} /><div style={{ height: 70 }} /></section>
);

/** "Per jenis simpanan" + mutation list of the selected type (URL `?jenis=`). */
export async function SavingsCards({ selected, before }: { selected: string | null; before: number | null }) {
  const [s, deductions] = await Promise.all([getSavingsSummary(), getActiveDeductions()]);
  if (s.state !== 'ok') return null;
  const monthly = new Map<string, DeductionItem>(deductions.state === 'ok' ? deductions.data.map((d) => [d.type, d]) : []);
  if (s.data.types.length === 0) return <EmptyState icon="wallet" title="Belum ada simpanan tercatat">Simpanan akan tampil setelah koperasi mencatat setoran pertama.</EmptyState>;
  const current = s.data.types.find((t) => t.type === selected) ?? s.data.types[0];
  const picker = (
    <div>
      {s.data.types.map((t, i) => (
        <Link key={t.type} href={typeHref(t.type)} replace scroll={false} className="kind-option" aria-current={t.type === current.type ? 'true' : undefined}>
          <span className={`type-icon ${TONE[i % 3]}`}><Icon name={i === 1 ? 'savings' : 'wallet'} /></span>
          <span><strong>{t.label}</strong><small><Sensitive>{rupiah4(t.recorded4)}</Sensitive></small></span>
          <span className="selected-mark"><Icon name="check" /></span>
        </Link>
      ))}
    </div>
  );
  return (
    <>
      <section aria-labelledby="types-title">
        <SectionHeading id="types-title" title="Per jenis simpanan" subtitle="Pilih untuk melihat mutasinya." />
        <div className="savings-list">
          {s.data.types.map((t, i) => (
            <Link key={t.type} href={typeHref(t.type)} replace scroll={false} className="savings-row" aria-current={t.type === current.type ? 'true' : undefined}>
              <span className={`type-icon ${TONE[i % 3]}`}><Icon name={i === 1 ? 'savings' : 'wallet'} /></span>
              <span className="row-content">
                <strong>{t.label}</strong>
                <small>{t.pending4 ? <>Menunggu persetujuan <Sensitive>{rupiah4(t.pending4)}</Sensitive></> : monthly.get(t.type)?.monthlySen ? <>Potongan <Sensitive>{rupiahSen(monthly.get(t.type)!.monthlySen)}</Sensitive> per bulan</> : `${t.rows} mutasi tercatat`}</small>
                <b><Sensitive>{rupiah4(t.recorded4)}</Sensitive></b>
              </span>
              <span className="row-arrow"><Icon name="chevronRight" /></span>
            </Link>
          ))}
        </div>
        {s.data.hasUnverified ? <Note tone="warning" title="Sebagian mutasi perlu dikonfirmasi">Ada mutasi tanpa dokumen induk yang jelas. Mutasi itu tidak dihitung; tanyakan ke pengurus koperasi.</Note> : null}
      </section>
      <section aria-labelledby="mutation-title">
        <SectionHeading id="mutation-title" title="Mutasi simpanan" subtitle={current.label}
          action={<SheetTrigger className="kind-picker" label="Ganti jenis simpanan" title="Pilih jenis simpanan" subtitle="Mutasi mana yang ingin kamu lihat?" content={picker}>
            <span>{current.label.replace(/^Simpanan /, '')}</span><Icon name="chevronDown" /></SheetTrigger>} />
        <MovementList type={current.type} before={before} pageHref={(id) => `${typeHref(current.type)}&sebelum=${id}`} />
      </section>
      <Note title="Atur potongan simpananmu">Perubahan potongan berlaku mulai bulan berikutnya.</Note>
      <Link className="primary" href="/potongan/ajukan">Ajukan perubahan potongan</Link>
    </>
  );
}

function MovementRow({ m }: { m: MovementItem }) {
  const st = STATE_LABEL[m.state];
  return (
    <li className="mutation">
      <span className={`mutation-icon${m.direction === 'out' ? ' out' : ''}`}><Icon name={m.direction === 'out' ? 'arrowOut' : 'arrowIn'} /></span>
      <div className="mutation-copy"><strong>{m.date}</strong><small>{m.title} · {m.detail}</small></div>
      <div className="mutation-values">
        <strong className={m.direction === 'out' ? 'out' : undefined}><Sensitive>{`${m.amount4 >= 0 ? '+' : ''}${rupiah4(m.amount4)}`}</Sensitive></strong>
        {m.state !== 'POSTED' ? <StatusBadge tone={st.tone}>{st.label}</StatusBadge> : null}
      </div>
    </li>
  );
}

export async function MovementList({ type, before, pageHref, filter }: { type: string | null; before: number | null; pageHref: (id: number) => string; filter?: 'in' }) {
  const r = await getMovements(type, before);
  if (r.state !== 'ok') return <UnavailableState what="Mutasi simpanan" />;
  const items = filter ? r.data.items.filter((m) => m.direction === filter && m.title !== 'Saldo awal') : r.data.items;
  if (items.length === 0 && !r.data.nextCursor) {
    return <EmptyState compact icon="arrowIn" title={filter ? 'Belum ada setoran' : 'Belum ada mutasi'}>{before ? 'Tidak ada mutasi lebih lama.' : 'Mutasi akan tampil setelah dicatat koperasi.'}</EmptyState>;
  }
  return (
    <>
      {items.length ? <ul className="list-card" aria-label="Daftar mutasi">{items.map((m) => <MovementRow key={m.id} m={m} />)}</ul> : null}
      {r.data.nextCursor ? <Link className="secondary load-more" href={pageHref(r.data.nextCursor)} scroll={false}>Tampilkan yang lebih lama</Link> : null}
      {before ? <Link className="text-link" href={pageHref(0).replace(/[&?]sebelum=0$/, '')} scroll={false}>Kembali ke mutasi terbaru</Link> : null}
    </>
  );
}

export const ListSkeleton = ({ rows = 3 }: { rows?: number }) => (
  <div className="list-card" aria-busy="true">{Array.from({ length: rows }, (_, i) => <div key={i} className="mutation"><Skeleton height={34} width={34} /><div style={{ flex: 1 }}><Skeleton height={12} width="50%" /><Skeleton height={10} width="70%" style={{ marginTop: 7 }} /></div></div>)}</div>
);

export async function DeductionPanel() {
  const [active, requests] = await Promise.all([getActiveDeductions(), getDeductionRequests()]);
  const pending = requests.state === 'ok' ? requests.data.filter((r) => r.status.tone === 'waiting') : [];
  return (
    <>
      <SectionHeading title="Potongan simpanan" subtitle="Potongan payroll per bulan yang tercatat." />
      {active.state !== 'ok' ? <UnavailableState what="Potongan simpanan" />
        : active.data.length === 0 ? <EmptyState compact icon="receipt" title="Belum ada potongan simpanan tercatat" />
          : <div className="list-card">{active.data.map((d) => (
            <div key={d.type} className="payroll-row"><div><strong>{d.label}</strong><small>{d.since ? `Sejak ${d.since}` : 'Potongan payroll per bulan'}</small></div><b><Sensitive>{rupiahSen(d.monthlySen)}</Sensitive></b></div>
          ))}</div>}
      {requests.state === 'ok' && requests.data.length ? (
        <>
          <SectionHeading title="Pengajuan perubahan" />
          <ul className="list-card">{requests.data.map((r) => (
            <li key={r.id} className="history-row"><div><strong>{r.title}</strong><small>{r.date}{r.start ? ` · mulai ${r.start}` : ''}</small></div>
              <div className="right"><b><Sensitive>{rupiahSen(r.toSen)}</Sensitive></b><StatusBadge tone={r.status.tone}>{r.status.label}</StatusBadge></div></li>
          ))}</ul>
        </>
      ) : null}
      <Note title="Atur potongan simpananmu">Perubahan potongan berlaku mulai bulan berikutnya. {pending.length ? `Ada ${pending.length} pengajuan yang sedang diproses.` : 'Saat ini tidak ada pengajuan yang sedang diproses.'}</Note>
      <Link className="primary" href="/potongan/ajukan">Ajukan perubahan potongan</Link>
    </>
  );
}

export async function WithdrawalPanel() {
  const w = await getWithdrawals();
  return (
    <>
      <SectionHeading title="Penarikan simpanan" subtitle="Riwayat penarikan anggota." />
      {w.state !== 'ok' ? <UnavailableState what="Riwayat penarikan" />
        : w.data.length === 0 ? <EmptyState icon="arrowOut" title="Belum ada penarikan">Riwayat penarikan simpanan akan ditampilkan di sini.</EmptyState>
          : <ul className="list-card">{w.data.map((x) => (
            <li key={x.id} className="history-row"><div><strong>{x.title}</strong><small>{x.date}</small></div>
              <div className="right"><b><Sensitive>{rupiahSen(x.amountSen)}</Sensitive></b><StatusBadge tone={x.status.tone}>{x.status.label}</StatusBadge></div></li>
          ))}</ul>}
    </>
  );
}
