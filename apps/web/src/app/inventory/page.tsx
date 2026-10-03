import { InventoryScreen } from "@/components/inventory/InventoryScreen";
import { requirePagePermission } from "@/infrastructure/auth/page-guard";
import { inventoryWritesAvailable } from "@/infrastructure/inventory/services";
import type { PosSession } from "@/features/pos/types";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  let auth = await requirePagePermission("inventory_so");
  if (auth.kind === "forbidden") auth = await requirePagePermission("inventory_view");
  if (auth.kind === "forbidden") {
    return <main className="login-shell"><section className="login-card"><h1>Akses ditolak</h1><p>Akun Anda tidak memiliki izin Warehouse &amp; Stock Opname.</p></section></main>;
  }
  if (auth.kind === "unavailable") return <main className="login-shell"><section className="login-card"><h1>Layanan tidak tersedia</h1><p>Inventory belum dapat dibuka. Coba lagi nanti.</p></section></main>;
  const { ctx, services } = auth;
  let session: PosSession;
  let capabilities: { stockOpname: boolean; warehouse: boolean; writes: boolean };
  try {
    const [company, companies, stockOpname, warehouse, user] = await Promise.all([
      services.deps.companies.findActive(ctx.companyId),
      ctx.canSwitchBranch ? services.deps.companies.listActive() : Promise.resolve([]),
      services.deps.permissions.has(ctx.roleId, "inventory_so"),
      ctx.canSwitchBranch ? services.deps.permissions.has(ctx.roleId, "inventory_view") : Promise.resolve(false),
      services.deps.users.findById(ctx.userId),
    ]);
    session = {
      userName: ctx.userName, userLogin: user?.username, branchName: company?.name ?? "Cabang", companyId: ctx.companyId,
      userId: ctx.userId, canSwitchBranch: ctx.canSwitchBranch, companies,
      csrfToken: services.keys.csrfToken(ctx.sidHash), checkoutAvailable: false,
      canInventory: stockOpname || warehouse, register: { open: null, multiple: false },
    };
    capabilities = { stockOpname, warehouse, writes: inventoryWritesAvailable() };
  } catch {
    return <main className="login-shell"><section className="login-card"><h1>Layanan tidak tersedia</h1><p>Inventory belum dapat dibuka. Coba lagi nanti.</p></section></main>;
  }
  if (!capabilities.stockOpname && !capabilities.warehouse) return <main className="login-shell"><section className="login-card"><h1>Akses ditolak</h1><p>Akun Anda tidak memiliki izin Warehouse &amp; Stock Opname.</p></section></main>;
  return <InventoryScreen key={`${ctx.userId}:${ctx.companyId}`} session={session} capabilities={capabilities} />;
}
