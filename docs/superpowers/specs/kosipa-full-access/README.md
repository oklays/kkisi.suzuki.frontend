# Spec — KOSIPA full access (legacy CodeIgniter audit → native Next.js CRUD and financial operations)

Date: 30 October 2026 (Asia/Jakarta). Branch at audit time: `feat/currency-rupiah-standard` (HEAD `0af0dd77`).
Input: [PRD / master prompt](../../../../.kiro/specs/enhancement_kosipa_full_access/prd.md). Method: `brownfield-spec-engineer` skill (9 phases).
Status: audit and specification complete. **Checkpoints FA-01 (write foundation), FA-01.5 (hardening), FA-02 (five reference masters) and FA-03A (compatibility, ownership and numbering) are locally implemented and tested on synthetic data only**: see the [FA-01 report](fa-01/CHECKPOINT_REPORT.md), [FA-01.5 + FA-02 report](fa-02/CHECKPOINT_REPORT.md), and [FA-03A report](fa-03a/CHECKPOINT_REPORT.md). FA-03A retains the existing PHP compatibility harness, document-numbering contracts/repository, shared-writer prototype and readiness documentation; final executed evidence, test-run caveats and remaining production gates are in that report. No member mutation or financial posting is activated. Legacy source, real-data staging and production remain outside the authorized write scope.

Builds on (does not repeat) the earlier spec [`unified-console-kosipa-warehouse`](../unified-console-kosipa-warehouse/README.md) (cited as **UCKW**), its private anomaly register, and the [public-savings spec](../public-simpanan-sukarela/README.md).

## Documents

