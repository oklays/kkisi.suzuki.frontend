# Latest POS UI foundation — checkpoint plan

Scope authorized by the supplied continuation instructions: implement the approved
POS UI now, using isolated fixtures, while characterization and operational
integration remain pending. The approved design is the POS section of
`prototype-mockup-web-dan-mobile/Koperasi Suzuki Mart - Web App.dc.html`.

## Readiness

- Read all 8 `docs/migration/*.md` and all 11 `docs/legacy-reference/*.md`, plus
  `requirements.md`, `design.md`, and `tasks.md` in this spec. No root-level
  migration document copies exist in the current checkout.
- POS responsibilities: discover products, manage cart, identify members, display
  pricing/payment choices, eventually finalize and print sales.
- Target: thin `src/app/pos/page.tsx`, presentation in `src/components/pos/`,
  typed read projections in `src/application/pos/`; no browser DB access.
- Operational dependencies: authenticated server session, `sales_add`, trusted
  company context, open register, inventory, member credit, tax/pricing,
  sales/payments, stock/reporting side effects. None is connected in this phase.
- Product fields derive from documented `db_items` and `db_category`: ID, company,
  category ID/name, code, custom barcode, name, image, selling price, stock.
- Member identifiers: NIK / ID card / QR only; no invented name/phone query.
- Cash and legacy Kredit are distinct from bank credit cards. Selection in this
  phase is a preview only; QRIS, bank cards, wallet, payroll and combination disabled.
- Preserve single-writer ownership. No PHP, schema, DB writes, production
  authentication claim, persistence, receipt, payment or stock mutations.
- Known gaps: stock recomputation / external `products` mirror conflicts with
  earlier audit claims; active cart flow, member-required semantics, exact
  pricing/tax/rounding, DDL, idempotency and external writers need characterization.
  The catalog and validation checklist describe expected scenarios, not completed
  runtime verification. These gaps block operational checkout, not this UI.

## Design and implementation tasks

Approved geometry: 264px dark sidebar, 68px white header, flexible product
workspace, 440px cart at desktop widths; contained scroll regions and narrower
laptop adaptation. Colors: navy `#101828`, Suzuki blue `#003399`, red `#E20A17`,
canvas `#F7F8FA`, white and pale category tints. System sans-serif follows the
existing app without requiring a remote font. Reuse the supplied illustrations;
Lucide React provides the sole UI icon system.

- [x] Define typed presentation contracts and isolated product/member fixtures.
  Write Node tests first for ID/name/code/barcode filtering, category identity,
  stable illustration mapping, real-image preference, and stock-bounded preview
  cart quantities / removal / subtotal. Run `npm test` and observe missing-feature
  failure; implement helpers, then require all tests to pass.
- [x] Add reusable shell/header, search/category/card/grid/image/stock components.
  Derive filter categories from supplied category IDs; map illustration families
  separately. Unknown categories retain their identity and use `lainnya` art.
  Place the 30 SVGs in `public/illustrations/`. Supplied SVG wrappers have no
  image href; app copies use replacement vectors described below. Never use randomness.
- [x] Add transaction panel, exact fixture member lookup, quantity/removal/clear
  controls, disabled promotion, preview subtotal, uncalculated tax, payment
  selector and disabled checkout. No fixture credit-limit calculation or fake
  payment outcome. Loading/error and processing components accept explicit state.
- [x] Replace only `/pos` placeholder, and link it from the scaffold homepage.
  Keep demo status visible; fixture state is in memory and resets on refresh.
- [x] Verify `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
  Inspect rendered `/pos` in the browser at desktop and laptop sizes; verify
  search/category/barcode/add/stock/member/remove/clear/payment states and images.
- [x] Record actual component mapping, verification results, and limitations here
  and in checkpoint tracking. Preserve old audit documents and operational gates.

## Workspace

The root repository has no initial commit; `apps/web/`, docs, specs and mockup
are untracked existing workspace content. A Git worktree cannot contain this
baseline. Work in the requested `apps/web/` directory and preserve other files.
No commit, merge or deployment is part of this checkpoint.

## Completion evidence

Verified on 2026-09-29 against the production build served at
`http://127.0.0.1:3100/pos`. No commit, merge or deployment performed.

| Check | Result |
|---|---|
| `npm test` | PASS, 5 tests; includes all 30 SVGs having visible drawing content. Missing-helper and blank-asset failures were observed before fixes. |
| `npm run lint` | PASS, exit 0. |
| `npm run typecheck` | PASS, exit 0. |
| `npm run build` | PASS, exit 0; `/` and `/pos` statically prerendered. |
| `npm run test:browser` with locally installed Playwright | PASS against built app. |
| Browser widths | 1600×900, 1440×900, 1280×800, 1024×768, 390×844; no document horizontal overflow. |
| Browser assertions | Product render/image decode, name/code/barcode search, barcode Enter, category filtering, no-match state, duplicate-add merge, stock bounds, quantity/remove/clear/cancel, all three fixture member identifiers, member-not-found, Cash/Kredit selection, unsupported payments and checkout disabled, stable images and empty cart after refresh. |
| Browser errors / writes | No page errors or console errors; no non-GET requests. |
| Visual QA | Screenshots reviewed; repaired blank illustrations, then corrected cart controls overlapping the promotion row. Summary remains outside the scroll region, with checkout visible at desktop. |

