# KOSIPA Multi-Format Export & KKISI Financial Document PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver multi-format server-side exports (`CSV`, `XLSX`, `PDF`) for all 5 KOSIPA reports, implement the KKISI Financial Document Standard PDF layout engine (`renderKosipaPdfDocument`), add 3 operational detail PDF exports (Loan Card, Payroll Member Slip, Savings Passbook), upgrade Public Savings Submission PDFs to `v3` (`kkisi-pss-a4/v3` & `kkisi-pss-wajib-a4/v3`), and wire accessible multi-format UI controls.

**Architecture:**
- `packages/domain/src/kosipa/xlsx.ts`: Zero-dependency OOXML `.xlsx` writer using `node:zlib` (`deflateRawSync`) + CRC32 ZIP builder, writing typed numeric cells (`<c t="n">`) for numbers/decimals and formula-neutralised `<c t="inlineStr">` for text, with frozen header row.
- `packages/domain/src/kosipa/pdf-document.ts`: Zero-dependency PDF 1.4 vector/text layout engine using standard Type1 fonts (`Helvetica`, `Helvetica-Bold`, `Courier`) with WinAnsi character width tables, Suzuki Blue (`#003399`) and Suzuki Red (`#E20A17`) masthead, KPI cards, key-value panels, provenance notices, right-aligned tabular numbers, zebra striping, automatic page breaks with repeating headers, and `Halaman X dari Y` footers.
- `packages/application/src/kosipa/report-export.ts`: Multi-format (`csv` | `xlsx` | `pdf`) report exports with backward-compatible `export*Csv` aliases.
- `packages/application/src/kosipa/document-pdf-export.ts`: Read-only operational document PDF exports (`exportLoanCardPdf`, `exportPayrollMemberSlipPdf`, `exportMemberSavingsPassbookPdf`) enforcing `kosipa.report.export` + module capability, rate limiting, `audit-before-read`, and NIK masking.
- `apps/web/src/infrastructure/public-savings/`: Add `kkisi-pss-a4/v3` and `kkisi-pss-wajib-a4/v3` while keeping `v1` and `v2` byte-identical.
- `apps/web/src/components/console/kosipa/ExportControl.tsx`: Accessible multi-format download toolbar and single-document PDF button (`min-height: 44px`, keyboard focusable, `role="status"` / `role="alert"`).

**Tech Stack:** TypeScript, Node.js (`node:test`, `node:zlib`, `node:crypto`), Next.js App Router, `pdf-lib` (Public Savings PNG signature embedding), `pdftotext` (layout verification in tests).

---

### Task 1: Zero-Dependency OOXML `.xlsx` Builder (`packages/domain/src/kosipa/xlsx.ts`)

**Files:**
- Create: `packages/domain/src/kosipa/xlsx.ts`
- Modify: `packages/domain/src/kosipa/index.ts`
- Test: `packages/domain/tests/kosipa-xlsx.test.mjs`

- [ ] **Step 1: Write failing tests in `packages/domain/tests/kosipa-xlsx.test.mjs`**
  Test ZIP magic bytes (`PK\x03\x04`), multi-sheet structure (`xl/workbook.xml`, `xl/worksheets/sheet1.xml`, `xl/worksheets/sheet2.xml`), numeric cells (`<c r="B2" s="2" t="n"><v>1250000.50</v></c>`), integer cells, formula neutralisation on dangerous strings (`=1+1` -> `'\t=1+1` inside `<is><t xml:space="preserve">`), XML special character escaping, and frozen top row (`<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>`).
- [ ] **Step 2: Run test to verify it fails**
  Run: `node --experimental-strip-types --test packages/domain/tests/kosipa-xlsx.test.mjs`
- [ ] **Step 3: Implement `packages/domain/src/kosipa/xlsx.ts` and export from `packages/domain/src/kosipa/index.ts`**
- [ ] **Step 4: Run test to verify it passes**
  Run: `node --experimental-strip-types --test packages/domain/tests/kosipa-xlsx.test.mjs`

---

### Task 2: KKISI Financial Document PDF Engine (`packages/domain/src/kosipa/pdf-document.ts`)

**Files:**
- Create: `packages/domain/src/kosipa/pdf-document.ts`
- Modify: `packages/domain/src/kosipa/index.ts`
- Test: `packages/domain/tests/kosipa-pdf-document.test.mjs`

- [ ] **Step 1: Write failing tests in `packages/domain/tests/kosipa-pdf-document.test.mjs`**
  Verify A4 Portrait and Landscape rendering, masthead title/subtitle/docMeta, KPI strip, key-value grid, callout box, table with right-aligned numbers and footer row, automatic multi-page continuation with repeated table headers (`(Lanjutan)`), and `Halaman X dari Y` footer verified via `pdftotext -layout`.
- [ ] **Step 2: Run test to verify it fails**
  Run: `node --experimental-strip-types --test packages/domain/tests/kosipa-pdf-document.test.mjs`
- [ ] **Step 3: Implement `packages/domain/src/kosipa/pdf-document.ts` and export from `packages/domain/src/kosipa/index.ts`**
- [ ] **Step 4: Run test to verify it passes**
  Run: `node --experimental-strip-types --test packages/domain/tests/kosipa-pdf-document.test.mjs`

---

### Task 3: Multi-Format Report Exports (`packages/application/src/kosipa/report-export.ts`)

**Files:**
- Modify: `packages/application/src/kosipa/report-export.ts`
- Modify: `packages/application/tests/kosipa-report-export.test.mjs`

