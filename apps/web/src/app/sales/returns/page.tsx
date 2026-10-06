import { FileSearch, Search, Undo2 } from 'lucide-react';
import { PosError, businessDates } from '@koperasi/domain/pos/sale';
import { parseReturnListQuery, type ReturnListQuery } from '@koperasi/domain/sales/return';
import { listSalesReturns } from '@koperasi/application/sales/returns';
import Link from '@/components/sales/SalesLink';
import { SalesFeedback } from '@/components/sales/SalesFeedback';
import { PaymentMethodChip, formatSalesDate, formatSalesMoney as idr } from '@/components/sales/SalesChips';
import { requirePagePermission } from '@/infrastructure/auth/page-guard';
import { returnReadRepository } from '@/infrastructure/sales/return-handlers';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Retur Penjualan · Koperasi Suzuki Mart' };
type Search = Record<string, string | string[] | undefined>;

export default async function SalesReturnsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const auth = await requirePagePermission(['sales_return_view', 'sales_return_add']);
  if (auth.kind !== 'ok') return <main className="sales-workspace" id="pos-workspace"><SalesFeedback title={auth.kind === 'forbidden' ? 'Akses ditolak' : 'Layanan tidak tersedia'} text={auth.kind === 'forbidden' ? 'Akun Anda tidak memiliki izin melihat retur penjualan.' : 'Daftar retur belum dapat dibuka.'} retry={auth.kind === 'unavailable'} /></main>;
  const search = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  const today = businessDates(auth.services.deps.clock.now()).day;
  let query: ReturnListQuery; let invalid = false;
  try { query = parseReturnListQuery(params, today); }
  catch (error) { if (!(error instanceof PosError)) throw error; invalid = true; query = parseReturnListQuery(new URLSearchParams(), today); }
  let result: Awaited<ReturnType<typeof listSalesReturns>> | null = null;
  if (!invalid) {
    try { result = await listSalesReturns(returnReadRepository(), auth.ctx.companyId, query); }
    catch { auth.services.deps.log('sales_return_list_unavailable'); }
  }
  const pageHref = (page: number) => `/sales/returns?${new URLSearchParams({ from: query.from, to: query.to, ...(query.q ? { q: query.q } : {}), page: String(page) })}`;
  const pageCount = result ? Math.max(1, Math.ceil(result.pagination.total / query.pageSize)) : 1;
  return <main className="sales-workspace" id="pos-workspace" tabIndex={-1}>
    <div className="sales-title"><div><p className="sales-eyebrow"><Undo2 size={15} aria-hidden="true" />PENJUALAN</p><h2>Retur Penjualan</h2><p>Retur barang cabang aktif. Retur baru dibuat dari detail transaksi di Riwayat Transaksi.</p></div>
      {result && <span className="sales-count"><strong>{result.pagination.total.toLocaleString('id-ID')}</strong> retur ditemukan</span>}</div>
    <form className="sales-filters" method="get" action="/sales/returns"><fieldset className="sales-return-filters">
      <label className="sales-search-label">Cari nomor retur, struk, atau pelanggan<span className="sales-search-input"><Search size={15} aria-hidden="true" /><input name="q" defaultValue={invalid ? '' : query.q} maxLength={50} placeholder="RTN-…, nomor struk, nama" /></span></label>
      <label>Dari tanggal<input type="date" name="from" defaultValue={query.from} max={today} /></label>
      <label>Sampai tanggal<input type="date" name="to" defaultValue={query.to} max={today} /></label>
      <div className="sales-filter-actions"><button className="sales-primary" type="submit">Terapkan</button><Link className="sales-text-link" href="/sales/returns">Reset</Link></div>
    </fieldset>{invalid && <p className="sales-filter-error" role="alert">Filter tidak valid. Gunakan rentang tanggal maksimal 93 hari dan pencarian tanpa karakter khusus.</p>}</form>
    {!invalid && !result ? <SalesFeedback title="Retur belum dapat ditampilkan" text="Layanan sementara tidak tersedia. Coba muat kembali." retry />
      : result && result.rows.length === 0 ? <div className="sales-empty-state"><FileSearch size={32} aria-hidden="true" /><h3>Belum ada retur pada periode ini</h3><p>Retur dibuat dari halaman detail transaksi penjualan.</p><Link className="sales-secondary" href="/sales">Buka Riwayat Transaksi</Link></div>
      : result && <>
        <div className="sales-table-wrap" tabIndex={0} role="region" aria-label="Daftar retur penjualan"><table className="sales-table"><caption className="pos-sr-only">Retur penjualan cabang aktif</caption>
          <thead><tr><th scope="col">No. retur / waktu</th><th scope="col">Struk asal</th><th scope="col">Pelanggan</th><th scope="col">Pengembalian</th><th scope="col" className="sales-money">Nilai retur</th><th scope="col">Alasan</th><th scope="col">Pembuat</th></tr></thead>
          <tbody>{result.rows.map((row) => <tr key={row.returnId}>
            <td><Link className="sales-receipt-link" href={`/sales/returns/${row.returnId}`}>{row.returnCode}</Link><small>{row.returnedAt}</small></td>
            <td>{row.saleId && row.salesCode ? <Link className="sales-receipt-link" href={`/sales/invoice/${row.saleId}`}>{row.salesCode}</Link> : '—'}</td>
            <td><strong className="sales-customer">{row.customerName}</strong></td>
            <td><PaymentMethodChip value={row.refundMethod} /></td>
            <td className="sales-money"><strong>{idr(row.totalSen)}</strong></td><td>{row.reason || '—'}</td><td>{row.createdBy}</td>
          </tr>)}</tbody></table></div>
        <nav className="sales-pagination" aria-label="Halaman retur"><span>{formatSalesDate(query.from)} – {formatSalesDate(query.to)}<small>Halaman {query.page} dari {pageCount}</small></span><div>
          {query.page > 1 ? <Link href={pageHref(query.page - 1)}>Sebelumnya</Link> : <span aria-disabled="true">Sebelumnya</span>}
          {result.pagination.hasNext ? <Link href={pageHref(query.page + 1)}>Berikutnya</Link> : <span aria-disabled="true">Berikutnya</span>}</div></nav>
      </>}
  </main>;
}
