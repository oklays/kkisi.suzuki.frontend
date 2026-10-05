import Link from './SalesLink';
import { ArrowLeft, Printer, ReceiptText } from 'lucide-react';
import { PaymentMethodChip, StatusChip, formatSalesDate, formatSalesMoney as idr, safeSalesReturn as safeReturn } from './SalesChips';
import type { readSaleDetail } from '@koperasi/application/sales/history';
import { SalePaymentsPanel } from './SalePaymentsPanel';
import './sales.css';

const reasonText: Record<string, string> = {
  NON_POS: 'Transaksi ini bukan penjualan POS.', NON_FINAL: 'Transaksi belum berstatus Final.', INACTIVE_RECORD: 'Record transaksi tidak aktif.',
  RETURN_UNSUPPORTED: 'Transaksi retur belum didukung cetak ulang.', PAYMENT_METHOD_UNSUPPORTED: 'Metode pembayaran tidak didukung.',
  PAYMENT_NOT_SETTLED: 'Status pembayaran belum lunas.', ITEMS_MISSING: 'Detail item tidak lengkap atau berasal dari company lain.',
  PRINT_TOO_LARGE: 'Jumlah item melebihi batas aman struk.', INVALID_SAVED_AMOUNT: 'Nilai tersimpan tidak valid.',
  PAYMENT_DATA_UNSUPPORTED: 'Catatan pembayaran tidak cukup konsisten untuk struk.', LEGACY_TOTALS_UNSUPPORTED: 'Rincian total historis belum dapat direkonstruksi dengan aman.',
};
export function SalesDetail({ canViewPayments = false, detail, returnTo, linePage }: { canViewPayments?: boolean; detail: Awaited<ReturnType<typeof readSaleDetail>>; returnTo: string; linePage: number }) {
  const { sale } = detail;
  const receiptHref = `/pos/receipt/${sale.saleId}?mode=reprint&returnTo=${encodeURIComponent(safeReturn(returnTo))}`;
  return <main className="sales-workspace" id="pos-workspace" tabIndex={-1}>
      <Link className="sales-back" href={safeReturn(returnTo)}><ArrowLeft size={15} aria-hidden="true" />Kembali ke riwayat</Link>
      <div className="sales-title"><div><p className="sales-eyebrow"><ReceiptText size={15} aria-hidden="true" />{sale.salesCode}</p><h2>Detail transaksi</h2><p>{formatSalesDate(sale.saleDate)} · {sale.source === 'pos' ? 'POS' : 'Non-POS'} · {sale.createdBy}</p></div>
        {detail.printEligibility.allowed && <Link className="sales-primary sales-print" href={receiptHref}><Printer size={16} aria-hidden="true" />Cetak ulang struk</Link>}
      </div>
      <section className="sales-summary-metrics" aria-label="Nilai dan pembayaran transaksi">
        <div><span>Total transaksi</span><strong>{idr(sale.grandTotalSen)}</strong><small>Nilai tersimpan</small></div>
        <div><span>Terbayar</span><strong>{idr(sale.paidSen)}</strong><StatusChip value={sale.paymentStatus} payment /></div>
        <div><span>Metode pembayaran</span><PaymentMethodChip value={sale.paymentType} /><small>{sale.registerReference || 'Referensi sesi tidak tersimpan'}</small></div>
      </section>
      {detail.printEligibility.allowed && <p className="sales-print-hint">Buka pratinjau struk, lalu pilih cetak. Struk tidak dicetak otomatis.</p>}
      {!detail.printEligibility.allowed && <aside className="sales-warning" aria-label="Struk tidak dapat dicetak ulang"><strong>Struk tidak dapat dicetak ulang</strong><ul>{detail.printEligibility.reasons.map((reason) => <li key={reason}>{reasonText[reason] ?? 'Data historis belum memenuhi syarat cetak.'}</li>)}</ul></aside>}
      {detail.warnings.length > 0 && <aside className="sales-warning"><strong>Beberapa data historis perlu diperiksa</strong><p>Nilai yang tidak tersimpan atau tidak lengkap ditandai sebagai tidak tersedia.</p></aside>}
      <section className="sales-detail-card"><h3>Ringkasan</h3><dl><div><dt>Pelanggan</dt><dd>{sale.customerName}</dd></div><div><dt>NIK anggota</dt><dd>{sale.memberNik || '—'}</dd></div><div><dt>Status penjualan</dt><dd><StatusChip value={sale.salesStatus} /></dd></div><div><dt>Status pembayaran</dt><dd><StatusChip value={sale.paymentStatus} payment /></dd></div><div><dt>Record / retur</dt><dd>{sale.recordStatus}{sale.returnBit && sale.returnBit !== '0' ? ` · ${sale.returnBit}` : ''}</dd></div><div><dt>Metode pembayaran</dt><dd><PaymentMethodChip value={sale.paymentType} /></dd></div><div><dt>Sesi kasir</dt><dd>{sale.registerReference || 'Referensi sesi tidak tersedia'}</dd></div><div><dt>ID sesi</dt><dd>{sale.registerId ?? '—'}</dd></div><div><dt>Subtotal tersimpan</dt><dd>{idr(sale.subtotalSen)}</dd></div><div><dt>Diskon tersimpan</dt><dd>{idr(sale.discountSen)}</dd></div><div><dt>Input biaya lain tersimpan</dt><dd>{idr(sale.otherChargesInputSen)}</dd></div><div><dt>Jumlah biaya lain tersimpan</dt><dd>{idr(sale.otherChargesSen)}</dd></div><div><dt>Nilai round_off legacy</dt><dd>{idr(sale.roundOffLegacySen)}</dd></div><div><dt>Total tersimpan</dt><dd><strong>{idr(sale.grandTotalSen)}</strong></dd></div><div><dt>Terbayar tersimpan</dt><dd>{idr(sale.paidSen)}</dd></div></dl>
        {canViewPayments && <SalePaymentsPanel key={sale.saleId} saleId={sale.saleId} />}
      </section>
      <section className="sales-detail-card"><h3>Item transaksi <small>· {detail.linePagination.total} baris tersimpan</small></h3><div className="sales-table-wrap" tabIndex={0} role="region" aria-label="Item transaksi, geser horizontal untuk melihat semua kolom"><table className="sales-table"><thead><tr><th scope="col">Item / barcode</th><th scope="col">Jumlah</th><th scope="col">Harga satuan</th><th scope="col">Diskon</th><th scope="col">Pajak</th><th scope="col">Total tersimpan</th><th scope="col">Status baris</th></tr></thead><tbody>{detail.lines.length === 0 ? <tr><td colSpan={7} className="sales-empty">Tidak ada baris item yang dapat ditampilkan.</td></tr> : detail.lines.map((line) => <tr key={line.lineId}><td>{line.label}<small>{line.barcode || 'Barcode tidak tersimpan'} · {line.labelSource === 'description' ? 'Deskripsi transaksi' : line.labelSource === 'current_master' ? 'Nama master saat ini' : 'Label fallback'}</small></td><td>{line.quantity}</td><td>{idr(line.unitPriceSen)}</td><td>{idr(line.discountSen)}</td><td>{idr(line.taxSen)}{line.taxType ? ` · ${line.taxType}` : ''}</td><td>{idr(line.totalSen)}</td><td><StatusChip value={line.salesStatus} /><small>{line.status === 1 ? 'Aktif' : `Nonaktif · ${line.status}`}</small></td></tr>)}</tbody></table></div>
        <div className="sales-pagination"><span>Halaman {linePage} · nilai di atas berasal dari data tersimpan</span><div>{linePage > 1 && <Link href={`?returnTo=${encodeURIComponent(safeReturn(returnTo))}&linePage=${linePage - 1}`}>Sebelumnya</Link>}{detail.linePagination.hasNext && <Link href={`?returnTo=${encodeURIComponent(safeReturn(returnTo))}&linePage=${linePage + 1}`}>Berikutnya</Link>}</div></div>
        {detail.lines.length === 0 && linePage > 1 && <Link className="sales-secondary" href={`?returnTo=${encodeURIComponent(safeReturn(returnTo))}&linePage=1`}>Ke halaman pertama item</Link>}
      </section>
    </main>;
}
