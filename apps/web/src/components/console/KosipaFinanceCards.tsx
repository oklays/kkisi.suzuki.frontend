import { CalendarClock, FileText, HandCoins, PiggyBank, type LucideIcon } from 'lucide-react';
import { FINANCE_EARLIEST_YEAR, type FinanceKpis } from '@koperasi/application/kosipa/dashboard-finance';
import type { Section } from '@koperasi/application/kosipa/member-360';
import { CurrencyText } from '@/components/money/CurrencyText';
import { KosipaFinanceFilter } from './KosipaFinanceFilter';

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/** `empty` explains a Rp0 figure (nothing recorded in the period) and how recent the source data is. */
type Card = { key: string; label: string; rule: string; empty: string; tone: 'red' | 'blue' | 'purple' | 'teal'; Icon: LucideIcon; value: Section<string> };

const pick = <T,>(s: Section<T>, f: (d: T) => string): Section<string> => (s.state === 'ok' ? { state: 'ok', data: f(s.data) } : s);
const isZero = (amount: string) => /^0+(\.0+)?$/.test(amount);
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${SHORT[Number(iso.slice(5, 7)) - 1] ?? ''} ${iso.slice(0, 4)}`;
const shortPeriod = (ym: string) => `${SHORT[Number(ym.slice(5, 7)) - 1] ?? ''} ${ym.slice(0, 4)}`;

/** The four legacy KOSIPA dashboard figures for one period. A restricted or failed read says so; it never shows a made-up zero. */
export function KosipaFinanceCards({ kpis, currentYear }: { kpis: FinanceKpis; currentYear: number }) {
  const { period } = kpis;
  const periodLabel = period.range === 'tahun' ? `Tahun ${period.year}` : `${MONTHS[period.month - 1]} ${period.year}`;
  const years = Array.from({ length: currentYear + 1 - FINANCE_EARLIEST_YEAR + 1 }, (_, i) => currentYear + 1 - i);
  const latestLoan = kpis.loans.state === 'ok' && kpis.loans.data.latestSubmissionOn ? ` · terakhir cair ${shortDate(kpis.loans.data.latestSubmissionOn)}` : '';
  const latestDebit = kpis.savings.state === 'ok' && kpis.savings.data.latestDebitPeriod ? ` · data terakhir ${shortPeriod(kpis.savings.data.latestDebitPeriod)}` : '';
  const cards: Card[] = [
    { key: 'cash', label: 'Kas Pinjaman', rule: 'Sisa cicilan belum bayar', empty: 'Tidak ada cicilan belum bayar di periode ini', tone: 'red', Icon: HandCoins, value: pick(kpis.loans, (d) => d.loanCash) },
    { key: 'submission', label: 'Pengajuan Pinjaman', rule: 'Pinjaman disetujui & cair', empty: `Belum ada pinjaman cair di periode ini${latestLoan}`, tone: 'blue', Icon: FileText, value: pick(kpis.loans, (d) => d.submissions) },
    { key: 'installment', label: period.range === 'bulan' ? 'Angsuran Pinjaman Bulan Ini' : 'Angsuran Pinjaman', rule: 'Angsuran belum bayar', empty: 'Tidak ada angsuran belum bayar di periode ini', tone: 'purple', Icon: CalendarClock, value: pick(kpis.loans, (d) => d.installments) },
    { key: 'debit', label: 'Debit Simpanan', rule: 'Pokok, wajib & sukarela', empty: `Belum ada debit simpanan di periode ini${latestDebit}`, tone: 'teal', Icon: PiggyBank, value: pick(kpis.savings, (d) => d.debit) },
  ];
  return (
    <section aria-labelledby="finance-title" className="console-finance">
      <div className="console-finance-head">
        <div>
          <h2 id="finance-title">Ringkasan Keuangan KOSIPA</h2>
          <p>Periode {periodLabel} · rumus sama dengan dashboard KOSIPA lama, bukan saldo resmi terverifikasi</p>
        </div>
        <KosipaFinanceFilter range={period.range} month={period.month} year={period.year} years={years} />
      </div>
      <div className="console-kpi-grid">
        {cards.map(({ key, label, rule, empty, tone, Icon, value }) => (
          <article key={key} className="console-kpi-card console-finance-card">
            <span className={`console-kpi-icon console-finance-icon-${tone}`} aria-hidden="true"><Icon size={20} /></span>
            <div className="console-kpi-body">
              <span className="console-kpi-label">{label}</span>
              <strong className="console-kpi-value">
                {value.state === 'ok' ? <CurrencyText value={value.data} variant="document" /> : '—'}
              </strong>
              {value.state === 'ok' && isZero(value.data) ? (
                <small className="console-kpi-sub console-finance-empty" title={empty}>{empty}</small>
              ) : (
                <small className="console-kpi-sub">
                  {value.state === 'ok' ? `${rule} · ${periodLabel}` : value.state === 'restricted' ? 'Tidak ada akses' : 'Tidak tersedia saat ini'}
                </small>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/** Placeholder while the finance figures stream in: same footprint, announced politely, no fake numbers. */
export function KosipaFinanceCardsLoading() {
  return (
    <section aria-label="Ringkasan Keuangan KOSIPA" aria-busy="true" className="console-finance">
      <div className="console-finance-head"><div><h2>Ringkasan Keuangan KOSIPA</h2><p role="status">Memuat ringkasan keuangan…</p></div></div>
      <div className="console-kpi-grid">
        {['Kas Pinjaman', 'Pengajuan Pinjaman', 'Angsuran Pinjaman', 'Debit Simpanan'].map((label) => (
          <article key={label} className="console-kpi-card console-finance-card">
            <span className="console-kpi-icon console-finance-icon-loading" aria-hidden="true" />
            <div className="console-kpi-body">
              <span className="console-kpi-label">{label}</span>
              <span className="console-finance-skeleton" aria-hidden="true" />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
