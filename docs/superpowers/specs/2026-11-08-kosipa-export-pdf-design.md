# KOSIPA Export & PDF Document Redesign Specification

**Date:** 8 November 2026  
**Scope:** Export Data (CSV, Excel `.xlsx`, PDF) & Operational PDF Document Design in KOSIPA New (`apps/web` + `packages/*`), plus Legacy PDF/Export Audit Completion (`docs/audits/kosipa-import-export/`).  
**Antislop Mode:** `DURING` (Dials: `ENERGY 1` Calm/Authoritative Financial, `RHYTHM 2` Structured Asymmetric Summary + Tabular Grid, `MOTION 1` Static/Hover only).

---

## 1. Objective & Scope

Focus exclusively on **Data Export and PDF Document Generation** across KOSIPA (excluding Excel/CSV Import implementation):

1. **Audit Completion for Legacy Exports & PDFs:**
   - Document all 33 client-side DataTables exports (`XLSX`, `CSV`, `PDF`), 2 dormant server-side PhpSpreadsheet exports, and all **17 server-side FPDF document templates (`KOS-PDF-001` to `KOS-PDF-017`)** in `docs/audits/kosipa-import-export/`.
2. **Multi-Format Report Exports (`CSV`, `XLSX`, `PDF`) for the 5 Verified KOSIPA Reports:**
   - Loans Report (`/api/kosipa/reports/loans/export?format=csv|xlsx|pdf&tahun=YYYY`)
   - Payroll Report (`/api/kosipa/reports/payroll/export?format=csv|xlsx|pdf&tahun=YYYY`)
   - Data Quality Report (`/api/kosipa/reports/data-quality/export?format=csv|xlsx|pdf`)
   - Membership Report (`/api/kosipa/reports/membership/export?format=csv|xlsx|pdf`)
   - Savings Movements Report (`/api/kosipa/reports/savings-movements/export?format=csv|xlsx|pdf&tahun=YYYY`)
3. **Public Savings Submission PDF v3 Redesign (`kkisi-pss-a4/v3` & `kkisi-pss-wajib-a4/v3`):**
   - Preserve byte-identical rendering for historical `v1` and `v2` templates while upgrading new submissions to `v3` using the KKISI Financial Document Standard.
4. **Operational Document PDF Exports on Active KOSIPA New Detail Pages:**
   - **Kartu Pinjaman & Jadwal Angsuran PDF:** `GET /api/kosipa/loans/[docNo]/pdf` on `/console/kosipa/pinjaman/[docNo]`
   - **Slip Rincian Potongan Payroll Anggota PDF:** `GET /api/kosipa/payroll/[docNo]/anggota/[nik]/pdf` on `/console/kosipa/payroll/[docNo]/anggota/[nik]`
   - **Buku Mutasi / Rekening Koran Simpanan Anggota PDF:** `GET /api/kosipa/savings/[memberId]/pdf` on `/console/kosipa/simpanan/[id]`

---

## 2. Design Rationale (`antislop` R-31)

- **Why this palette?** Derived directly from `DESIGN.md` and `kosipa.css`: Suzuki Blue (`#003399`) for primary structural headers, Suzuki Red (`#E20A17`) as a 5% brand rule accent in the document masthead, and high-contrast slate neutrals (`#101828` primary ink, `#3E4652` body, `#737B87` muted labels, `#F7F8FA` zebra rows, `#D9DDE3` table borders) with semantic amber (`#FFF7E6` / `#B65B0A`) for data-integrity notices.
- **Why this layout?** Cooperative officers and members read financial PDFs to verify exact figures, statuses, and audit provenance at a glance. Each PDF opens with a two-column institutional masthead, a 3-to-4 card KPI summary strip, structured two-column key-value panels, and a right-aligned tabular ledger with repeating headers across pages.
- **Why this typography?** Standard embedded PDF fonts (`Helvetica`, `Helvetica-Bold`, `Courier` for SHA-256 hashes and document codes) guarantee zero external font-loading failures, deterministic byte output, and crisp tabular number alignment.
- **Why this spacing?** A 36pt page margin with 12pt section rhythm and 6pt row padding maximizes readable density on A4 pages while preventing cramped text or clipped numbers.
- **Why use cards?** KPI summary cards and two-column metadata boxes group related financial attributes (such as Old vs New Deduction, or Principal vs Installment Progress) so the eye does not hunt through a flat single-column list.
- **Why use icons?** Minimal functional icons (`Download`, `FileSpreadsheet`, `FileText`, `LoaderCircle`) on web export buttons distinguish file formats immediately alongside explicit Indonesian labels (`Unduh PDF`, `Unduh Excel`, `Unduh CSV`).

