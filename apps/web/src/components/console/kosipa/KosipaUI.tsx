import Link from 'next/link';
import { ArrowRight, CircleAlert, CircleHelp, Inbox, LockKeyhole, Search, ShieldCheck } from 'lucide-react';
import { Children, cloneElement, isValidElement, type ReactNode, type ReactElement } from 'react';

export function KosipaPageHeader({ title, children, review = false }: { title: ReactNode; children: ReactNode; review?: boolean }) {
  return <header className="console-page-head kosipa-page-head">
    <div className="kosipa-eyebrow">KOSIPA <span>/</span> Administrasi koperasi</div>
    <div className="kosipa-title-row"><h1 tabIndex={-1}>{title}</h1><Provenance kind={review ? 'review' : 'readonly'} /></div>
    <div className="kosipa-page-purpose">{children}</div>
  </header>;
}

export function Provenance({ kind }: { kind: 'recorded' | 'derived' | 'review' | 'unavailable' | 'readonly' }) {
  const text = { recorded: 'Tercatat', derived: 'Hasil perhitungan', review: 'Untuk tinjauan', unavailable: 'Tidak tersedia', readonly: 'Mode baca saja' }[kind];
  return <span className="kosipa-provenance" data-kind={kind}>{kind === 'readonly' && <LockKeyhole size={12} aria-hidden="true" />}{text}</span>;
}

export function ContextNotice({ title, children, tone = 'info', expandable = false }: { title: string; children: ReactNode; tone?: 'info' | 'warning' | 'error'; expandable?: boolean }) {
  return <aside className="kosipa-context" data-tone={tone} role={tone === 'error' ? 'alert' : 'note'}>
    <ShieldCheck size={18} aria-hidden="true" /><div><strong>{title}</strong>{expandable ? <details><summary><CircleHelp size={14} aria-hidden="true" />Apa artinya?</summary><div>{children}</div></details> : <div>{children}</div>}</div>
  </aside>;
}

export type FinancialColumn = { key?: string; label: ReactNode; type?: 'text' | 'currency' | 'count' | 'date' | 'status'; numeric?: boolean; minWidth?: number; priority?: 'primary' | 'secondary'; help?: string };
export function FinancialTable({ columns, children, label }: { columns: readonly FinancialColumn[]; children: ReactNode; label: string }) {
  // Column metadata governs both the heading and cells, including counts that had no numeric class in legacy markup.
  type TableElement = ReactElement<{ children?: ReactNode; className?: string; colSpan?: number }>;
  const body = Children.map(children, (section) => {
    if (!isValidElement(section)) return section;
    return cloneElement(section as TableElement, {}, Children.map((section as TableElement).props.children, (row) => {
      if (!isValidElement(row)) return row;
      let index = 0;
      return cloneElement(row as TableElement, {}, Children.map((row as TableElement).props.children, (cell) => {
        if (!isValidElement(cell)) return cell;
        const element = cell as TableElement;
        const numeric = columns[index]?.numeric && (element.props.colSpan ?? 1) === 1;
        index += element.props.colSpan ?? 1;
        return numeric ? cloneElement(element, { className: `${element.props.className ?? ''} num`.trim() }) : element;
      }));
    }));
  });
  return <div className="kosipa-table-frame"><div className="kosipa-table-scroll" role="region" aria-label={label} tabIndex={0}>
      <table className="console-table kosipa-table"><caption className="console-visually-hidden">{label}</caption>
        <thead><tr>{columns.map((column, i) => <th key={column.key ?? i} scope="col" className={column.numeric ? 'num' : undefined} style={{ minWidth: column.minWidth ?? (typeof column.label === 'string' && /^(Nama|Jenis|NIK|Dokumen|Tanggal|Jatuh tempo)/.test(column.label) ? (/^Nama/.test(column.label) ? 170 : 120) : undefined) }} data-priority={column.priority} data-type={column.type}>
          {column.help ? <abbr title={column.help}>{column.label}</abbr> : column.label}
        </th>)}</tr></thead>{body}
      </table>
  </div><p className="kosipa-table-hint" hidden><ArrowRight size={13} aria-hidden="true" />Geser tabel untuk melihat kolom lainnya.</p></div>;
}

