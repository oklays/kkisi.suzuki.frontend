import Link from './SalesLink';
import { ArrowRight, ChevronLeft, ChevronRight, FileSearch, ReceiptText } from 'lucide-react';
import type { SalesHistoryQuery } from '@koperasi/domain/sales/history';
import type { SalesHistoryItem } from '@koperasi/application/sales/history';
import { SalesFilters } from './SalesFilters';
import { SalesFeedback } from './SalesFeedback';
import { PaymentMethodChip, StatusChip, formatSalesDate, formatSalesMoney, salesListHref } from './SalesChips';

export function SalesScreen({ query, rows, total, today = query.to, rawFilters, invalidFilter, unavailable }: { query: SalesHistoryQuery; rows: SalesHistoryItem[]; total: number; today?: string; rawFilters?: Record<string, string>; invalidFilter?: string; unavailable?: boolean }) {
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const outOfRange = query.page > pageCount;
  const start = (query.page - 1) * query.pageSize + 1;
  const detailHref = (saleId: number) => `/sales/invoice/${saleId}?returnTo=${encodeURIComponent(salesListHref(query))}`;
  return <main className="sales-workspace" id="pos-workspace" tabIndex={-1}>
    <div className="sales-title"><div><p className="sales-eyebrow"><ReceiptText size={15} aria-hidden="true" />PENJUALAN</p><h2>Riwayat Transaksi</h2><p>Telusuri penjualan, periksa pembayaran, dan cetak ulang bukti transaksi.</p></div>{!invalidFilter && !unavailable && <span className="sales-count"><strong>{total.toLocaleString('id-ID')}</strong> transaksi ditemukan</span>}</div>
    <SalesFilters key={JSON.stringify(rawFilters ?? query)} query={query} today={today} rawFilters={rawFilters} invalidFilter={invalidFilter} />
    {unavailable ? <SalesFeedback title="Transaksi belum dapat ditampilkan" text="Layanan sementara tidak tersedia. Filter Anda tetap tersimpan; coba muat kembali." retry /> : invalidFilter ? <section className="sales-empty-state"><FileSearch size={32} aria-hidden="true" /><h3>Perbaiki filter untuk melanjutkan</h3><p>Sesuaikan isian di atas atau reset untuk kembali ke periode bulan ini.</p><Link href="/sales" className="sales-secondary">Reset filter</Link></section> : <>
    <div className="sales-results-heading"><h3>Daftar transaksi</h3><span>{formatSalesDate(query.from)} – {formatSalesDate(query.to)}<small> · {query.sort === 'newest' ? 'Terbaru lebih dulu' : 'Terlama lebih dulu'}</small></span></div>
    {rows.length === 0 ? <div className="sales-empty-state"><FileSearch size={32} aria-hidden="true" /><h3>{outOfRange ? 'Halaman ini tidak tersedia' : 'Belum ada transaksi yang cocok'}</h3><p>{outOfRange ? 'Jumlah hasil telah berubah. Mulai dari halaman pertama.' : 'Coba tanggal lain, ubah pencarian, atau pilih semua status.'}</p><Link className="sales-secondary" href={outOfRange ? salesListHref(query, { page: 1 }) : '/sales'}>{outOfRange ? 'Ke halaman pertama' : 'Reset filter'}</Link></div> : <div className="sales-table-wrap" tabIndex={0} role="region" aria-label="Daftar transaksi, geser horizontal untuk melihat semua kolom"><table className="sales-table"><caption className="pos-sr-only">Transaksi penjualan pada periode dan filter terpilih</caption><thead><tr><th scope="col">Tanggal / struk</th><th scope="col">Pelanggan</th><th scope="col">Sumber / sesi</th><th scope="col">Status</th><th scope="col">Pembayaran</th><th scope="col" className="sales-money">Total</th><th scope="col" className="sales-money">Terbayar</th><th scope="col">Pembuat</th><th scope="col" className="sales-sticky-action">Aksi</th></tr></thead><tbody>
      {rows.map(row => <tr key={row.saleId}>
        <td><Link className="sales-receipt-link" href={detailHref(row.saleId)}>{row.salesCode}</Link><small><time dateTime={row.saleDate}>{formatSalesDate(row.saleDate)}</time></small></td>
        <td><strong className="sales-customer">{row.customerName}</strong><small>{row.memberNik ? `NIK ${row.memberNik}` : 'NIK tidak tercatat'}</small></td>
        <td><span className={`sales-chip sales-chip--${row.source === 'pos' ? 'blue' : 'neutral'}`}>{row.source === 'pos' ? 'POS' : 'Non-POS'}</span><small>{row.registerReference || (row.registerId ? `Sesi #${row.registerId} · referensi tidak tersimpan` : 'Sesi tidak tersimpan')}</small>{row.cashierLabel && <small>{row.cashierLabel}</small>}</td>
        <td><StatusChip value={row.salesStatus} />{row.recordStatus !== 1 && <small className="sales-warning-text">Record nonaktif</small>}{row.returnBit && row.returnBit !== '0' && <small className="sales-warning-text">Retur</small>}</td>
        <td><div className="sales-payment-chips"><PaymentMethodChip value={row.paymentType} /><StatusChip value={row.paymentStatus} payment /></div></td>
        <td className="sales-money"><strong>{formatSalesMoney(row.grandTotalSen)}</strong></td><td className="sales-money">{formatSalesMoney(row.paidSen)}</td><td>{row.createdBy || 'Tidak tersimpan'}</td>
        <td className="sales-sticky-action"><Link className="sales-action" aria-label={`Lihat detail ${row.salesCode}`} href={detailHref(row.saleId)}>Lihat detail<ArrowRight size={14} aria-hidden="true" /></Link>{row.warnings.length > 0 && <small className="sales-warning-text">Periksa data historis</small>}</td>
      </tr>)}
    </tbody></table></div>}
    <nav className="sales-pagination" aria-label="Halaman transaksi"><span>{rows.length ? `${start.toLocaleString('id-ID')}–${Math.min(start + rows.length - 1, total).toLocaleString('id-ID')} dari ${total.toLocaleString('id-ID')} transaksi` : '0 transaksi ditampilkan'}<small>Halaman {query.page} dari {pageCount}</small></span><div>{query.page > 1 && !outOfRange ? <Link href={salesListHref(query, { page: query.page - 1 })} scroll={false}><ChevronLeft size={15} aria-hidden="true" />Sebelumnya</Link> : <span aria-disabled="true"><ChevronLeft size={15} aria-hidden="true" />Sebelumnya</span>}{query.page < pageCount ? <Link href={salesListHref(query, { page: query.page + 1 })} scroll={false}>Berikutnya<ChevronRight size={15} aria-hidden="true" /></Link> : <span aria-disabled="true">Berikutnya<ChevronRight size={15} aria-hidden="true" /></span>}</div></nav>
    </>}
  </main>;
}