---

## 3. Architecture & Component Boundaries

### 3.1 Domain Layer (`packages/domain/src/kosipa/`)
1. **`xlsx.ts` (`xlsxDocument`):**
   - Pure, dependency-free OOXML `.xlsx` generator (ZIP store/deflate using Node `zlib.deflateRawSync`) producing a valid multi-sheet workbook (`xl/workbook.xml`, `xl/styles.xml`, `xl/worksheets/sheet1.xml`, `sheet2.xml`).
   - Supports typed cells:
     - Numeric integer and exact decimal (`{ decimal: string }`) written as `<c t="n" s="numStyle"><v>...</v></c>` with number format `#,##0.00` so Excel `SUM()` works natively (resolving `IE-ANO-028`).
     - Text strings neutralised via `neutralizeFormula()` and XML-escaped as `<c t="inlineStr"><is><t>...</t></is></c>` (resolving `IE-ANO-030`).
   - Freezes the header row (`<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>`) and auto-computes column widths.
2. **`pdf-document.ts` (`renderKosipaPdfDocument`):**
   - Deterministic `pdf-lib` layout engine implementing the **KKISI Financial Document Standard**:
     - Page sizes: A4 Portrait (`595.28 x 841.89`) and A4 Landscape (`841.89 x 595.28`).
     - **Masthead:** Top Suzuki Blue bar (`#003399`, 6pt) + Suzuki Red accent line (`#E20A17`, 2pt), institution title (`KOPERASI KARYAWAN PT INDOMOBIL SUZUKI INTERNATIONAL PLANT TAMBUN II`), document title, status pill badge, document reference, and UTC generation timestamp.
     - **KPI Metric Strip:** 2 to 4 equal-width cards with soft blue (`#E8F0FF`) or neutral (`#F7F8FA`) fills, label, primary figure, optional sub-note, and optional vector progress bar.
     - **Notice / Provenance Callout Box:** Amber (`#FFF7E6` fill, `#F4D8A9` border, `#854509` text) or info (`#F0F5FF` fill, `#DCE6FA` border, `#003399` text) callout boxes for `OFFICIAL_BALANCE_UNVERIFIED` and data-quality warnings.
     - **Two-Column Key-Value Grid:** Paired side-by-side cards with titled headers and aligned label/value rows.
     - **Auto-Paginating Financial Table:** Column width allocation, right-aligned numeric columns, automatic text wrapping within cells, zebra striping (`#F7F8FA`), bold summary/total rows, and automatic header repetition when a table spans multiple pages.
     - **Page Footer:** Drawn on every page with page numbering (`Halaman X dari Y`), document reference, source tables, and integrity note.

### 3.2 Application Layer (`packages/application/src/kosipa/`)
1. **`report-export.ts`:**
   - Adds `ExportFormat = 'csv' | 'xlsx' | 'pdf'` and `parseExportFormat(raw: unknown): ExportFormat` (defaults to `'csv'`, throws `KosipaError('FORMAT_INVALID')` on unknown values before rate-limit/audit/read).
   - `ExportFile` supports `contentType: 'text/csv; charset=utf-8' | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' | 'application/pdf'` and `body: string | Uint8Array`.
   - `EXPORT_MAX_PDF_BYTES = 4_000_000` and `EXPORT_MAX_XLSX_BYTES = 4_000_000` (while keeping `EXPORT_MAX_BYTES = 1_000_000` for CSV).
   - Extends `exportLoanReport`, `exportPayrollReport`, `exportDataQuality`, `exportMembershipReport`, and `exportSavingsMovement` (while preserving `export*Csv` functions with identical signatures and return types for 100% backward compatibility with existing tests).
