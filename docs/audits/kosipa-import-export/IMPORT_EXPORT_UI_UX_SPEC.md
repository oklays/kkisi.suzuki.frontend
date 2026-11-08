# 09 — Import/Export UI/UX Specification (KOSIPA New)

This is a recommendation for the console. It reuses the current console UI standard instead of introducing parallel components:
- `PageBreadcrumbs` and `KosipaPageHeader` (with `tail`, `CRUMB_ICONS`);
- `ContextNotice`;
- `FinancialTable`;
- the `kosipa-primary-action` button;
- the `mform` layout (`mform-group`, `mform-grid`, `mform-rail`, `mform-reason`, `mform-submit`);
- `ExportControl` (all in `apps/web/src/components/console/kosipa/`).

Add only the CSS that this standard lacks. The UI language is Indonesian, matching existing screens.

## 1. Where the controls live

| Context | Control | Placement |
|---|---|---|
| List page that owns an import (e.g. Pinjaman Reguler) | "Impor Excel" secondary button | Header `tail`, next to the primary action. Visible only with the import capability for that family. |
| Document detail page (savings document, payroll batch, SHU) | "Impor baris" | Detail header `tail`. **Disabled with a reason** when the document is not OPEN. The server enforces the same rule. |
| Any list or report with an approved export | `ExportControl` | Above the table, right-aligned, with a one-line scope note ("Berisi semua baris sesuai filter, maks. 5.000") |

The import runs on its own route (`…/impor/[type]`), not in a modal. A route survives refresh, can be linked, and gives the preview room on a phone. The route keeps the context (document number) in the path, not in hidden fields.

## 2. Import wizard (one component, configured per import type)

```text
┌ KosipaPageHeader: "Impor pinjaman reguler"  · breadcrumbs: KOSIPA › Pinjaman › Pinjaman Reguler › Impor
│
│ Step 1  Unduh template     [Unduh template .xlsx]   ContextNotice: kolom wajib, format tanggal, format nominal
│ Step 2  Pilih berkas       dropzone + file button (accept=".xlsx,.csv"), shows name/size; one file
│ Step 3  Periksa struktur   ✔ satu sheet · ✔ header cocok (list) · ✖ kolom tidak dikenal "BUNGA%"   → stop here if ✖
│ Step 4  Periksa isi        progress bar while staging (server)
│ Step 5  Pratinjau          summary rail (mform-rail): total baris · valid · tidak valid · total nominal · anggota unik
│                            tabs: [Valid (n)] [Tidak valid (m)]   FinancialTable, 50 rows/page, columns as parsed
│                            invalid rows: row number, column, message, original value
│                            [Unduh laporan kesalahan .csv]
│ Step 6  Konfirmasi         mform-reason (required note) + checkbox "Saya sudah memeriksa pratinjau"
│                            primary: "Terapkan n baris"  (disabled if m>0 and the family is all-or-nothing)
│ Step 7  Hasil              outcome card: applied / rejected / batch id / time / actor; links to the affected list
└
```

Behaviour rules:
- **Staging is not applying.** Steps 1–5 never change business data. The page says so ("Belum ada data yang disimpan").
- **One file, one sheet.** A second non-empty sheet is a structure error with a clear message (IE-ANO-001).
- **Header-named columns.** Step 3 shows found vs expected headers. Legacy header spellings are accepted and shown as "dikenali sebagai …".
- **Parsed values are shown, not raw text.** Dates as `dd MMM yyyy` and amounts as `Rp 1.500.000,00`, so the user sees how the system read them (IE-ANO-011, 028).
- **Duplicates are visible.** The same member repeated in a file, or already present in the target document, is shown as a warning or an error per family rule.
- **Apply mode.**
  - Financial families (loans, savings, payroll, gaji minus, SHU) default to **all-or-nothing**.
  - "Apply valid rows only" exists only where the owner has allowed it, and then it needs an extra confirmation.
- **Idempotency is explained.** Re-uploading an applied file shows "Berkas ini sudah diterapkan pada <waktu> (batch …)" with a link, instead of applying again.
- **Long operations.** Staging and apply show progress and stay on the page. Leaving the page does not cancel a running apply; the result is listed under "Riwayat impor".
- **History.** "Riwayat impor" (per family) lists batches: time, actor, file name, hash prefix, counts, status. Rows link to the error report while it is retained.
- **Access.** The import button is hidden without the capability. The server refuses anyway. A denial page explains which capability is missing.

## 3. Error presentation

| Level | Example | Presentation |
|---|---|---|
| File | wrong type, too large, unreadable, more than one sheet | Inline error under the dropzone; wizard stays at step 2 |
| Structure | missing or unknown header | Step 3 checklist with ✖ items; nothing staged |
| Row | unknown NIK, invalid date, amount not a number, document not open | Invalid tab: row number, column, code (`NIK_NOT_FOUND`, `DATE_AMBIGUOUS`, …), message in Indonesian, original value |
| Apply | concurrency conflict, fence active (`LEGACY_ACTIVE`), permission revoked | Result card with outcome "Tidak diterapkan", the reason, and confirmation that nothing changed |

The error report CSV uses the same columns and is written with the formula-neutralising CSV writer.

## 4. Export control

- One `ExportControl` per export, labelled with the format ("Unduh CSV" / "Unduh Excel").
- The scope note states what is included: the current filters and period, a row cap, aggregate or per-row, masked fields.
- The file name carries the report, filter period and generation date, e.g. `outstanding-reguler-2026-10_dibuat-20261108.xlsx`.
- The first lines (CSV) or a "Info" sheet (XLSX) repeat:
  - report name;
  - generated at;
  - source;
  - the filters, as already done by `META` in `report-export.ts`;
  - the statement on official balances.
- While preparing, the button shows the existing spinner and "Menyiapkan…".
- **Errors.** Rate limit: "Coba lagi dalam n menit". Too large: "Persempit filter". Unavailable: the existing message from `presentation.ts`.
- Per-member exports (only if E3 allows):
  - require a reason field before download;
  - mask contact and bank fields unless the user has the unmask capability.

## 5. Responsive and accessibility requirements

- Verify at 375, 768 and 1440 px.
- The preview table scrolls inside its card; there is no page-level horizontal scroll.
- The dropzone has a real `<input type="file">` with a visible label; the drag-and-drop area is not the only way in.
- Step headings are `<h2>`. Progress uses `aria-live="polite"`. Validation counts and the result card are announced.
- Status colours always come with text and icons (valid / invalid / warning).
- The primary action stays reachable without scrolling past a long preview on mobile: a sticky `mform-submit` area.

## 6. Out of scope for the UI

PDF and print exports, and the legacy Copy/Print buttons, are not part of this specification.
