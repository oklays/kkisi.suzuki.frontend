# 08 — Recommended Implementation Backlog (KOSIPA New)

These are recommendations. They do not approve any change to legacy business rules. Every item that changes a legacy rule names the owner decision it needs. Items assume the existing KOSIPA New architecture:
- layering `apps/web → packages/application → packages/domain`;
- a command pipeline with ledger, idempotency and the `LEGACY_ACTIVE` fence (FD-01b, FD-03);
- capability grants (two-admin confirmation);
- the audited export path in `report-export.ts`.

Priority follows the evidence of impact. Usage figures come from the 30 Oct data copy: 9,770 loans carry the import suffix `XLS`, and only 4 exit-settlement rows exist.

## Overview and sequence

| Seq | Backlog ID | Priority | Title | Features | Anomalies | Depends on |
|---|---|---|---|---|---|---|
| 0 | IE-BL-007 | P0 (operator) | Contain legacy exposure while the legacy app is still in use | TPL-001/002, all uploads, EXP-022/023 | 016, 017, 029 | Owner approval only |
| 1 | IE-BL-001 | P0 | Import foundation: stage → validate → preview → apply | all imports | 001, 002, 011, 018, 019, 020, 021, 035 | Command ledger (TASK-105/106) |
| 2 | IE-BL-003 | P0 | Payroll matrix import | IMP-018 (+019) | 001, 002, 012, 013 | 001; payroll batch commands |
| 3 | IE-BL-005 | P0 | Gaji Minus: decide the rule, then import | IMP-016 | 003 | Owner decision; 001; loan family |
| 4 | IE-BL-002 | P0 | Loan bulk import (one engine, product profiles) | IMP-011…015, 017 | 001, 004, 011, 023, 034 | 001; native loan family |
| 5 | IE-BL-004 | P1 | Savings document line import | IMP-005, 006 | 008, 012 | 001; savings document commands |
| 6 | IE-BL-006 | P1 | Credit-limit import | IMP-003, 004 | 005 | 001; limit command; smartkkisi wallet decision |
| 7 | IE-BL-009 | P1 | Deposit and withdrawal batch import | IMP-007, 008 | 009, 010, 015 | 001; withdrawal command |
| 8 | IE-BL-010 | P1 | Deduction master import and list export | IMP-010, EXP-018 | 014 | 001; deduction master command |
| 9 | IE-BL-008 | P1 | Member import | IMP-001, 002 | 016, 020, 021, 022 | 001; `member.register` (exists) |
| 10 | IE-BL-012 | P1 | Report parity: outstanding, disbursement, savings summary | EXP-027…032 | 027, 028, 031 | Official balance / outstanding definitions (FD) |
| 11 | IE-BL-015 | P1 | Payroll per-member file | EXP-019 | 029 | E3 use case |
| 12 | IE-BL-014 | P2 | Operational list exports (per row) | EXP-004…025 | 027…031 | E3 decision |
| 13 | IE-BL-011 | P2 | Exit-settlement import | IMP-009, EXP-017 | 011, 024 | Exit command (R-16) |
| 14 | IE-BL-013 | P2 | SHU imports and exports | IMP-020, 021, EXP-020, 021 | 006, 007 | SHU command (R-18) |
| 15 | IE-BL-016 | P2 | XLSX export writer and template generator | all | 016, 026, 028 | 001 |
| 16 | IE-BL-017 | P2 | Shared import/export UI kit | all | 018, 019 | 001 |
| 17 | IE-BL-018 | P3 | PPOB exports | EXP-033…036 | — | Scope decision |
| 18 | IE-BL-019 | P3 | Cosmetics: file names, titles, help text | all | 019 | — |

No P0 item can go to production without a cutover gate for its feature: a legacy fence row, owner UAT, and production SQL reviewed by an operator ([production-db-changes rule](../../superpowers/specs/kosipa-full-access/fa-03a/PRODUCTION_READINESS_GATES.md)).

---

## IE-BL-007 — Contain legacy exposure (operator action, P0)

- **Related:** TPL-001, TPL-002, all import uploads, EXP-022/023 · IE-ANO-016, 017, 029.
- **Target:** the legacy hosting. This is **not** a code change in this repository and is **not** performed by this audit.
- **Current:**
  - templates contain real member rows;
  - uploaded import files stay in a folder the web server serves;
  - any page user can bulk-export member personal data.
