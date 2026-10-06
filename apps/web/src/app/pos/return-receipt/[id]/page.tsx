import { notFound } from 'next/navigation';
import { PosError } from '@koperasi/domain/pos/sale';
import { readReturnDocument } from '@koperasi/application/sales/returns';
import { requirePagePermission } from '@/infrastructure/auth/page-guard';
import { returnReadRepository } from '@/infrastructure/sales/return-handlers';
import { ReceiptPrintButton } from '@/components/pos/ReceiptPrintButton';
import '../../receipt/[id]/receipt.css';

export const dynamic = 'force-dynamic';
const rupiah = (sen: number | null) => sen === null ? '—' : `Rp ${new Intl.NumberFormat('id-ID', { minimumFractionDigits: sen % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(sen / 100)}`;

/** 80 mm sales return note (nota retur). Same paper layout as the sales receipt. */
export default async function ReturnReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string | string[]; autoprint?: string | string[] }> }) {
  const auth = await requirePagePermission(['sales_return_view', 'sales_return_add']);
  if (auth.kind === 'forbidden') return <main className="receipt-message">Akses nota retur tidak diizinkan.</main>;
  if (auth.kind === 'unavailable') return <main className="receipt-message">Nota retur sementara tidak tersedia.</main>;
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const raw = Array.isArray(sp.returnTo) ? null : sp.returnTo;
  const returnTo = raw && /^\/sales\/returns(\/\d+)?$/.test(raw) ? raw : '/sales/returns';
  let document;
  try { document = await readReturnDocument(returnReadRepository(), auth.ctx.companyId, id); }
  catch (error) {
    if (error instanceof PosError && error.code === 'RETURN_NOT_FOUND') notFound();
    return <main className="receipt-message">Nota retur sementara tidak tersedia.</main>;
  }
  return <main className="receipt-screen">
    <nav className="receipt-actions"><a href={returnTo}>← Kembali ke retur</a><ReceiptPrintButton autoPrint={sp.autoprint === '1'} label="Cetak nota retur" /></nav>
    <article className="receipt-paper" aria-label={`Nota retur ${document.returnCode}`}>
      <header><h1>{document.storeName}</h1><p>{document.storeAddress}</p><p><strong>NOTA RETUR PENJUALAN</strong></p></header>
      <dl className="receipt-meta"><div><dt>No. Retur</dt><dd>{document.returnCode}</dd></div><div><dt>Waktu</dt><dd>{document.returnedAt}</dd></div>
        <div><dt>Struk Asal</dt><dd>{document.salesCode ?? '—'}</dd></div><div><dt>Kasir</dt><dd>{document.createdBy}</dd></div>
        {document.customerName !== 'UMUM' && <div><dt>Pelanggan</dt><dd>{document.customerName}</dd></div>}{document.memberNik && <div><dt>Nik</dt><dd>{document.memberNik}</dd></div>}
        <div><dt>Pengembalian</dt><dd>{document.refundMethod === 'Kredit' ? 'Potong tagihan kredit' : 'Tunai'}</dd></div><div><dt>Alasan</dt><dd>{document.reason || '—'}</dd></div></dl>
      <div className="receipt-lines"><div className="receipt-columns"><span>Item</span><span>Qty</span><span>Harga</span><span>Retur</span></div>{document.lines.map((line, index) => <div className="receipt-line" key={index}>
        <strong>{line.label}</strong><div><span>{line.quantity} × {rupiah(line.unitPriceSen)}</span><span>{rupiah(line.refundSen)}</span></div></div>)}</div>
      <dl className="receipt-totals"><div className="receipt-grand"><dt>Total Retur</dt><dd>{rupiah(document.totalSen)}</dd></div></dl>
      <footer>{document.refundMethod === 'Kredit' ? 'Nilai retur mengurangi tagihan kredit anggota bulan transaksi.' : 'Uang retur telah diterima pelanggan.'}<br /><br />Penerima ________ &nbsp; Kasir ________</footer>
    </article>
  </main>;
}
