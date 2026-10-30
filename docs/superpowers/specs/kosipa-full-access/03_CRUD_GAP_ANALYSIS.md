# 03 — CRUD gap analysis: legacy KOSIPA vs current Next.js

Baseline: branch `feat/currency-rupiah-standard` (HEAD `0af0dd77`, 30 Oct 2026). The existing read-only implementation is treated as correct unless evidence says otherwise (PRD §1.1); no rewrite is proposed for it.

## 1. What Next.js KOSIPA does today (E1, verified in code)

| Capability | Route / API | Implementation | Writes? |
|---|---|---|---|
| Console shell, KOSIPA navigation, access status | `/console`, `/console/kosipa` | `features/console/navigation.ts`, `sidebar-model.ts` | no |
| Identity link staff ↔ KOSIPA user (create/revoke) | `/console/settings/identitas`, `POST /api/console/identity-links`, `…/[id]/revoke` | `application/console/identity-links.ts`, console store `console_identity_link` | **yes — console store only** |
| View capabilities from legacy menus | `GET /api/console/capabilities` | `domain/console/kosipa-access.ts` (view only) | no |
| Member directory + Member 360 (profile, savings, loans, store credit tabs) | `/console/kosipa/anggota`, `/anggota/[id]` | `application/kosipa/member-360.ts`, `kosipa-member.repository.ts` | no |
| Savings per member (recorded movements) | `/console/kosipa/simpanan`, `/simpanan/[id]`, `GET /api/kosipa/savings/[memberId]` | `application/kosipa/savings.ts`, `kosipa-savings.repository.ts` | no |
| Loans list/detail with schedule data-quality | `/console/kosipa/pinjaman`, `/pinjaman/[docNo]`, `GET /api/kosipa/loans`, `/loans/[docNo]` | `application/kosipa/loans.ts`, `kosipa-loan.repository.ts` | no |
| Payroll batches, member lines, store reconciliation (net of returns) | `/console/kosipa/payroll/**`, `GET /api/kosipa/payroll/**` | `application/kosipa/payroll.ts`, `domain/kosipa/payroll-reconciliation.ts` | no |
| Reports: membership, savings movements, loans, payroll, data quality + CSV export (allow-list) | `/console/kosipa/laporan/**`, `GET /api/kosipa/reports/**`, `…/export` | `application/kosipa/reports*.ts`, `report-export.ts` | no (export audit → console store) |
| Public secure link for Simpanan Sukarela deduction requests (operator issue/revoke link, member submits) | `/console/kosipa/simpanan-sukarela`, `/api/kosipa/public-savings-links/**`, `/api/kosipa/savings-applications/**` | `infrastructure/public-savings/service.ts` | **yes — `trans_simpanan_pengajuan` (OPEN request) + `pss_*` tables** (behind `PSS_*` flags) |
| Pure domain rules ready but unused by writes | — | `document-state.ts`, `loan-schedule.ts`, `payroll-settlement.ts`, `shu-allocation.ts`, `journal.ts`, `savings.ts` | — |

Conclusion: **read coverage is broad; the only KOSIPA business-table write is the public-link request intake.** No KOSIPA approval, financial posting, master-data or member write exists.

## 2. Coverage counts (55 legacy features, [02 §4](02_LEGACY_FUNCTION_INVENTORY.md#4-function-inventory-matrix))

| Status in Next.js | Count | Features |
|---|---|---|
| Existing (read parity for the feature's purpose) | 4 | F01, F09, F35, F42 |
| Partial | 8 | F08, F17, F23, F38, F45, F50, F51, F54 |
| Missing (to build) | 37 | F02–F07, F10–F16, F18, F19, F22, F24–F31, F33, F34, F36, F37, F39–F41, F43, F44, F46, F47, F52, F55 |
| RETIRE (not migrated, reason in 02/09) | 4 | F20, F32, F48, F53 |
| Not a live legacy feature (decision FD-09) | 1 | F21 |
| HOLD (P3 decision) | 1 | F49 |

By operation type, counted from the Type column of [02 §4](02_LEGACY_FUNCTION_INVENTORY.md#4-function-inventory-matrix) over the 44 write features (a feature can carry several types): Create 23 · Update 24 (one hidden, F31) · Delete 19 (all become cancel/void/reverse/deactivate) · Approve 15 · Reject 4 · Import 11 · Calculate 8 · Reverse 1 · Reconcile 1 · Cancel 1 · Other 2. Next.js covers **0** of the 44 write features natively (F45 has intake only).

## 3. Side-by-side gap table

| Area | Legacy capability | Next.js today | Gap | Work item |
|---|---|---|---|---|
| Membership | Register (F02), edit + status side effects (F03), delete (F04), imports (F05, F06), ID card (F07), mobile user admin (F10) | Directory + 360 (read) | All writes; deactivate semantics; staged imports; card printing | WI-07, WI-08, WI-23 |
| Deductions | Master potongan payroll (F18); mobile change requests (F45) | Public-link intake of SUKARELA requests | Config writes; request decisions (all channels) | WI-09 |
| Savings | Documents, lines, approval (F12–F15); withdrawals (F16, F46); card (F17) | Recorded movements per member; savings-movements report | All writes; server balance; reversal; official balance (B1) | WI-10, WI-11, WI-12 |
| Exit | Hak & kewajiban (F19) | — | Entire feature (fixed, atomic) | WI-20 |
| Lending | Apply (F22), simulate (F23), schedule (F24), disburse (F25), approve (F26), delete (F27), documents (F28), rollover (F29), import (F30), status refresh (F31), settlement/over-kredit (F33, F34), prints (F36), mobile loans (F47) | List/detail/schedule read; loan report | All writes; computed status (replaces F31); simulation is domain-only | WI-04, WI-13…WI-17, WI-23, WI-24 |
| Payroll | Batch CRUD (F37), generation (F38), line edits/imports (F39, F40), approval/settlement (F41), slip (F42), PPOB bills (F43) | Batches, lines, member view, store reconciliation | All writes; native generator | WI-18, WI-19, WI-22 |
| SHU | F44 | — | Entire feature | WI-21 |
| Reports | 14 legacy report controllers + Excel (F50) | 5 report families + data quality + CSV | Outstanding/kas per product, transaction cash; Excel→CSV parity | WI-23 |
| Dashboard | KPIs + notifications (F51) | Console landing widgets | KOSIPA KPIs with verified definitions | WI-24 |
| Masters | 17 KOSIPA masters (F52) | — | CRUD + deactivate | WI-06 |
| IAM | KOSIPA users/groups/menus/profile/settings (F54) | Identity links + view capabilities | Write capability grants (FD-16); business settings | WI-02, WI-24 |
| Platform | API settings + root prints (F55) | — | Authenticated print routes | WI-23 |

## 4. Differences in behaviour that are intentional (not gaps)
Next.js deliberately does **not** reproduce: client-trusted amounts/status, list-view writes, schedule rebuilds, hard deletes, auto-paid instalments, approver overwriting maker, GET mutations, md5 login, journal-less "posting" claims. Each is mapped to an ANO id in [06](06_LEGACY_ANOMALIES_AND_PERFORMANCE.md) and to a requirement.
