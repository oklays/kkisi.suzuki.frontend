# Full Access completion baseline — 6 November 2026

Owner objective: complete every pending KOSIPA Full Access task so the native application can replace Legacy KOSIPA. Owner selected verified legacy business parity with security and integrity corrections. Proposed changes to normal monetary formulas, payment schedules or financial policy are not silently adopted.

This is the complete static baseline at 4118c410, not a runtime/production acceptance report. The current production release remains monitoring-only. Source completion, synthetic verification, real-data UAT and production activation are separate evidence columns. An existing helper, route name, checkbox, successful build or deployment alone does not complete a business flow.

Inventory: **107 requirements, 42 tasks, 25 work items and 55 legacy features**. Five of seventeen masters have bounded synthetic CRUD; twelve remain to be implemented or explicitly dispositioned. Native financial command families remain absent at this baseline. Owner resolved WI-25/F49 scope on 6 November: external PPOB/IAK sales are included for implementation and sandbox testing, with no automatic paid production transactions. This item remains unimplemented at the baseline and must not be omitted.

Implementation workspace: `feat/kosipa-full-access-completion`, isolated from master/master-dev/live. Operational credentials, raw production schema exports and detailed ephemeral evidence remain outside Git. No production financial transaction is used as a test.

## Dependency order

1. Recover and verify the real-PHP synthetic harness, current structure-only contracts and source-driven inventory coverage (TASK-102/103/104).
2. Correct membership contract premises from actual source; characterize create/profile/status/side-table behavior, identifiers and supported controls (FA-03B M-01/M-02). Preserve normal business behavior and record intentional defect corrections.
3. Separate role-based monitoring from explicit per-user write grants and verified native actor identity; resolve view-entitlement/fence interaction. Add missing writer/ledger/grant/startup and ownership protections with tests.
4. Complete reference masters, native membership and imports/limits, deductions and request decisions, with domain/repository/HTTP/UI and legacy compatibility tests.
5. Complete savings documents/withdrawals/reversals; loan products/applications/decisions/disbursement/rollover/settlement/attachments; payroll/native generation/exit/SHU/PPOB billing.
6. Complete report/print parity, dashboard/notifications/settings, security/concurrency, reconciliation, accessibility/performance, current production definitions and all competing-writer inventory.
7. Rehearse rollback and all eight cutover gates by feature, obtain genuine owner UAT evidence and activate verified native ownership. Keep legacy and data recoverable. The goal remains incomplete until full replacement acceptance is evidenced.

## Task inventory