- [ ] **Step 1: Write failing tests in `packages/application/tests/kosipa-report-export.test.mjs`**
  Test `?format=csv|xlsx|pdf` across all 5 reports (`exportLoanReport`, `exportPayrollReport`, `exportDataQuality`, `exportMembershipReport`, `exportSavingsMovement`), invalid format rejection (`FORMAT_INVALID` before rate-limit/audit/read), `.xlsx` content type and sheet contents, and `.pdf` content type and `pdftotext -layout` verification.
- [ ] **Step 2: Run test to verify it fails**
  Run: `node --experimental-strip-types --test packages/application/tests/kosipa-report-export.test.mjs`
- [ ] **Step 3: Update `packages/application/src/kosipa/report-export.ts` with multi-format support**
- [ ] **Step 4: Run test to verify it passes**
  Run: `node --experimental-strip-types --test packages/application/tests/kosipa-report-export.test.mjs`

---

### Task 4: Operational Document PDF Exports (`packages/application/src/kosipa/document-pdf-export.ts`)

**Files:**
- Create: `packages/application/src/kosipa/document-pdf-export.ts`
- Modify: `packages/application/package.json` (add `"./kosipa/document-pdf-export"` export entry)
- Test: `packages/application/tests/kosipa-document-pdf-export.test.mjs`

- [ ] **Step 1: Write failing tests in `packages/application/tests/kosipa-document-pdf-export.test.mjs`**
  Test `exportLoanCardPdf`, `exportPayrollMemberSlipPdf`, and `exportMemberSavingsPassbookPdf` for:
  - Capability gates (`kosipa.report.export` + module view capability)
  - Rate limit (`EXPORT_RATE_LIMITED` + denied audit)
  - `audit-before-read` (audit failure prevents any DB read)
  - `NOT_FOUND` when document/member does not exist
  - Masked NIK (`***12`) and complete financial sections verified via `pdftotext -layout`
- [ ] **Step 2: Run test to verify it fails**
  Run: `node --experimental-strip-types --test packages/application/tests/kosipa-document-pdf-export.test.mjs`
- [ ] **Step 3: Implement `packages/application/src/kosipa/document-pdf-export.ts` and register in `packages/application/package.json`**
- [ ] **Step 4: Run test to verify it passes**
  Run: `node --experimental-strip-types --test packages/application/tests/kosipa-document-pdf-export.test.mjs`

---

### Task 5: Public Savings Submission PDF v3 (`kkisi-pss-a4/v3` & `kkisi-pss-wajib-a4/v3`)

**Files:**
- Modify: `apps/web/src/infrastructure/public-savings/pdf-templates.ts`
- Modify: `apps/web/src/infrastructure/public-savings/artifacts.ts`
- Modify: `apps/web/tests/public-savings-pdf-versions.test.mjs`
- Modify: `apps/web/tests/public-savings-artifacts.test.mjs`
- Modify: `apps/web/tests/public-savings-integration.test.mjs`

- [ ] **Step 1: Update tests in `apps/web/tests/public-savings-pdf-versions.test.mjs` and `apps/web/tests/public-savings-artifacts.test.mjs` for `v3`**
  Keep all `v1` frozen byte-identical tests and `v2` tests intact; add `v3` (`kkisi-pss-a4/v3`, `kkisi-pss-wajib-a4/v3`) tests verifying layout, amounts, Terbilang, signature PNG embedding, and SHA-256 footer.
- [ ] **Step 2: Run tests to verify new `v3` assertions fail first**
  Run: `node --experimental-strip-types --test apps/web/tests/public-savings-pdf-versions.test.mjs apps/web/tests/public-savings-artifacts.test.mjs`
- [ ] **Step 3: Implement `v3` in `pdf-templates.ts` and `artifacts.ts`**
- [ ] **Step 4: Run tests to verify all `v1`, `v2`, and `v3` tests pass**
  Run: `node --experimental-strip-types --test apps/web/tests/public-savings-pdf-versions.test.mjs apps/web/tests/public-savings-artifacts.test.mjs`

---

### Task 6: API Routes, HTTP Handlers, & Console UI Controls (`apps/web`)

**Files:**
- Modify: `apps/web/src/infrastructure/console/kosipa-http.ts`
- Modify: `apps/web/src/infrastructure/console/report-handlers.ts`
- Create: `apps/web/src/infrastructure/console/document-pdf-handlers.ts`
- Create: `apps/web/src/app/api/kosipa/loans/[docNo]/pdf/route.ts`
- Create: `apps/web/src/app/api/kosipa/payroll/[docNo]/anggota/[nik]/pdf/route.ts`
- Create: `apps/web/src/app/api/kosipa/savings/[memberId]/pdf/route.ts`
- Modify: `apps/web/src/components/console/kosipa/ExportControl.tsx`
- Modify: `apps/web/src/app/console/kosipa/kosipa.css`
- Modify: `apps/web/src/app/console/kosipa/pinjaman/[docNo]/page.tsx`
- Modify: `apps/web/src/app/console/kosipa/payroll/[docNo]/anggota/[nik]/page.tsx`
- Modify: `apps/web/src/app/console/kosipa/simpanan/[id]/page.tsx`
- Modify: `apps/web/tests/console-reports-export-http.test.mjs`

- [ ] **Step 1: Add HTTP tests in `apps/web/tests/console-reports-export-http.test.mjs` for `?format=xlsx`, `?format=pdf`, `?format=invalid`, and the 3 document PDF handlers**
- [ ] **Step 2: Run test to verify it fails**
  Run: `node --experimental-strip-types --test apps/web/tests/console-reports-export-http.test.mjs`
- [ ] **Step 3: Implement `kosipa-http.ts`, `report-handlers.ts`, `document-pdf-handlers.ts`, API routes, `ExportControl.tsx`, `kosipa.css`, and detail page buttons**
- [ ] **Step 4: Run all tests, lint, and typecheck across workspaces**
  Run: `pnpm check`
