# Feature Requirements Specification: `kosipa-full-access`

IDs in this spec start at 101 to stay distinct from the earlier spec `unified-console-kosipa-warehouse`, whose IDs are cited here without a hyphen (for example `UCKW:REQ030`) so the coverage validator only tracks this spec. Every requirement maps to design, tasks and verification in [verification.md](verification.md).

## 1. Overview & Business Objectives
- **Problem Statement**: KOSIPA in the unified console is read-only. All financial and administrative operations still run in legacy CodeIgniter 2 (PHP 5.6), which has no transactions on any approval path, takes balances/statuses/payoffs from the browser, rebuilds loan schedules on edit (erasing payment history), and authorises per page instead of per action ([01](01_EXECUTIVE_AUDIT_SUMMARY.md), [06](06_LEGACY_ANOMALIES_AND_PERFORMANCE.md)).
- **Business Goal**: every legitimate legacy KOSIPA capability ([02](02_LEGACY_FUNCTION_INVENTORY.md), F01–F55) is available natively in Next.js with correct business behaviour, transactional safety, per-action authorization, an audit trail and better performance — with no runtime dependency on PHP and no uncontrolled dual writer.
- **Target User Roles**: KOSIPA Operator (prepares documents), Supervisor (approves), Finance (disburses, approves payroll/exit), Admin (masters, configuration, grants), Auditor (read/export). Role bundles are proposals until FD-16/FD-17.

## 2. Requirements Matrix

### Functional Requirements (`REQ-*`)

Foundation (P0)
- `REQ-101`: Keep the legacy inventory complete and current.
  - **EARS Acceptance Criteria**: WHEN the legacy source or menu evidence changes, THE SYSTEM (inventory tooling) SHALL regenerate [02A](02A_LEGACY_METHOD_WRITE_INDEX.md) and SHALL fail if any controller or write method lacks a feature mapping (F01–F55) or a RETIRE/HOLD reason.
  - **Traceability**: PRD §3, §14 ("all discoverable routes inventoried").
- `REQ-102`: Maintain the legacy ↔ Next.js gap analysis.
  - **EARS Acceptance Criteria**: WHEN a feature changes status, THE SYSTEM documentation SHALL update [03](03_CRUD_GAP_ANALYSIS.md) so that each F-ID shows Existing/Partial/Missing/RETIRE/HOLD with the Next.js route.
  - **Traceability**: PRD §3.2, §12-03.
- `REQ-103`: Enforce one writer per feature.
  - **EARS Acceptance Criteria**: WHEN a KOSIPA write command is received, THE SYSTEM SHALL execute it only if that feature's ownership state is `N` and its write flag is on; otherwise it SHALL return `503 WRITE_DISABLED` without touching the database.
  - **Traceability**: PRD §4.1.
- `REQ-104`: No legacy runtime dependency.
  - **EARS Acceptance Criteria**: THE SYSTEM SHALL perform every KOSIPA mutation through Next.js use cases and writer repositories, and SHALL NOT call legacy PHP URLs, reuse PHP sessions, or call legacy stored procedures from a writer.
  - **Traceability**: PRD §2.1.
- `REQ-105`: Uniform command pipeline.
  - **EARS Acceptance Criteria**: WHEN any write command runs, THE SYSTEM SHALL validate input, check capability, resolve idempotency, lock rows in the context's lock order, re-check state and invariants on locked rows, write business rows and the ledger in one transaction, and append the outcome to the console audit.
  - **Traceability**: PRD §7, §9.
- `REQ-106`: Server-side document lifecycle.
  - **EARS Acceptance Criteria**: WHEN a transition is requested, THE SYSTEM SHALL decide the target state from the action name and the current stored state (domain `nextDocumentState`) and SHALL refuse any client-supplied status.
  - **Traceability**: `ANO-K03`.
- `REQ-107`: Document numbering.
  - **EARS Acceptance Criteria**: WHEN a document is created, THE SYSTEM SHALL allocate `PREFIX+YYYY+MM+n` under a lock inside the creating transaction and SHALL verify no row with that number exists before commit.
  - **Traceability**: `ANO-K06`, R-02.

Membership (P1)
- `REQ-108`: Register a member.
  - **EARS Acceptance Criteria**: WHEN an authorised user registers a member, THE SYSTEM SHALL refuse a canonical-NIK duplicate and SHALL insert the member and its initial payroll deduction rows atomically.
  - **Traceability**: F02, `ANO-K39`.
