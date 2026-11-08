# 06 — Legacy vs New KOSIPA Parity Matrix

**New-app baseline:** `apps/web` and `packages/*` in the working tree on 8 Nov 2026 (HEAD `0b69cfab` on `master-dev`), read-only.

**Finding.** KOSIPA New has **no import capability of any kind**: no file input exists anywhere in `apps/web/src`. Its only export capability is five aggregate/diagnostic CSV report exports. Native write commands exist for members (register, update profile, change status), five reference masters plus product masters, and single savings deposits (`packages/application/src/kosipa/commands/*`). They run only in the isolated synthetic FA stack; no write is enabled in production.

**How parity was judged.** Parity was judged on behaviour (format, schema, validation, rules, permissions, DB effects, workflow, errors, accuracy), not on whether a button exists. Where the legacy behaviour itself is unsafe, the target is "**corrected parity**": the same business outcome, without the anomaly.

## 1. Import parity

| Feature ID | Legacy menu / page | Operation | Legacy status | New menu / page | New status | Parity | Blocking dependencies | Recommended action |
|---|---|---|---|---|---|---|---|---|
| KOS-IMP-001 | Master Data › Anggota | Import members | Verified (static) | `/console/kosipa/anggota` (list, register `baru`) | Single register command exists (`kosipa.member.register`); no import | MISSING | Import foundation (IE-BL-001); FA-03b NIK canonicalisation | Implement as a batch of `member.register` (IE-BL-008) |
| KOS-IMP-002 | Anggota › Daftar Anggota | Import members (copy) | Verified | same | — | MISSING | same | Merge with 001; one import (IE-ANO-022) |
| KOS-IMP-003 | Master Data › Anggota | Import limits | Verified | `/console/kosipa/anggota/[id]` | No limit command | MISSING | Limits command; wallet decision (smartkkisi) | IE-BL-006 |
| KOS-IMP-004 | Anggota › Daftar Anggota | Import limits (copy) | Verified | same | — | MISSING | same | Merge with 003 |
| KOS-IMP-005 | Simpanan › Data Simpanan (detail) | Import savings lines | Verified | `/console/kosipa/simpanan` (read), `simpanan/setoran` (single deposit) | Savings document and line commands absent | MISSING | Savings document command family (FA-03c+) | IE-BL-004 |
| KOS-IMP-006 | Simpanan › Payroll & Saldo Awal (detail) | Import payroll / opening lines | Verified | — | — | MISSING | same, plus opening-balance definition (OFFICIAL_BALANCE_UNVERIFIED) | IE-BL-004 (variant) |
| KOS-IMP-007 | Simpanan › Setor TF/Tunai | Bulk deposits | Verified | `/console/kosipa/simpanan/setoran` | Single deposit with prepare/approve exists | MISSING (single-entry only) | Import foundation | IE-BL-009: batch of `savings.deposit` |
| KOS-IMP-008 | Simpanan › Penarikan | Bulk withdrawals | Verified | — | No withdrawal command | MISSING | Withdrawal command + balance rule | IE-BL-009 |
| KOS-IMP-009 | Simpanan › Hak & Kewajiban | Bulk exit settlements | Verified | — | No exit command | MISSING | Exit command (R-16); owner decision on typed amounts | IE-BL-011 |
| KOS-IMP-010 | Simpanan › Master Potongan Payroll | Import standing deductions | Verified | — | No deduction-master command | MISSING | Deduction master command | IE-BL-010 |
| KOS-IMP-011 | Pinjaman › Daftar Pinjaman | Bulk loans (any product) | Verified | `/console/kosipa/pinjaman` (read) | No loan write commands | MISSING | Native loan family (apply, approve, disburse, schedule R-04/R-05) | IE-BL-002 |
| KOS-IMP-012 | Pinjaman › Pinjaman Reguler | Bulk regular loans | Verified | same | — | MISSING | same | IE-BL-002 (product profile) |
| KOS-IMP-013 | Pinjaman › Pinjaman Bank | Bulk bank loans | Verified | same | — | MISSING | same | IE-BL-002 |
| KOS-IMP-014 | Pinjaman › Kasbon | Bulk kasbon | Verified | same | — | MISSING | same | IE-BL-002 |
| KOS-IMP-015 | Pinjaman › Pembiayaan | Bulk financing | Verified | same | — | MISSING | same | IE-BL-002 |
| KOS-IMP-016 | Pinjaman › Gaji Minus | Bulk gaji-minus loans + global reset | Verified | — | — | **LEGACY_ANOMALY** | Owner decision on the gaji-minus rule (IE-ANO-003) before any parity work | IE-BL-005 |
| KOS-IMP-017 | Pinjaman › KPR BTN | Bulk housing loans | Verified | same as 011 | — | MISSING | same as 011 | IE-BL-002 |
| KOS-IMP-018 | Matrix Potongan (detail) | Import deduction matrix | Verified | `/console/kosipa/payroll/[docNo]` (read, store reconciliation) | No payroll write commands | MISSING | Payroll batch commands; native generator (OD-2) | IE-BL-003 |
| KOS-IMP-019 | Matrix Potongan (detail) | Import store bills (route-only) | Verified endpoint; operational use UNVERIFIED | `/console/kosipa/payroll/[docNo]/rekonsiliasi` (read) | — | UNVERIFIED | Owner: is it still used, or replaced by the matrix import or the TOKO feed? | Decide; probably fold into IE-BL-003 |
| KOS-IMP-020 | SHU (detail) | Import SHU base | Verified | — | No SHU module | MISSING | SHU command (R-18) | IE-BL-013 |
| KOS-IMP-021 | SHU (detail) | Import sukarela interest | Verified | — | — | MISSING | same | IE-BL-013 |
| KOS-IMP-022…031 | various | dormant / dead | Verified dead | — | — | NOT_APPLICABLE | Owner confirmation | Do not migrate (IE-ANO-025) |