| # | Document | Content |
|---|---|---|
| 01 | [EXECUTIVE_AUDIT_SUMMARY](01_EXECUTIVE_AUDIT_SUMMARY.md) | Findings, counts, risks, architecture, roadmap, first checkpoint (= PRD "required final response") |
| 02 | [LEGACY_FUNCTION_INVENTORY](02_LEGACY_FUNCTION_INVENTORY.md) | 55 features with the 16 PRD columns, coverage counts, transactions, menu drift, unsupported capabilities |
| 02A | [LEGACY_METHOD_WRITE_INDEX](02A_LEGACY_METHOD_WRITE_INDEX.md) | Generated: all 94 controllers, all 285 write methods with file:line, broken calls |
| 03 | [CRUD_GAP_ANALYSIS](03_CRUD_GAP_ANALYSIS.md) | Next.js today vs legacy; counts |
| 04 | [DATABASE_WRITE_MAPPING](04_DATABASE_WRITE_MAPPING.md) | Write targets, 30 write paths, hidden writes, ownership matrix, coexistence, evidence gaps |
| 05 | [BUSINESS_RULES_AND_FINANCIAL_LOGIC](05_BUSINESS_RULES_AND_FINANCIAL_LOGIC.md) | 23 rules (legacy / documented / reconstructed / proposed) with reproducible examples, delete semantics, invariants |
| 06 | [LEGACY_ANOMALIES_AND_PERFORMANCE](06_LEGACY_ANOMALIES_AND_PERFORMANCE.md) | `ANO-K22`… anomalies, 14 performance findings, performance targets |
| 07 | [TARGET_ARCHITECTURE](07_TARGET_ARCHITECTURE.md) | Layers, command catalogue, pipeline, consistency, compatibility contracts, routes |
| 08 | [AUTHORIZATION_AND_AUDIT_DESIGN](08_AUTHORIZATION_AND_AUDIT_DESIGN.md) | Capabilities, grant source, authorization matrix, security tests, audit trail |
| 09 | [IMPLEMENTATION_BACKLOG](09_IMPLEMENTATION_BACKLOG.md) | WI-01…WI-25 with all PRD fields, dependency graph |
| 10 | [TESTING_AND_RECONCILIATION_PLAN](10_TESTING_AND_RECONCILIATION_PLAN.md) | Test categories, cases, reconciliation method, exit criteria |
| 11 | [CUTOVER_AND_ROLLBACK_PLAN](11_CUTOVER_AND_ROLLBACK_PLAN.md) | Eight gates, order C-1…C-9, runbook, rollback, coexistence risks |
| 12 | [DECISION_REGISTER](12_DECISION_REGISTER.md) | Verified facts, approved rules, open decisions FD-01…FD-25, assumptions, evidence gaps |
| — | [current-state](current-state.md) · [impact-analysis](impact-analysis.md) · [requirements](requirements.md) · [design](design.md) · [tasks](tasks.md) · [verification](verification.md) | Skill-format spec (Phases 4–9), traceable `REQ/BR/VAL/SEC/NFR/OBS/MIG-1xx` → `TASK-1xx` |
| FA-01 | [CHECKPOINT_REPORT](fa-01/CHECKPOINT_REPORT.md) · [FD-03 legacy fence verification](fa-01/FD-03-legacy-fence-verification.md) | First implementation checkpoint: write foundation + Master Lokasi slice |
| FA-01.5 | [FD-01b ledger isolation](fa-01.5/FD-01b-ledger-isolation.md) · [shared writer ownership](fa-01.5/SHARED_WRITER_OWNERSHIP.md) · [B1 operator instructions](fa-01.5/B1-operator-instructions.md) | Foundation hardening |
| FA-02 | [CHECKPOINT_REPORT](fa-02/CHECKPOINT_REPORT.md) · [MASTER_SEMANTICS](fa-02/MASTER_SEMANTICS.md) | Bagian, Jenis Dokumen, Rekening Bank, Periode Angsuran |
| FA-03A | [CHECKPOINT_REPORT](fa-03a/CHECKPOINT_REPORT.md) · [legacy compatibility](fa-03a/LEGACY_COMPATIBILITY_RESULTS.md) · [shared ownership](fa-03a/SHARED_WRITE_OWNERSHIP.md) · [numbering](fa-03a/DOCUMENT_NUMBERING_IMPLEMENTATION.md) · [production gates](fa-03a/PRODUCTION_READINESS_GATES.md) · [membership plan](fa-03a/NEXT_IMPLEMENTATION_PLAN.md) | Continuation evidence; production gates and proposed decisions remain open |
| Manual UAT | [database refresh](fa-03a/manual-uat/DATABASE_REFRESH_REPORT.md) · [restore validation](fa-03a/manual-uat/DATABASE_RESTORE_VALIDATION.md) · [environment](fa-03a/manual-uat/UAT_ENVIRONMENT_SETUP.md) · [checklist](fa-03a/manual-uat/MANUAL_UAT_CHECKLIST.md) · [accounts](fa-03a/manual-uat/UAT_TEST_ACCOUNTS.md) · [rollback](fa-03a/manual-uat/DATABASE_ROLLBACK_PLAN.md) | Dedicated read/write UAT running; complete production replication pending authorized routine export; existing staging preserved |
| — | `private-legacy-security-findings.md` (gitignored) | Exploitable legacy findings (`ANO-K40`, `K48`–`K50`); never committed |

Evidence labels used everywhere: **E1** source/schema, **E1-data** aggregate measurement on the 30 Sep staging copy, **E1-inferred** reasoned from E1, **Unknown** (gap id). Proposals are marked PROPOSED; nothing proposed is approved.

## PRD coverage map (nothing skipped)

