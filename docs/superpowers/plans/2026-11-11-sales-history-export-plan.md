# Sales History (`/sales`) Master Format Export (`PDF` & `.xlsx`) Implementation Plan

> **For agentic workers:** Use TDD (`test-driven-development`) to implement this plan task-by-task. Every production module must have a failing test written and run before implementation.

**Goal:** Deliver `Export PDF` and `Export (.xlsx)` controls on the POS/Kasir `Riwayat Transaksi` (`/sales`) page that generate the Master Format 6-sheet Excel workbook (with dynamic Excel formulas `=SUM`, `=COUNTA`, `=IF`, margin, ratios, Rupiah/integer/percent formats, merged banners, AutoFilter, and frozen panes) and the multi-section Executive PDF report, supporting both active-store (`scope=store`) and all-stores consolidated (`scope=all`, gated by `canSwitchBranch`) modes while respecting the active `/sales` filter query.

**Architecture:**
- `packages/domain/src/sales/export.ts`:
  - Query parser `parseSalesExportParams(params, now)` validating `format` (`xlsx` | `pdf`), `scope` (`store` | `all`), and delegating filter parsing to `parseSalesHistoryQuery`.
  - Pure aggregation & Master Format builders:
    - `buildSalesExportWorkbook(bundle)`: Zero-dependency OOXML `.xlsx` generator producing the 6 Master Format sheets (`Ringkasan Eksekutif`, `Rekap Harian`, `Riwayat Transaksi (Final)`, `Top Produk & Kategori`, `Rekap Belanja Anggota`, `Quotation & Catatan Audit`) with typed numeric cells, formula cells (`<f>...</f>` + cached `<v>...</v>`), merged title banners, AutoFilter, freeze panes, and Master Format styling (`styles.xml`).
    - `buildSalesExportPdf(bundle)`: Uses the zero-dependency PDF 1.4 layout engine (`renderKosipaPdfDocument` / custom sales executive spec) to render the multi-page A4 Executive & Transaction History PDF report.
- `packages/application/src/sales/export-history.ts`:
  - `exportSalesHistory(repo, actor, params, now)` use case enforcing `validCompany`, `scope === 'all'` -> `actor.canSwitchBranch` check (`FORBIDDEN` if false), calling `repo.exportBundle(...)`, and returning `{ filename, contentType, body }`.
- `apps/web/src/infrastructure/repositories/prisma-sales-history.repository.ts` & `apps/web/src/infrastructure/sales/handlers.ts` & `apps/web/src/app/api/sales/export/route.ts`:
  - `exportBundle` query on `PrismaSalesHistoryRepository` fetching filtered sales, member names (`m_anggota`), store names (`db_company`), item/category summaries (`db_salesitems` + `db_items` + `db_category`), and sales returns (`db_salesreturn`).
  - `handleSalesExport` HTTP handler with `guard(services, request, { permission: 'sales_view' })`, `sec-fetch-site: cross-site` protection, and binary attachment headers.
- `apps/web/src/components/sales/SalesExportActions.tsx`, `SalesScreen.tsx`, `apps/web/src/app/sales/page.tsx`, `sales.css`:
  - Client export toolbar on `/sales` with scope selector (`Toko Aktif` vs `Semua Toko` when `canSwitchBranch` is true) and `Export PDF` + `Export (.xlsx)` buttons.

---

### Task 1: Domain Sales Export Parser, 6-Sheet Master `.xlsx` Formula Engine, and Executive `.pdf` Builder (`packages/domain/src/sales/export.ts`)

**Files:**
- Create: `packages/domain/src/sales/export.ts`
- Modify: `packages/domain/package.json` (if subpath exports are listed)
- Test: `packages/domain/tests/sales-export.test.mjs`

- [ ] **Step 1: Write failing tests in `packages/domain/tests/sales-export.test.mjs`**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `packages/domain/src/sales/export.ts`**
- [ ] **Step 4: Run test to verify it passes**

---

### Task 2: Application Sales Export Use Case (`packages/application/src/sales/export-history.ts`)

**Files:**
- Create: `packages/application/src/sales/export-history.ts`
- Modify: `packages/application/src/sales/read-history.ts` / `packages/application/package.json`
- Test: `packages/application/tests/sales-export.test.mjs`

- [ ] **Step 1: Write failing tests in `packages/application/tests/sales-export.test.mjs`**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `packages/application/src/sales/export-history.ts`**
- [ ] **Step 4: Run test to verify it passes**

---

### Task 3: Web Repository, HTTP Handler, API Route, and UI Export Buttons (`apps/web`)

**Files:**
- Modify: `apps/web/src/infrastructure/repositories/prisma-sales-history.repository.ts`
- Modify: `apps/web/src/infrastructure/sales/handlers.ts`
- Create: `apps/web/src/app/api/sales/export/route.ts`
- Create: `apps/web/src/components/sales/SalesExportActions.tsx`
- Modify: `apps/web/src/components/sales/SalesScreen.tsx`
- Modify: `apps/web/src/app/sales/page.tsx`
- Modify: `apps/web/src/components/sales/sales.css`
- Test: `apps/web/tests/sales-history.test.mjs`

- [ ] **Step 1: Write failing tests in `apps/web/tests/sales-history.test.mjs` for `handleSalesExport` and UI rendering**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement repository method, handler, route, and UI components**
- [ ] **Step 4: Run full test suite, typecheck, and lint**

