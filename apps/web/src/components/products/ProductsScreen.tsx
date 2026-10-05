"use client";

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownWideNarrow, Barcode, Boxes, Check, ChevronLeft, ChevronRight, Download, Eye, Package, PackageOpen, Plus, Pencil, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import type { MasterProduct, MasterProductPage, MasterProductQuery } from '@koperasi/domain/inventory';
import type { PosSession } from '@/features/pos/types';
import { PosShell } from '../pos/PosShell';
import { ProductEditor } from './ProductEditor';
import { ProductCreator } from './ProductCreator';
import { productsCsv, stockState } from './product-view';
import '../pos/pos.css';
import './products.css';

const number = (value: number) => new Intl.NumberFormat('id-ID').format(value);
const rupiah = (value: string) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: Number(value) % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(Number(value));
const stockNames = { available: 'Tersedia', low: 'Stok menipis', empty: 'Stok habis' };
type Filters = { q: string; category: string; brand: string; status: MasterProductQuery['status']; stock: MasterProductQuery['stock']; sort: MasterProductQuery['sort']; page: number; pageSize: number };
const initialFilters: Filters = { q: '', category: '', brand: '', status: 'all', stock: 'all', sort: 'newest', page: 1, pageSize: 25 };

function StockBadge({ item }: { item: MasterProduct }) {
  const state = stockState(item);
  return <div className={`products-stock products-stock-${state}`}><span className="products-stock-number"><i aria-hidden="true" />{number(item.stock)} <small>{item.unit || 'unit'}</small></span><span>{stockNames[state]} · min. {number(item.alertQty)}</span></div>;
}

