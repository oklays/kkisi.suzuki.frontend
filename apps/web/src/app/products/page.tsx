import { ProductsScreen } from '@/components/products/ProductsScreen';
import { requirePagePermission } from '@/infrastructure/auth/page-guard';
import type { PosSession } from '@/features/pos/types';
import { productWritesAvailable } from '@/infrastructure/products/services';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Produk & Inventory · Koperasi Suzuki Mart' };
function Notice({ title, text }: { title: string; text: string }) {
  return <main className="login-shell"><section className="login-card"><h1>{title}</h1><p>{text}</p></section></main>;
}
export default async function ProductsPage() {
  const auth = await requirePagePermission('items_view');
  if (auth.kind === 'forbidden') return <Notice title="Akses ditolak" text="Akun Anda tidak memiliki izin melihat produk." />;
  if (auth.kind === 'unavailable') return <Notice title="Layanan tidak tersedia" text="Daftar produk belum dapat dibuka. Coba lagi nanti." />;
  const { ctx, services } = auth;
  let session: PosSession;
  let capabilities: { add: boolean; edit: boolean; writes: boolean };
  try {
    const [company, companies, stockOpname, warehouse, add, edit, canCheckout, canSales] = await Promise.all([
      services.deps.companies.findActive(ctx.companyId),
      ctx.canSwitchBranch ? services.deps.companies.listActive() : Promise.resolve([]),
      services.deps.permissions.has(ctx.roleId, 'inventory_so'),
      ctx.canSwitchBranch ? services.deps.permissions.has(ctx.roleId, 'inventory_view') : Promise.resolve(false),
      services.deps.permissions.has(ctx.roleId, 'items_add'), services.deps.permissions.has(ctx.roleId, 'items_edit'),
      services.deps.permissions.has(ctx.roleId, 'sales_add'), services.deps.permissions.has(ctx.roleId, 'sales_view'),
    ]);
    session = { userId: ctx.userId, userName: ctx.userName, branchName: company?.name ?? 'Cabang', companyId: ctx.companyId,
      canSwitchBranch: ctx.canSwitchBranch, companies, csrfToken: services.keys.csrfToken(ctx.sidHash),
      checkoutAvailable: false, canInventory: stockOpname || warehouse, canProducts: true, canCheckout, canSales, register: { open: null, multiple: false } };
    capabilities = { add, edit, writes: productWritesAvailable() };
  } catch { return <Notice title="Layanan tidak tersedia" text="Daftar produk belum dapat dibuka. Coba lagi nanti." />; }
  return <ProductsScreen key={`${ctx.userId}:${ctx.companyId}`} session={session} capabilities={capabilities} />;
}
