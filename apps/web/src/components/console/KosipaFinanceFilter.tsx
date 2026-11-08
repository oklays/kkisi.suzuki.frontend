'use client';

import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Landmark, LoaderCircle } from 'lucide-react';

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export type FinancePanelProps = { range: 'bulan' | 'tahun'; month: number; year: number; years: readonly number[]; children: ReactNode };

/**
 * The "Ringkasan Keuangan KOSIPA" panel: heading, its own period filter, and the cards below, in one bordered group so the
 * filter visibly belongs to these cards. A change applies at once through a client navigation (no full reload, no scroll jump);
 * the cards dim while the new figures load. Without JavaScript the form still works as a plain GET with the <noscript> button.
 */
export function KosipaFinancePanel({ range, month, year, years, children }: FinancePanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState({ range, month, year });
  const label = value.range === 'tahun' ? `Tahun ${value.year}` : `${MONTHS[value.month - 1]} ${value.year}`;

  const apply = (next: typeof value) => {
    setValue(next);
    const query = next.range === 'tahun' ? `periode=tahun&tahun=${next.year}` : `periode=bulan&bulan=${next.month}&tahun=${next.year}`;
    startTransition(() => router.replace(`/console?${query}`, { scroll: false }));
  };
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); apply(value); };

  return (
    <section aria-labelledby="finance-title" aria-busy={pending || undefined} className="console-finance">
      <header className="console-finance-head">
        <div className="console-finance-heading">
          <span className="console-finance-badge" aria-hidden="true"><Landmark size={18} /></span>
          <div>
            <h2 id="finance-title">Ringkasan Keuangan KOSIPA</h2>
            <p>Periode <strong>{label}</strong><span className="console-finance-note"> · rumus dashboard KOSIPA lama, bukan saldo resmi</span></p>
          </div>
        </div>
        <form method="get" action="/console" onSubmit={submit} className="console-finance-filter" aria-label="Filter periode Ringkasan Keuangan KOSIPA">
          <span className="console-finance-filter-label"><CalendarDays size={15} aria-hidden="true" />Periode</span>
          <div className="console-finance-seg" role="radiogroup" aria-label="Jenis periode">
            {(['bulan', 'tahun'] as const).map((r) => (
              <label key={r} data-active={value.range === r || undefined}>
                <input type="radio" name="periode" value={r} checked={value.range === r} onChange={() => apply({ ...value, range: r })} />
                {r === 'bulan' ? 'Bulanan' : 'Tahunan'}
              </label>
            ))}
          </div>
          {value.range === 'bulan' && (
            <select name="bulan" aria-label="Bulan" value={value.month} onChange={(e) => apply({ ...value, month: Number(e.currentTarget.value) })}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          )}
          <select name="tahun" aria-label="Tahun" value={value.year} onChange={(e) => apply({ ...value, year: Number(e.currentTarget.value) })}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <span className="console-finance-status" role="status">
            {pending && <><LoaderCircle size={15} className="console-finance-spin" aria-hidden="true" /><span className="console-visually-hidden">Memuat ringkasan {label}</span></>}
          </span>
          <noscript><button type="submit" className="console-finance-apply">Terapkan</button></noscript>
        </form>
      </header>
      <div className="console-finance-grid" data-pending={pending || undefined}>{children}</div>
    </section>
  );
}
