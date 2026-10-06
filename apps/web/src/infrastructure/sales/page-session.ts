import type { PageAuth } from '../auth/page-guard';
import type { PosSession } from '@/features/pos/types';

export async function buildSalesSession({ ctx, services }: Pick<Extract<PageAuth, { kind: 'ok' }>, 'ctx' | 'services'>): Promise<PosSession> {
  const [company, companies, canCheckout, canViewPayments, canProducts, stockOpname, warehouse, canReturns] = await Promise.all([
    services.deps.companies.findActive(ctx.companyId),
    ctx.canSwitchBranch ? services.deps.companies.listActive() : Promise.resolve([]),
    ctx.hasPermission('sales_add'), ctx.hasPermission('sales_payment_view'), ctx.hasPermission('items_view'),
    ctx.hasPermission('inventory_so'), ctx.canSwitchBranch ? ctx.hasPermission('inventory_view') : Promise.resolve(false), ctx.hasPermission('sales_return_view'),
  ]);
  return { userId: ctx.userId, userName: ctx.userName, branchName: company?.name ?? 'Cabang', companyId: ctx.companyId,
    canSwitchBranch: ctx.canSwitchBranch, companies, csrfToken: services.keys.csrfToken(ctx.sidHash), checkoutAvailable: false,
    canCheckout, canSales: true, canReturns, canViewPayments, canProducts, canInventory: stockOpname || warehouse,
    register: { open: null, multiple: false } };
}