Import summary: **0 FULL · 0 PARTIAL · 19 MISSING · 1 LEGACY_ANOMALY · 1 UNVERIFIED · 10 NOT_APPLICABLE**.

## 2. Export parity

The new exports are aggregate only, and decision **E3** says per-member exports are never allowed "until a use case is written down". Every legacy per-row export is therefore missing **by policy**, not by oversight. Parity for them needs the E3 use case first (IE-BL-014).

| Feature ID | Legacy menu / page | Legacy content | New equivalent | New status | Parity | Recommended action |
|---|---|---|---|---|---|---|
| KOS-EXP-004…010 | Pinjaman lists (Reguler, Bank, Kasbon, Pembiayaan, Gaji Minus, KPR, Daftar) | Per-loan rows: member, amounts, term, status | `/console/kosipa/laporan/pinjaman` → loans CSV (monthly buckets, no rows) | Aggregate only | MISSING (per-row; blocked by E3) | IE-BL-014 operational list export |
| KOS-EXP-011 | Pelunasan Pinjaman | Per-settlement rows | — | — | MISSING | IE-BL-014 |
| KOS-EXP-012 | Kartu Aktif | Per-loan instalment state | — | — | MISSING | IE-BL-014 |
| KOS-EXP-013, 015 | Savings document lines | Per-member lines of a document | — | — | MISSING | IE-BL-014 (document-scoped) |
| KOS-EXP-014, 016 | Withdrawal / deposit lists | Per-document rows | savings-movements CSV (monthly totals) | Aggregate only | MISSING | IE-BL-014 |
| KOS-EXP-017 | Hak & Kewajiban | Per-exit rows | — | — | MISSING | with IE-BL-011 |
| KOS-EXP-018 | Master Potongan Payroll | Per-member deductions | — | — | MISSING | with IE-BL-010 |
| KOS-EXP-019 | Matrix detail | Per-member deduction matrix (≈50 columns) | payroll CSV (per-batch totals and component groups) | Aggregate only | MISSING (per-member) | IE-BL-015: payroll file for finance/HR (likely the strongest E3 use case) |
| KOS-EXP-020, 021 | SHU list / detail | SHU per member | — | — | MISSING | with IE-BL-013 |
| KOS-EXP-022, 023 | Member lists | Member directory with contact and credit data | membership CSV (counts only) | Aggregate only | MISSING (personal data; E3) | IE-BL-014 with masking |
| KOS-EXP-024, 025 | Member loan / store transactions | Per-member history | member 360 page (read) | Screen only | MISSING | IE-BL-014 |
| KOS-EXP-026 | Users Mobile | Mobile accounts | — (smartkkisi out of scope) | — | NOT_APPLICABLE unless the owner wants it | Confirm |
| KOS-EXP-027…030 | Outstanding (Reguler, Bank, Kasbon, Pembiayaan) | Per-loan outstanding for a month | loans CSV states "pokok rencana, bukan outstanding" (OFFICIAL_BALANCE_UNVERIFIED) | Not equivalent | **BEHAVIOR_MISMATCH** (different measure) | IE-BL-012 once an official outstanding definition is approved |
| KOS-EXP-031 | Pencairan Reguler | Per-loan disbursement report | loans CSV (planned principal by month) | Not equivalent | BEHAVIOR_MISMATCH | IE-BL-012 |
| KOS-EXP-032 | Resume Simpanan | Per-member savings summary by year | savings-movements CSV (totals; explicitly not balances) | Not equivalent | BEHAVIOR_MISMATCH | IE-BL-012 (needs FD on opening balance) |
| KOS-EXP-033…036 | PPOB lists and reports | Sales, bills | — | — | MISSING | P3 unless PPOB is in the replacement scope |
| KOS-EXP-001…003, 037…039 | dormant | — | — | — | NOT_APPLICABLE | Do not migrate |
| (new only) | — | — | Data-quality report (`CSV`, `XLSX`, `PDF`) | Exists | FULL (new diagnostic capability) | Keep |