- **Expected:**
  - templates contain headers only;
  - the upload folder is not web-reachable;
  - retained uploads are purged;
  - the owner knows who holds menu grants for the member pages.
- **Approach:** the operator replaces the template files, adds a deny rule for the upload folder, and moves or purges retained files, all after a backup. Exact paths are in the private findings file.
- **Dependencies:** owner approval; operator access.
- **Acceptance:**
  - the template downloads contain no data rows;
  - an unauthenticated request for a retained upload is refused;
  - the purge is logged with a file count.
- **Risk:** low (static files only). Legacy behaviour is unchanged otherwise.
- **Sequence:** immediately, independent of KOSIPA New.

## IE-BL-001 — Import foundation (P0)

- **Related:** all imports · IE-ANO-001, 002, 011, 018, 019, 020, 021, 035.
- **Target:** `packages/domain/src/kosipa/import/*` (pure), `packages/application/src/kosipa/import/*` (orchestration), `apps/web/src/app/api/kosipa/imports/*`, console UI.
- **Current:** each legacy handler parses, validates and writes row by row, with autocommit, no preview and no report.
- **Expected:**
  - a two-phase import: **stage** (parse and validate, no business writes) → **preview** → **apply**;
  - apply runs in one transaction per batch, all-or-nothing by default;
  - every applied row goes through the same command as single entry.
- **Technical approach:**
  1. **Parser** (server-side). XLSX and CSV. Reads only the first sheet, or the named sheet in the template. Rejects workbooks with more than one non-empty sheet (IE-ANO-001). Size cap (e.g. 2 MB) and row cap (e.g. 2,000) decided per family. Formulas are rejected, or their cached values used and flagged.
  2. **Column contract per import type**, by header name (case- and space-insensitive), with the legacy header spellings accepted as aliases. A missing, extra or duplicate header fails the whole file (IE-ANO-020).
  3. **Cell parsers:**
     - NIK → canonical (FA-03b rule);
     - money → exact decimal (accepts `1500000`, `1.500.000`, `1500000.00`; rejects ambiguous `1,500`);
     - date → real date cell, ISO, or `dd-mm-yyyy`; `mm/dd` rejected (IE-ANO-011);
     - enums → closed lists from master data.
  4. **Row validation** through the target command's own validator (dry run). Collects every error; never stops at the first.
  5. **Staging store.** A batch with: id, type, actor, file SHA-256, context (e.g. document number), row results, status. Kept in the console store or the ledger database, not in the legacy DB. The file itself is not kept after staging, or is kept encrypted for at most N days (decision E2-style).
  6. **Idempotency.** `(type, context, file hash)` blocks applying the same file twice. Each row gets a deterministic key, `batch id + row number`, recorded in the command ledger.
  7. **Apply:**
     - checks the capability again and the `LEGACY_ACTIVE` fence;
     - checks document state server-side (IE-ANO-012);
     - runs every row command in one DB transaction (writer user with least privilege);
     - writes one audit event for the batch plus a ledger entry per row.
  8. **Result:** applied/rejected counts and a downloadable error CSV (row, column, code, message; formula-neutralised).
- **Dependencies:** command ledger and idempotency primitives (TASK-105/106, done locally); FA-03b canonical NIK; capability model (FD-16).
- **Acceptance criteria:**
  - A 3-sheet workbook with data on sheet 1 is processed once, or rejected with `MULTIPLE_SHEETS`. Never triplicated.
  - A file with one invalid row applies **zero** rows unless the operator chooses "apply valid rows only", if the owner allows that mode per family.
  - Re-submitting the same file returns `ALREADY_APPLIED` with the original batch id.
  - A date cell, ISO text and `dd-mm-yyyy` text all parse to the same date. `12/05/2022` is rejected.
  - `1.500.000` and `1500000` give the same amount. `O'Neil & Sons` is stored unchanged.
  - Killing the process mid-apply leaves no partial rows (transaction test).
  - The audit event records actor, type, hash, counts and outcome. A denied attempt is audited as denied.
- **Risk:** medium (new shared component). It reduces risk for every later item.
- **Sequence:** first, after IE-BL-007.

## IE-BL-003 — Payroll matrix import (P0)