Screenshots: `/private/tmp/ksm-pos-verification/pos-1440-empty.png`,
`pos-1440-cart.png`, and `pos-{1600,1440,1280,1024,390}.png`.
The optional browser runner is checked in at `apps/web/tests/pos-browser.mjs`;
setup and overrides are documented in `apps/web/README.md`. The browser connector
could not initialize, so the available local Playwright/Chromium was used.
Lucide 0.577.0 was restored from the cached official archive because the configured
registry was unreachable; package and lock entry match the archive integrity.

## Completion report

| Requested item | Evidence / outcome |
|---|---|
| 1. Documentation read | All 8 migration docs: SYSTEM_MAP, DATA_OWNERSHIP, MIGRATION_MATRIX, MIGRATION_DEPENDENCY_GRAPH, IMPLEMENTATION_BACKLOG, module-boundaries, characterization-tests, validation-checklist. All 11 numbered `docs/legacy-reference/` docs (00-index through 10-diagrams). All 3 POS specs and the supplied continuation instructions. Approved HTML POS section and its fixture/illustration definitions; illustration README/manifest; supporting POS image references. |
| 2. Documented assumptions | Products/categories are separate company-scoped read projections. Operational session/permission/register and member/credit rules belong on the server. Single-writer stock/sales ownership remains with legacy. Mockup tax/promotions/payment options do not establish business rules. |
| 3. Next.js files | Thin `src/app/pos/page.tsx`; homepage preview link in `src/app/page.tsx`; `src/application/pos/contracts.ts`; seven `src/components/pos/` files; 30 `public/illustrations/*.svg`; two `tests/*.mjs`; README; package/lock with Lucide and optional browser-test command. Spec status/tracking updated without rewriting audit docs. |
| 4. Components | `PosShell.tsx`: shell/header. `ProductCatalog.tsx`: search, category filter, grid/card, illustration, stock badge, loading/error/no-match states. `TransactionPanel.tsx`: member search, cart item/quantity, empty cart, promotion, price summary, payment selection, disabled/processing checkout, native clear dialog. `PosScreen.tsx`: preview UI state/composition. `preview.ts`: pure preview helpers; `fixtures.ts`: isolated example data; `pos.css`: scoped presentation styles. |
| 5. Mockup parity | Structural hierarchy, colors, desktop 264px sidebar / 440px cart, search, filter rail, cards, member/cart/promotion/total/payment/checkout order verified. Laptop/mobile adaptation verified. Intentional differences: honest preview/session labels, verified identifier concepts, no optional-member policy claim, uncalculated tax, disabled promotions/unsupported payments, explicit legacy Kredit choice. Exact raster-art parity remains unavailable because supplied SVGs are blank. Unrelated mockup sections untouched. |
| 6. Illustrations | Real image preferred; failed real URL falls back. Curated fixture indices mirror approved example-product mapping. Other products use stable ID hash modulo 6. Unknown category retains backend identity and gets `lainnya` art. All five families / six variants exist as standalone native vectors in app copies; original wrappers are preserved. |
| 7. Interactions | Name/code/barcode filtering; scanner focus and Enter to add exact code/barcode; categories; add/merge/increase/decrease/remove; decrement at one removes line; bounded fixture stock; low/zero-stock labels; exact fixture NIK/ID-card/QR lookup; member-not-found/remove; clear confirmation/cancel; Cash/Kredit preview selection; refresh clears state. |
| 8. Fixtures remaining | Nine example products/categories and one example member. Mockup's eight products plus a low-stock stationery example. No real person, live inventory, member limit, invoice number, online status, or register identity is claimed. Piece-count/whole-rupiah preview only; operational decimal precision remains a server contract decision. |
| 9. Deferred integrations | Auth/RBAC/company/register, bounded real catalog/stock, members/credit, authoritative tax/discount/rounding, checkout/payment/persistence/idempotency/receipt, stock mirrors and reporting. Loading/error/processing component states are presentation foundations; no artificial network delay or processing/success outcome is triggered by fixtures. |
| 10. Gaps | Earlier stock decrement/audit claims conflict with later recomputation/external-mirror findings. Active cart endpoints, tax/discount/rounding, member-required behavior, live DDL/engines/idempotency, external writers remain unresolved. Numbered docs are under `docs/legacy-reference/`, although older references omit `/docs/`; root migration copies do not exist. Supplied SVGs contain `<image>` with no href despite their README saying embedded PNG is present. Replacement vectors differ from intended raster art. |
| 11. Targeted legacy verification | None. No PHP source or runtime re-audit performed. Source checks were limited to the current Next.js app/framework guides, approved mockup and illustration assets. |
| 12. Lint | PASS. |
| 13. TypeScript | PASS. |
| 14. Production build | PASS. |
| 15. Next checkpoint | Authenticated read-only Product & Inventory integration: trusted company/session/permission/register context, bounded name/code/barcode queries, verified category/price/stock/image projections, staging evidence. Then cart/member/pricing, then checkout/persistence after operational characterization and single-writer gates. |
