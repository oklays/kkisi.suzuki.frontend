import { CalendarClock, FileText, HandCoins, PiggyBank, type LucideIcon } from 'lucide-react';
import { FINANCE_EARLIEST_YEAR, type FinanceKpis, type FinancePeriod } from '@koperasi/application/kosipa/dashboard-finance';
import type { Section } from '@koperasi/application/kosipa/member-360';
import { CurrencyText } from '@/components/money/CurrencyText';
import { KosipaFinancePanel } from './KosipaFinanceFilter';

/** `empty` explains a Rp0 figure (nothing recorded in the period) and how recent the source data is. */
type Card = { key: string; label: string; rule: string; empty: string; tone: 'red' | 'blue' | 'purple' | 'teal'; Icon: LucideIcon; value: Section<string> };

const pick = <T,>(s: Section<T>, f: (d: T) => string): Section<string> => (s.state === 'ok' ? { state: 'ok', data: f(s.data) } : s);
const isZero = (amount: string) => /^0+(\.0+)?$/.test(amount);
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${SHORT[Number(iso.slice(5, 7)) - 1] ?? ''} ${iso.slice(0, 4)}`;
const shortPeriod = (ym: string) => `${SHORT[Number(ym.slice(5, 7)) - 1] ?? ''} ${ym.slice(0, 4)}`;
const filterYears = (currentYear: number) => Array.from({ length: currentYear + 1 - FINANCE_EARLIEST_YEAR + 1 }, (_, i) => currentYear + 1 - i);
const LABELS = (range: FinancePeriod['range']) => ['Kas Pinjaman', 'Pengajuan Pinjaman', range === 'bulan' ? 'Angsuran Pinjaman Bulan Ini' : 'Angsuran Pinjaman', 'Debit Simpanan'] as const;
const TONES = [['red', HandCoins], ['blue', FileText], ['purple', CalendarClock], ['teal', PiggyBank]] as const;

/** The four legacy KOSIPA dashboard figures for one period. A restricted or failed read says so; it never shows a made-up zero. */
export function KosipaFinanceCards({ kpis, currentYear }: { kpis: FinanceKpis; currentYear: number }) {
  const { period } = kpis;
  const labels = LABELS(period.range);
  const latestLoan = kpis.loans.state === 'ok' && kpis.loans.data.latestSubmissionOn ? ` · terakhir cair ${shortDate(kpis.loans.data.latestSubmissionOn)}` : '';
  const latestDebit = kpis.savings.state === 'ok' && kpis.savings.data.latestDebitPeriod ? ` · data terakhir ${shortPeriod(kpis.savings.data.latestDebitPeriod)}` : '';
  const cards: Card[] = [
    { key: 'cash', label: labels[0], rule: 'Sisa cicilan belum bayar', empty: 'Tidak ada cicilan belum bayar', tone: 'red', Icon: HandCoins, value: pick(kpis.loans, (d) => d.loanCash) },
    { key: 'submission', label: labels[1], rule: 'Pinjaman disetujui & cair', empty: `Belum ada pinjaman cair${latestLoan}`, tone: 'blue', Icon: FileText, value: pick(kpis.loans, (d) => d.submissions) },
    { key: 'installment', label: labels[2], rule: 'Angsuran belum bayar', empty: 'Tidak ada angsuran belum bayar', tone: 'purple', Icon: CalendarClock, value: pick(kpis.loans, (d) => d.installments) },
    { key: 'debit', label: labels[3], rule: 'Pokok, wajib & sukarela', empty: `Belum ada debit simpanan${latestDebit}`, tone: 'teal', Icon: PiggyBank, value: pick(kpis.savings, (d) => d.debit) },
  ];
  return (
    <KosipaFinancePanel range={period.range} month={period.month} year={period.year} years={filterYears(currentYear)}>
      {cards.map(({ key, label, rule, empty, tone, Icon, value }) => {
        const zero = value.state === 'ok' && isZero(value.data);
        const note = value.state === 'ok' ? (zero ? empty : rule) : value.state === 'restricted' ? 'Tidak ada akses' : 'Tidak tersedia saat ini';
        return (
          <article key={key} className="console-finance-card" data-tone={tone}>
            <div className="console-finance-card-top">
              <span className="console-finance-card-icon" aria-hidden="true"><Icon size={17} /></span>
              <span className="console-finance-card-label">{label}</span>
            </div>
            <strong className="console-finance-card-value">
              {value.state === 'ok' ? <CurrencyText value={value.data} variant="document" /> : '—'}
            </strong>
            <small className="console-finance-card-note" data-empty={zero || undefined} title={note}>{note}</small>
          </article>
        );
      })}
    </KosipaFinancePanel>
  );
}

/** Placeholder while the figures stream in: the same panel and filter, skeleton values, no fake numbers. */
export function KosipaFinanceCardsLoading({ period, currentYear }: { period: FinancePeriod; currentYear: number }) {
  return (
    <KosipaFinancePanel range={period.range} month={period.month} year={period.year} years={filterYears(currentYear)}>
      {LABELS(period.range).map((label, i) => {
        const [tone, Icon] = TONES[i];
        return (
          <article key={label} className="console-finance-card" data-tone={tone} aria-busy="true">
            <div className="console-finance-card-top">
              <span className="console-finance-card-icon" aria-hidden="true"><Icon size={17} /></span>
              <span className="console-finance-card-label">{label}</span>
            </div>
            <span className="console-finance-skeleton" aria-hidden="true" />
            <small className="console-finance-card-note">Memuat…</small>
          </article>
        );
      })}
    </KosipaFinancePanel>
  );
}