| Task | Existing document state | Audited source state | Remaining gap |
|---|---|---|---|
| TASK-101 Owner/finance decision session on FD-01…FD-21 and inherited D1–D6. | unchecked | partial | Decision register exists; many FD/D/B choices remain open; read monitoring FD-26 does not approve financial policy. |
| TASK-102 Operator evidence intake G-01…G-10 (source hashes, view/procedure bodies, triggers/indexes/`sql_mode`, production menu/grants, row counts). | partial | partial | Synthetic exporter ready; actual complete routine/source/ownership intake missing. |
| TASK-103 Inventory drift check tool. | unchecked | missing | Required inventory checker absent. |
| TASK-104 Characterization harness and golden files for WP-01…WP-30. | unchecked | partial | Real-PHP five-master harness is a slice; all WP01-30 scenario/golden suite absent despite unchecked task. |
| TASK-105 Command ledger DDL and rollback (local only; production review SQL). | checked-local-only | exact | Local foundation implemented; production provisioning and FD-01c remain. |
| TASK-106 Domain command primitives (request hash, idempotency outcome, error codes). | checked-local-only | exact | Current command primitives implemented; historical tests not rerun here. |
| TASK-107 Unit of work + lock helpers + ownership gate + flags. | checked-local-only | partial | Local master foundation implemented; retry-count mismatch and unregistered remaining contexts. |
| TASK-108 Command pipeline use case + audit emission. | checked-local-only | partial | Pipeline exists; document lifecycle integration and full structured metrics/disabled-denial audit missing. |
| TASK-109 Transaction-safe native document-number allocation (local reusable foundation). | checked-local-only | exact | Reusable local foundation complete within revised task title; real command integration/FD23/FD02 remain. |
| TASK-110 Write capability vocabulary and grant store. | checked-local-only | exact | Local grants lifecycle complete; master-only grantable scope and production gate remain. |
| TASK-111 Read-model corrections (computed loan status; zero writes in reads). | unchecked | partial | Existing read files do not implement computed all-paid LUNAS; no read-write assertion suite. |
| TASK-112 Performance baseline and index proposal. | unchecked | missing | Benchmark script and measured full-access baseline absent. |
| TASK-113 Legacy switch generator and staging rehearsal. | partial | partial | Equivalent named fence generator exists; five-master synthetic rehearsal only, all-writer member fence unproven. |
| TASK-114 Masters domain + commands + writer + pages. | partial | partial | Five of seventeen masters; twelve outstanding. |
| TASK-115 Member register/profile/status/deactivate. | unchecked | partial | Register + profile domain/application core (T03) and synthetic-stack repository, writer grants, fence/ownership feature and legacy read compatibility (T04, MC12) exist; status/deactivate, HTTP/UI, production writer and cutover absent. |
| TASK-116 Staged imports (members, limits). | unchecked | missing | No staged imports/limits command. |
| TASK-117 Deduction configuration + request decisions (mobile, public link, savings changes). | unchecked | missing | No config/request decisions. |
| TASK-118 Savings documents (payroll, deposit, opening balance). | unchecked | missing | No savings document lifecycle. |
| TASK-119 Withdrawals (staff + mobile processing). | unchecked | missing | No withdrawal lifecycle. |
| TASK-120 Savings reversal. | unchecked | missing | No savings reversal. |
| TASK-121 Loan product configuration and exact calculations (flat/annuity, fees, due-day clamp, ratio). | unchecked | partial | Exact schedule/ratio primitives pre-exist; product/rate/fee/date/parity implementation missing. |
| TASK-122 Loan application command + pages. | unchecked | missing | Loans API is GET only; no application writer/page. |
| TASK-123 Loan approve/reject/cancel/void. | unchecked | missing | No loan lifecycle decisions. |
| TASK-124 Disbursement with schedule-once and rollover settlement. | unchecked | missing | No disbursement/rollover persistence. |
| TASK-125 Early settlement, over-kredit, loan reversal. | unchecked | missing | No early settlement/reversal. |
| TASK-126 Loan document attachments. | unchecked | missing | No attachments lifecycle. |
| TASK-127 Mobile loan request conversion. | unchecked | missing | No mobile loan conversion. |
| TASK-128 Payroll batch lifecycle with batch-scoped settlement. | unchecked | partial | Read/plan helpers exist, no payroll batch writer. |
| TASK-129 Native payroll generator (after B1). | unchecked | missing | No native generator; B1/parity open. |
| TASK-130 Member exit settlement. | unchecked | missing | No atomic exit. |
| TASK-131 Compatibility tests (legacy pages + procedure read Next.js rows). | partial | partial | Five-master PHP slice; financial/procedure definitions incomplete. |
| TASK-132 SHU lifecycle. | unchecked | partial | Allocator only; SHU lifecycle absent. |
| TASK-133 PPOB member billing. | unchecked | missing | No native billing. |
| TASK-134 Report parity (outstanding/cash per product, transaction cash, savings outstanding) and authenticated prints. | unchecked | partial | Existing report/CSV/request PDF slices; remaining report families/official print parity absent. |
| TASK-135 Dashboard KPIs, notifications, business settings. | unchecked | partial | Widgets only; verified KOSIPA dashboard, notification mutation and settings absent. |
| TASK-136 Security and concurrency suite across all commands. | unchecked | partial | Master-focused security/concurrency evidence exists; suite across absent commands cannot pass. |
| TASK-137 Read-after-write and UI states. | unchecked | partial | Historical master browser/UI evidence exists; all-feature refresh/accessibility/POS latency coverage absent. |
| TASK-138 Reconciliation reports and audit review job. | unchecked | missing | No report/review job. |
| TASK-139 Connection budget and writer account review SQL. | partial | partial | Synthetic pool2 guard/review docs; production registry, all context grants/intake absent. |
| TASK-140 Cutover rehearsal per feature group on staging (gates 1–8). | unchecked | missing | No all-group staging rehearsal and accepted rollback evidence. |
| TASK-141 Full verification run. | partial | partial | Historical local foundation verification, not current full programme verification. |
| TASK-142 Owner UAT checklist per feature group (not production). | unchecked | missing | Per-feature owner UAT checklist/filled acceptance absent. |

