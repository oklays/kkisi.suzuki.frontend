# POS / Kasir brownfield migration — Requirements

Status: DRAFT for operational migration. Latest POS UI foundation is authorized by the supplied continuation instructions and tracked in `ui-foundation.md`; no production writes are authorized. The original audit checkpoint was written from repository inspection when the requested skill was unavailable.

## Audit findings and scope
- Legacy app: `tokonew.kkisitb2.id/` CodeIgniter 3; config under `application/config/`, database semantics described in `docs/legacy-reference/04-database.md`. Do not expose credentials.
- Next.js: audit initially found no `package.json`; the new application is now bootstrapped in `apps/web/`; the existing documentation is retained in `docs/legacy-reference/`. POS is an inactive placeholder; no business features have been migrated.
- Approved reference exists: `prototype-mockup-web-dan-mobile/Koperasi Suzuki Mart - Web App.dc.html`, POS branch begins around line 248 (`isPOS`), with search/category/product grid and 440px cart panel. Contains mockup-only promo and six payment choices; approval/version provenance cannot be independently established. No older POS replacement was found in this file. Preserve unrelated pages.
- Existing planning: `SYSTEM_MAP.md`, `MIGRATION_MATRIX.md`, `MIGRATION_DEPENDENCY_GRAPH.md`, `DATA_OWNERSHIP.md`, `IMPLEMENTATION_BACKLOG.md`, `docs/migration/*`, `apps/web/*`.
- Legacy entry: `Pos::index` (`application/controllers/Pos.php`), calls `load_global()`, `permission_check('sales_add')`; view `application/views/pos.php`. Session: `inv_userid`, `company_id`, `no_kasir`, `buka_kasir`. `Pos::buka_toko`, `new_invoice`, `tutup_kasir` manage register and draft quotation.
- Controllers/models/helpers: `Pos.php`, `Print_pos.php`, `Login.php`, `Pos_model.php`, `MY_Controller.php`, `custom_helper.php` (`cek_buka_kasir`, `tagihan_anggota`); POS view JS must be characterized separately before adapter design.
- Tables observed on active paths: `db_company`, `db_users`, `db_roles`, `db_permissions`, `db_buka_kasir`, `db_sales`, `db_salesitems`, `db_cart`, `db_salespayments`, `db_items`, `db_stockentry`, `db_purchase`, `db_purchaseitems`, `db_purchasereturn`, `db_purchaseitemsreturn`, `db_salesreturn`, `db_salesitemsreturn`, `m_anggota`, and external `products` mirror. Reports aggregate sales/items; scope and accounting impact require live validation.

## Acceptance requirements
1. Preserve legacy PHP and shared DB schema; use staged single-writer cutover per company and coupled stock/sales tables; no simultaneous PHP/Next.js POS writes for the same branch.
2. POS access requires server-verified authenticated session, `sales_add`, company scope, and open register. Never accept identity/company/register from untrusted request payload.
3. Product discovery supports actual legacy searchable identifiers (name/code/barcode); keyboard barcode scanning remains usable. Fetch bounded result sets; map DB category names, do not invent taxonomy.
4. Product cards reflect approved mockup, show real image or deterministic category illustration, price and stock; zero-stock disabled. Cart quantity cannot exceed available stock in UI **and** is revalidated server-side at checkout.
5. Member lookup uses only identifiers proven by `Pos_model::getnik`, `getidcard`, `getnik_qr`; credit limit follows verified month/status semantics. Name/phone lookup in mockup is disabled until backed by supported queries.
6. Discounts/tax/rounding must be characterized from active view JS and PHP paths before implementation. Never use mockup's fixed `PPN 11%` as authority.
7. Wire only payment modes confirmed by active PHP POS path; label unsupported modes disabled. Never fabricate success.
8. Checkout must be transactional, idempotent server-side, stock-locked and company-scoped. Result must include persisted transaction number, date, cashier, member, authoritative total, payment method, and receipt lookup. Failures must rollback; PHP legacy lacks guaranteed transaction boundary and this is a safety improvement requiring parity review.
9. Approved mockup hierarchy and styling remain intact; use one icon system (existing app or Lucide), deterministic SVG fallbacks with `object-fit: contain`; no edits to unrelated mockup pages.
10. Search, cart, membership, total, payment, rollback, idempotency, stock, receipt and authorization tests must pass on staging before production writes are enabled.

## Open decisions (block checkout work)
- Confirm actual DB DDL and live stock correctness; `Pos_model::update_items_quantity()` recomputes stock from stockentry plus dated purchase/sales/returns and writes `products.current_stock`, not simply decrement + stockentry.
- Confirm active POS view's JS submits which endpoints, precise tax/discount rules and sale-mode (`db_cart` versus direct `db_salesitems`).
- Confirm member-required vs walk-in behavior; `Pos_model::pos_save()` dereferences `m_anggota` result without null check.
- Confirm PHP and other writer ownership for `products`, `db_items`, `orders`, and report caches.
- Confirm DB engine, indexes/unique invoice keys and safe idempotency strategy compatible with PHP; no schema changes until reviewed migration/rollback written.
