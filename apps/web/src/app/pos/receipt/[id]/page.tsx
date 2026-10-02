import { notFound } from 'next/navigation';
import { readReceipt } from '@koperasi/application/pos/receipt';
import { PosError } from '@koperasi/domain/pos/sale';
import { requirePagePermission } from '@/infrastructure/auth/page-guard';
import { PrismaReceiptRepository } from '@/infrastructure/repositories/prisma-receipt.repository';
import { ReceiptPrintButton } from '@/components/pos/ReceiptPrintButton';
import './receipt.css';

export const dynamic = 'force-dynamic';
const rupiah = (sen: number) => `Rp ${new Intl.NumberFormat('id-ID', { minimumFractionDigits: sen % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(sen / 100)}`;

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePagePermission('sales_add');
  if (auth.kind === 'forbidden') return <main className="receipt-message">Akses struk tidak diizinkan.</main>;
  if (auth.kind === 'unavailable') return <main className="receipt-message">Struk sementara tidak tersedia.</main>;
  const { id } = await params;
  let receipt;
  try { receipt = await readReceipt(new PrismaReceiptRepository(), auth.ctx, id); }
  catch (error) {
    if (error instanceof PosError && ['NOT_FOUND', 'INVALID_INPUT'].includes(error.code)) notFound();
    return <main className="receipt-message">Struk sementara tidak tersedia.</main>;
  }
  const date = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' }).format(new Date(`${receipt.saleDate}T00:00:00+07:00`));
  return <main className="receipt-screen">
    <nav className="receipt-actions"><a href="/pos">← Kembali ke Kasir</a><ReceiptPrintButton /></nav>
    <article className="receipt-paper" aria-label={`Struk ${receipt.salesCode}`}>
      <header><h1>{receipt.storeName}</h1><p>{receipt.storeAddress}</p><p>STRUK PEMBAYARAN</p></header>
      <dl className="receipt-meta"><div><dt>No. Struk</dt><dd>{receipt.salesCode}</dd></div><div><dt>Tanggal</dt><dd>{date}</dd></div><div><dt>Kasir</dt><dd>{receipt.cashier}</dd></div><div><dt>Anggota</dt><dd>{receipt.customerName}</dd></div></dl>
      <div className="receipt-lines">{receipt.lines.map((line, index) => <div className="receipt-line" key={index}>
        <strong>{line.name}</strong><div><span>{line.quantity} × {rupiah(line.unitPriceSen)}</span><span>{rupiah(line.totalSen)}</span></div>
        {line.discountSen > 0 && <small>Diskon {rupiah(line.discountSen)} / item</small>}
      </div>)}</div>
      <dl className="receipt-totals"><div><dt>Subtotal</dt><dd>{rupiah(receipt.subtotalSen)}</dd></div>{receipt.discountSen > 0 && <div><dt>Diskon transaksi</dt><dd>−{rupiah(receipt.discountSen)}</dd></div>}<div className="receipt-grand"><dt>Total</dt><dd>{rupiah(receipt.grandTotalSen)}</dd></div><div><dt>Metode</dt><dd>{receipt.paymentType}</dd></div><div><dt>{receipt.paymentType === 'Kredit' ? 'Tagihan Kredit' : 'Uang Bayar'}</dt><dd>{rupiah(receipt.paidSen)}</dd></div>{receipt.paymentType === 'Cash' && <div><dt>Kembalian</dt><dd>{rupiah(receipt.changeSen)}</dd></div>}</dl>
      <footer>Terima kasih atas kunjungan Anda</footer>
    </article>
  </main>;
}