## Work-item inventory

| WI | Source state | Tasks | Remaining scope |
|---|---|---|---|
| WI-01 Write foundation (command pipeline) | partial | TASK-105, TASK-106, TASK-107, TASK-108, TASK-109 | Local foundation implemented; production provisioning and FD-01c remain.; Current command primitives implemented; historical tests not rerun here.; Local master foundation implemented; retry-count mismatch and unregistered remaining contexts.; Pipeline exists; document lifecycle integration and full structured metrics/disabled-denial audit missing.; Reusable local foundation complete within revised task title; real command integration/FD23/FD02 remain. |
| WI-02 Write capability grants | partial | TASK-110 | Local grants lifecycle complete; master-only grantable scope and production gate remain. |
| WI-03 Characterization and reconciliation harness | partial | TASK-102, TASK-103, TASK-104, TASK-131, TASK-138 | Synthetic exporter ready; actual complete routine/source/ownership intake missing.; Required inventory checker absent.; Real-PHP five-master harness is a slice; all WP01-30 scenario/golden suite absent despite unchecked task.; Five-master PHP slice; financial/procedure definitions incomplete.; No report/review job. |
| WI-04 Read-model corrections and performance baseline | partial | TASK-111, TASK-112 | Existing read files do not implement computed all-paid LUNAS; no read-write assertion suite.; Benchmark script and measured full-access baseline absent. |
| WI-05 Legacy switch tooling (FD-03) | partial | TASK-113, TASK-140 | Equivalent named fence generator exists; five-master synthetic rehearsal only, all-writer member fence unproven.; No all-group staging rehearsal and accepted rollback evidence. |
| WI-06 KOSIPA reference masters | partial | TASK-114 | Five of seventeen masters; twelve outstanding. |
| WI-07 Members: register, profile, status, deactivate | partial | TASK-115 | Register/profile repository proven on the synthetic stack only (T04); status/deactivate, HTTP/UI and production activation remain. |
| WI-08 Member imports and credit limits | missing | TASK-116 | No staged imports/limits command. |
| WI-09 Payroll deduction configuration and request decisions | missing | TASK-117 | No config/request decisions. |
| WI-10 Savings documents (payroll, deposit, opening balance) | missing | TASK-118 | No savings document lifecycle. |
| WI-11 Withdrawals (staff + mobile) | missing | TASK-119 | No withdrawal lifecycle. |
| WI-12 Savings reversal | missing | TASK-120 | No savings reversal. |
| WI-13 Loan products, application and simulation | partial | TASK-121, TASK-122 | Exact schedule/ratio primitives pre-exist; product/rate/fee/date/parity implementation missing.; Loans API is GET only; no application writer/page. |
| WI-14 Loan approval, rejection, cancel, void | missing | TASK-123 | No loan lifecycle decisions. |
| WI-15 Disbursement, schedule, rollover | missing | TASK-124 | No disbursement/rollover persistence. |
| WI-16 Early settlement, over-kredit, loan reversal | missing | TASK-125 | No early settlement/reversal. |
| WI-17 Mobile loan request conversion | missing | TASK-127 | No mobile loan conversion. |
| WI-18 Payroll batch (native lifecycle; generation still legacy) | partial | TASK-128 | Read/plan helpers exist, no payroll batch writer. |
| WI-19 Native payroll generator | missing | TASK-129 | No native generator; B1/parity open. |
| WI-20 Member exit settlement | missing | TASK-130 | No atomic exit. |
| WI-21 SHU | partial | TASK-132 | Allocator only; SHU lifecycle absent. |
| WI-22 PPOB member billing | missing | TASK-133 | No native billing. |
| WI-23 Report parity and printed documents | partial | TASK-134 | Existing report/CSV/request PDF slices; remaining report families/official print parity absent. |
| WI-24 Dashboard, notifications, business settings, loan documents | partial | TASK-126, TASK-135 | No attachments lifecycle.; Widgets only; verified KOSIPA dashboard, notification mutation and settings absent. |
| WI-25 PPOB sales operations (F49) | hold | TASK-135 | External IAK integration remains explicitly HOLD under REQ-137; owner decision needed to expand scope. |