- `REQ-109`: Update a member profile.
  - **EARS Acceptance Criteria**: WHEN profile, employment, bank or salary fields change, THE SYSTEM SHALL update only those fields, record a before/after summary without PII values, and SHALL NOT change status, limits or deductions in the same command.
  - **Traceability**: F03, `ANO-K12`.
- `REQ-110`: Change member status.
  - **EARS Acceptance Criteria**: WHEN a member moves to a non-AKTIVE status, THE SYSTEM SHALL in one transaction set the status, zero `limit_toko`/`limit_ppob`/`gaji_minus`, set the mobile wallet mirror per FD-08 once, and delete the member's mobile tokens by `user_id`.
  - **Traceability**: F03, F10, `ANO-K32`, `ANO-K17`.
- `REQ-111`: Deactivate instead of delete.
  - **EARS Acceptance Criteria**: WHEN removal of a member is requested, THE SYSTEM SHALL deactivate; IF the member has any financial history, THEN THE SYSTEM SHALL refuse a hard delete.
  - **Traceability**: F04, `ANO-K28`, FD-07.
- `REQ-112`: Staged imports (members, limits).
  - **EARS Acceptance Criteria**: WHEN a file is imported, THE SYSTEM SHALL validate every row, show a preview with per-row errors, and apply all valid rows in one transaction only after confirmation; invalid enum values (status/group) SHALL be rejected.
  - **Traceability**: F05, F06, `ANO-K38`.
- `REQ-113`: Payroll deduction configuration.
  - **EARS Acceptance Criteria**: WHEN deductions are set or a deduction request (mobile or public link) is approved, THE SYSTEM SHALL keep at most one active row per member×type in `m_simpanan_aktif` and SHALL mark the request decided in the same transaction.
  - **Traceability**: F18, F45.

Savings (P1)
- `REQ-114`: Savings documents (payroll, cash/transfer deposit, opening balance).
  - **EARS Acceptance Criteria**: WHEN a savings document is approved, THE SYSTEM SHALL set header and all lines to the same status, set the payout/receipt date, insert the `trans_simpanan_saldo` row only on the first transition, and SHALL refuse edits to lines of non-OPEN documents.
  - **Traceability**: F12–F15, `ANO-K30`, `ANO-K34`, `ANO-K43`.
- `REQ-115`: Withdrawals with server balance.
  - **EARS Acceptance Criteria**: WHEN a withdrawal line is added and again WHEN it is approved, THE SYSTEM SHALL compute the available balance from approved movements minus pending withdrawals under a lock on the member and SHALL refuse amounts that break the type policy (D2).
  - **Traceability**: F16, F46, `ANO-K04`.
- `REQ-116`: Savings reversal.
  - **EARS Acceptance Criteria**: WHEN an approved savings document must be corrected, THE SYSTEM SHALL create a reversal document referencing it, requiring a reason and a checker, and SHALL NOT delete or edit the original.
  - **Traceability**: R-17.
- `REQ-117`: Member exit settlement.
  - **EARS Acceptance Criteria**: WHEN an exit settlement is approved, THE SYSTEM SHALL atomically settle open loans, create the net savings withdrawal per FD-13, deactivate the member per REQ-110 and mark the settlement approved; IF any step fails, THEN nothing SHALL be committed.
  - **Traceability**: F19, `ANO-K31`, `ANO-X01`.

Lending (P1)
- `REQ-118`: Loan application for every product.
  - **EARS Acceptance Criteria**: WHEN a loan is applied for, THE SYSTEM SHALL use the product configuration (replacing the 7 controllers), compute fees and the schedule preview with exact arithmetic, evaluate the deduction ratio (D1), store a salary snapshot on the loan, and SHALL NOT change the member's salary.
  - **Traceability**: F22, F23, `ANO-K07`, `ANO-K11`, `ANO-K12`, `ANO-K24`, `ANO-K25`.
- `REQ-119`: Loan approval and rejection.
  - **EARS Acceptance Criteria**: WHEN a loan is approved or rejected, THE SYSTEM SHALL require a checker different from the maker, record both in the ledger, and SHALL keep the legacy `cd_usr` as the maker.
  - **Traceability**: F26, `ANO-K27`.
