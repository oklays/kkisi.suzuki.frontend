import { notFound } from 'next/navigation';
import { ArrowLeft, Undo2 } from 'lucide-react';
import { PosError } from '@koperasi/domain/pos/sale';
import { readReturnContext } from '@koperasi/application/sales/returns';
import Link from '@/components/sales/SalesLink';
import { SalesFeedback } from '@/components/sales/SalesFeedback';
import { SalesReturnForm } from '@/components/sales/SalesReturnForm';
import { PaymentMethodChip, formatSalesDate, formatSalesMoney as idr } from '@/components/sales/SalesChips';
import { refundLabel, returnMessage } from '@/components/sales/return-messages';
import { requirePagePermission } from '@/infrastructure/auth/page-guard';
import { returnReadRepository, returnWritesAvailable } from '@/infrastructure/sales/return-handlers';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Retur Barang · Koperasi Suzuki Mart' };

export default async function SalesReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePagePermission('sales_return_add');
  if (auth.kind !== 'ok') return <main className="sales-workspace" id="pos-workspace"><SalesFeedback title={auth.kind === 'forbidden' ? 'Akses ditolak' : 'Layanan tidak tersedia'} text={auth.kind === 'forbidden' ? 'Akun Anda tidak memiliki izin memproses retur penjualan.' : 'Halaman retur belum dapat dibuka.'} retry={auth.kind === 'unavailable'} /></main>;
  const { id } = await params;
  let context: Awaited<ReturnType<typeof readReturnContext>>;
  try { context = await readReturnContext(returnReadRepository(), auth.ctx.companyId, id, auth.services.deps.clock.now()); }
  catch (error) {
    if (error instanceof PosError && error.code === 'SALE_NOT_FOUND') notFound();
    auth.services.deps.log('sales_return_page_unavailable');
    return <main className="sales-workspace" id="pos-workspace"><SalesFeedback title="Retur belum dapat dibuka" text="Layanan sementara tidak tersedia. Coba lagi." retry /></main>;
  }
  const { sale, eligibility } = context;
  const back = `/sales/invoice/${sale.saleId}`;
  return <main className="sales-workspace" id="pos-workspace" tabIndex={-1}>
    <Link className="sales-back" href={back}><ArrowLeft size={15} aria-hidden="true" />Kembali ke detail transaksi</Link>
    <div className="sales-title"><div><p className="sales-eyebrow"><Undo2 size={15} aria-hidden="true" />RETUR PENJUALAN · {sale.salesCode}</p><h2>Retur barang</h2><p>{formatSalesDate(sale.saleDate)} · {sale.customerName}{sale.memberNik ? ` · NIK ${sale.memberNik}` : ''}</p></div></div>
    <section className="sales-summary-metrics" aria-label="Ringkasan transaksi asal">
      <div><span>Total transaksi asal</span><strong>{idr(sale.grandTotalSen)}</strong><small>Nilai penjualan tidak diubah oleh retur</small></div>
      <div><span>Metode pembayaran</span><PaymentMethodChip value={sale.paymentType} /><small>{refundLabel(eligibility.refundMethod)}</small></div>
      <div><span>Batas retur</span><strong>{eligibility.deadline ? formatSalesDate(eligibility.deadline) : '—'}</strong><small>{sale.paymentType === 'Kredit' ? 'Akhir periode kredit (bulan transaksi)' : '7 hari kalender sejak transaksi'}</small></div>
    </section>
    {!eligibility.allowed ? <aside className="sales-warning" role="alert"><strong>Transaksi ini tidak dapat diretur</strong><ul>{eligibility.reasons.map((reason) => <li key={reason}>{returnMessage(reason)}</li>)}</ul></aside>
      : !returnWritesAvailable() ? <aside className="sales-warning" role="alert"><strong>Penyimpanan retur belum diaktifkan</strong><p>{returnMessage('WRITE_NOT_CONFIGURED')}</p></aside>
      : <SalesReturnForm context={context} csrfToken={auth.services.keys.csrfToken(auth.ctx.sidHash)} />}
    <p className="sales-print-hint">Refund tunai dicatat pada sesi kasir Anda yang sedang terbuka hari ini dan mengurangi saldo akhir laci saat tutup kasir.</p>
  </main>;
}
