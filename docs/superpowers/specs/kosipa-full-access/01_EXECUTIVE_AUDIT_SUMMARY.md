# 01 — Executive audit summary: KOSIPA full access

Date: 30 October 2026. Scope: turn the read-only KOSIPA module of the unified console into a complete native management system. This is an **audit and plan**; no application code, schema, grant or production data was changed. Evidence: local legacy source copy, Next.js source, aggregate read-only queries on the local 30 Sep 2026 staging copy, earlier spec `unified-console-kosipa-warehouse` (UCKW).

## 1. Summary

Legacy KOSIPA (CodeIgniter 2, PHP 5.6) runs every financial and administrative operation of the cooperative: members, payroll savings deductions, deposits and withdrawals, seven loan products, disbursement with rollover netting, early settlement, monthly payroll deduction and settlement, member exit settlement, SHU, mobile request processing and 17 reference masters. It does so **without a single database transaction or lock on any approval, disbursement, settlement or payroll path**, trusting balances, statuses and payoff amounts sent by the browser, authorising per page instead of per action, and with several defects that silently change financial history (loan schedules rebuilt on edit and past instalments auto-marked paid; payroll approval settling every member of the month; exit approval failing half-way).

Next.js today reads all of this well (member 360, savings, loans, payroll with store reconciliation, five report families, CSV export) and writes only identity links and public-link savings requests. It already contains the pure financial rules needed for safe writes (state machine with maker-checker, exact schedules, batch-scoped settlement, SHU allocation, returns-net store obligations).

Recommendation: build writes as one uniform, transactional, idempotent, audited command pipeline; migrate feature groups one at a time using a reversible legacy switch (`ref_menu.status`, a data change) so there is never a second writer; keep data legacy-compatible so rollback needs no conversion. Start with the foundation checkpoint in §8.

## 2. Legacy feature coverage (from [02](02_LEGACY_FUNCTION_INVENTORY.md), [02A](02A_LEGACY_METHOD_WRITE_INDEX.md))

| Measure | Count |
|---|---|
| Controllers / functions | 94 / 776 |
| Controller methods that write | 285 |
| Tables written / procedures called | 60 / 2 |
| Business features inventoried | 55 (F01–F55) |
| … with database writes | 44 |
| Controllers reachable via the 30 Sep menu / unreachable (gated, not in menu) / ungated or print | 54 / 25 / 15 |
| Menu entries without source | 9 |
| Endpoints calling non-existent model methods | 7 |
| Write paths using a transaction | 6 functions (deletes and uploads only) |

