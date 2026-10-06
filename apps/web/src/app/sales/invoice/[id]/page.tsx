import { notFound } from 'next/navigation';
import { readSaleDetail } from '@koperasi/application/sales/history';
import { SalesDetail } from '@/components/sales/SalesDetail';
import { SalesFeedback } from '@/components/sales/SalesFeedback';
import { requirePagePermission } from '@/infrastructure/auth/page-guard';
import { PrismaSalesHistoryRepository } from '@/infrastructure/repositories/prisma-sales-history.repository';
import { SalesHistoryError } from '@koperasi/domain/sales/history';
import { readReturnContext } from '@koperasi/application/sales/returns';
import { returnReadRepository } from '@/infrastructure/sales/return-handlers';

export const dynamic = 'force-dynamic';
type Search = Record<string, string | string[] | undefined>;
export default async function SalesInvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const auth = await requirePagePermission('sales_view');
  if (auth.kind !== 'ok') return <SalesFeedback title={auth.kind === 'forbidden' ? 'Akses ditolak' : 'Layanan tidak tersedia'} text="Detail transaksi belum dapat dibuka." retry={auth.kind === 'unavailable'} />;
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const raw = search.linePage;
  const linePage = raw === undefined ? 1 : typeof raw === 'string' && /^[1-9]\d*$/.test(raw) ? Number(raw) : 0;
  if (Object.keys(search).some(key => !['linePage', 'returnTo'].includes(key)) || !Number.isSafeInteger(linePage) || linePage < 1 || (linePage - 1) * 50 > 100_000 || Array.isArray(search.returnTo)) {
    return <main className="sales-workspace" id="pos-workspace"><SalesFeedback title="Permintaan tidak valid" text="Parameter halaman transaksi tidak valid. Pilih kembali transaksi dari riwayat." /></main>;
  }
  let detail: Awaited<ReturnType<typeof readSaleDetail>>;
  let canViewPayments: boolean; let canViewReturns: boolean; let canCreateReturn: boolean;
  try {
    [detail, canViewPayments, canViewReturns, canCreateReturn] = await Promise.all([
      readSaleDetail(new PrismaSalesHistoryRepository(), auth.ctx.companyId, id, linePage, 50),
      auth.ctx.hasPermission('sales_payment_view'), auth.ctx.hasPermission('sales_return_view'), auth.ctx.hasPermission('sales_return_add'),
    ]);
  } catch (error) {
    if (error instanceof SalesHistoryError && error.code === 'NOT_FOUND') notFound();
    if (error instanceof SalesHistoryError && error.code === 'INVALID_INPUT') return <main className="sales-workspace" id="pos-workspace"><SalesFeedback title="Permintaan tidak valid" text="Nomor atau halaman transaksi tidak valid." /></main>;
    auth.services.deps.log('sales_detail_page_unavailable');
    return <main className="sales-workspace" id="pos-workspace"><SalesFeedback title="Detail belum dapat ditampilkan" text="Layanan sementara tidak tersedia. Filter riwayat Anda tetap tersimpan di tautan kembali." retry /></main>;
  }
  // Return facts are optional on this page: a failure hides the section instead of the whole transaction.
  let returns: { context: Awaited<ReturnType<typeof readReturnContext>>; canCreate: boolean } | null = null;
  if (canViewReturns || canCreateReturn) {
    try { returns = { context: await readReturnContext(returnReadRepository(), auth.ctx.companyId, id, auth.services.deps.clock.now()), canCreate: canCreateReturn }; }
    catch { auth.services.deps.log('sales_return_context_unavailable'); }
  }
  return <SalesDetail canViewPayments={canViewPayments} detail={detail} returnTo={search.returnTo ?? '/sales'} linePage={linePage} returns={returns} />;
}
