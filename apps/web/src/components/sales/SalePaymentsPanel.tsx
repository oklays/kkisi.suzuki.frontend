'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, LoaderCircle, WalletCards } from 'lucide-react';
import type { SalePayment } from '@koperasi/application/sales/history';
import { PaymentMethodChip, formatSalesDate, formatSalesMoney } from './SalesChips';

const pageSize = 50;
export function SalePaymentsPanel({ saleId }: { saleId: number }) {
  const panelId = useId();
  const request = useRef<AbortController | null>(null);
  const [requestedPage, setRequestedPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [rows, setRows] = useState<SalePayment[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  useEffect(() => () => request.current?.abort(), []);
  async function loadPage(nextPage: number) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setRequestedPage(nextPage);
    setLoading(true); setError(''); setExpired(false);
    let failureMessage = 'Koneksi terputus. Coba muat pembayaran kembali.';
    try {
      const response = await fetch(`/api/sales/${saleId}/payments?page=${nextPage}&pageSize=${pageSize}`, { cache: 'no-store', signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!response.ok) {
        if (response.status === 401) setExpired(true);
        failureMessage = response.status === 401 ? 'Sesi Anda berakhir. Masuk kembali untuk melihat pembayaran.' : response.status === 403 ? 'Izin melihat pembayaran tidak tersedia.' : response.status === 404 ? 'Transaksi tidak tersedia pada cabang aktif.' : 'Pembayaran belum dapat dimuat. Coba lagi.';
        throw new Error('PAYMENTS_UNAVAILABLE');
      }
      const result = await response.json() as { rows: SalePayment[]; pagination: { total: number; hasNext: boolean } };
      if (controller.signal.aborted) return;
      setRows(result.rows); setTotal(result.pagination.total); setHasNext(result.pagination.hasNext); setPage(nextPage);
    } catch {
      if (!controller.signal.aborted) setError(failureMessage);
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }
  function toggle() {
    if (open) { request.current?.abort(); setLoading(false); setOpen(false); }
    else { setOpen(true); if (!rows || error) void loadPage(requestedPage); }
  }
  return <section className="sale-payments"><button type="button" className="sale-payments-toggle" aria-expanded={open} aria-controls={panelId} onClick={toggle}><WalletCards size={18} aria-hidden="true" />{open ? 'Tutup pembayaran' : 'Lihat pembayaran tersimpan'}<ChevronDown size={16} aria-hidden="true" /></button>
    <div id={panelId} className="sale-payments-content" hidden={!open} aria-busy={loading}>
      {open && <>
      {loading ? <p className="sales-inline-loading" role="status"><LoaderCircle size={16} className="sales-spin" aria-hidden="true" />Memuat pembayaran halaman {requestedPage}…</p> : error ? <div className="sales-filter-error" role="alert"><p>{error}</p>{expired ? <Link href="/login">Masuk kembali</Link> : <button type="button" className="sales-secondary" onClick={() => void loadPage(requestedPage)}>Coba lagi</button>}</div> : rows && (rows.length ? <>
        <p className="sales-filter-hint">Catatan pembayaran tersimpan; baris nonaktif tidak menyatakan transaksi lunas.</p>
        <div className="sales-table-wrap" tabIndex={0} role="region" aria-label="Catatan pembayaran"><table className="sales-table sales-payments-table"><caption className="pos-sr-only">Pembayaran transaksi tersimpan</caption><thead><tr><th scope="col">Tanggal / metode</th><th scope="col" className="sales-money">Pembayaran</th><th scope="col" className="sales-money">Kembalian</th><th scope="col">Pembuat</th><th scope="col">Status / catatan</th></tr></thead><tbody>{rows.map(row => <tr key={row.paymentId}><td><time dateTime={row.paymentDate}>{formatSalesDate(row.paymentDate)}</time><div className="sales-payment-chips"><PaymentMethodChip value={row.paymentType} /></div></td><td className="sales-money">{formatSalesMoney(row.paymentSen)}</td><td className="sales-money">{formatSalesMoney(row.changeSen)}</td><td>{row.createdBy || 'Tidak tersimpan'}</td><td><span className={`sales-chip sales-chip--${row.status === 1 ? 'success' : 'neutral'}`}>{row.status === 1 ? 'Aktif' : `Nonaktif · ${row.status}`}</span>{row.note && <details className="sales-payment-note"><summary>Lihat catatan</summary><p>{row.note}</p></details>}{row.warnings.length > 0 && <small className="sales-warning-text">Nilai pembayaran perlu diperiksa</small>}</td></tr>)}</tbody></table></div>
        <nav className="sales-pagination" aria-label="Halaman pembayaran"><span>{total.toLocaleString('id-ID')} pembayaran<small>Halaman {page} dari {Math.max(1, Math.ceil(total / pageSize))}</small></span><div><button type="button" disabled={page === 1} onClick={() => void loadPage(page - 1)}><ChevronLeft size={15} aria-hidden="true" />Sebelumnya</button><button type="button" disabled={!hasNext} onClick={() => void loadPage(page + 1)}>Berikutnya<ChevronRight size={15} aria-hidden="true" /></button></div></nav>
      </> : <div className="sales-empty-state"><WalletCards size={26} aria-hidden="true" /><h3>Tidak ada catatan pembayaran pada halaman ini</h3><p>Status pembayaran pada ringkasan tetap mengikuti transaksi tersimpan.</p>{page > 1 && <button className="sales-secondary" onClick={() => void loadPage(1)}>Ke halaman pertama pembayaran</button>}</div>)}
      </>}
    </div>
  </section>;
}
