# Traceable Verification Plan: `kosipa-full-access`

Executed so far: the audit evidence in §4, checkpoint FA-01 in §5 and FA-01.5 + FA-02 in §6 (isolated synthetic stack and an isolated DEV LOCAL runtime only); everything else is still a plan. Test strategy and reconciliation method: [10](10_TESTING_AND_RECONCILIATION_PLAN.md). Activation gates: [11 §2](11_CUTOVER_AND_ROLLBACK_PLAN.md#2-the-eight-activation-gates-prd-111).

## 1. Requirement Traceability Matrix

| Req ID | Description | Design Element | Task ID | Verification Method |
|---|---|---|---|---|
| `REQ-101` | Inventory complete/current | 02A generator, drift check | `TASK-102`, `TASK-103`, `TASK-141` | drift check exit codes; hash comparison G-01 |
| `REQ-102` | Gap analysis current | 03 | `TASK-103`, `TASK-141` | review per release |
| `REQ-103` | One writer per feature | ownership gate, legacy switch | `TASK-107`, `TASK-113` | HTTP 503 tests; staging switch rehearsal |
| `REQ-104` | No legacy runtime dependency | 07 §7 | `TASK-107` | code search: no legacy URL/procedure call in writers; review |
| `REQ-105` | Command pipeline | 07 §4 | `TASK-106`, `TASK-107`, `TASK-108` | foundation DB/HTTP/application tests |
| `REQ-106` | Server-side lifecycle | `document-state.ts`, 07 §6 | `TASK-108` | application tests refusing client status |
| `REQ-107` | Numbering | R-02 | `TASK-109`, `TASK-122` | concurrent allocation test |
| `REQ-108` | Register member | member command | `TASK-115` | DB + browser tests |
| `REQ-109` | Profile update | member command | `TASK-115` | DB tests (no side effects) |
| `REQ-110` | Status change side effects | member status command, FD-08 | `TASK-115` | atomicity + token revoke test |
| `REQ-111` | Deactivate not delete | 05 §4 | `TASK-115` | history blocks hard delete |
| `REQ-112` | Staged imports | import domain | `TASK-116` | 5,000-row / malformed tests |
| `REQ-113` | Deduction config | deduction command | `TASK-117` | one active row per type; procedure reads amounts |
| `REQ-114` | Savings documents | savings-document command | `TASK-118` | reconciliation month = 0 blocking diffs |
| `REQ-115` | Withdrawals server balance | withdrawal command | `TASK-119` | concurrency test INV-05 |
| `REQ-116` | Savings reversal | reversal command | `TASK-120` | INV-09 |
| `REQ-117` | Exit settlement atomic | exit command | `TASK-130` | failure injection per step |
| `REQ-118` | Loan application | loan product/schedule | `TASK-121`, `TASK-122` | unit examples + parity grid vs views |
| `REQ-119` | Loan approval | loan decision | `TASK-123` | maker-checker + concurrency |
| `REQ-120` | Disbursement + rollover | disbursement command | `TASK-124` | INV-01/02/03; procedure harness |
| `REQ-121` | Schedule immutability | settlement-only updates | `TASK-124` | no DELETE on `trans_pinjaman_dtl` (statement log assertion) |
| `REQ-122` | Early settlement | settlement command | `TASK-125` | payoff formula tests; approval required |
| `REQ-123` | Cancel/void/reverse | decision + reversal commands | `TASK-123`, `TASK-125` | no row deletion; compensation nets |
| `REQ-124` | Loan documents | document storage | `TASK-126` | authenticated download test |
| `REQ-125` | Payroll lifecycle | payroll command, generator | `TASK-128`, `TASK-129` | batch-scope test; parity report |
| `REQ-126` | PPOB billing | ppob-bill command | `TASK-133` | reconciliation to orders |
| `REQ-127` | SHU | shu command | `TASK-132` | INV-10 |
| `REQ-128` | Request decisions | request-decision command | `TASK-117`, `TASK-127` | double-decision race |
| `REQ-129` | Masters | master command | `TASK-114` | reference-count refusal |
| `REQ-130` | Write grants | grant store | `TASK-110` | persona matrix; self-grant 403 |
| `REQ-131` | Report parity | report repositories | `TASK-134` | totals vs views per period |
| `REQ-132` | Authenticated prints | print routes | `TASK-134` | 401/403 without session/capability |
| `REQ-133` | Read-after-write | 07 §5 | `TASK-137` | browser refresh assertions |
| `REQ-134` | Computed loan status | `loan-read.ts` | `TASK-111` | domain tests; zero writes in reads |
| `REQ-135` | Dashboard | widgets | `TASK-135` | unavailable-state test |
| `REQ-136` | Business settings | settings command | `TASK-135` | second confirmation test |
| `REQ-137` | PPOB HOLD | no IAK adapter | `TASK-135` | code search: no IAK client |
| `REQ-138` | Characterization/reconciliation | harness, 10 §5 | `TASK-102`, `TASK-104`, `TASK-138` | golden files; reports |
| `REQ-139` | Performance | 06 §3.1 | `TASK-112`, `TASK-141` | baseline + target report |
| `REQ-140` | Kill switch/rollback | flags + switch SQL | `TASK-107`, `TASK-113`, `TASK-140`, `TASK-142` | rehearsal ≤ 15 min |
| `REQ-141` | No silent new features | FD gating | `TASK-101`, `TASK-142` | code review checklist; decision register |
| `REQ-142` | Legacy-compatible data | 07 §6 | `TASK-104`, `TASK-131`, `TASK-141` | compatibility tests on staging |
| `BR-101` | Exact money | R-01 | `TASK-118` | domain + post-condition tests |
| `BR-102` | Schedule invariants | R-03…R-05 | `TASK-121` | INV-01/02 |
| `BR-103` | Paid only by settlement | R-06 | `TASK-124` | INV-03 |
| `BR-104` | LUNAS = all paid | R-07 | `TASK-111` | domain tests |
| `BR-105` | Maker ≠ checker | `document-state.ts` | `TASK-118`, `TASK-123` | application tests |
| `BR-106` | Immutability/reversal | R-17 | `TASK-118`, `TASK-120` | edit-after-approve refused |
| `BR-107` | Rollover in disbursement tx | R-10 | `TASK-124` | DB test |
| `BR-108` | Batch-scoped payroll | R-13 | `TASK-128` | settlement scope test |
| `BR-109` | Withdrawal policy | R-15 | `TASK-119` | policy tests (D2) |
| `BR-110` | Atomic exit | R-16 | `TASK-130` | failure injection |
| `BR-111` | No hard delete with history | 05 §4 | `TASK-115` | DB test |
| `BR-112` | Status side effects once | R-20 | `TASK-115` | DB test |
| `BR-113` | Salary only via member | R-01/ANO-K12 | `TASK-115`, `TASK-122` | loan apply leaves salary unchanged |
| `BR-114` | Ratio per D1 | R-09 | `TASK-121` | ratio tests |
| `BR-115` | SHU largest remainder | R-18 | `TASK-132` | INV-10 |
| `BR-116` | Unique doc numbers | R-02 | `TASK-109` | concurrency test |
| `BR-117` | One writer per feature | FD-03 | `TASK-113` | rehearsal |
| `BR-118` | Bulk = N commands | 07 §4 | `TASK-116` | per-item result test |
| `BR-119` | Store window net returns | R-12 | `TASK-129` | existing `store-credit` tests + parity |
| `BR-120` | Rate parsing | R-23 | `TASK-121` | parse tests |
| `VAL-101` | NIK | `canonicalNik` | `TASK-115` | unit |
| `VAL-102` | Enums | 07 §6 | `TASK-114` | unit |
| `VAL-103` | Amounts | money parser | `TASK-118` | unit |
| `VAL-104` | Loan inputs | `loanSchedule` validation | `TASK-121` | unit |
| `VAL-105` | Dates | business dates | `TASK-115` | unit |
| `VAL-106` | Payroll period | payroll command | `TASK-128` | unit + DB |
| `VAL-107` | Import limits | import domain | `TASK-116` | unit |
| `VAL-108` | Reasons | pipeline | `TASK-120` | unit |
| `VAL-109` | Idempotency key/hash | command primitives | `TASK-106` | unit |
| `VAL-110` | Double columns read-back | savings writer | `TASK-118` | DB test |
| `VAL-111` | File types | document storage | `TASK-126` | HTTP test |
| `VAL-112` | URL identifiers | command HTTP | `TASK-107` | HTTP test |
| `SEC-101` | Capability per command | 08 §4 | `TASK-110`, `TASK-136` | security suite |
| `SEC-102` | Explicit grants only | 08 §3 | `TASK-110` | persona matrix |
| `SEC-103` | Parameterised SQL | repositories | `TASK-136` | injection tests + lint rule review |
| `SEC-104` | Identities from session | pipeline | `TASK-110`, `TASK-136` | forged maker test |
| `SEC-105` | CSRF/Origin, POST only | command HTTP | `TASK-107`, `TASK-136` | cross-origin + GET tests |
| `SEC-106` | PII masking | member pages | `TASK-115` | unmask audit test |
| `SEC-107` | Least-privilege writers | writer clients | `TASK-114`, `TASK-139` | grant verification script |
| `SEC-108` | Session/link re-validation | pipeline | `TASK-107`, `TASK-136` | revoked link test |
| `SEC-109` | No client-trusted money | commands | `TASK-119`, `TASK-136` | forged parameter tests |
| `SEC-110` | Files via auth routes | storage | `TASK-126`, `TASK-134` | HTTP tests |
| `SEC-111` | No PII in errors/logs/audit | pipeline | `TASK-108`, `TASK-136` | log/audit assertions |
| `SEC-112` | Typed confirmation + reason | UI + commands | `TASK-115`, `TASK-136` | browser + HTTP |
| `NFR-101` | Performance targets | 06 §3.1 | `TASK-112` | benchmark report |
| `NFR-102` | Connection budget | deployment guard | `TASK-139` | guard tests |
| `NFR-103` | Short transactions | unit of work | `TASK-107` | timing assertions |
| `NFR-104` | Rule coverage | domain | `TASK-121` | coverage report |
| `NFR-105` | Idempotent, deadlock retry | pipeline | `TASK-106`, `TASK-107`, `TASK-136` | concurrency tests |
| `NFR-106` | Accessibility | UI | `TASK-137` | axe + viewport runs |
| `NFR-107` | POS unaffected | routing | `TASK-137` | `/pos` latency check |
| `NFR-108` | Reads never write | repositories | `TASK-111` | statement assertion |
| `OBS-101` | Command ledger | FD-01 | `TASK-105` | DB test |
| `OBS-102` | Console audit for denials etc. | audit port | `TASK-108` | application tests |
| `OBS-103` | Structured logs/metrics | logger | `TASK-108` | log assertions |
| `OBS-104` | Reconciliation reports | 10 §5 | `TASK-138` | report produced |
| `OBS-105` | Monthly review | FD-18 | `TASK-138` | owner record |
| `MIG-101` | No DDL without decision | FD-01/02 | `TASK-101`, `TASK-105` | decision register; review SQL only |
| `MIG-102` | No silent data correction | 11 §5 | `TASK-138` | anomaly report to finance |
| `MIG-103` | Real definitions in staging | B1 | `TASK-102`, `TASK-140` | evidence gates |
| `MIG-104` | Cutover per feature | 11 | `TASK-113`, `TASK-140` | rehearsal record |
| `MIG-105` | Operator-run production SQL | OD-4 | `TASK-113`, `TASK-139` | review sign-off |
| `MIG-106` | Legacy-readable data | 07 §6 | `TASK-131` | compatibility tests |
| `MIG-107` | Procedure until parity | FD-20 | `TASK-129` | parity report |
| `MIG-108` | Synthetic data for destructive tests | 10 §1 | `TASK-104` | fixture review |

## 2. Automated Test Commands
```bash
# Lint, types, unit + application + DB-free tests (existing workspace scripts)
pnpm lint
pnpm typecheck
pnpm test

# Browser suites (existing runner)
pnpm test:browser

# KOSIPA DB suites against the local staging container (existing pattern; new suites added per task)
pnpm --filter @koperasi/web exec node --experimental-strip-types --test tests/kosipa-*-db.test.mjs

# Spec coverage (this skill)
.agents/skills/brownfield-spec-engineer/scripts/validate-spec-coverage.sh docs/superpowers/specs/kosipa-full-access
```

## 3. Manual Verification & Smoke Test Protocol
1. **DEV LOCAL only** (no production): `bash apps/web/scripts/dev-local.sh status` first (do not stop a running :3200/:3201 server), then start the build under test; synthetic DEV LOCAL database.
2. **Feature smoke**: for the feature under test, execute the E2E path from [10 §2](10_TESTING_AND_RECONCILIATION_PLAN.md#2-test-categories) with Operator and Supervisor personas; verify ledger and console audit rows; verify legacy harness reads the rows.
3. **Rollback verification**: run the generated switch and rollback SQL on the staging copy; confirm the legacy controller is denied/allowed accordingly and that rows written by Next.js display correctly in legacy pages.

## 4. Evidence already produced by this audit (30 Oct 2026)

| Evidence | Result |
|---|---|
| Static scan of local legacy source | 94 controllers, 776 functions, 285 write methods, 60 tables + 2 procedures, 7 broken calls ([02A](02A_LEGACY_METHOD_WRITE_INDEX.md)) |
| Aggregate queries on `kkisi_staging` (read-only account) | counts, status distributions, keys, column types, anomaly counts quoted in 02–06; two aggregates exceeded 120 s (missing indexes, P-01) |
| Simulation of legacy annuity loop (PHP double semantics) | last-row drop in 2,673/5,346 parameter sets; not present in stored data |
| Existing domain functions run on the 05 examples | exact results quoted in [05](05_BUSINESS_RULES_AND_FINANCIAL_LOGIC.md) |
| Spec coverage validator | run after writing this spec; result in the README |

## 5. Evidence produced by checkpoint FA-01 (30 Oct 2026)

All runs used the isolated synthetic stack `kkisi-kosipa-fa01` (`127.0.0.1:3322`). Full detail is in the [FA-01 report](fa-01/CHECKPOINT_REPORT.md).

| Requirement(s) | Verification executed | Result |
|---|---|---|
| `REQ-105`, `NFR-105`, `VAL-109`, `OBS-101` | `apps/web/tests/kosipa-foundation-db.test.mjs`: atomic create and ledger row; replay; 20 concurrent same-key submissions → 1 effect; same code ×20 → 1 row; injected failure → 0 rows and 0 ledger rows; real 1205 retried; retry cap → `BUSY_RETRY` | 9/9 pass (3 consecutive runs) |
| `SEC-107`, `MIG-101` | Same file, writer-privilege test: ledger UPDATE/DELETE, `m_lokasi` DELETE and personal columns are refused (1142/1143); the reader cannot write | pass |
| `MIG-101` | `kosipa-migrations-rollback-db.test.mjs`: forward → rollback (retire, rows kept) → forward, for the ledger and the grant table, in a scratch database | pass |
| `REQ-103`, `REQ-140`, `BR-117` | `kosipa-legacy-fence-db.test.mjs`: the exact legacy gate SQL allows, refuses after the fence for every user, and allows again after rollback. Also [FD-03 verification](fa-01/FD-03-legacy-fence-verification.md) | pass |
| `REQ-130`, `SEC-101`, `SEC-102`, `SEC-104`, `SEC-105`, `SEC-108`, `SEC-109`, `SEC-111` | `kosipa-master-http.test.mjs` (8) and `packages/application/tests/{kosipa-commands-pipeline,console-kosipa-grants}.test.mjs` (11): the 08 §6 threat matrix for masters | pass |
| `REQ-129`, `REQ-133`, `REQ-142`, `NFR-106` (layout) | `apps/web/tests/kosipa-master-browser.mjs` E1–E7 against the isolated build on :3230 | PASS |
| Regression of existing read functionality | `pnpm -r test` (web 473 pass, 0 fail), `pnpm typecheck`, `pnpm lint` (0 errors) | pass |
| `REQ-101` (parity input), `MIG-103` | `apps/web/scripts/kosipa-b1-schema-export.sh` rehearsed on the synthetic container: definitions only, no data statements | Procedure ready; **production run pending (operator)** |

## 6. Evidence produced by FA-01.5 and FA-02 (30 Oct 2026)

Details are in the [FA-01.5 + FA-02 report](fa-02/CHECKPOINT_REPORT.md). Commands run on the final tree.

| Requirement(s) | Verification executed | Result |
|---|---|---|
| `OBS-101`, `MIG-101`, `SEC-107` (FD-01b) | `kosipa-foundation-db.test.mjs` FD-01b tests: database-level-only account refused UPDATE/DELETE/TRUNCATE/ALTER/DROP/RENAME/CREATE/TRIGGER/REPLACE/ODKU on the ledger; failure after the ledger insert rolls back both databases; replay across databases | pass |
| `REQ-103`, `REQ-140`, `BR-117` (FD-03) | Foundation DB "re-enabling … in any way adm_menu_c can" and "racing" tests; `kosipa-masters-db` per-feature `LEGACY_ACTIVE`; browser E7 | pass |
| `REQ-130`, `SEC-102`, `SEC-104` (two administrators) | `packages/application/tests/console-kosipa-grants.test.mjs` (6), domain grant tests (6), foundation DB grant-store test (DB-enforced), browser E3/E8 | pass |
| `REQ-129`, `REQ-142`, `VAL-102`, `VAL-104`, `VAL-108`, `VAL-112` (FA-02) | `packages/domain/tests/kosipa-master.test.mjs` (9), `kosipa-masters-db.test.mjs` (6: CRUD, protected references, legacy readers' own SQL, loan checksum unchanged, DB privilege on the month count, 10× same-key concurrency, legacy-active), browser E6 | pass |
| `MIG-103` (B1) | `kosipa-b1-export-db.test.mjs`: every definition kind exported, no row value, DEFINER/AUTO_INCREMENT stripped, password never printed | pass; production run pending |
| Regression (existing read functionality) | `pnpm -r test` (domain 340, application 174, web 474 pass, 0 fail); isolated DEV LOCAL runtime: `console-kosipa-nav-browser` 13/13, `kosipa-uiux-browser` 59/59, `dev-local-smoke-browser` 11 PASS + 1 pre-existing stale assertion | pass with the documented pre-existing exception |


## 7. FA-03A continuation evidence boundary (30 Oct 2026)

The authoritative executed commands, counts, skips and reruns are in [FA-03A CHECKPOINT_REPORT](fa-03a/CHECKPOINT_REPORT.md). The following maps existing implementation/test artifacts; it does not claim a fresh execution from this documentation review.

| Requirement / task | Existing artifact | Boundary |
|---|---|---|
| `REQ-107`, `BR-116`, `TASK-109` | Domain formatter, `DocumentNumberingService`, `PrismaDocumentNumberRepository`, registry migration 005; domain/application and `kosipa-document-number-db.test.mjs` tests | Local foundation; no member/financial command enabled; FD-23 and FD-02 remain open |
| `REQ-129`, `REQ-142`, `MIG-106`, `TASK-114`, `TASK-131` | `kosipa-legacy-runtime.test.mjs`, actual legacy PHP runtime and five-master fixture | Synthetic five-master slice; production definitions/source identity and other masters/documents not proven |
| `REQ-103`, `BR-117`, `TASK-113` | Real-PHP per-controller fence/rollback tests and ownership prototype | Member-menu fence bypass is demonstrated; FD-22 proposed, not a production control |
| `REQ-130`, `SEC-104`, `OBS-101`, `MIG-101` | Grant application/store tests and cross-database foundation tests | Continuation counts belong in checkpoint report; B6/FD-01b operator deployment remains open |
| `MIG-103`, `NFR-102`, `TASK-139` | B1 export test, production SQL static/scratch tests, [production gates](fa-03a/PRODUCTION_READINESS_GATES.md) | B1/B3/B5/B8/B6/FD-01c are not closed by synthetic tests |
| `REQ-108`…`REQ-111`, `TASK-115` | [FA-03B dependency plan](fa-03a/NEXT_IMPLEMENTATION_PLAN.md) | Planning delivered; mutation implementation/tests remain future work |

Before any DB/browser test command above, inspect its script and target; do not use an unknown `.env.local` or the real-data staging copy for mutations. Execute synthetic suites sequentially when they share tables/fixtures. Prior FA-02 smoke results stay historical; any corrected assertion and rerun must be recorded in the FA-03A report, not inferred here.
