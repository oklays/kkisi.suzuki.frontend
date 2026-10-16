/**
 * Console capabilities: one server-derived vocabulary for navigation and page/API gates. A capability never grants
 * more than the existing legacy permission slugs do; handlers keep checking their own permission independently.
 */
export const TOKO_CAPABILITIES = [
  'toko.pos.checkout',
  'toko.sales.view',
  'toko.sales.payments',
  'toko.returns.view',
  'toko.returns.create',
  'toko.products.view',
  'toko.products.create',
  'toko.products.edit',
  'toko.inventory.view',
  'toko.inventory.so',
  'toko.inventory.warehouse',
] as const;

export type TokoCapability = (typeof TOKO_CAPABILITIES)[number];
/** KOSIPA/Warehouse/IAM capabilities are added only once their identity links and adapters exist (spec REQ-020/050). */
export type Capability = TokoCapability;
export type CapabilitySet = ReadonlySet<Capability>;

/** Every db_permissions slug the TOKO mapping reads; resolved in one batched query. */
export const TOKO_PERMISSION_SLUGS = [
  'sales_add', 'sales_view', 'sales_payment_view', 'sales_return_view', 'sales_return_add',
  'items_view', 'items_add', 'items_edit', 'inventory_so', 'inventory_view',
] as const;
export type TokoPermissionSlug = (typeof TOKO_PERMISSION_SLUGS)[number];

/**
 * Mirrors the gates of the existing pages exactly:
 * - /sales layout requires sales_view; payments additionally sales_payment_view;
 * - returns live inside the Sales area, so sales_view AND (sales_return_view OR sales_return_add);
 * - /products requires items_view; add/edit additionally items_add/items_edit;
 * - /inventory: stock opname needs inventory_so; the global warehouse master needs inventory_view AND a branch chooser
 *   (role <= 2), as in app/inventory/page.tsx.
 */
export function tokoCapabilities(granted: ReadonlySet<string>, canSwitchBranch: boolean): Set<Capability> {
  const has = (slug: TokoPermissionSlug) => granted.has(slug);
  const out = new Set<Capability>();
  if (has('sales_add')) out.add('toko.pos.checkout');
  if (has('sales_view')) {
    out.add('toko.sales.view');
    if (has('sales_payment_view')) out.add('toko.sales.payments');
    if (has('sales_return_view') || has('sales_return_add')) out.add('toko.returns.view');
    if (has('sales_return_add')) out.add('toko.returns.create');
  }
  if (has('items_view')) {
    out.add('toko.products.view');
    if (has('items_add')) out.add('toko.products.create');
    if (has('items_edit')) out.add('toko.products.edit');
  }
  const so = has('inventory_so');
  const warehouse = canSwitchBranch && has('inventory_view');
  if (so) out.add('toko.inventory.so');
  if (warehouse) out.add('toko.inventory.warehouse');
  if (so || warehouse) out.add('toko.inventory.view');
  return out;
}

/** Capabilities that make a user more than a cashier; their absence routes a fresh login straight to /pos. */
const MANAGEMENT: readonly Capability[] = ['toko.products.view', 'toko.inventory.view'];

export type LandingInput = { capabilities: CapabilitySet; consoleEnabled: boolean };

/**
 * Where a fresh login without an explicit `next` should land.
 * Console off: '/pos' (the pre-console behaviour, unchanged). Console on: cashier-focused users (checkout, optionally
 * history/returns, nothing else) go to '/pos'; everyone else to '/console'.
 */
export function postLoginLanding({ capabilities, consoleEnabled }: LandingInput): '/pos' | '/console' {
  if (!consoleEnabled) return '/pos';
  const cashierFocused = capabilities.has('toko.pos.checkout') && !MANAGEMENT.some((cap) => capabilities.has(cap));
  return cashierFocused ? '/pos' : '/console';
}
