import { parseSalesHistoryQuery, SalesHistoryError } from '@koperasi/domain/sales/history';
import { readSalesHistory } from '@koperasi/application/sales/history';
import { SalesScreen } from '@/components/sales/SalesScreen';
import { SalesFeedback } from '@/components/sales/SalesFeedback';
import { requirePagePermission } from '@/infrastructure/auth/page-guard';
import { PrismaSalesHistoryRepository } from '@/infrastructure/repositories/prisma-sales-history.repository';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Riwayat Transaksi · Koperasi Suzuki Mart' };
type Search = Record<string, string | string[] | undefined>;
function toSearchParams(search: Search): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  return params;
}

export default async function SalesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const auth = await requirePagePermission('sales_view');
  if (auth.kind !== 'ok') return <SalesFeedback title={auth.kind === 'forbidden' ? 'Akses ditolak' : 'Layanan tidak tersedia'} text="Riwayat transaksi belum dapat dibuka." retry={auth.kind === 'unavailable'} />;
  const { ctx, services } = auth;
  const search = await searchParams;
  const defaults = parseSalesHistoryQuery(new URLSearchParams(), services.deps.clock.now());
  let query;
  try { query = parseSalesHistoryQuery(toSearchParams(search), services.deps.clock.now()); }
  catch (error) {
    if (!(error instanceof SalesHistoryError)) throw error;
    return <SalesScreen query={defaults} rows={[]} total={0} rawFilters={Object.fromEntries(Object.entries(search).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value ?? '']))} invalidFilter={error.message} today={defaults.to} />;
  }
  let result: Awaited<ReturnType<typeof readSalesHistory>>;
  try {
    result = await readSalesHistory(new PrismaSalesHistoryRepository(), ctx.companyId, query);
  } catch {
    services.deps.log('sales_history_page_unavailable');
    return <SalesScreen query={query} rows={[]} total={0} today={defaults.to} unavailable />;
  }
  return <SalesScreen query={query} rows={result.items} total={result.pagination.total} today={defaults.to} />;
}