## Scope and status inconsistencies

- S01: 03_CRUD_GAP_ANALYSIS says no native master writes and F52 Missing, while MASTER_TYPES and generic commands implement five synthetic masters.
- S02: 09 backlog global status PROPOSED/not started is stale; tasks records six checked foundations plus six partial, real-PHP harness and numbering. Dependency graph omits defined WI-24 and table-only WI-25.
- S03: TASK-108 checked does not satisfy REQ-106 financial lifecycle or OBS-103 full metrics; pipeline has no document state call and only audit-append-failure log hook.
- S04: REQ-134/TASK-111 existing path is not computed all-paid status: loan repository selects status_bayar and list filter uses it; loansFullyPaid is not read-model integration.
- S05: NFR-105/TASK107 says retry once; UOW MAX_ATTEMPTS=3 permits two automatic retries. Resolve contract explicitly.
- S06: OBS-102 universal denied/failed audit is incomplete: ownership.owns false throws before event helper/catch, so WRITE_DISABLED is not emitted by pipeline; HTTP flag-off also returns before pipeline.
- S07: Production writer capability is intentionally impossible in current master adapter: validate config refuses isProduction and only accepts loopback3322/kkisi_kfa_synthetic. Checked local tasks never imply replace-legacy readiness.
- S08: F30 loan import has no explicit standalone atomic task/acceptance in full-access tasks; TASK116 is members/limits. F11 dormant mobile-user list also lacks explicit migrate/retire task.
- S09: F42 Existing is member detail read equivalence, not authenticated payroll-slip print acceptance; REQ132/TASK134 still open. F09/F35 recorded amounts do not establish official balance/outstanding parity.
- S10: Latest restore validation explicitly reports zero restored procedures against ten source procedures. Table/view copy cannot close B1, native payroll parity or all production-definition gates.
- S11: VAL112 URL doc format differs from current loan read parser (letters both cases, underscore,4..50 vs upper-case/hyphen1..30). Decide compatibility policy separately from new writers.
- S12: Full replacement cannot be declared while WI19 intentionally retains payroll procedure until measured parity; REQ104 final no-runtime-dependency and transitional MIG107 require phased acceptance.
- S13: BR118 independent per-item bulk commands and REQ112 one-transaction confirmed valid rows require explicit staged-import/bulk distinction to avoid contradictory implementation acceptance.
- S14: FD26 production monitoring permits view access only; cannot infer financial policy, write grants, ownership trigger exception, numbering deviations or all deployment authorization from read monitoring.
- S15: F52 gate text says10/17 masters not-in-menu while counting mixes TOKO brand/category/unit; 17 KOSIPA master inventory and seven in-menu wording need source/menu reconciliation before priorities.
- S16: TASK104 unchecked overlooks real-PHP harness slice; TASK111 planned files already exist but planned computed behavior does not. File existence and test names must not drive completion.

## Owner decisions recorded during execution

- Verified normal legacy business parity, with security/integrity corrections retained.
- Bank-account and member-status changes: one authorized operator, with mandatory reason and audit. This does not remove existing maker-checker requirements for financial document approvals/disbursements/reversals.
- WI-25/F49 IAK sales: in scope, sandbox verification only; automatic paid production transactions are not authorized. PPOB member billing/payroll is separately still required.
