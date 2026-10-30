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

/** Read-only KOSIPA access, derived from an active identity link (spec REQ-020/021). Write access is the separate list below. */
export const KOSIPA_CAPABILITIES = ['kosipa.member.view', 'kosipa.savings.view', 'kosipa.loan.view', 'kosipa.payroll.view', 'kosipa.store-credit.view'] as const;
export type KosipaCapability = (typeof KOSIPA_CAPABILITIES)[number];

/**
 * KOSIPA write vocabulary (kosipa-full-access 08 §3, TASK-110). NEVER derived from legacy menus or from an identity link: only an
 * explicit console grant (console_kosipa_grant, FD-16) confers one, and each also needs its view capability (KOSIPA_WRITE_REQUIRES).
 */
export const KOSIPA_WRITE_CAPABILITIES = [
  'kosipa.master.manage',
  'kosipa.member.create', 'kosipa.member.update', 'kosipa.member.status', 'kosipa.member.limits', 'kosipa.member.pii',
  'kosipa.deduction.manage', 'kosipa.request.decide',
  'kosipa.savings.prepare', 'kosipa.savings.approve', 'kosipa.savings.reverse',
  'kosipa.loan.prepare', 'kosipa.loan.approve', 'kosipa.loan.disburse', 'kosipa.loan.settle', 'kosipa.loan.reverse',
  'kosipa.payroll.prepare', 'kosipa.payroll.approve',
  'kosipa.exit.prepare', 'kosipa.exit.approve',
  'kosipa.shu.prepare', 'kosipa.shu.approve',
  'kosipa.config.manage',
] as const;
export type KosipaWriteCapability = (typeof KOSIPA_WRITE_CAPABILITIES)[number];

const area = (prefix: string): KosipaCapability =>
  prefix === 'savings' || prefix === 'deduction' || prefix === 'request' ? 'kosipa.savings.view'
    : prefix === 'loan' ? 'kosipa.loan.view' : prefix === 'payroll' ? 'kosipa.payroll.view' : 'kosipa.member.view';
/** The view capability every write capability additionally requires (08 §3 "Requires also"). */
export const KOSIPA_WRITE_REQUIRES: Readonly<Record<KosipaWriteCapability, KosipaCapability>> =
  Object.fromEntries(KOSIPA_WRITE_CAPABILITIES.map((cap) => [cap, area(cap.split('.')[1])])) as Record<KosipaWriteCapability, KosipaCapability>;

/**
 * Grantable today = capabilities whose native commands exist. FA-01 ships the reference-master commands only, so no financial
 * capability can be granted ahead of its command, its decisions (FD-xx) and its cutover gates.
 */
export const GRANTABLE_KOSIPA_CAPABILITIES: readonly KosipaWriteCapability[] = ['kosipa.master.manage'];

/**
 * Risky action, NOT derived from legacy menus: exporting aggregate KOSIPA reports. It is granted only by an explicit deployment policy
 * (feature flag + allow-list of console user ids, see infrastructure/console/export-config.ts) and ALWAYS requires the matching view capability too.
 * Being allowed to view a report (or one member) never confers the right to export it.
 */
export const EXPORT_CAPABILITIES = ['kosipa.report.export'] as const;
export type ExportCapability = (typeof EXPORT_CAPABILITIES)[number];

/** Read-only SYNTHETIC Warehouse preview (no Gudang connection exists). Granted only by the deployment flag on top of `toko.inventory.warehouse`. */
export const WAREHOUSE_CAPABILITIES = ['warehouse.preview.view'] as const;
export type WarehouseCapability = (typeof WAREHOUSE_CAPABILITIES)[number];

/**
 * Console administration. `iam.link.manage` = may create/revoke console<->KOSIPA identity links. `iam.kosipa.grant` = may grant/revoke
 * KOSIPA write capabilities: iam.link.manage AND an explicit deployment allow-list (KOSIPA_GRANT_ADMIN_USER_IDS), never by role alone.
 */
export const IAM_CAPABILITIES = ['iam.link.manage', 'iam.kosipa.grant'] as const;
export type IamCapability = (typeof IAM_CAPABILITIES)[number];

export type Capability = TokoCapability | KosipaCapability | KosipaWriteCapability | ExportCapability | WarehouseCapability | IamCapability;
export const ALL_CAPABILITIES: readonly Capability[] = [...TOKO_CAPABILITIES, ...KOSIPA_CAPABILITIES, ...KOSIPA_WRITE_CAPABILITIES, ...EXPORT_CAPABILITIES, ...WAREHOUSE_CAPABILITIES, ...IAM_CAPABILITIES];
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

/**
 * Console administration: the legacy `users_edit` permission AND a branch chooser (role <= 2). Linking a staff account to
 * KOSIPA exposes member financial data, so ordinary branch staff with users_edit are deliberately excluded.
 */
export const IAM_PERMISSION_SLUGS = ['users_edit'] as const;
export function iamCapabilities(granted: ReadonlySet<string>, canSwitchBranch: boolean): Set<Capability> {
  return new Set<Capability>(canSwitchBranch && granted.has('users_edit') ? ['iam.link.manage'] : []);
}

/** Capabilities that make a user more than a cashier; their absence routes a fresh login straight to /pos. */
const MANAGEMENT: readonly Capability[] = ['toko.products.view', 'toko.inventory.view', ...KOSIPA_CAPABILITIES, ...IAM_CAPABILITIES];

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
