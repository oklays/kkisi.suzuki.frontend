# Verification — 5 October 2026

This is the original read-only checkpoint. The subsequent native editor and local writer activation supersede its edit-related operational limits: see [edit-verification.md](edit-verification.md).

Delivered /products and /api/products, plus permission-aware navigation from POS/inventory. Product functions were referenced from the local legacy Items controller/model/view; fetching the public HTTPS website with the web tool was unavailable. Legacy add/edit URLs are source-confirmed, but remote form submissions were not tested.

## Evidence

- `pnpm lint`: exit 0; five existing warnings in TransactionPanel, receipt repository and register test. No new-file warnings.
- `pnpm typecheck`: exit 0. Fixed two pre-existing scan errors in PosScreen: nullable barcode matching and an optional lookup result. These are a null guard and a type annotation; checkout behavior is unchanged.
- `pnpm test`: exit 0; domain 15/15, application 16/16, web 153 passing with 40 opt-in DB tests skipped. Total 184 passing, zero failures.
- `pnpm build`: exit 0; /products and /api/products emitted as dynamic routes.
- `git diff --check`: clean.
- Read-only local DB inspection confirmed db_items.alert_qty is INT and expire_date is DATE. New repository SELECT against existing local schema returned 8,605 products for company 2, 10 on the requested page, including 6,500 empty-stock products. No table/schema/data writes.
- `node apps/web/tests/products-browser.mjs`: exit 0 using an existing ignored local test fixture on http://127.0.0.1:3000. Browser verified sidebar current state, real paginated master catalog, session-company override rejection, barcode search, category filter, empty-stock filter, empty result/reset, detail dialog/Escape/focus return, CSV header + 25 product rows, safe failed read/retry and disabled export during errors.
- Six viewport checks: 1440x900, 1280x720, 1024x768, 768x1024, 390x844 and 320x700. No document horizontal overflow or runtime exceptions. Detail dialog fits each viewport. Desktop, 390 px list and 390 px detail screenshots visually inspected. The table scrolls within its container on small screens.

## Requirement coverage

| Requirement | Implementation | Verification |
| --- | --- | --- |
| REQ-1 permission and navigation | products page/handler; PosShell; POS/inventory capability reads | HTTP 401/403 tests; browser authorized navigation |
| REQ-2 full master list and controls | ReadMasterProducts; PrismaMasterProductRepository; ProductsScreen | query validation and parameterization tests; real local SELECT; browser pagination/search/category |
| REQ-3 summary/detail/export/states | ProductsScreen; product-view.ts | stock/CSV safety tests; browser detail/Escape/focus/CSV/error/retry/reset |
| REQ-4 actual legacy fields | SELECT joins/projection; table/detail | schema inspection; Decimal mapping and inactive/locked/empty repository test; browser empty-stock filter |
| REQ-5 responsive existing shell | products.css; PosShell reuse | six viewport checks; screenshot review; native dialog keyboard test |

## Operational limits

Next.js does not save master items, toggle product status/SO or adjust stock from this page. Authorized add/edit buttons open legacy forms, which require their own authenticated session and correct branch. Export is explicitly the current page. Stok is a refreshable snapshot, not a streaming feed. Min stock uses alert_qty; no max stock/warehouse location is invented. No dependencies, Prisma mapping/schema changes, DB migration, commit, push or deployment were performed.

Repeat UI checks only with an authorized local test fixture: `PRODUCTS_BROWSER_FIXTURE=/absolute/path/to/ignored-fixture.json node apps/web/tests/products-browser.mjs`. Fixture shape is username/password; never commit or print it. The test logs into the local app and reads products; it does not submit product mutations or remote forms.
