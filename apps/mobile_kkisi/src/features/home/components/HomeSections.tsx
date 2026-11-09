import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { ServiceArt } from '@/components/ui/ServiceArt';
import { SheetTrigger } from '@/components/overlay/Sheet';
import { Skeleton, StatusBadge, UnavailableState } from '@/components/feedback/States';
import { PrivacyToggle, Sensitive } from '@/providers/PrivacyProvider';
import { compact4, rupiah4, rupiahSen } from '@/lib/utils/money';
import { monthShort } from '@/lib/utils/dates';
import { HOME_GRID } from '@/features/ppob/services/ppob';
import { cardBreakdown } from '@/features/savings/services/savings';
import { getSavingsSummary } from '@/features/savings/services/savings.server';
import { getActiveLoan, getLoanApplications } from '@/features/loans/services/loans.server';
import { getDeductionPeriods } from '@/features/deductions/services/deductions.server';
import { getShuYears } from '@/features/shu/services/shu.server';
import { getStoreCredit } from '@/features/store-credit/services/store-credit.server';
import { getProfile } from '@/features/member/services/member.server';
import { INSTALLMENT_LABEL } from '@/features/loans/services/loans';

// ------------------------------------------------------------------------------------------------------------ balance card
export async function BalanceCard() {
  const [summary, profile] = await Promise.all([getSavingsSummary(), getProfile()]);
  const ok = summary.state === 'ok';
  return (
    <section className="balance" aria-label="Ringkasan simpanan">
      <div className="balance-top">
        <div>
          <div className="balance-label">Simpanan tercatat<PrivacyToggle what="saldo" /></div>
          <div className={`amount${ok ? '' : ' is-unavailable'}`}>{ok ? <Sensitive>{rupiah4(summary.data.totalRecorded4)}</Sensitive> : 'Belum dapat dimuat'}</div>
        </div>
        <Link className="qr" href="/lainnya?buka=qr" aria-label="Lihat QR ID anggota"><Icon name="qr" /></Link>
      </div>
      {ok && summary.data.types.length ? (
        <div className="balance-breakdown">
          {cardBreakdown(summary.data).map((t) => (
            <div key={t.type}><small title={t.label}>{t.label.replace(/^Simpanan /, '')}</small><strong><Sensitive>{compact4(t.recorded4)}</Sensitive></strong></div>
          ))}
        </div>
      ) : <div style={{ height: 16 }} />}
      <div className="balance-footer">
        <span>NIK {profile.nik}</span>
        <Link href="/simpanan">Lihat rincian <Icon name="chevronRight" /></Link>
      </div>
    </section>
  );
}
export function BalanceCardSkeleton() {
  return (
    <section className="balance" aria-label="Memuat ringkasan simpanan" aria-busy="true">
      <Skeleton onBlue height={14} width={110} /><Skeleton onBlue height={34} width={190} style={{ marginTop: 10 }} />
      <div className="balance-breakdown">{[0, 1, 2].map((i) => <div key={i}><Skeleton onBlue height={28} /></div>)}</div>
      <div className="balance-footer"><Skeleton onBlue height={12} width={90} /></div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------------------ services
function ServiceLink({ label, href, art, tone }: (typeof HOME_GRID)[number]) {
  return <Link className={`service ${tone}`} href={href}><span className="service-art"><ServiceArt name={art} /></span><span>{label}</span></Link>;
}
export function ServicesGrid() {
  const all = (
    <>
      <h3 className="sheet-section">Isi ulang</h3>
      <div className="services">{HOME_GRID.filter((s) => ['Token', 'Pulsa', 'Paket Data'].includes(s.label)).map((s) => <ServiceLink key={s.href} {...s} />)}</div>
      <h3 className="sheet-section">Bayar tagihan</h3>
      <div className="services">{HOME_GRID.filter((s) => ['Pascabayar', 'Air PDAM', 'Internet'].includes(s.label)).map((s) => <ServiceLink key={s.href} {...s} />)}</div>
      <h3 className="sheet-section">Belanja anggota</h3>
      <div className="services"><ServiceLink {...HOME_GRID[4]} /></div>
      <h3 className="sheet-section">Layanan koperasi</h3>
      <div className="coop-grid">
        {COOP_LINKS.map((c) => <Link key={c.href} className="coop-item" href={c.href}><Icon name={c.icon} /><strong>{c.label}</strong></Link>)}
      </div>
    </>
  );
  return (
    <section aria-labelledby="services-title">
      <div className="section-heading"><div><h2 id="services-title">Isi ulang dan bayar</h2><p>Kebutuhan harian, tinggal pilih.</p></div></div>
      <div className="services">
        {HOME_GRID.map((s) => <ServiceLink key={s.href} {...s} />)}
        <SheetTrigger className="service more" title="Semua layanan" subtitle="Mau isi ulang, bayar, atau belanja?" content={all}>
          <span className="service-art"><ServiceArt name="more" /></span><span>Lainnya</span>
        </SheetTrigger>
      </div>
    </section>
  );
}

const COOP_LINKS = [
  { href: '/simpanan', label: 'Simpanan', icon: 'wallet' as const },
  { href: '/pinjaman', label: 'Pinjaman', icon: 'loan' as const },
  { href: '/potongan', label: 'Potongan', icon: 'receipt' as const },
  { href: '/shu', label: 'SHU', icon: 'pie' as const },
];

// ------------------------------------------------------------------------------------------------------------ cooperative grid
export async function CoopGrid() {
  const [savings, loan, deductions, shu] = await Promise.all([getSavingsSummary(), getActiveLoan(), getDeductionPeriods(), getShuYears()]);
  const hints = {
    '/simpanan': savings.state === 'ok' ? compact4(savings.data.totalRecorded4) : '—',
    '/pinjaman': loan.state !== 'ok' ? '—' : loan.data ? loan.data.monthsLeftLabel : 'Tidak ada',
    '/potongan': deductions.state !== 'ok' ? '—' : deductions.data[0] ? `${monthShort(deductions.data[0].periodKey).split(' ')[0]}: ${compact4(deductions.data[0].total4)}` : 'Belum ada',
    '/shu': shu.state !== 'ok' ? '—' : shu.data[0] ? `Tahun ${shu.data[0].year}` : 'Belum ada',
  } as Record<string, string>;
  return (
    <div className="coop-grid">
      {COOP_LINKS.map((c) => (
        <Link key={c.href} className="coop-item" href={c.href}><Icon name={c.icon} /><strong>{c.label}</strong><small><Sensitive>{hints[c.href]}</Sensitive></small></Link>
      ))}
    </div>
  );
}
export function CoopGridSkeleton() {
  return <div className="coop-grid" aria-busy="true">{COOP_LINKS.map((c) => <div key={c.href} className="coop-item"><Icon name={c.icon} /><strong>{c.label}</strong><Skeleton height={10} width={46} /></div>)}</div>;
}

// ------------------------------------------------------------------------------------------------------------ reminders
export async function Reminders() {
  const [loan, apps] = await Promise.all([getActiveLoan(), getLoanApplications()]);
  if (loan.state !== 'ok' && apps.state !== 'ok') return <UnavailableState what="Pengingat" />;
  const items: React.ReactNode[] = [];
  if (loan.state === 'ok' && loan.data?.current) {
    const c = loan.data.current;
    items.push(
      <Link key="inst" className="reminder" href="/pinjaman#rincian-angsuran">
        <div className="reminder-title">Angsuran ke-{c.no ?? '?'} {loan.data.title}</div>
        <div className="reminder-bottom"><small><Sensitive>{rupiah4(c.total4)}</Sensitive> · {c.month}</small><StatusBadge tone={c.status === 'overdue' ? 'danger' : 'waiting'}>{INSTALLMENT_LABEL[c.status]}</StatusBadge></div>
      </Link>,
    );
  }
  if (apps.state === 'ok') {
    for (const a of apps.data.filter((x) => x.status.tone === 'waiting').slice(0, 2)) {
      items.push(
        <Link key={`app${a.id}`} className="reminder" href="/pinjaman?tab=pengajuan">
          <div className="reminder-title">Pengajuan {a.title}</div>
          <div className="reminder-bottom"><small><Sensitive>{rupiahSen(a.amountSen)}</Sensitive>{a.months ? ` untuk ${a.months} bulan` : ''}</small><StatusBadge tone="waiting">{a.status.label}</StatusBadge></div>
        </Link>,
      );
    }
  }
  if (items.length === 0) return <div className="reminders"><p className="reminder" style={{ fontSize: 12, color: 'var(--muted)' }}>Tidak ada angsuran atau pengajuan yang menunggu.</p></div>;
  return <div className="reminders">{items}</div>;
}
export function RemindersSkeleton() {
  return <div className="reminders" aria-busy="true">{[0, 1].map((i) => <div key={i} className="reminder"><Skeleton height={14} width="70%" /><Skeleton height={12} width="45%" style={{ marginTop: 9 }} /></div>)}</div>;
}

// ------------------------------------------------------------------------------------------------------------ store card
export async function StoreCard() {
  const credit = await getStoreCredit();
  const text = credit.state !== 'ok' ? 'belum dapat dimuat' : credit.data.credit.eligible ? rupiahSen(credit.data.credit.remainingSen) : 'tidak tersedia';
  return (
    <div className="store">
      <div><strong>Toko S-MART TB2</strong><p>Sisa kredit toko <Sensitive>{text}</Sensitive></p></div>
      <Link href="/belanja">Belanja</Link>
    </div>
  );
}
export function StoreCardSkeleton() {
  return <div className="store" aria-busy="true"><div style={{ flex: 1 }}><strong>Toko S-MART TB2</strong><Skeleton height={11} width={150} style={{ marginTop: 6 }} /></div></div>;
}

