'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type Options = { kinds: string[]; statuses: string[]; stores: string[]; periods: string[] };
const FIELDS = [
  { key: 'jenis', label: 'Jenis', all: 'Semua jenis', from: 'kinds' },
  { key: 'status', label: 'Status', all: 'Semua status', from: 'statuses' },
  { key: 'toko', label: 'Toko', all: 'Semua toko', from: 'stores' },
  { key: 'periode', label: 'Periode', all: 'Semua periode', from: 'periods' },
] as const;

/** Filters live in the URL (`?jenis=&status=&toko=&periode=`), so a filtered list survives refresh and can be shared/bookmarked. */
export function TransactionFilters({ options, count }: { options: Options; count: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };
  const active = FIELDS.some((f) => params.get(f.key));
  return (
    <form aria-label="Filter transaksi" onSubmit={(e) => e.preventDefault()}>
      <div className="filters">
        {FIELDS.map((f) => (
          <label key={f.key} className="filter-field" htmlFor={`filter-${f.key}`}>
            <span>{f.label}</span>
            <select id={`filter-${f.key}`} value={params.get(f.key) ?? ''} onChange={(e) => set(f.key, e.target.value)}>
              <option value="">{f.all}</option>
              {[...new Set([...(options[f.from] as string[]), ...(params.get(f.key) ? [params.get(f.key) as string] : [])])].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="filter-footer">
        <p role="status" aria-live="polite">{count} transaksi</p>
        <button type="button" className="text-button" disabled={!active} onClick={() => router.replace(pathname, { scroll: false })}>Reset filter</button>
      </div>
    </form>
  );
}