- `REQ-120`: Disbursement with rollover netting.
  - **EARS Acceptance Criteria**: WHEN an approved loan is disbursed, THE SYSTEM SHALL in one transaction compute fees and net amount, settle linked old loans using server-computed remaining amounts (FD-11) with type `ROLLOVER` and a reference, and generate the schedule once with every instalment unpaid (FD-06).
  - **Traceability**: F25, F29, `ANO-K46`.
- `REQ-121`: Schedule immutability.
  - **EARS Acceptance Criteria**: WHILE a loan is disbursed, THE SYSTEM SHALL NOT delete or regenerate its schedule, and SHALL change instalment status only through settlement commands that record the settlement type and document.
  - **Traceability**: F24, `ANO-K22`, `ANO-K23`, `ANO-K44`.
- `REQ-122`: Early settlement and over-kredit.
  - **EARS Acceptance Criteria**: WHEN an early settlement is prepared, THE SYSTEM SHALL compute the payoff server-side (FD-11) and SHALL apply it only after checker approval.
  - **Traceability**: F33, F34, `ANO-K29`.
- `REQ-123`: Cancel, void and reverse instead of delete.
  - **EARS Acceptance Criteria**: WHEN deletion of a loan is requested, THE SYSTEM SHALL cancel (OPEN), void (approved, not disbursed) or reverse (disbursed, within FD-14 limits) and SHALL never delete loan or instalment rows.
  - **Traceability**: F27, `ANO-K28`, 05 §4.
- `REQ-124`: Loan documents.
  - **EARS Acceptance Criteria**: WHILE a loan is OPEN, THE SYSTEM SHALL allow attaching and removing supporting files stored outside the web root and served only to authorised users.
  - **Traceability**: F28.

Payroll, SHU, requests (P1/P2)
- `REQ-125`: Payroll batch lifecycle.
  - **EARS Acceptance Criteria**: WHEN a payroll batch is approved, THE SYSTEM SHALL settle only instalments of members in that batch whose deduction covers what is due, list exceptions (D4), mark loans LUNAS per REQ-134, refuse re-approval, and SHALL NOT modify loans on header edits.
  - **Traceability**: F37–F42, `ANO-K05`, `ANO-K45`, `ANO-K47`.
- `REQ-126`: PPOB member billing.
  - **EARS Acceptance Criteria**: WHEN PPOB bills are generated and processed, THE SYSTEM SHALL produce per-member amounts reconciled to their source orders and SHALL feed the payroll PPOB component.
  - **Traceability**: F43.
- `REQ-127`: SHU lifecycle.
  - **EARS Acceptance Criteria**: WHEN SHU is allocated, THE SYSTEM SHALL refuse zero totals, allocate with largest remainder to the configured unit so Σ allocations = pool − reported remainder, and SHALL apply the financial effect decided in FD-10 on approval.
  - **Traceability**: F44, `ANO-K09`, `ANO-K42`.
- `REQ-128`: Mobile and public-link request decisions.
  - **EARS Acceptance Criteria**: WHEN a savings-change, withdrawal or loan request is decided, THE SYSTEM SHALL lock the request, convert it into the target document through the same commands as staff-entered documents, and update the request status in the same transaction.
  - **Traceability**: F45–F47.
- `REQ-129`: KOSIPA reference masters.
  - **EARS Acceptance Criteria**: WHEN a master record is created, updated or deactivated, THE SYSTEM SHALL validate COA account codes where present and SHALL refuse hard deletion of referenced records.
  - **Traceability**: F52.
- `REQ-130`: Write capability grants.
  - **EARS Acceptance Criteria**: WHEN a user is granted or revoked a KOSIPA write capability, THE SYSTEM SHALL record grantor, reason and time, refuse self-grants, and SHALL derive no write capability from an identity link or a legacy menu.
  - **Traceability**: PRD §8, FD-16.

Read side, documents, operations
- `REQ-131`: Remaining report parity.
  - **EARS Acceptance Criteria**: WHEN a legacy report family (outstanding per product, cash per product, transaction cash, savings outstanding) is requested, THE SYSTEM SHALL return the same totals as the legacy view definitions for the same period (B1 parity) with bounded queries and authorised export.
  - **Traceability**: F50.
- `REQ-132`: Authenticated printed documents.
  - **EARS Acceptance Criteria**: WHEN a nota, slip, card, settlement statement or loan form is printed, THE SYSTEM SHALL require a session and the matching view capability and SHALL render from stored values.
  - **Traceability**: F07, F17, F36, F42, F55, `ANO-K01`.
