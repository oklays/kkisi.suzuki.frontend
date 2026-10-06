import { notFound } from 'next/navigation';
import { readReceipt } from '@koperasi/application/pos/receipt';
import { PosError } from '@koperasi/domain/pos/sale';
import { requirePagePermission } from '@/infrastructure/auth/page-guard';
import { PrismaReceiptRepository } from '@/infrastructure/repositories/prisma-receipt.repository';
import { ReceiptPrintButton } from '@/components/pos/ReceiptPrintButton';
import './receipt.css';

export const dynamic = 'force-dynamic';
const rupiah = (sen: number) => `Rp ${new Intl.NumberFormat('id-ID', { minimumFractionDigits: sen % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(sen / 100)}`;

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ autoprint?: string | string[]; print?: string | string[]; mode?: string | string[]; returnTo?: string | string[] }>;
}) {
  const auth = await requirePagePermission(['sales_add', 'sales_view']);
  if (auth.kind === 'forbidden') return <main className="receipt-message">Akses struk tidak diizinkan.</main>;
  if (auth.kind === 'unavailable') return <main className="receipt-message">Struk sementara tidak tersedia.</main>;
  const { id } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const modeValue = Array.isArray(sp?.mode) ? null : sp?.mode;
  const returnValue = Array.isArray(sp?.returnTo) ? null : sp?.returnTo;
  if (modeValue === null || (modeValue !== undefined && modeValue !== 'checkout' && modeValue !== 'reprint') || (sp?.returnTo !== undefined && returnValue === null)) {
    return <main className="receipt-message">Permintaan struk tidak valid.</main>;
  }
  let canCheckout: boolean;
  try { canCheckout = await auth.ctx.hasPermission('sales_add'); }
  catch { return <main className="receipt-message">Struk sementara tidak tersedia.</main>; }
  const mode = modeValue === 'reprint' || !canCheckout ? 'reprint' : 'checkout';
  const returnTo = returnValue && (returnValue === '/sales' || returnValue.startsWith('/sales?')) ? returnValue : '/sales';
  const autoPrint = mode === 'checkout' && (sp?.autoprint === '1' || sp?.autoprint === 'true' || sp?.print === '1');
  let receipt;
  try { receipt = await readReceipt(new PrismaReceiptRepository(), auth.ctx, id, mode); }
  catch (error) {
    if (error instanceof PosError && ['NOT_FOUND', 'INVALID_INPUT'].includes(error.code)) notFound();
    if (error instanceof PosError && error.code === 'RECEIPT_UNSUPPORTED') return <main className="receipt-message"><p>Transaksi ini memerlukan pemeriksaan sebelum dapat dicetak ulang.</p><a href={returnTo}>Kembali ke riwayat transaksi</a></main>;
    return <main className="receipt-message">Struk sementara tidak tersedia.</main>;
  }
  const date = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' }).format(new Date(`${receipt.saleDate}T00:00:00+07:00`));
  return <main className="receipt-screen">
    <nav className="receipt-actions"><a href={mode === 'reprint' ? returnTo : '/pos'}>{mode === 'reprint' ? '← Kembali ke Riwayat Transaksi' : '← Kembali ke Kasir'}</a><ReceiptPrintButton autoPrint={autoPrint} label={mode === 'reprint' ? 'Cetak ulang struk' : 'Cetak struk'} /></nav>
    <article className="receipt-paper" aria-label={`Struk ${receipt.salesCode}`}>
      <header><h1>{receipt.storeName}</h1><p>{receipt.storeAddress}</p><p>Telp: +62 822-2333-1148</p></header>
      <dl className="receipt-meta"><div><dt>No. Struk</dt><dd>{receipt.salesCode}</dd></div><div><dt>Tanggal</dt><dd>{date}</dd></div><div><dt>Kasir</dt><dd>{receipt.cashier}</dd></div>{receipt.customerName !== 'UMUM' && <div><dt>Pelanggan</dt><dd>{receipt.customerName}</dd></div>}{receipt.memberNik && <div><dt>Nik</dt><dd>{receipt.memberNik}</dd></div>}<div><dt>Metode</dt><dd>{receipt.paymentType}</dd></div>{mode === 'checkout' && receipt.memberNik && <><div><dt>Limit</dt><dd>{rupiah(receipt.limitSen!)}</dd></div><div><dt>Limit Terpakai</dt><dd>{rupiah(receipt.usedLimitSen!)}</dd></div><div><dt>Sisa Limit</dt><dd>{rupiah(receipt.remainingLimitSen!)}</dd></div></>}</dl>
      <div className="receipt-lines"><div className="receipt-columns"><span>Item</span><span>Qty</span><span>Harga</span><span>Total</span></div>{receipt.lines.map((line, index) => <div className="receipt-line" key={index}>
        <strong>{line.name}</strong><div><span>{line.quantity} × {rupiah(line.unitPriceSen)}</span><span>{rupiah(line.totalSen)}</span></div>
        {line.discountSen > 0 && <small>{mode === 'reprint' ? 'Diskon tercatat' : 'Diskon'} {rupiah(line.discountSen)} / item</small>}
        {mode === 'reprint' && line.taxSen !== null && line.taxSen > 0 && <small>Pajak tercatat {rupiah(line.taxSen)}</small>}
      </div>)}</div>
      <dl className="receipt-totals"><div><dt>Subtotal</dt><dd>{rupiah(receipt.subtotalSen)}</dd></div>{mode === 'checkout' && <div><dt>PPN</dt><dd>0</dd></div>}{mode === 'reprint' && receipt.taxTotalSen !== null && receipt.taxTotalSen > 0 && <div><dt>Pajak tercatat</dt><dd>{rupiah(receipt.taxTotalSen)}</dd></div>}{receipt.discountSen > 0 && <div><dt>{mode === 'reprint' ? 'Diskon transaksi tercatat' : 'Diskon transaksi'}</dt><dd>−{rupiah(receipt.discountSen)}</dd></div>}<div className="receipt-grand"><dt>Total</dt><dd>{rupiah(receipt.grandTotalSen)}</dd></div>{receipt.paymentType === 'Cash' && <><div><dt>Uang Bayar</dt><dd>{rupiah(receipt.paidSen)}</dd></div><div><dt>Kembalian</dt><dd>{rupiah(receipt.changeSen)}</dd></div></>}</dl>
      <footer>{mode === 'reprint' ? <>Cetak ulang bukti transaksi{receipt.hasReturns && <><br />Sebagian/seluruh barang telah diretur. Lihat nota retur.</>}</> : <>Terima kasih atas kunjungan Anda<br />Harga Sudah Termasuk PPN</>}</footer>
    </article>
  </main>;
}
