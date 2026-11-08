# 04 — Export Workflow Audit

This document covers the 33 active client-side exports (KOS-EXP-004 to 036), the dormant server-side exports (EXP-001 to 003) and the dormant groups (EXP-037 to 039). See the [inventory](LEGACY_FEATURE_INVENTORY.md#b-export-features).

## 1. Mechanism: every working export is client-side

All 33 working exports are DataTables **Buttons** in the browser. The server has no export endpoint for them.

```text
List page ── DataTables(serverSide:true) ── POST <controller>/ajax_list (draw,start,length,search,order + page filters)
                │                                   │
                │                                   └─ model: SELECT … WHERE <filters> ORDER … LIMIT length OFFSET start   (length = -1 → no LIMIT)
                │                                      controller builds display rows (HTML snippets, formatted money)
                ▼
   [Excel] [CSV] buttons → Buttons.exportData(columns: [...]) over the rows ALREADY in the browser
                → excelHtml5: JSZip builds .xlsx (sheet named after the page title), numeric-looking cells → number, else inline string
                → csvHtml5: comma-separated text, no formula neutralisation
```

Library: `assets/global/plugins/datatables/datatables.min.js`. The bundle header lists DataTables 1.10.12, Buttons 1.2.1, HTML5 export 1.2.1, Flash export 1.2.1, JSZip 2.5.0 and pdfmake 0.1.18. `footer.php` also loads an older `jquery.dataTables.min.js` first (lines 38 and 65). The later bundle wins, but loading both is a latent conflict.

### 1.1 What an export contains (scope)

| Question | Legacy behaviour |
|---|---|
| Current page only? | **Yes, by default.** The export holds exactly the rows loaded in the table: the current page under the current filters, search box and sort (IE-ANO-027). |
| All filtered records? | Only if the user first chooses page length "All" (`-1`), which 30 of the 33 pages offer. Kartu Aktif, Transaksi Pinjaman and Transaksi Toko stop at 1,000. |
| All records? | Same as above with no filter applied. |
| Selected records? | No. Selection is not used for export. |
| Reporting period? | The page's own period filter (`pilihrange`: tahun / bulan / periode) is applied by `ajax_list`. The "periode" variant is broken (IE-ANO-031). |
| Branch-specific? | No branch dimension. KOSIPA serves one cooperative. |
| Default page length | `pageLength` is not set, so DataTables uses its default of 10, whatever the `lengthMenu` order. Not checked in a running browser (**UNVERIFIED**). |

### 1.2 File structure

| Property | Excel button | CSV button |
|---|---|---|
| Extension / MIME | `.xlsx`, a genuine OOXML package built by JSZip. **Not** an HTML table renamed `.xls`. | `.csv`, `text/csv` with a BOM option at its default (off in 1.2.1) |
| File name | Defaults to the page `<title>` (Buttons 1.2.1 `filename: '*'`). No filters or dates in the name. Exact titles **UNVERIFIED** at runtime. | same |
| Worksheet | One sheet, named after the title | — |
| Headers | Text of the visible `<thead>` cells for the exported column indexes | same |
| Column order | As listed in `exportOptions.columns` ([inventory §B1](LEGACY_FEATURE_INVENTORY.md#b1-active-client-side-exports-33)) | same |
| HTML in cells | Stripped (`stripHtml` default). Labels such as status badges become their text. | same |
| Money | **Text**, in whatever display format the page uses (IE-ANO-028) | text |
| Dates | Text `dd-mm-YYYY` (as displayed) | text |
| NIK | `09901` stays text (leading-zero rule); `9901` becomes a number | text |
| Subtotals / totals | **None.** Totals shown above some reports (`ajax_total`) are not in the file. | none |
| Formulas | None. Values beginning with `=` are written as inline strings, so they are inert. | **Not neutralised** (IE-ANO-030) |
| Empty values | Empty string | empty field |

Money formats by data endpoint (static scan of `number_format` signatures inside `ajax_list`):

| Format written to the exported (visible) column | Endpoints |
|---|---|
| `1.250.000,00` (Indonesian, 2 decimals) | Gaji Minus, Kartu Aktif, Kasbon, KPR BTN, Pembiayaan, Pinjaman Bank lists; Outstanding Kasbon/Pembiayaan; Pencairan Reguler; Transaksi Pinjaman/Toko |
| `1,250,000.00` (US) | Pinjaman Reguler list; Outstanding Reguler; Outstanding Bank (5 columns) |
| `1.250.000.00` (malformed) | Outstanding Bank, *pokok* column |
| Plain integer (numeric cell) | Daftar Pinjaman (2 columns), Pelunasan (4 columns) |
| Amounts formatted in the model or view (not via `number_format` in the controller) | Savings, payroll, SHU, PPOB, H&K, member pages: format not traced per column (**Partial**) |

Most report endpoints also return hidden plain-number copies of the money columns (`number_format(x,0,'','')`). For example, Outstanding Reguler marks columns 15–19 hidden (`columnDefs`), but its Excel button exports columns 0–16. The clean numbers are therefore mostly left out.

### 1.3 Query and business rules

The export uses **the same query as the screen**: it is the same `ajax_list` call. Exports therefore inherit every screen rule and every screen defect:

| Rule | Effect on export |
|---|---|
| Filters (status, product/bank, period, payment status, card status, mobile flag, search) | Applied exactly as on screen |
| Period "periode" (from/to) | Wrong for cross-month ranges in 18 list models (IE-ANO-031) |
| Loan status shown in lists | Some loan list endpoints **write** `status_bayar` while listing (ANO-K26, ANO-K50). Exporting with "All" therefore performs writes as a side effect. |
| Outstanding figures | Computed per row by `get_outstanding_pinjaman()` (helper) for the selected year/month. Not reconciled to an official balance (OFFICIAL_BALANCE_UNVERIFIED in the new app). |
| Totals | Screen totals come from a separate `ajax_total` query and are **not** in the file. Whether they equal the sum of the exported rows was not tested. |
| Resume Simpanan | Built on views (`v_kartu_simpanan`, …) whose definitions are not in the local dump (G-01/B1). Correctness **UNVERIFIED**. |

## 2. Security and data exposure

| Check | Finding |
|---|---|
| Unauthorised export endpoints | No dedicated endpoints. The data endpoint `ajax_list` accepts any user with the page grant. An attacker who scripts `ajax_list` with `length = -1` gets everything without pressing a button. |
| Server-side permission | Page grant only (ANO-K02); no export permission (IE-ANO-029) |
| Cross-branch leakage | Not applicable (no branch model). Every grant holder sees the whole cooperative. |
| Sensitive personal data | Member list exports (EXP-022/023): NIK, name, phone, email, credit limits, gaji minus, bills, statement flag. Loan and savings exports: NIK, name, amounts, bank account fields on some lists. Users Mobile (EXP-026): mobile account data. |
| Unrestricted bulk download | Yes. "All" has no cap. |
| Spreadsheet formula injection | CSV only (11 pages) (IE-ANO-030) |
| Download authorisation | The file is built in the browser; the server never sees an "export" action |
| Audit logging | None. The server cannot tell a view from an export. |
| Server load | "All" on report pages runs one helper query per loan (e.g. `outstanding/lap_reguler_c.php:128`) on shared hosting with 20 DB connections (B5/B8). A large export can stall the legacy application. |

## 3. Dormant server-side exports (not migrated)

| ID | What it would produce | Why it does not work | Notes for the redesign |
|---|---|---|---|
| EXP-001 Resume Simpanan | XLSX "DATA SIMPANAN {jenis} {tahun}": NO, NIK, NAMA, SALDO AWAL, then 12 months × (PAYROLL, CASH/TF, PENARIKAN, JASA, POKOK), TOTAL JASA, TOTAL SALDO | Button commented out; GET vs POST mismatch; only January filled; carry-over between members; malformed file name header; SQL built by string interpolation | The intended layout (a per-member yearly savings card with interest) is a real business need: see backlog IE-BL-012 |
| EXP-002 Kasbon | XLSX title `{bank} {period}`, columns NO, DOC NO, TANGGAL, NIK, NAMA, NO REK, PINJAMAN, JW, ANGSURAN (status columns commented out) | Button commented out; the client parses the binary as JSON | Same data as EXP-006 |
| EXP-003 | 10 empty `export_excel()` methods | Empty | — |

## 4. Exports in KOSIPA New

KOSIPA New provides server-side multi-format report exports (`CSV`, `XLSX`, `PDF`) across all five reports plus four operational/regulatory document PDFs rendered on the server. See [parity matrix §2](LEGACY_VS_NEW_PARITY_MATRIX.md#2-export-parity).

| Route | Formats | Content | Controls |
|---|---|---|---|
| `GET /api/kosipa/reports/loans/export?format=csv\|xlsx\|pdf&tahun=` | CSV, XLSX, PDF | Monthly buckets by document and repayment status, planned principal | `kosipa.report.export` **and** `kosipa.loan.view`; env allow-list (`KOSIPA_EXPORT_ENABLED`, `KOSIPA_EXPORT_USER_IDS`); throttle 6 per 10 min per user; audit row written before any read; <= 5,000 rows and <= 1 MB; exact decimals; formula neutralisation (`packages/domain/src/kosipa/csv.ts`, `xlsx.ts`, `pdf-document.ts`) |
| `GET /api/kosipa/reports/payroll/export?format=csv\|xlsx\|pdf&tahun=` | CSV, XLSX, PDF | Per batch: header vs row totals, component groups, `TOKO_*` columns (review-only) | same, with `kosipa.payroll.view` |
| `GET /api/kosipa/reports/membership/export?format=csv\|xlsx\|pdf` | CSV, XLSX, PDF | Counts by status, employment and group; no member rows | `kosipa.member.view` |
| `GET /api/kosipa/reports/savings-movements/export?format=csv\|xlsx\|pdf&tahun=` | CSV, XLSX, PDF | Monthly movement totals by savings type (not balances) | `kosipa.savings.view` |
| `GET /api/kosipa/reports/data-quality/export?format=csv\|xlsx\|pdf` | CSV, XLSX, PDF | Diagnostics (duplicates, conflicts, unusable dates, orphans) with reference samples (doc numbers only) | loan or payroll view |
| `GET /api/kosipa/loans/[docNo]/pdf` | PDF (A4) | Kartu Pinjaman & Jadwal Angsuran (`KOS-PDF-001` / `KOS-PDF-002` read-side equivalent) | `kosipa.report.export` + `kosipa.loan.view`, rate-limited, audited before read, NIK masked |
| `GET /api/kosipa/payroll/[docNo]/anggota/[nik]/pdf` | PDF (A4) | Slip Rincian Potongan Payroll Anggota (`KOS-PDF-017` equivalent) | `kosipa.report.export` + `kosipa.payroll.view`, rate-limited, audited before read, NIK masked |
| `GET /api/kosipa/savings/[memberId]/pdf` | PDF (A4) | Buku Mutasi Simpanan Anggota (`KOS-PDF-014` read-side equivalent) | `kosipa.report.export` + `kosipa.savings.view` + `kosipa.member.view`, rate-limited, audited before read, NIK masked |
| Public Savings Submission Artifact (`kkisi-pss-a4/v3`, `kkisi-pss-wajib-a4/v3`) | PDF (A4) | Formulir Pengajuan Perubahan Simpanan (`KOS-PDF-009` equivalent, with immutable `v1`/`v2` backward compatibility) | Token-gated & SHA-256 integrity-verified artifact store (`apps/web/src/infrastructure/public-savings/artifacts.ts`) |

## 5. Legacy server-side FPDF document exports (17 templates)

In addition to the DataTables browser exports, legacy KOSIPA contains 17 FPDF 1.7 views (`KOS-PDF-001` through `KOS-PDF-017`, listed in [inventory §D](LEGACY_FEATURE_INVENTORY.md#d-server-side-pdf-document-exports-fpdf-17)).

### 5.1 Execution flow and layout problems in legacy FPDF views

1. **Direct GET controller actions:** Buttons on list rows or detail headers call `window.open(base_url + '<module>/<controller>/print_pdf?doc_no=' + doc_no, '_blank')`.
2. **Manual coordinate arithmetic:** Every view positions cells with raw `$pdf->SetXY(...)` and `$pdf->Cell(...)` without text measurement or multi-line wrapping (`MultiCell` is rarely used for dynamic values). Long member names or division names overflow into adjacent columns or are truncated with `substr($val, 0, 20)` (`IE-ANO-038`).
3. **No visual hierarchy or provenance:** Every PDF uses plain `Arial` / `Courier` monochrome cells without KPI summaries, status badges, zebra striping, repeating multi-page table headers, or data-integrity callouts.
4. **Security and snapshot defects:**
   - Unescaped `$_GET['doc_no']` / `$_GET['id']` values are concatenated directly into SQL queries inside multiple print controllers (`IE-ANO-036`).
   - `prn_pinjaman_doc.php` and `print_pengajuan_simpanan_pdf.php` pass unauthenticated remote image URLs (`http://kkisi.id/ API` or `cdn/ktp/`) to `$pdf->Image(...)` (`IE-ANO-037`).
   - `print_pengajuan_simpanan_pdf.php` queries current live deductions (`m_simpanan_aktif`) instead of storing an immutable submission snapshot, so re-printing an old form after approval shows the new deduction as the "old" deduction (`IE-ANO-039`).