| PRD section | Requirement | Where answered |
|---|---|---|
| Role & mission; audit first | read, create, update, delete/cancel/void/reverse, approvals, financial processing, admin/config, reporting/export, other ops | 02 (all 55 features), 05 §4, 07 §3, 09; implementation gated (this README status) |
| §1.1 New application | verify existing read-only capabilities; do not rewrite working parts | 03 §1, 07 §1, impact-analysis |
| §1.2 Legacy location | inspect `kosipa/` source; behavioural reference only | 02, 02A, 04 (file:line throughout) |
| §1.3 Existing documentation | read, avoid duplicate discovery, verify, update where evidence differs | README "builds on"; 06 §1 (re-verified items, `ANO-K07` upgraded); 02 §1 (counts reconciled 775 ↔ 776) |
| §1.4 Existing database | verify schema/row counts; PII protection; distinguish DB environments | 12 VF-04 (9,276 members / 32,631 loans confirmed), current-state §1/§4, 10 §1; aggregate-only queries |
| §2.1 No legacy runtime dependency | prohibited patterns | REQ-104, 07 §7 |
| §2.2 Database compatibility | keys, relations, history, balances, identifiers, write semantics; migration proposal with rollback | 04 §2, 07 §6, design §2/§5, FD-01/FD-02, REQ-142 |
| §2.3 Behaviour preservation (A/B/C) | classify rules | 05 (each rule tagged A/B/C), 12 |
| §3 Phase A inventory | all routes/controllers/models/SQL/views/JS/validation/auth/helpers/batch/reports/import-export | 02, 02A, 04 §3.6 |
| §3.1 Functional coverage list (22 items) + op types | per feature; unsupported marked | 02 §4 (Type column), 02 §7 |
| §3.2 Inventory matrix (16 columns) | real source refs; gap vs Next.js | 02 §4, 03 |
| §4 Phase B write-path audit (18 attributes) | every write op incl. indirect | 04 §3.1 (common), §3.2–§3.5 (WP-01…WP-30), §3.6 hidden writes, 02A |
| §4.1 Write ownership & coexistence | matrix, questions, gradual transfer, no parallel source of truth | 04 §4–§5, 11 |
| §5 Phase C financial logic | formulas, examples, four-way comparison, defect checklist, decimal-safe | 05 §2–§3, 06 §2 |
| §5.1 Delete semantics | draft/cancel/void/reverse/deactivate/config; permissions; confirmation | 05 §4, 08 §4 |
| §6 Phase D performance | 17 issue types; 7-part analysis; safe environment | 06 §3 (P-01…P-14) |
| §6.1 Performance targets | p50/p95, queries, rows, error rate; baselines first | 06 §3.1, REQ-139, TASK-112 |
| §7 Phase E architecture | presentation/application/domain/infrastructure; reuse; no new ORM | 07 §1–§4, §8 |
| §7.1 Read/write consistency | cache, refresh, search, dashboard, reports, pagination, concurrency, stale UI | 07 §5, REQ-133 |
| §8 Phase F authorization & security | capability list, server-side, branch scope, test list, identity linking | 08 §2–§6, REQ-130, SEC-101…SEC-112 |
| §9 Phase G integrity & audit | audit fields; idempotency, concurrency, isolation, retry, deadlock, rollback, partial failure, invariants | 08 §7, 07 §4, 05 §5 |
| §10 Phase H testing | characterization, domain, application, repository, E2E, regression, performance, reconciliation, synthetic data | 10 |
| §11 Phase I roadmap | P0/P1/P2; per item 13 fields | 09 |
| §11.1 Cutover principles | 8 conditions; build ≠ readiness; no production authorised | 11 §1–§2 |
| §12 Deliverables 01–12 | each document distinguishes evidence vs proposal | this folder (01–12), labels above |
| §13 Execution rules | allowed / not allowed | complied: read-only source and DB access, no INSERT/UPDATE/DELETE/DDL/triggers, no deployment, no commit/push; private findings kept out of git |
| §14 Definition of done | 12 criteria | see table below |
| Required final response (12 items + first checkpoint) | | 01 §1–§13 |

### Definition of done (PRD §14)

| Criterion | Status |
|---|---|
| All discoverable legacy routes and business actions inventoried | Done for the local copy (02, 02A); production equality pending G-01/G-02 |
| Next.js functionality mapped against the legacy matrix | Done (03) |
| Significant write paths and tables identified | Done (04) |
| Financial rules and invariants documented | Done (05); authority of view-based amounts pending B1/D6 |
| Destructive and reversal semantics understood | Done (05 §4) |
| Legacy bugs and performance anomalies documented with evidence | Done (06) |
| Native architecture for missing critical operations | Done (07, design) |
| Authorization and audit requirements defined | Done (08) |
| Ownership and coexistence risks analysed | Done (04 §4–§5, 11 §6) |
| Tasks with dependencies and acceptance criteria | Done (09, tasks) |
| Testing, reconciliation and cutover plans actionable | Done (10, 11) |
| Uncertainties separated from verified findings | Done (12 §1 vs §3/§5/§6; labels) |

## Validation
`.agents/skills/brownfield-spec-engineer/scripts/validate-spec-coverage.sh docs/superpowers/specs/kosipa-full-access` → **passed** on 30 Oct 2026: six required files present, all 42 `REQ-101…REQ-142` covered in design, tasks and verification. An additional check confirmed every `BR/VAL/SEC/NFR/OBS/MIG-1xx` appears in both tasks and verification, and every relative link and in-folder anchor resolves.