export function ProductsScreen({ session, capabilities }: { session: PosSession; capabilities: { add: boolean; edit: boolean; writes: boolean } }) {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState<MasterProductPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [updated, setUpdated] = useState('');
  const [editorId, setEditorId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const addTrigger = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<MasterProduct | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const detailTrigger = useRef<HTMLElement | null>(null);
  const filtered = !!(filters.q || filters.category || filters.brand || filters.status !== 'all' || filters.stock !== 'all');

  function change(next: Partial<Filters>) {
    setLoading(true); setError(''); setFilters(previous => ({ ...previous, ...next, page: next.page ?? 1 }));
  }
  function reload() { setLoading(true); setError(''); setRefresh(value => value + 1); }
  function reset() { setLoading(true); setError(''); setFilters(initialFilters); setRefresh(value => value + 1); }

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ q: filters.q.trim(), page: String(filters.page), pageSize: String(filters.pageSize), status: filters.status, stock: filters.stock, sort: filters.sort });
      if (filters.category) params.set('category', filters.category);
      if (filters.brand) params.set('brand', filters.brand);
      try {
        const response = await fetch(`/api/products?${params}`, { cache: 'no-store', signal: controller.signal });
        if (response.status === 401) { router.replace('/login'); return; }
        if (!response.ok) throw new Error(response.status === 403 ? 'FORBIDDEN' : 'UNAVAILABLE');
        const result: MasterProductPage = await response.json();
        if (controller.signal.aborted) return;
        setData(result); setUpdated(new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' }).format(new Date()));
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error && failure.message === 'FORBIDDEN' ? 'Akun Anda tidak memiliki izin melihat produk.' : 'Daftar produk belum dapat dimuat. Periksa koneksi dan coba lagi.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, filters.q ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [filters, refresh, router]);

  function showDetail(item: MasterProduct, trigger: HTMLElement) {
    detailTrigger.current = trigger; setSelected(item); dialog.current?.showModal();
  }
  function openEditor(id: number, trigger?: HTMLElement) {
    if (trigger) detailTrigger.current = trigger;
    dialog.current?.close(); setEditorId(id);
  }
  function closeEditor() { setEditorId(null); detailTrigger.current?.focus(); }
  function closeCreator() { setCreating(false); addTrigger.current?.focus(); }
  function exportPage() {
    if (!data || loading || error) return;
    const url = URL.createObjectURL(new Blob([productsCsv(data.items)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `produk-cabang-${session.companyId}-halaman-${data.page}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const page = data?.page ?? 1;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / filters.pageSize));
  const ready = !loading && !error && data;

  return <PosShell branchName={session.branchName} session={session} active="products">
    <header className="products-header">
      <div><span className="products-eyebrow">KATALOG CABANG</span><h1>Produk &amp; Inventory</h1><p>Kenali produk. Pantau stok. Jaga ketersediaan.</p></div>
      <div className="products-header-right"><span className="products-branch"><span aria-hidden="true" />{session.branchName}</span><div className="pos-user"><span aria-hidden="true">{session.userName.slice(0, 1).toUpperCase()}</span><div><strong>{session.userName}</strong><small>Pengelola produk</small></div></div></div>
    </header>
    <main id="pos-workspace" className="products-content">
      <div className="products-intro"><div><h2>Daftar produk</h2><p>Seluruh produk cabang, termasuk produk nonaktif dan sedang SO.</p></div><div className="products-actions"><button type="button" className="products-button" onClick={reload} disabled={loading} aria-label="Perbarui daftar produk"><RefreshCw size={16} className={loading ? 'products-spinning' : ''} />Perbarui</button><button type="button" className="products-button" onClick={exportPage} disabled={!ready || !data?.items.length}><Download size={16} />Export halaman</button>{capabilities.add && <button ref={addTrigger} type="button" className="products-button products-primary" onClick={() => { setNotice(''); setCreating(true); }}><Plus size={16} />Tambah produk</button>}</div></div>
      {notice && <p className="product-editor-success" role="status">{notice}</p>}
      <section className="products-summary" aria-label="Ringkasan hasil filter">
        {[{ label: 'Produk ditemukan', value: data?.summary.total, icon: Boxes, color: 'blue' }, { label: 'Produk aktif', value: data?.summary.active, icon: Check, color: 'green' }, { label: 'Stok menipis', value: data?.summary.low, icon: Package, color: 'amber' }, { label: 'Stok habis', value: data?.summary.empty, icon: PackageOpen, color: 'red' }, { label: 'Sedang stock opname', value: data?.summary.locked, icon: Barcode, color: 'gray' }].map(({ label, value, icon: Icon, color }) => <div className={`products-stat products-stat-${color}`} key={label}><span className="products-stat-icon"><Icon size={19} /></span><div><span>{label}</span><strong>{ready ? number(value ?? 0) : '—'}</strong></div></div>)}
      </section>
      <section className="products-catalog" aria-label="Katalog produk">
        <div className="products-toolbar">
          <label className="products-search"><Search size={19} aria-hidden="true" /><span className="pos-sr-only">Cari produk</span><input ref={search} value={filters.q} maxLength={100} placeholder="Cari SKU, barcode, atau nama produk…" onChange={event => change({ q: event.target.value })} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); reload(); } }} />{filters.q ? <button type="button" aria-label="Hapus pencarian" onClick={() => { change({ q: '' }); search.current?.focus(); }}><X size={17} /></button> : <Barcode size={20} aria-hidden="true" />}</label>
          <label className="products-sort"><ArrowDownWideNarrow size={17} /><span className="pos-sr-only">Urutkan produk</span><select value={filters.sort} onChange={event => change({ sort: event.target.value as Filters['sort'] })}><option value="newest">Produk terbaru</option><option value="name">Nama A–Z</option><option value="stock">Stok terendah</option><option value="price">Harga terendah</option></select></label>
        </div>
        <div className="products-filters"><span className="products-filter-label"><SlidersHorizontal size={15} />Filter</span>
          <label><span className="pos-sr-only">Kategori</span><select value={filters.category} onChange={event => change({ category: event.target.value })}><option value="">Semua kategori</option>{data?.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label><span className="pos-sr-only">Merek</span><select value={filters.brand} onChange={event => change({ brand: event.target.value })}><option value="">Semua merek</option>{data?.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <label><span className="pos-sr-only">Status produk</span><select value={filters.status} onChange={event => change({ status: event.target.value as Filters['status'] })}><option value="all">Semua status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></label>
          {filtered && <button type="button" className="products-reset" onClick={reset}><X size={14} />Reset filter</button>}
        </div>
        <div className="products-stock-tabs" aria-label="Filter ketersediaan stok">{[['all', 'Semua stok'], ['available', 'Tersedia'], ['low', 'Stok menipis'], ['empty', 'Stok habis'], ['locked', 'Sedang SO']].map(([value, label]) => <button key={value} type="button" aria-pressed={filters.stock === value} onClick={() => change({ stock: value as Filters['stock'] })}>{label}</button>)}</div>
        <div className="products-results-meta"><span role="status" aria-live="polite">{loading ? 'Memuat produk…' : error ? 'Daftar belum tersedia' : `${number(data?.total ?? 0)} produk${filtered ? ' sesuai filter' : ` di ${session.branchName}`}`}</span><span>{updated && ready ? `Diperbarui ${updated} WIB` : 'Stok dibaca saat daftar dimuat'}</span></div>
        <div className="products-table-scroll" tabIndex={0} aria-label="Tabel produk, geser untuk melihat kolom lainnya" aria-busy={loading}>
          <table className="products-table"><thead><tr><th scope="col">Produk / SKU</th><th scope="col">Barcode</th><th scope="col">Kategori &amp; merek</th><th scope="col" className="products-numeric">Harga jual</th><th scope="col">Stok saat ini</th><th scope="col">Status</th><th scope="col"><span className="pos-sr-only">Detail produk</span></th></tr></thead><tbody>
            {loading ? Array.from({ length: 7 }, (_, i) => <tr className="products-skeleton-row" key={i}><td colSpan={7}><span /></td></tr>) : error ? <tr><td colSpan={7}><div className="products-empty" role="alert"><PackageOpen size={32} /><strong>Produk belum dapat ditampilkan</strong><p>{error}</p><button className="products-button" type="button" onClick={reload}>Coba lagi</button></div></td></tr> : !data?.items.length ? <tr><td colSpan={7}><div className="products-empty"><Search size={32} /><strong>{filtered ? 'Produk tidak ditemukan' : 'Belum ada produk di cabang ini'}</strong><p>{filtered ? 'Coba kata pencarian lain atau hapus filter yang dipilih.' : 'Daftar produk akan muncul setelah produk cabang tersedia.'}</p>{filtered && <button className="products-button" type="button" onClick={reset}>Reset filter</button>}</div></td></tr> : data.items.map(item => <tr key={item.id}><td><div className="products-identity"><span className="products-item-icon" aria-hidden="true"><Package size={20} /></span><div><button type="button" className="products-name" onClick={event => showDetail(item, event.currentTarget)}>{item.name}</button><span className="products-code">{item.code || 'Kode belum diisi'}{item.sku ? ` · SKU ${item.sku}` : ''}</span></div></div></td><td><span className="products-barcode">{item.barcode || '—'}</span>{item.packBarcode && <small className="products-pack">Kemasan: {item.packBarcode}</small>}</td><td><span>{item.category || 'Tanpa kategori'}</span><small className="products-cell-secondary">{item.brand || 'Tanpa merek'}</small></td><td className="products-numeric"><strong>{rupiah(item.sellingPrice)}</strong>{Number(item.discount) > 0 && <small className="products-cell-secondary">Diskon {rupiah(item.discount)}</small>}</td><td><StockBadge item={item} /></td><td><span className={`products-badge ${item.active ? 'products-badge-active' : ''}`}>{item.active ? 'Aktif' : 'Nonaktif'}</span>{item.locked && <small className="products-so">Sedang SO</small>}</td><td><div className="products-row-actions">{capabilities.edit && <button type="button" className="products-detail-button products-edit-button" aria-label={`Edit ${item.name}`} onClick={event => openEditor(item.id, event.currentTarget)}><Pencil size={16} /></button>}<button type="button" className="products-detail-button" aria-label={`Detail ${item.name}`} onClick={event => showDetail(item, event.currentTarget)}><Eye size={17} /></button></div></td></tr>)}
          </tbody></table>
        </div>
        <div className="products-pagination"><span>{ready && data.total ? `${number((page - 1) * filters.pageSize + 1)}–${number(Math.min(page * filters.pageSize, data.total))} dari ${number(data.total)} produk` : '—'}</span><div><label>Tampilkan <select value={filters.pageSize} onChange={event => change({ pageSize: Number(event.target.value) })}>{[10, 25, 50, 100].map(size => <option value={size} key={size}>{size}</option>)}</select></label><button type="button" aria-label="Halaman sebelumnya" disabled={!ready || page <= 1} onClick={() => change({ page: page - 1 })}><ChevronLeft size={18} /></button><span>Halaman {page} / {pages}</span><button type="button" aria-label="Halaman berikutnya" disabled={!ready || page >= pages} onClick={() => change({ page: page + 1 })}><ChevronRight size={18} /></button></div></div>
      </section>
      <div className="products-footnote"><span>Export berisi produk pada halaman yang sedang ditampilkan.</span>{capabilities.add && <span>Produk baru ditambahkan ke {session.branchName}.</span>}</div>
    </main>
    <dialog ref={dialog} className="products-dialog" aria-labelledby="product-detail-title" onClose={() => { setSelected(null); detailTrigger.current?.focus(); }} onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.currentTarget.close(); } }}>
      {selected && <><div className="products-dialog-heading"><span className="products-item-icon"><Package size={25} /></span><div><span className="products-eyebrow">DETAIL PRODUK</span><h2 id="product-detail-title">{selected.name}</h2><span className="products-code">{selected.code}</span></div><button autoFocus type="button" className="products-detail-button" aria-label="Tutup detail produk" onClick={() => dialog.current?.close()}><X size={20} /></button></div>
        <div className="products-dialog-stock"><StockBadge item={selected} /><span className={`products-badge ${selected.active ? 'products-badge-active' : ''}`}>{selected.active ? 'Aktif' : 'Nonaktif'}</span>{selected.locked && <span className="products-so">Sedang SO</span>}</div>
        <dl className="products-detail-grid">{[['Barcode satuan', selected.barcode], ['Barcode kemasan', selected.packBarcode], ['Kategori', selected.category], ['Merek', selected.brand], ['Satuan', selected.unit], ['Isi per kemasan', number(selected.packQuantity)], ['Harga jual', rupiah(selected.sellingPrice)], ['Harga beli', rupiah(selected.purchasePrice)], ['Diskon per satuan', rupiah(selected.discount)], ['Pajak', selected.tax ? `${selected.tax} · ${selected.taxType}` : null], ['Jenis produk', selected.type], ['Tanggal kedaluwarsa', selected.expiryDate && selected.expiryDate !== '0000-00-00' ? selected.expiryDate.split('-').reverse().join('/') : null]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>
        <div className="products-dialog-footer"><p>Stok mengikuti pembacaan terakhir daftar produk.</p>{capabilities.edit && <button type="button" className="products-button products-primary" onClick={() => openEditor(selected.id)}><Pencil size={15} />Edit produk</button>}</div></>}
    </dialog>
    {creating && <ProductCreator csrfToken={session.csrfToken} writes={capabilities.writes} branchName={session.branchName} onClose={closeCreator} onFind={term => { closeCreator(); setNotice(''); change({ ...initialFilters, q: term }); }} onSaved={result => { closeCreator(); setNotice(`Produk “${result.name}” ditambahkan dengan kode ${result.code}${result.stock ? ` dan stok awal ${number(result.stock)}` : ''}.`); reset(); }} />}
    {editorId !== null && <ProductEditor key={editorId} id={editorId} csrfToken={session.csrfToken} writes={capabilities.writes} onClose={closeEditor} onSaved={message => { closeEditor(); setNotice(message); reload(); }} />}
  </PosShell>;
}