- `REQ-133`: Read-after-write consistency.
  - **EARS Acceptance Criteria**: WHEN a command commits, THE SYSTEM SHALL make the change visible on the next page load of every affected list, detail, dashboard and report without cache delay.
  - **Traceability**: PRD §7.1.
- `REQ-134`: Computed loan status.
  - **EARS Acceptance Criteria**: THE SYSTEM SHALL compute LUNAS as "all instalments paid" (FD-05) in read models, SHALL persist `status_bayar` only in the command that pays the last instalment, and SHALL never write from a read path.
  - **Traceability**: F31, F32, `ANO-K26`.
- `REQ-135`: Dashboard and notifications.
  - **EARS Acceptance Criteria**: WHEN the KOSIPA dashboard loads, THE SYSTEM SHALL show only KPIs whose definitions are verified, degrading to "unavailable" within the query budget.
  - **Traceability**: F51.
- `REQ-136`: Business settings.
  - **EARS Acceptance Criteria**: WHEN business settings change, THE SYSTEM SHALL require `kosipa.config.manage` with a second confirmation and SHALL audit before/after.
  - **Traceability**: F54 (`bisnis_c`).
- `REQ-137`: PPOB sales operations stay on HOLD.
  - **EARS Acceptance Criteria**: WHILE FD for PPOB is open, THE SYSTEM SHALL provide read-only PPOB visibility only and SHALL NOT call IAK.
  - **Traceability**: F49.
- `REQ-138`: Characterization and reconciliation harness.
  - **EARS Acceptance Criteria**: WHEN a feature is proposed for cutover, THE SYSTEM SHALL have passing characterization tests of the legacy behaviour on a synthetic staging database and a reconciliation report showing zero unexplained differences.
  - **Traceability**: PRD §10.
