'use client';

import Link from './SalesLink';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { CalendarDays, Filter, LoaderCircle, Search } from 'lucide-react';
import { parseSalesHistoryQuery, SalesHistoryError, type SalesHistoryQuery } from '@koperasi/domain/sales/history';

export function SalesFilters({ query, today, rawFilters, invalidFilter }: { query: SalesHistoryQuery; today: string; rawFilters?: Record<string, string>; invalidFilter?: string }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const alert = useRef<HTMLParagraphElement>(null);
  const [error, setError] = useState(invalidFilter ?? '');
  const [pending, startTransition] = useTransition();
  useEffect(() => { if (error) alert.current?.focus(); }, [error]);
  const value = (key: keyof SalesHistoryQuery) => rawFilters?.[key] ?? String(query[key] ?? '');
  const selected = (key: keyof SalesHistoryQuery, choices: string[]) => <select name={key} defaultValue={value(key)}>{!choices.includes(value(key)) && <option value={value(key)}>{value(key) || 'Tidak tersimpan'}</option>}{choices.map(choice => <option key={choice} value={choice}>{choice === 'all' ? 'Semua' : choice === 'pos' ? 'POS' : choice === 'nonpos' ? 'Non-POS' : choice === 'newest' ? 'Terbaru' : choice === 'oldest' ? 'Terlama' : choice}</option>)}</select>;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, entry] of new FormData(event.currentTarget)) if (typeof entry === 'string' && (entry.trim() || key === 'from' || key === 'to')) params.set(key, entry.trim());
    try { parseSalesHistoryQuery(params); }
    catch (cause) {
      setError(cause instanceof SalesHistoryError ? cause.message : 'Periksa nilai filter.');
      return;
    }
    setError('');
    startTransition(() => router.push(`/sales?${params}`, { scroll: false }));
  }
  function preset(period: 'today' | 'week' | 'month') {
    const end = new Date(`${today}T00:00:00Z`);
    const from = period === 'today' ? today : period === 'month' ? `${today.slice(0, 7)}-01` : new Date(end.getTime() - 6 * 86_400_000).toISOString().slice(0, 10);
    const elements = form.current?.elements;
    if (elements) {
      (elements.namedItem('from') as HTMLInputElement).value = from;
      (elements.namedItem('to') as HTMLInputElement).value = today;
    }
    setError('');
  }
  const expanded = !!invalidFilter || ['createdBy', 'registerId'].some(key => !!rawFilters?.[key]) || !!query.createdBy || query.registerId !== null || query.source !== 'pos' || query.salesStatus !== 'Final' || query.paymentStatus !== 'all' || query.paymentType !== 'all';
  return <form ref={form} className="sales-filters" method="get" action="/sales" onSubmit={submit} aria-busy={pending}>
    <div className="sales-filter-heading"><span><Filter size={15} aria-hidden="true" />Filter transaksi</span><div className="sales-presets"><CalendarDays size={14} aria-hidden="true" />{(['today', 'week', 'month'] as const).map((period, index) => <button key={period} type="button" onClick={() => preset(period)} disabled={pending}>{['Hari ini', '7 hari terakhir', 'Bulan ini'][index]}</button>)}</div></div>
    <fieldset disabled={pending} className="sales-filter-fields"><legend className="pos-sr-only">Pencarian dan periode</legend>
      <label className="sales-search-label">Nomor struk, NIK, atau nama<div className="sales-search-input"><Search size={17} aria-hidden="true" /><input type="search" name="q" defaultValue={value('q')} maxLength={100} placeholder="Cari struk atau pelanggan…" /></div></label>
      <label>Dari tanggal<input type="date" name="from" defaultValue={value('from')} required /></label>
      <label>Sampai tanggal<input type="date" name="to" defaultValue={value('to')} required /></label>
      <div className="sales-filter-actions"><button className="sales-primary" type="submit">{pending ? <LoaderCircle size={15} className="sales-spin" aria-hidden="true" /> : <Search size={15} aria-hidden="true" />}{pending ? 'Mencari…' : 'Terapkan filter'}</button><Link className="sales-text-link" href="/sales" onClick={() => { form.current?.reset(); setError(''); }}>Reset</Link></div>
    </fieldset>
    <details className="sales-advanced" open={expanded || undefined}><summary>Filter lanjutan <span>Sumber, status, pembayaran & sesi</span></summary><fieldset disabled={pending}><legend className="pos-sr-only">Filter lanjutan</legend>
      <label>Sumber{selected('source', ['pos', 'nonpos', 'all'])}</label>
      <label>Status penjualan{selected('salesStatus', ['Final', 'Draft', 'Hold', 'Quotation', 'all'])}</label>
      <label>Metode pembayaran{selected('paymentType', ['all', 'Cash', 'QRIS', 'Kredit'])}</label>
      <label>Status pembayaran{selected('paymentStatus', ['all', 'Paid', 'Dibayar', 'Unpaid', 'Partial'])}</label>
      <label>Pembuat<input name="createdBy" defaultValue={value('createdBy')} maxLength={100} placeholder="Nama pembuat" /></label>
      <label>ID sesi kasir<input name="registerId" type="number" min="1" max="2147483647" step="1" defaultValue={value('registerId')} placeholder="Semua sesi" /></label>
      <label>Urutan{selected('sort', ['newest', 'oldest'])}</label>
      <label>Baris per halaman{selected('pageSize', ['25', '50', '100'])}</label>
    </fieldset></details>
    {error ? <p ref={alert} tabIndex={-1} className="sales-filter-error" role="alert"><strong>Filter tidak valid.</strong> {error}</p> : <p className="sales-filter-hint">Periode maksimal 93 hari. Terapkan filter untuk memperbarui hasil.</p>}
    <span role="status" className="pos-sr-only">{pending ? 'Memuat hasil pencarian transaksi…' : ''}</span>
  </form>;
}