Export summary (33 active legacy list exports): **0 FULL · 0 PARTIAL · 26 MISSING · 6 BEHAVIOR_MISMATCH · 1 NOT_APPLICABLE (pending confirmation)**. The six mismatches are EXP-027 to 032. Dormant entries are NOT_APPLICABLE.

### 2B. Server-side Report Multi-Format & PDF Document Parity

| Feature ID | Legacy feature | Legacy format | KOSIPA New equivalent | New formats | Parity status |
|---|---|---|---|---|---|
| Report Exports (Loans, Payroll, Membership, Savings Movements, Data Quality) | Client-side DataTables (`KOS-EXP-022..032`, current page only, text money) | XLSX, CSV, PDF (browser `pdfmake`) | `/api/kosipa/reports/{loans,payroll,membership,savings-movements,data-quality}/export?format=csv\|xlsx\|pdf` | Server-side CSV, native OOXML `.xlsx` (numeric cells + `Info` sheet), Executive A4 PDF | **ENHANCED PARITY (Aggregate)** |
| `KOS-PDF-001`, `KOS-PDF-002` | `prn_pinjaman_doc.php`, `prn_pinjaman.php` (Loan application & loan schedule card) | FPDF A4 | `GET /api/kosipa/loans/[docNo]/pdf` on `/console/kosipa/pinjaman/[docNo]` | KKISI Financial Document Standard A4 PDF | **FULL (Read-side Card & Schedule)** |
| `KOS-PDF-009` | `print_pengajuan_simpanan_pdf.php` (Savings change submission form) | FPDF A4 | Public Savings Submission Artifact (`kkisi-pss-a4/v3`, `kkisi-pss-wajib-a4/v3` + frozen `v1`/`v2`) | `pdf-lib` A4 PDF with embedded PNG signature & SHA-256 seal | **ENHANCED PARITY** |
| `KOS-PDF-014`, `KOS-PDF-015` | `simpanan/views/print_kartu.php` (Member savings passbook) | FPDF A4 | `GET /api/kosipa/savings/[memberId]/pdf` on `/console/kosipa/simpanan/[id]` | KKISI Financial Document Standard A4 PDF | **FULL (Read-side Passbook)** |
| `KOS-PDF-017` | `payroll/views/prnt_slip.php` (Member payroll deduction slip) | FPDF A4 | `GET /api/kosipa/payroll/[docNo]/anggota/[nik]/pdf` on `/console/kosipa/payroll/[docNo]/anggota/[nik]` | KKISI Financial Document Standard A4 PDF | **FULL (Read-side Member Slip)** |
| `KOS-PDF-003..005, 010, 012, 013, 016` | Write-workflow vouchers (Kasbon form, Pembiayaan form, Pelunasan receipt, Withdrawal form, Batch savings doc, Deposit receipt, Exit H&K sheet) | FPDF A4 | Pending native write-command UI pages for those workflows | Planned on top of `renderKosipaPdfDocument` | **PLANNED (Awaiting Write Modules)** |
| `KOS-PDF-006..008, 011` | Unreferenced FPDF templates | FPDF | None (dormant dead code) | n/a | **NOT_APPLICABLE** |

## 3. Cross-cutting parity factors

| Factor | Legacy | New today | Gap |
|---|---|---|---|
| File format compatibility | XLSX in (Spout); XLSX/CSV out (browser) | CSV out only | Import: none. Export: no XLSX. Legacy templates must stay accepted during cutover (IE-BL-001 accepts the legacy column layouts by header name). |
| Schema compatibility | Writes legacy tables directly | Native commands write the same legacy tables through the ledger and fence (FD-01b, FD-03) | Compatible by design; imports must use the same command path |
| Validation | Almost none (§3 of [03](IMPORT_WORKFLOW_AUDIT.md#3-validation-matrix)) | Commands validate (e.g. VAL-101 canonical NIK) | New is stricter. Expect legacy files to be rejected where they were silently half-applied before. |
| Business logic | Embedded in import handlers, sometimes different from the UI path | Single command per action | Import must call the same command as single entry (never its own SQL) |
| Permissions | Page grant | Capability per action plus two-admin write grants | New is stricter; import needs its own capability per family |
| DB operations | Autocommit, row by row | One transaction per command, idempotency via the command ledger | Batch-level transaction and idempotency still to design (IE-BL-001) |
| Workflow | Upload → done | — | Preview and confirmation needed |
| Error handling | One message, no row report | Typed errors per command | Row-level report still to design |
| Export accuracy | Text money; scope = loaded page; broken period filter | Exact decimals; whole filtered result; bounded | New is correct for what it covers; coverage is narrower |