- `REQ-139`: Performance baselines and targets.
  - **EARS Acceptance Criteria**: WHEN a read or command is released, THE SYSTEM SHALL meet the p50/p95/query-count targets in [06 §3.1](06_LEGACY_ANOMALIES_AND_PERFORMANCE.md#31-performance-targets-proposed--baselines-first-prd-61) on the staging copy, measured against a recorded legacy baseline.
  - **Traceability**: PRD §6.
- `REQ-140`: Kill switch and rollback per feature.
  - **EARS Acceptance Criteria**: WHEN a feature's flag is turned off, THE SYSTEM SHALL stop accepting its commands within one request and the legacy controller can be re-enabled by the documented reversible data change.
  - **Traceability**: PRD §11.1.
- `REQ-141`: No silent new financial features.
  - **EARS Acceptance Criteria**: THE SYSTEM SHALL NOT post GL journals, close periods, accrue interest or pay SHU unless the corresponding decision (FD-09, FD-15, FD-10) is approved.
  - **Traceability**: PRD §2.3, `ANO-K33`.
- `REQ-142`: Legacy compatibility of written data.
  - **EARS Acceptance Criteria**: WHEN Next.js writes a KOSIPA table, THE SYSTEM SHALL use only the legacy status vocabulary, identifier formats and column scales of [07 §6](07_TARGET_ARCHITECTURE.md#6-legacy-compatibility-contracts) so that legacy reports and the payroll procedure read the rows correctly.
  - **Traceability**: PRD §2.2.

### Business Rules (`BR-*`)
- `BR-101`: Money is exact; quantise to the column scale half-up only at the points defined in [05](05_BUSINESS_RULES_AND_FINANCIAL_LOGIC.md); totals derive from stored lines. **Enforcement Layer**: Domain + repository post-check.
- `BR-102`: Σ schedule principal = principal; one instalment per month; due day clamped (FD-04). **Enforcement Layer**: Domain.
- `BR-103`: An instalment is paid only by a recorded settlement event. **Enforcement Layer**: Domain + repository.
- `BR-104`: LUNAS ⇔ all instalments paid (FD-05). **Enforcement Layer**: Domain.
- `BR-105`: Maker ≠ checker for approve/disburse/reverse/settle/payroll/exit/SHU (UCKW:BR008, FD-17). **Enforcement Layer**: Domain + use case.
- `BR-106`: Approved and later documents are immutable; correction by reversal (UCKW:BR009). **Enforcement Layer**: Domain + repository.
- `BR-107`: Rollover settles old loans in the disbursement transaction with server amounts. **Enforcement Layer**: Repository.
- `BR-108`: Payroll settlement is batch-scoped; shortfalls are exceptions (D4). **Enforcement Layer**: Domain.
- `BR-109`: Withdrawal availability per type policy (D2), checked at entry and approval. **Enforcement Layer**: Domain + lock.
- `BR-110`: Exit approval is atomic across lending, savings and membership. **Enforcement Layer**: Repository.
- `BR-111`: No hard delete of members or financial documents with history (FD-07). **Enforcement Layer**: Use case.
- `BR-112`: Non-AKTIVE status zeroes limits and wallet mirror once and revokes tokens by `user_id`. **Enforcement Layer**: Repository.
- `BR-113`: Salary changes only through the member command; loans store a snapshot. **Enforcement Layer**: Use case.
- `BR-114`: Deduction ratio per D1, never silently approved. **Enforcement Layer**: Domain.
- `BR-115`: SHU allocation by largest remainder to a configured unit (FD-10 for the effect). **Enforcement Layer**: Domain.
- `BR-116`: Document numbers unique per type with legacy format. **Enforcement Layer**: Repository.
- `BR-117`: Exactly one writer per feature; transfer all-or-nothing per feature. **Enforcement Layer**: Deployment + data switch (FD-03).
- `BR-118`: Bulk actions are N independent commands with per-item results. **Enforcement Layer**: Use case.
- `BR-119`: Store obligation for payroll M = Kredit sales of M−1 net of their returns (OD-3). **Enforcement Layer**: Domain.
- `BR-120`: `biaya_suku_bunga` is a monthly percentage parsed as an exact decimal (D6). **Enforcement Layer**: Domain.

### Validation Requirements (`VAL-*`)
- `VAL-101`: NIK 1–20 alphanumeric, canonical uniqueness on create/import. **Constraints**: `canonicalNik`.
- `VAL-102`: Enumerations: member status ∈ {AKTIVE, LUAR BIASA, KONTRAK, RESIGN, PENSIUN}; group ∈ {ANGGOTA, NON ANGGOTA, BMP, KOPERASI}; document statuses per [07 §6](07_TARGET_ARCHITECTURE.md#6-legacy-compatibility-contracts). **Constraints**: exact match, no free text.
- `VAL-103`: Amounts: decimal string, ≥ 0, ≤ 10^13, at most the column scale; parser `parseRupiahInput` on UI. **Constraints**: reject ambiguous separators.
- `VAL-104`: Loan: term 1–360, monthly rate 0–100 exact decimal, method ∈ {Flat, Anuitas}, fee % 0–100, due day 1–31, disbursement date ≥ approval date. **Constraints**: domain `loanSchedule` validation.
- `VAL-105`: Dates ISO `YYYY-MM-DD` in Asia/Jakarta; `doc_date` not in the future; back-dating within FD-14 limit. **Constraints**: server clock.
- `VAL-106`: Payroll period `YYYY-MM`; one batch per period × `kd_group`. **Constraints**: lock + check.
- `VAL-107`: Imports ≤ 5 MB, ≤ 5,000 rows, header must match template (UCKW:VAL004). **Constraints**: staged validation.
- `VAL-108`: Reasons 5–200 printable characters for reject/reverse/override/status change. **Constraints**: trimmed.
- `VAL-109`: Idempotency key = UUID v4; request hash = SHA-256 of canonical payload. **Constraints**: 409 on hash mismatch.
- `VAL-110`: Writes to `double` columns are verified by reading back and comparing at 2 decimals. **Constraints**: post-condition.
- `VAL-111`: Files: PDF/JPG/PNG ≤ 5 MB, content-type sniffed. **Constraints**: loan documents.
- `VAL-112`: Identifiers in URLs: doc no `^[A-Z0-9\-]{1,30}$`, numeric ids ≤ 2^31−1. **Constraints**: parse before query.

### Security & Multi-Tenancy Requirements (`SEC-*`)
- `SEC-101`: Every command checks its capability server-side; the UI only reflects it. **Tenant Isolation Rule**: KOSIPA has no branch tenancy (UCKW:BR002); scope = cooperative, enforced by capability, not by branch.
- `SEC-102`: Write capabilities come only from explicit grants (FD-16); identity links and legacy menus grant view only. **Tenant Isolation Rule**: grants are per console user.
- `SEC-103`: All SQL parameterised (`Prisma.sql`); no string-built SQL. **Tenant Isolation Rule**: n/a.
- `SEC-104`: Maker/checker identities from the authenticated session, never from the body. **Tenant Isolation Rule**: n/a.
- `SEC-105`: CSRF/Origin check on every state change; commands accept POST/PATCH only. **Tenant Isolation Rule**: n/a.
- `SEC-106`: PII masked by default; unmask requires `kosipa.member.pii` and is audited. **Tenant Isolation Rule**: n/a.
- `SEC-107`: One least-privilege DB account per context; production grants only via reviewed SQL (OD-4). **Tenant Isolation Rule**: writer accounts cannot read/write unrelated schemas.
- `SEC-108`: Session and identity link re-validated on every request; revoked link stops the next command. **Tenant Isolation Rule**: n/a.
- `SEC-109`: Client-supplied balances, statuses, payoffs and remaining amounts are never trusted. **Tenant Isolation Rule**: n/a.
- `SEC-110`: Files and printed documents served only through authenticated routes, never from a public path. **Tenant Isolation Rule**: n/a.
- `SEC-111`: Error responses expose only stable codes; logs and audit details contain no NIK, name, phone, address, salary or bank number. **Tenant Isolation Rule**: n/a.
- `SEC-112`: Destructive actions require typed confirmation and a reason (05 §4). **Tenant Isolation Rule**: n/a.

### Non-Functional Requirements (`NFR-*`)
- `NFR-101`: Performance targets of [06 §3.1](06_LEGACY_ANOMALIES_AND_PERFORMANCE.md#31-performance-targets-proposed--baselines-first-prd-61) on the staging copy, after a recorded baseline.
- `NFR-102`: Total pools ≤ `MAX_CONNECTION_BUDGET` (12); writer pool ≤ 2; only enabled writers count (B5/B8 before production).
- `NFR-103`: Write transactions ≤ 15 s, lock waits capped (`capLockWait`), no network or file IO inside a transaction.
- `NFR-104`: Domain money/state functions have 100% branch coverage of rule branches (UCKW:NFR004).
- `NFR-105`: Commands are idempotent under retry; deadlocks retried once automatically.
- `NFR-106`: WCAG 2.1 AA for new forms/dialogs; tested at 375/768/1440 px (UCKW:NFR005).
- `NFR-107`: POS checkout latency unaffected (no KOSIPA work on `/pos` routes) (UCKW:NFR006).
- `NFR-108`: Read paths execute zero write statements (asserted in tests).

### Observability & Logging (`OBS-*`)
- `OBS-101`: Command ledger row for every committed command with the fields of [08 §7](08_AUTHORIZATION_AND_AUDIT_DESIGN.md#7-audit-trail-design) (FD-01).
- `OBS-102`: Console audit event for every denied/failed command, PII unmask, grant change and export.
- `OBS-103`: Structured, PII-free logs with request id; metrics for latency, lock wait, refusals by code, replays.
- `OBS-104`: Reconciliation report per feature during parity/cutover (counts, sums, mismatches, gate status).
- `OBS-105`: Monthly review of reversals, denials and failures by a named owner (FD-18).

### Data & Migration Requirements (`MIG-*`)
- `MIG-101`: No DDL or trigger on the business database without an approved decision (FD-01, FD-02); proposals are additive with tested rollback SQL.
- `MIG-102`: No backfill or silent correction of historical data; anomalies (`ANO-K23/K26/K31/K34/K38`, duplicates) are reported for finance decisions.
- `MIG-103`: Staging for parity contains the production view/procedure definitions (B1) before any parity claim (UCKW:MIG001).
- `MIG-104`: Cutover per feature follows [11](11_CUTOVER_AND_ROLLBACK_PLAN.md): eight gates, legacy switch (FD-03) by reviewed SQL, rollback rehearsed.
- `MIG-105`: Production DB users/grants/switch rows changed only by the operator from reviewed SQL (OD-4).
- `MIG-106`: Data written by Next.js stays readable by legacy until legacy retirement (REQ-142), so rollback never needs data conversion.
- `MIG-107`: Payroll generation stays on the legacy procedure until the native generator proves parity on staging with real definitions (OD-2, FD-20).
- `MIG-108`: Destructive tests run only on synthetic databases; no real member data in fixtures.