- **Related:** IMP-018 (and IMP-019, pending the owner's answer) · IE-ANO-001, 002, 012, 013.
- **Target:** payroll module (`/console/kosipa/payroll/[docNo]`).
- **Current:** a 41-column positional upload; upsert per `(batch, NIK)`; no server-side status check; unknown store names go to GIIC.
- **Expected:**
  - upsert of component amounts for a batch in OPEN (or POSTING, if the owner confirms) only;
  - header-named columns mapped to `trans_potongan_matrix` components;
  - a closed list of store columns;
  - the preview shows the per-component total difference versus the current batch.
- **Approach:** IE-BL-001 contract "PAYROLL_MATRIX", with a column map generated from the 41 legacy headers ([inventory TPL-013](LEGACY_FEATURE_INVENTORY.md#c-import-templates)). Apply through `payroll.adjustLine` (WI-18/19). Store import (IMP-019) as an optional contract "PAYROLL_STORE" if still needed.
- **Dependencies:** payroll batch commands; native generator decision (OD-2); store-column mapping confirmation (already flagged "review-only" in the payroll report).
- **Acceptance:**
  - Apply on an APPROVED batch is refused server-side.
  - An unknown NIK is rejected with its row number.
  - Every legacy template header maps to exactly one column.
  - Batch totals after apply equal the preview totals.
  - A rerun of the same file is a no-op.
- **Risk:** high (payroll money). Run in parallel with legacy for at least one cycle.
- **Sequence:** 2.

## IE-BL-005 — Gaji Minus rule decision, then import (P0)

- **Related:** IMP-016 · IE-ANO-003.
- **Current:**
  - a global reset of `gaji_minus` and wallets;
  - hard-coded 500,000 / 200,000;
  - a string threshold comparison.
- **Expected:** the owner and finance decide:
  1. whether an upload **replaces** the set of gaji-minus members or adds to it;
  2. where the amounts and threshold live (master data, not code);
  3. whether wallet balances are KOSIPA's responsibility at all (smartkkisi owner).
  
  Then the import produces an explicit diff (members added, removed, changed) that is applied in one transaction.
- **Approach:** a decision record (FD), then contract "GAJI_MINUS" on IE-BL-001 and the loan family (IE-BL-002) for the loan part.
- **Acceptance:**
  - No member outside the diff changes.
  - The preview lists every member whose flag or wallet would change.
  - The threshold compares exact decimals.
- **Risk:** high until decided. **Do not implement legacy parity literally.**
- **Sequence:** 3 (decision now; build after IE-BL-002 exists).

## IE-BL-002 — Loan bulk import (P0)

- **Related:** IMP-011…015, 017 · IE-ANO-001, 004, 011, 023, 034.
- **Current:**
  - seven copies of one handler;
  - loans created APPROVED and disbursed;
  - `MAX(id)+1` numbering;
  - silent skips;
  - schedules always unpaid.
- **Expected:**
  - one import engine with product profiles: Reguler, Bank, KPR, Kasbon, Pembiayaan, Daftar Pinjaman (any product);
  - creates loan applications in the state the owner decides (**default: awaiting approval**, FD needed if finance wants "approved on import" for historic migration);
  - document numbering from the native numbering service (FA-03a);
  - schedule from the native engine (R-04/R-05);
  - product lookup errors reported.
- **Approach:** contract per profile, sharing columns A–I; product column resolved against `m_jenis_pinjaman` with the template legend generated from the same master; the `KASBON LEBIH DARI 1X POT` → `KASBON >1X POT` alias preserved.
- **Dependencies:** native loan family (apply, approve, disburse); numbering; IE-BL-001.
- **Acceptance:**
  - An unknown product or member rejects the row with a reason, and the count matches.
  - Re-submitting creates nothing.
  - A 3-sheet workbook creates each loan once.
  - Imported schedules equal UI-created schedules for the same parameters (golden test against the legacy formula, minus the ANO-K22/K23/K24 defects).
  - Imported loans cannot be disbursed without the configured approval.
- **Risk:** high. Very commonly used (9,770 legacy imports).
- **Sequence:** 4.

## IE-BL-004 — Savings document line import (P1)

- **Related:** IMP-005, 006 · IE-ANO-008, 012.
- **Expected:**
  - lines upserted on `(document, canonical member)` into an **OPEN** document only;
  - unknown NIK rejected;
  - the amount column chosen from the document's transaction type (not from the client);
  - a standing-deduction change (`m_simpanan_aktif`) only as an explicit, previewed option for PAYROLL documents.
- **Dependencies:** savings document command family; opening-balance definition for "Saldo Awal" (OFFICIAL_BALANCE_UNVERIFIED).
- **Acceptance:**
  - `9901`, `09901` and a numeric cell resolve to the same member and never duplicate.
  - Import into an APPROVED document is refused.
  - A preview of standing-deduction changes is shown and is opt-in.
- **Risk:** medium-high. **Sequence:** 5.

## IE-BL-006 — Credit-limit import (P1)

- **Related:** IMP-003, 004 · IE-ANO-005.
- **Expected:**
  - columns by header: `NIK, LIMIT_TOKO, GAJI_MINUS, LIMIT_PPOB`;
  - a blank cell means "no change";
  - AKTIVE members only;
  - wallet effects follow a written rule from the smartkkisi owner;
  - the current wallet balance is never overwritten by a limit.
- **Acceptance:**
  - The 3-column legacy template does not blank PPOB limits.
  - GAJI_MINUS = 0 does not zero the wallet.
  - The diff preview shows old and new limits.
- **Risk:** medium. **Sequence:** 6.

## IE-BL-009 — Deposit and withdrawal batch import (P1)

- **Related:** IMP-007, 008 · IE-ANO-009, 010, 015.
- **Expected:**
  - one batch document per upload (not one document per row), using the existing `savings.deposit` prepare/approve flow for deposits and a new withdrawal command;
  - a per-member balance check for withdrawals;
  - the template generated from the parser contract (`TANGGAL, NIK, NOMINAL` for withdrawals).
- **Acceptance:**
  - A withdrawal over the available balance is rejected.
  - The detail-page import adds lines to that document.
  - An ambiguous NIK (several members) is rejected.
- **Sequence:** 7.

## IE-BL-010 — Deduction master import and export (P1)

- **Related:** IMP-010, EXP-018 · IE-ANO-014.
- **Expected:**
  - upsert per `(member, savings type)` with explicit sync rules to `m_anggota` (Wajib **and** Sukarela, per the owner);
  - canonical NIK;
  - a row count in the result.
- **Acceptance:**
  - Wajib amounts appear in both tables (if the owner confirms the sync).
  - No 4-digit NIK padding.
- **Sequence:** 8.

## IE-BL-008 — Member import (P1)

- **Related:** IMP-001, 002 · IE-ANO-016, 020, 021, 022.
- **Expected:**
  - one import calling `member.register` per row;
  - GROUP and STATUS validated against enumerations (VAL-102);
  - canonical NIK uniqueness (VAL-101);
  - existing members reported as "already exists" (legacy skips them; no update unless the owner asks).
- **Acceptance:**
  - Rows with amounts in status or group columns are rejected.
  - Names are stored unescaped.
  - Results match single registration field for field.
- **Sequence:** 9.

## IE-BL-012 — Report export parity (P1)

- **Related:** EXP-027…032 · IE-ANO-027, 028, 031.
- **Expected:**
  - server-side exports of the full filtered result for Outstanding (by product), Disbursement (Pencairan) and the yearly savings summary (Resume Simpanan);
  - correct half-open date ranges;
  - numeric money cells (XLSX via IE-BL-016) or exact decimals (CSV);
  - totals rows that equal the screen totals.
- **Dependencies:** owner-approved definitions of outstanding and savings balance (both are currently OFFICIAL_BALANCE_UNVERIFIED); E3 if the files are per member.
- **Acceptance:**
  - The file's totals equal the screen's totals for the same filter.
  - A 25 Jan – 5 Feb range includes both months' rows.
  - The file states its scope (filters, generated at, source).
- **Sequence:** 10.

## IE-BL-015 — Payroll per-member file (P1)

- **Related:** EXP-019 · IE-ANO-029.
- **Expected:** a per-member deduction file for HR/payroll processing, if the owner writes the E3 use case. A separate capability, an audit entry, masking of fields HR does not need, row cap = batch size.
- **Acceptance:**
  - Only grant holders can download.
  - Each download is audited with the batch id.
  - Component columns equal the batch lines.
- **Sequence:** 11.

## IE-BL-014 — Operational list exports (P2)

- **Related:** EXP-004…025 · IE-ANO-027…031.
- **Expected:**
  - per-row exports only for the use cases approved under E3;
  - each one server-side, reusing `report-export.ts` controls (capability, allow-list, throttle, audit-before-read, caps, formula neutralisation);
  - masking of contact and bank fields by default.
- **Acceptance:**
  - The export equals the screen query (same filter object).
  - It includes every filtered row up to the cap, and states when the cap is hit.
  - No contact field appears without the unmask capability.
- **Sequence:** 12.

## IE-BL-011 — Exit-settlement import (P2)

- **Related:** IMP-009, EXP-017 · IE-ANO-011, 024.
- **Expected:**
  - amounts computed by the exit command;
  - the file may provide overrides only with a reason column;
  - a rejected earlier exit does not block a new one.
- **Note:** low usage (4 rows in the data copy). The owner may choose single entry only.
- **Sequence:** 13.

## IE-BL-013 — SHU imports and exports (P2)

- **Related:** IMP-020, 021, EXP-020, 021 · IE-ANO-006, 007.
- **Expected:**
  - the import supplies base values only;
  - allocation is computed deterministically (R-18);
  - no master-data side effects (`bagian`, `lokasi` untouched unless an explicit option is chosen).
- **Acceptance:**
  - Uploading the same file twice gives identical allocations.
  - The Sukarela upload leaves member attributes unchanged.
- **Sequence:** 14 (annual cycle).

## IE-BL-016 — XLSX writer and template generator (P2)

- **Expected:**
  - an XLSX writer for the export path, alongside the existing CSV writer: numeric cells with a Rupiah number format, date cells, a frozen header and a metadata sheet;
  - a template generator that builds each import template from its column contract (headers, legend from master data, one sheet, no data).
- **Dependency:** a library choice. Use a pinned, maintained XLSX library, reviewed for formula and XXE safety.
- **Acceptance:**
  - Opening an export in Excel sums money columns correctly.
  - Generated templates round-trip through the parser with zero errors.
- **Sequence:** 15.

## IE-BL-017 — Shared import/export UI kit (P2)

See [09 UI/UX spec](IMPORT_EXPORT_UI_UX_SPEC.md). **Acceptance:** browser suites at 375, 768 and 1440 px pass; keyboard-only completion of the wizard; errors are announced.

## IE-BL-018 — PPOB exports (P3) · IE-BL-019 — Cosmetics (P3)

PPOB only if PPOB is in the replacement scope. Cosmetics: file names carry the report name, period and generation date; one terminology across pages.

## IE-BL-020 — Multi-format report exports (CSV, XLSX, PDF) & KKISI Financial Document PDF engine (P1, Implemented)

- **Related:** KOS-EXP-022…032, KOS-PDF-001, 002, 009, 014, 017 · IE-ANO-027…030, 036…039.
- **Delivered:**
  - Zero-dependency OOXML `.xlsx` writer (`packages/domain/src/kosipa/xlsx.ts`) with typed numeric cells (`<c t="n">`), formula-neutralised inline strings, frozen header row, and metadata `Info` sheet.
  - Shared KKISI Financial Document Standard PDF engine (`packages/domain/src/kosipa/pdf-document.ts`) with Suzuki Blue (`#003399`) and Suzuki Red (`#E20A17`) masthead, KPI cards, key-value panels, provenance notices, right-aligned tabular numbers, zebra striping, repeating multi-page headers, and `Halaman X dari Y` footers.
  - Multi-format (`?format=csv|xlsx|pdf`) support across all 5 KOSIPA report export endpoints (`packages/application/src/kosipa/report-export.ts`).
  - Operational detail PDF exports (`packages/application/src/kosipa/document-pdf-export.ts`): Loan Card & Schedule PDF (`GET /api/kosipa/loans/[docNo]/pdf`), Payroll Member Slip PDF (`GET /api/kosipa/payroll/[docNo]/anggota/[nik]/pdf`), and Member Savings Passbook PDF (`GET /api/kosipa/savings/[memberId]/pdf`).
  - Public Savings Submission PDF upgraded to `kkisi-pss-a4/v3` and `kkisi-pss-wajib-a4/v3` while preserving `v1` and `v2` byte-identical rendering.
