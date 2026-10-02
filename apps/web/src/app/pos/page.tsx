import { PosScreen } from "@/components/pos/PosScreen";
import { demoMembers } from "@/components/pos/fixtures";
import { listCatalogCategories, searchCatalog } from "@koperasi/application/pos/catalog";
import type { PosCategory, PosProduct, PosSession } from "@/features/pos/types";
import { readRegister } from "@koperasi/application/pos/register";
import { requirePagePermission } from "@/infrastructure/auth/page-guard";
import { ProductReadError } from "@koperasi/domain/inventory";

export const dynamic = "force-dynamic";

function Notice({ title, text }: { title: string; text: string }) {
  return <main className="login-shell"><section className="login-card"><h1>{title}</h1><p>{text}</p></section></main>;
}

export default async function PosPage() {
  // Guard FIRST: no session -> /login; no sales_add -> notice; any database failure -> notice (never treated as logged in).
  const auth = await requirePagePermission("sales_add");
  if (auth.kind === "forbidden") return <Notice title="Akses ditolak" text="Akun Anda tidak memiliki izin untuk POS." />;
  if (auth.kind === "unavailable") return <Notice title="Layanan tidak tersedia" text="POS belum dapat dibuka. Coba lagi nanti." />;

  const { ctx, services, catalog } = auth;
  let session: PosSession;
  try {
    const [register, company, companies] = await Promise.all([
      readRegister(services.deps, ctx),
      services.deps.companies.findActive(ctx.companyId),
      ctx.canSwitchBranch ? services.deps.companies.listActive() : Promise.resolve([]),
    ]);
    session = {
      userName: ctx.userName, branchName: company?.name ?? "Cabang", companyId: ctx.companyId, canSwitchBranch: ctx.canSwitchBranch,
      companies, csrfToken: services.keys.csrfToken(ctx.sidHash),
      register: { open: register.open ? { noref: register.open.noref, noKasir: register.open.noKasir, openedOn: register.open.openedOn, stale: register.open.stale } : null, multiple: register.warnings.length > 0 },
    };
  } catch {
    return <Notice title="Layanan tidak tersedia" text="POS belum dapat dibuka. Coba lagi nanti." />;
  }

  let products: PosProduct[] = [];
  let categories: PosCategory[] = [];
  let failed = false;
  try {
    [products, categories] = await Promise.all([
      searchCatalog(catalog, { companyId: ctx.companyId }),
      listCatalogCategories(catalog, { companyId: ctx.companyId }),
    ]);
  } catch (error) {
    failed = true;
    console.error(`[pos] initial catalog load failed: ${error instanceof ProductReadError ? error.code : "UNEXPECTED"}`);
  }
  return <PosScreen products={products} categories={categories} members={demoMembers} session={session} catalogStatus={failed ? "error" : "ready"} />;
}
