# Produk & Inventory Implementation Plan

Goal: interactive company-scoped product master using legacy tables and functions.
Architecture: guarded page/API -> application read port -> parameterized SELECT repository; client renders products, filters and native dialog in existing PosShell.
Tech: Next.js 16, React 19, existing Prisma 6.12, lucide-react, native CSS/dialog/CSV; no new dependencies.
Constraints: no table/DB changes, no writes, server items_view, trusted session company, preserve POS query behavior. Design: ../specs/products-inventory/design.md.

- [x] Add domain master-product projection, validated read use case and port. Write application tests first: invalid company/page/filter must reject before repository calls; valid search trims and passes scoped query.
- [x] Add guarded HTTP handler and SELECT repository. Tests first: missing session 401, missing items_view 403 before repository factory; companyId override ignored; DB errors safe 503; filtered query uses parameter values, count and pagination.
- [x] Add /api/products and /products composition, session canProducts capability, update POS/inventory sidebar permission reads. Keep schemas and legacy files untouched.
- [x] Build ProductsScreen and scoped CSS: filter toolbar, matching summaries, sortable table, last-read time, pagination, CSV current page, native detail dialog, legacy add/edit links based on permissions. Abort old requests, error retry and empty reset.
- [x] Run pnpm lint, pnpm typecheck, pnpm test and pnpm build. Exercise desktop/mobile browser, filters/detail/CSV/error recovery and permissions; inspect screenshots. Record actual evidence and limitations. No commit/push/deploy unless requested.