2. **`document-pdf-export.ts`:**
   - Operational PDF exporters using the same security gate (`EXPORT_CAPABILITY` + module view capability, `WindowThrottle`, `audit-before-read`, and `maskIdentifier` for NIK):
     - `exportLoanCardPdf(deps, actor, { docNo })`: Reads loan detail & full schedule (up to bounded cap), renders Kartu Pinjaman & Jadwal Angsuran PDF.
     - `exportPayrollMemberSlipPdf(deps, actor, { docNo, nik })`: Reads member payroll breakdown & due installments reference, renders Slip Rincian Potongan Payroll Anggota PDF.
     - `exportMemberSavingsPassbookPdf(deps, actor, { memberId, params })`: Reads member savings summary & movement ledger, renders Buku Mutasi Simpanan Anggota PDF.

### 3.3 Infrastructure & Web Layer (`apps/web/src/`)
1. **Public Savings PDF v3 (`apps/web/src/infrastructure/public-savings/pdf-templates.ts` & `artifacts.ts`):**
   - Registers `'kkisi-pss-a4/v3'` (`renderer: 'pdf-lib-1.17.1/kkisi-pss-v3'`) and `'kkisi-pss-wajib-a4/v3'` (`renderer: 'pdf-lib-1.17.1/kkisi-pss-wajib-v3'`).
   - Updates `CURRENT_PDF_TEMPLATE = 'kkisi-pss-a4/v3'` and `WAJIB_PDF_TEMPLATE` to `'kkisi-pss-wajib-a4/v3'`.
   - Keeps the exact `v1` and `v2` rendering code untouched when `templateVersion` is `v1` or `v2`.
   - For `v3`, renders the new structured A4 document:
     - Official KKISI masthead with `PENGAJUAN / BELUM DISETUJUI` badge and reference box.
     - Side-by-side **Comparison Highlight Cards** (*Potongan Sebelumnya* vs *Potongan Baru yang Diajukan* in `#E8F0FF` highlight card) + full-width *Terbilang* & *Periode Efektif* banner.
     - Two-column **Data Anggota** & **Bukti Verifikasi + Tanda Tangan Digital** cards.
     - Framed **Pernyataan Persetujuan Anggota** section and **Segel Integritas Dokumen (SHA-256)** footer block.
2. **API Handlers & Routes (`apps/web/src/infrastructure/console/report-handlers.ts` & `/api/kosipa/...`):**
   - Updates `report-handlers.ts` to return binary `Uint8Array` or string `ExportFile` with accurate `Content-Type`, `Content-Disposition`, `Content-Length`, `Cache-Control: no-store`, and `X-Content-Type-Options: nosniff`.
   - Adds new GET routes:
     - `apps/web/src/app/api/kosipa/loans/[docNo]/pdf/route.ts`
     - `apps/web/src/app/api/kosipa/payroll/[docNo]/anggota/[nik]/pdf/route.ts`
     - `apps/web/src/app/api/kosipa/savings/[memberId]/pdf/route.ts`
3. **UI Components (`apps/web/src/components/console/kosipa/ExportControl.tsx`):**
   - Multi-format download bar supporting `Unduh PDF`, `Unduh Excel (.xlsx)`, and `Unduh CSV` with per-format loading indicator, accessible status/error feedback (`role="status"` / `role="alert"`), and support for single-PDF document download mode (`mode="pdf"` with custom label such as `Unduh Kartu Pinjaman (PDF)`).

---

## 4. Error Handling & Security Invariants

1. **Gate Order:** Cross-site check (`Sec-Fetch-Site: cross-site` -> `403`) -> Session & Capability check (`kosipa.report.export` AND module view capability -> `403 FORBIDDEN`) -> Input/Format/Filter validation (`400 FORMAT_INVALID` / `PERIOD_INVALID` / `DOC_NO_INVALID`) -> Rate limit (`429 EXPORT_RATE_LIMITED`, audited as `denied`) -> Audit log append (`audit-before-read`; if audit fails, zero financial rows are read) -> Bounded data read -> Size cap check (`EXPORT_TOO_LARGE`).
2. **PII Protection in Operational PDFs:** Member NIK is masked via `maskIdentifier` (e.g. `****1234`) in operational PDF exports unless unmasked by policy, and no bank account numbers or raw phone numbers are exposed.
3. **Honest Provenance:** Every report export (CSV, XLSX, PDF) and operational PDF explicitly states that figures are recorded legacy values (`nilai tercatat di KOSIPA, baca saja; bukan saldo resmi / OFFICIAL_BALANCE_UNVERIFIED`).
