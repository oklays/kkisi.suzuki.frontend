# Current state: POS and inventory enhancement

Source request: `docs/migration/prompts.md`, read on 2026-10-03. The user explicitly requests specifications followed immediately by implementation; no additional specification approval gate is needed.

## Confirmed implementation

- `apps/web/src/components/pos/PosScreen.tsx` owns a user/company/register-scoped browser cart, scanner and catalog. `TransactionPanel.tsx` renders member lookup, the small cart, totals and guarded/idempotent checkout. Successful lookup sets the member but leaves payment Cash; removing it resets Cash.
- `ProductCatalog.tsx` renders category buttons. `packages/application/src/pos/contracts.ts` caps reads at 24. `app/pos/page.tsx` calls the session permission guard before catalog/register reads. API handlers derive branch from the session; prices, member limits and stock are rechecked in the checkout transaction.
- `PosShell.tsx` disables Warehouse & Stock Opname. No inventory management page/API/use case currently exists. The monorepo uses domain → application → app-owned persistence/presentation with pnpm 10, Next 16, React 19, Prisma 6.12 and Node's built-in test runner.
- Stock/warehouse writes remain legacy-owned in operational environments. POS/register write clients only permit named local staging targets, distinct read/write users and explicit enable flags. This change must preserve that boundary.
- Existing receipt changes in the checkout are user work and outside this change. Do not revert/stage them. No commit, push or deployment is requested.

## Targeted legacy research and schema evidence

Read documentation first: `docs/legacy-reference/02-modules.md`, `04-database.md`, `05-data-flow.md`, `06-business-rules.md`, `docs/migration/DATA_OWNERSHIP.md`, `module-boundaries.md` and `POS_DB_INTEGRATION_IMPLEMENTATION.md`. Targeted verification: `application/controllers/Inventory.php` (`add_so_ajax`, `approve`), `models/Inventory_model.php` (`save_items`), `models/Warehouse_model.php` and `models/Pos_model.php::update_items_quantity` under `tokonew.kkisitb2.id`.

SELECT-only information_schema inspection against the configured local source-schema copy confirmed:

| Table | Actual structure / behavior |
| --- | --- |
| `db_warehouse` | Global `id, warehouse_name varchar(100), mobile varchar(20), email varchar(100), status int`; **no company_id or address**. |
| `db_inventory_so` | Company-scoped header, `doc_status int` (0 draft, 1 approved); period, dates, remarks, creator fields. |
| `db_inventory_so_dtl` | `so_id,item_id`, barcode/name snapshots; signed INT system/actual/adjustment quantities, double(18,2) cost/subtotal; note, status, konsinyasi, expire, item_type, creator fields. |
| `db_stockentry` | Signed INT qty, datetime entry_date, item/company/status; note enum includes `Penyesuaian`; **no type/reference_id/created_date**. |
| `db_items_stock` | Not present in inspected schema. No warehouse balance relationship exists. |

All relevant tables are InnoDB. Confirmed permission slugs: `inventory_so`, `inventory_stock`, `inventory_view`; no warehouse-specific slug exists. Warehouse legacy code lacks adequate global authorization and uses interpolated SQL. SO draft locking is commented out. Legacy approval sets status and adjusts detail quantities for date-range sales; it does not implement the stock/audit replacement claimed by the summary docs. The legacy stock helper sums active stockentry quantities plus purchasing/returns minus sales. These discrepancies are resolved explicitly in design; legacy code is not changed.

## Scope interpretation

The request refers to both a right and left small cart panel. The actual transaction panel is on the right: move its item list to the center, keep member/discount/totals/payment there, and retain the left navigation. Initial tab is Product; a successful barcode scan opens Keranjang. Warehouse is a global master, not per-location stock. Operational cutover, transfer inventory, purchasing, expiry batch management and spreadsheet export are outside this phase. No queues/workers are involved.
