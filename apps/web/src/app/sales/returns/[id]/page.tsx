import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Printer, Undo2 } from 'lucide-react';
import { PosError } from '@koperasi/domain/pos/sale';
import { readReturnDocument } from '@koperasi/application/sales/returns';
import Link from '@/components/sales/SalesLink';
import { SalesFeedback } from '@/components/sales/SalesFeedback';
import { PaymentMethodChip, formatSalesDate, formatSalesMoney as idr } from '@/components/sales/SalesChips';
import { refundLabel } from '@/components/sales/return-messages';
import { requirePagePermission } from '@/infrastructure/auth/page-guard';
import { returnReadRepository } from '@/infrastructure/sales/return-handlers';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Detail Retur · Koperasi Suzuki Mart' };

export default async function SalesReturnDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const auth = await requirePagePermission(['sales_return_view', 'sales_return_add']);
  if (auth.kind !== 'ok') return <main className="sales-workspace" id="pos-workspace"><SalesFeedback title={auth.kind === 'forbidden' ? 'Akses ditolak' : 'Layanan tidak tersedia'} text="Detail retur belum dapat dibuka." retry={auth.kind === 'unavailable'} /></main>;
  const [{ id }, search] = await Promise.all([params, searchParams]);
  let document: Awaited<ReturnType<typeof readReturnDocument>>;
  try { document = await readReturnDocument(returnReadRepository(), auth.ctx.companyId, id); }
  catch (error) {
    if (error instanceof PosError && error.code === 'RETURN_NOT_FOUND') notFound();
    auth.services.deps.log('sales_return_detail_unavailable');
    return <main className="sales-workspace" id="pos-workspace"><SalesFeedback title="Detail retur belum dapat ditampilkan" text="Layanan sementara tidak tersedia." retry /></main>;
  }
  const created = search.created === '1';
  const print = `/pos/return-receipt/${document.returnId}?returnTo=${encodeURIComponent(`/sales/returns/${document.returnId}`)}${created ? '&autoprint=1' : ''}`;
  return <main className="sales-workspace" id="pos-workspace" tabIndex={-1}>
    <Link className="sales-back" href={document.saleId ? `/sales/invoice/${document.saleId}` : '/sales/returns'}><ArrowLeft size={15} aria-hidden="true" />{document.saleId ? 'Kembali ke transaksi asal' : 'Kembali ke daftar retur'}</Link>
    {created && <aside className="sales-return-success" role="status"><CheckCircle2 size={20} aria-hidden="true" /><div><strong>Retur tersimpan</strong><p>{document.refundMethod === 'Cash' ? `Serahkan ${idr(document.totalSen)} tunai kepada pelanggan, lalu cetak nota retur.` : `Tagihan kredit anggota berkurang ${idr(document.totalSen)}. Cetak nota retur untuk pelanggan.`}</p></div></aside>}
    <div className="sales-title"><div><p className="sales-eyebrow"><Undo2 size={15} aria-hidden="true" />{document.returnCode}</p><h2>Detail retur</h2><p>{document.returnedAt} · {document.createdBy}</p></div>
      <Link className="sales-primary sales-print" href={print}><Printer size={16} aria-hidden="true" />Cetak nota retur</Link></div>
    <section className="sales-summary-metrics" aria-label="Nilai retur">
      <div><span>Nilai retur</span><strong>{idr(document.totalSen)}</strong><small>{refundLabel(document.refundMethod)}</small></div>
      <div><span>Pengembalian</span><PaymentMethodChip value={document.refundMethod} /><small>Transaksi asal: {document.salePaymentType ?? '—'}</small></div>
      <div><span>Struk asal</span><strong className="sales-return-code">{document.salesCode ?? '—'}</strong><small>{document.saleDate ? formatSalesDate(document.saleDate) : 'Tanggal tidak tersimpan'}</small></div>
    </section>
    <section className="sales-detail-card"><h3>Ringkasan</h3><dl><div><dt>Pelanggan</dt><dd>{document.customerName}</dd></div><div><dt>NIK anggota</dt><dd>{document.memberNik ?? '—'}</dd></div><div><dt>Alasan</dt><dd>{document.reason || '—'}</dd></div></dl></section>
    <section className="sales-detail-card"><h3>Barang diretur <small>· {document.lines.length} baris</small></h3><div className="sales-table-wrap" tabIndex={0} role="region" aria-label="Barang diretur"><table className="sales-table sales-payments-table">
      <thead><tr><th scope="col">Item</th><th scope="col">Jumlah</th><th scope="col" className="sales-money">Harga satuan</th><th scope="col" className="sales-money">Nilai retur</th></tr></thead>
      <tbody>{document.lines.map((line, index) => <tr key={`${line.itemId}-${index}`}><td>{line.label}</td><td>{line.quantity}</td><td className="sales-money">{idr(line.unitPriceSen)}</td><td className="sales-money"><strong>{idr(line.refundSen)}</strong></td></tr>)}</tbody>
    </table></div></section>
  </main>;
}