PRD capability list items **not supported by legacy**: member suspension workflow, savings adjustments, savings interest accrual, reversal documents, period closing, live GL posting (code exists but is not wired; journals table empty), system reconciliation, branch authorization, batch jobs ([02 §7](02_LEGACY_FUNCTION_INVENTORY.md#7-capabilities-the-prd-asks-about-that-legacy-does-not-have)).

## 3. Current Next.js coverage and missing capabilities ([03](03_CRUD_GAP_ANALYSIS.md))
Existing 4 · Partial 8 · Missing 37 · RETIRE 4 · not-live 1 · HOLD 1 (of 55). **0 of 44 legacy write features exist natively** (only the request intake of F45). Missing: all member writes, deduction config, all savings documents and withdrawals, the whole loan lifecycle, payroll lifecycle and generator, exit, SHU, masters, write grants, remaining report families and authenticated prints.

## 4. Critical financial and technical risks

| Risk | Evidence |
|---|---|
| Loan schedule rebuilt on every edit; instalments due ≤ today marked paid without payment | `ANO-K22`, `ANO-K23`; 24,027 paid instalments without payment type, 6,696 dated after the snapshot |
| Payroll approval of one group settles all members' instalments of the month; re-approval re-runs | `ANO-K05`, `ANO-K47` |
| Withdrawals validated against a browser-sent balance; no lock | `ANO-K04` |
| Exit approval fails after the header is approved (wrong column), member stays active | `ANO-K31` |
| Hard deletes of approved loans and of members with history | `ANO-K28`; 33,136 orphan instalment rows |
| Approver overwrites creator → maker-checker unprovable | `ANO-K27` |
| No unique document numbers; 7 duplicate loan numbers | `ANO-K06` |
| Shared live DB written by four applications; 12/12 connections already allocated | UCKW B5/B8; [04 §2](04_DATABASE_WRITE_MAPPING.md#2-write-target-inventory) |
| View/procedure definitions (balances, loan amounts, payroll generator) missing from every local copy | B1 |

## 5. Database write-path findings ([04](04_DATABASE_WRITE_MAPPING.md))
- 30 write paths reconstructed (WP-01…WP-30) with statement order and file:line evidence.
- Hidden writes: loan list views update `status_bayar` per row; public schedule rebuild URLs; GET-driven IAM changes (private); two stored procedures.
- Multi-writer tables: `m_anggota` (KOSIPA ×many, TOKO legacy, smartkkisi), `trans_simpanan_pengajuan` (smartkkisi, Next.js public link, KOSIPA), `users` (smartkkisi + KOSIPA wallet mirror).
- Write ownership matrix and coexistence answers in [04 §4–§5](04_DATABASE_WRITE_MAPPING.md#4-write-ownership-matrix-per-feature): today both systems could act on the same pending item and conflicting approvals are possible; hence one writer per feature group, switched together.

## 6. Significant legacy logic defects ([05](05_BUSINESS_RULES_AND_FINANCIAL_LOGIC.md), [06](06_LEGACY_ANOMALIES_AND_PERFORMANCE.md))
Flat amounts overwritten by the annuity view (`ANO-K07`, now confirmed in code); annuity loop can drop the last instalment (2,673/5,346 simulated parameter sets; not seen in stored data); due day 29–31 overflow; LUNAS judged from the last row only (212 inconsistent loans); rollover marks all old instalments paid without type; early settlement amounts from the browser without approval; bulk approve skips single-approve effects; repeated approval duplicates saldo rows; status change re-sets wallets of deactivated members; SHU rounding loses money (Rp1,000 on a Rp1,000,000 example); float money with 1.1 M fractional instalment rows; ≈1,400 column-shifted member rows; savings header/line status divergence (≈42,000 lines).

## 7. Database performance opportunities ([06 §3](06_LEGACY_ANOMALIES_AND_PERFORMANCE.md#3-performance-findings))
Financial tables have only primary keys: every schedule lookup scans 1.2 M rows (two audit aggregates exceeded 120 s locally). Proposed Tier-1 indexes (already drafted, not executed), set-based status computation instead of per-row list writes, keyset pagination instead of DataTables triple queries, canonical NIK keys instead of `CONVERT()` predicates, batch-scoped chunked payroll settlement, staged imports. Targets in [06 §3.1](06_LEGACY_ANOMALIES_AND_PERFORMANCE.md#31-performance-targets-proposed--baselines-first-prd-61), measured only after a recorded baseline.

## 8. Recommended first implementation checkpoint

**CP-1 "Write foundation + evidence" (no business write enabled anywhere outside DEV LOCAL):**
1. Owner decisions FD-01 (ledger table), FD-03 (legacy switch), FD-16 (grant store) and the operator evidence request G-01…G-10 / B1 (`TASK-101`, `TASK-102`).
2. Inventory drift tool and characterization harness on synthetic data (`TASK-103`, `TASK-104`).
3. Command pipeline: ledger (local), unit of work, locks, idempotency, ownership gate, flags, numbering, audit (`TASK-105`…`TASK-109`).
4. Write capability vocabulary and grants (`TASK-110`); computed loan status and zero writes in reads (`TASK-111`); performance baseline and index proposal (`TASK-112`); legacy switch generator rehearsed on staging (`TASK-113`).
5. **Proof slice:** reference-masters commands (WI-06 / `TASK-114`) end-to-end on DEV LOCAL synthetic data behind a flag — the lowest-risk feature that exercises every layer, the switch and rollback.

Exit criteria: foundation tests (single effect under 20 concurrent submissions; zero rows after injected failure; deadlock retry), security matrix for the master commands, switch + rollback rehearsal recorded, spec coverage validator passing. Nothing is deployed or activated in production.

## 9. Recommended native architecture ([07](07_TARGET_ARCHITECTURE.md), [08](08_AUTHORIZATION_AND_AUDIT_DESIGN.md))
Existing layering (`apps → application → domain`), no new ORM/framework. Commands per bounded context (reference data, membership, savings configuration, savings, lending, payroll, exit, SHU, IAM). One InnoDB transaction per command with fixed lock order, idempotency keys and a command ledger in the business DB (FD-01), console audit for denials/exports/grants. Explicit write grants; identity link grants no writes; maker ≠ checker for money-moving actions. Legacy-compatible statuses, identifiers and scales.

## 10. Prioritised roadmap ([09](09_IMPLEMENTATION_BACKLOG.md))
P0: WI-01 foundation, WI-02 grants, WI-03 harness, WI-04 read corrections/indexes, WI-05 switch tooling. P1: WI-06 masters → WI-07/08 members → WI-09 deductions/requests → WI-10/11/12 savings → WI-13…WI-17 lending → WI-18/19 payroll → WI-20 exit. P2: WI-21 SHU, WI-22 PPOB bills, WI-23 reports/prints, WI-24 dashboard/settings/documents. HOLD: PPOB sales. RETIRE: KOSIPA login/menu, TOKO catalog masters, duplicates.

## 11. Production migration and cutover considerations ([11](11_CUTOVER_AND_ROLLBACK_PLAN.md))
Nine cutover steps C-1…C-9 by feature group, each passing eight gates (parity, invariants, permissions, DB compatibility, ownership, coexistence/drain, reconciliation sign-off, rehearsed rollback). Switch = operator-run reviewed SQL on `ref_menu.status` + Next.js flag; rollback ≤ 15 minutes with no data conversion. Preconditions: connection capacity decision (B5/B8), console store in production (B6), production view/procedure definitions (B1), writer accounts by reviewed SQL. Payroll generation stays on the legacy procedure until the native generator proves parity.

## 12. Documents created
See [README](README.md): 01–12 PRD deliverables, 02A generated method index, the six skill files (current-state, impact-analysis, requirements, design, tasks, verification), and a gitignored private security annex.

## 13. Evidence gaps and decisions
Gaps G-01…G-10 and decisions FD-01…FD-21 (plus inherited D1–D6, B1, B3–B6, B8, B10) in [12](12_DECISION_REGISTER.md). Most consequential: B1 (view/procedure bodies — no official balance or loan parity without them), FD-01/FD-03/FD-16 (needed for CP-1), D1/D2/D4/D6 (needed before lending, withdrawals and payroll approval).