export function FilterContext({ filters, reset, privateReset = false }: { filters: readonly { label: string; value: string }[]; reset: string; privateReset?: boolean }) {
  const active = filters.filter((f) => f.value);
  return <div className="kosipa-filter-context">
    <div className="kosipa-filter-chips">{active.length ? active.map((f) => <span key={f.label}>{f.label}: <strong>{f.value}</strong></span>) : <span className="kosipa-filter-none">Semua data yang diizinkan</span>}</div>
    {active.length > 0 && (privateReset ? <form action={reset} method="post" data-kosipa-private><button className="kosipa-button-secondary" type="submit" name="_reset" value="1">Reset filter aktif</button></form> : <Link prefetch={false} className="kosipa-reset" href={reset}>Reset filter</Link>)}
  </div>;
}

export function SearchGuidance() {
  return <section className="kosipa-empty" role="status"><span className="kosipa-empty-icon"><Search size={24} aria-hidden="true" /></span><h2>Mulai dengan mencari anggota</h2><p>Masukkan minimal 2 karakter NIK atau nama. Pilih anggota untuk meninjau data yang tersedia bagi akun Anda.</p><small>Pencarian tidak disimpan di alamat halaman. Setelah memuat ulang, lakukan pencarian kembali.</small></section>;
}

export function ReportYearFilter({ path, year, years }: { path: string; year: number | null; years: readonly number[] }) {
  const options = [...new Set(year === null ? years : [year, ...years])].sort((a, b) => b - a);
  if (options.length === 0) return null;
  return <form className="console-search kosipa-report-filter" action={path} method="get" aria-label="Filter tahun laporan">
    <label htmlFor="report-year">Tahun laporan</label><div><select id="report-year" name="tahun" defaultValue={year ?? options[0]}>{options.map((value) => <option key={value} value={value}>{value}</option>)}</select><button type="submit">Terapkan filter</button><Link prefetch={false} className="kosipa-button-secondary" href={path}>Reset filter</Link></div>
  </form>;
}

export function StatusBadge({ value, label }: { value: string | null | undefined; label?: string }) {
  const state = value && ['APPROVED', 'POSTED', 'AKTIVE', 'LUNAS', 'Bayar'].includes(value) ? 'available' : value && ['OPEN', 'PENDING', 'Belum Bayar', 'BELUM LUNAS'].includes(value) ? 'partial' : 'planned';
  return <span className="console-badge" data-state={state}>{label || value || 'Tidak tercatat'}</span>;
}

export function FeedbackState({ title, children, kind, level = 2, reset }: { title: ReactNode; children: ReactNode; kind: 'error' | 'empty'; level?: 2 | 3; reset?: string }) {
  const Heading = level === 3 ? 'h3' : 'h2';
  const Icon = kind === 'error' ? CircleAlert : Inbox;
  return <section className="console-panel kosipa-feedback-state" role={kind === 'error' ? 'alert' : 'status'}>
    <Icon size={24} aria-hidden="true" /><Heading>{title}</Heading>{children}
    {reset && <a className="kosipa-button-secondary" href={reset}>{kind === 'error' ? 'Coba lagi' : 'Reset filter'}</a>}
  </section>;
}

export function CursorPagination({ href, children }: { href: string; children: ReactNode }) {
  return <nav className="kosipa-pagination" aria-label="Halaman hasil"><Link prefetch={false} className="kosipa-button-secondary" href={href}>{children}<ArrowRight size={14} aria-hidden="true" /></Link></nav>;
}

export function KosipaSkeleton() {
  return <div className="console-page kosipa-loading" aria-busy="true" role="status"><span className="console-visually-hidden">Memuat data KOSIPA…</span><div className="console-skeleton console-skeleton-title" /><div className="console-skeleton kosipa-skeleton-toolbar" /><div className="kosipa-skeleton-table">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="console-skeleton kosipa-skeleton-row" />)}</div></div>;
}
