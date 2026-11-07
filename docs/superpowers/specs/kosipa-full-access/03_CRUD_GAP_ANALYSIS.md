# 03 — CRUD gap analysis: legacy KOSIPA vs current Next.js

Historical baseline: branch `feat/currency-rupiah-standard` (HEAD `0af0dd77`, 30 Oct 2026). Updated source inventory 6 Nov 2026 at `4118c410`; full execution baseline and current limits are in [completion/STATUS.md](completion/STATUS.md). The existing read-only implementation is treated as correct unless evidence says otherwise (PRD §1.1); no rewrite is proposed for it.

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

Current conclusion: **read coverage is broad; five reference-master command families and the shared command/numbering/grant foundation exist for the isolated synthetic stack.** Production remains monitoring-only; native member/financial operational commands are absent at this baseline. Public-link request intake is a separate guarded business write, not savings approval/posting. Five-master routes are `/console/kosipa/master/[type]` and `/api/kosipa/master/[type]/**`; two-administrator grant tooling exists at `/console/settings/akses-kosipa` and `/api/console/kosipa-grants/**`. Neither a local test nor deployed source means full replacement acceptance.

## 2. Coverage counts (55 legacy features, [02 §4](02_LEGACY_FUNCTION_INVENTORY.md#4-function-inventory-matrix))

| Audited source status at 4118c410 | Count | Features |
|---|---|---|
| equivalent | 3 | F01, F09, F35 |
| partial | 13 | F08, F17, F23, F38, F41, F42, F44, F45, F50, F51, F52, F54, F55 |
| missing | 33 | F02, F03, F04, F05, F06, F07, F10, F11, F12, F13, F14, F15, F16, F18, F19, F22, F24, F25, F26, F27, F28, F29, F30, F31, F33, F34, F36, F37, F39, F40, F43, F46, F47 |
| retire | 4 | F20, F32, F48, F53 |
| not_live | 1 | F21 |
| hold | 1 | F49 |

These are static source-scope labels, not production acceptance. FD-29 subsequently brings the former HOLD F49 into implementation/sandbox scope; it remains pending work and is not excluded from the replacement goal. Each of all 55 features has its source mapping and remaining gap in [coverage-baseline.json](completion/coverage-baseline.json).

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
| Masters | 17 KOSIPA masters (F52) | Five synthetic CRUD slices: lokasi, bagian, jenis dokumen, rekening bank, periode angsuran | Remaining twelve or explicit disposition; compatibility, access and production cutover | WI-06 |
| IAM | KOSIPA users/groups/menus/profile/settings (F54) | Identity links, view capabilities and local two-admin grant workflow | Role-mode write actor/grants, production grant activation, remaining administration/business settings | WI-02, WI-24 |
| Platform | API settings + root prints (F55) | — | Authenticated print routes | WI-23 |

## 4. Differences in behaviour that are intentional (not gaps)
Next.js deliberately does **not** reproduce: client-trusted amounts/status, list-view writes, schedule rebuilds, hard deletes, auto-paid instalments, approver overwriting maker, GET mutations, md5 login, journal-less "posting" claims. Each is mapped to an ANO id in [06](06_LEGACY_ANOMALIES_AND_PERFORMANCE.md) and to a requirement.
