# Produk & Inventory

Request: deliver an interactive Next.js product page following existing legacy functions and tables. Implementation is authorized by the user's request; proceed with reversible work in the clean active checkout.

## Evidence and scope

Legacy `Items_model::_get_datatables_query` lists master items without POS sellability exclusions, searches code/unit barcode/pack barcode/name/category/brand, filters category and brand, and joins db_category/db_brands/db_units/db_tax. `Items::ajax_list` displays db_items.stock, prices, discount, status and status_so; edit uses items/update/{id}, add uses items/add with items_edit/items_add. Existing Next.js POS search excludes inactive, locked and (on browse) zero-stock items, so it cannot supply the master list unchanged.

Use only SELECT against existing tables, including existing db_items.alert_qty (INT, pos-schema.sql). No schema/table creation, DB migration, write account or production mutation. No invented maximum-stock or per-item warehouse location. Page and API require items_view and derive company exclusively from validated session; branch switching reuses SessionControls. Add/edit, when allowed, open the existing HTTPS legacy forms in a new tab with an explicit label and independent legacy authentication/branch selection. No secret/session transfer.

## Requirements and design

- REQ-1: /products and a permission-aware sidebar link from POS and inventory. Guard page and API on the server before composition. Forbidden/unavailable notices fail closed.
- REQ-2: complete master list including inactive, SO-locked and empty-stock products. Debounced search, category/brand/status/stock filters, stable sorting and server pagination (10/25/50/100). Exact decimal price strings; null associations remain readable.
- REQ-3: matching-result summary (products, active, low stock, empty stock, SO), refresh, honest CSV export of current page with formula injection protection, row detail dialog, keyboard and mobile support. Loading, error/retry and empty/reset states. Abort obsolete requests and clear prior results while refreshing.
- REQ-4: existing SKU, barcode/pack barcode, category/brand/unit/type, prices/discount/tax, stock/alert quantity/status/SO displayed in table/detail. Low stock means positive stock <= alert_qty; empty includes zero/negative. Do not claim streaming or automatic synchronization; show last refresh time.
- REQ-5: reuse PosShell 80% scale, fonts, icons, session controls. Palette Suzuki blue #003399, ink #101828, canvas #f7f8fa, border #e2e5ea, amber #a15c08, green #087f5b. System sans headings/body; monospace SKU/barcodes; tabular numeric quantities. Signature: compact stock indicator alongside exact current/minimum values. Table on desktop, contained table scroll on mobile; native detail dialog with focus return/Escape.

Flow: page/API -> auth guard -> ReadMasterProducts -> MasterProductRepository -> Prisma SQL SELECT. Distinct read projection preserves the existing POS behavior.

## Verification and limits

Tests: application validation/normalization, HTTP unauthorized/permission/session-company/errors, repository parameterized SQL/filter/pagination including inactive/locked/zero rows, CSV safety and classification. Workspace lint/typecheck/tests/build. Browser checks use local application and read requests only, cover filters/detail/CSV/retry/branch and desktop/mobile overflow. No remote form submissions or deployment. Live website could not be fetched through web tool; local legacy source is the function reference. Read results are a snapshot, not an SSE feed.
