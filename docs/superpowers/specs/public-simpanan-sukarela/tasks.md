# Tasks index and traceability

## Effective execution ledger —29 October2026

Owner MASTER EXECUTION PROMPT authorizes completion under approved Policy v1.0.0, STG-01, additive local migrations/integration, tests and atomic local feature commits. It supersedes the historical approval-loop/status paragraphs retained below. No policy B-ID is reopened. No production activation/push/merge/deployment is authorized.

| Original task | Implemented files / verification | Current acceptance |
|---|---|---|
| CP1-T01A | Existing approved structural/domain foundation, baseline80d9e200 | DONE; unchanged accepted baseline |
| CP1-T01B | `packages/domain/src/kosipa/savings-*`; approved policy, reference/eligibility/calendar/money/lifecycle/link/snapshot/access contracts; `public-savings-precheck.ts` / `public-savings-submit.ts` | DONE pure approved contracts; actual-runtime mapping acceptance remains O-02/05/06 |
| CP1-T02 | `integration/public-savings/{schema.sql,staging.mjs,preflight.mjs,migrations/001_public_savings.sql}`; guarded config/crypto/pool/UoW; real MariaDB tests | DONE isolated representative integration; no production-equivalence claim |
| CP1-T03 | `infrastructure/public-savings/{security.ts,service.ts,http.ts}`, issuance/revocation routes; opaque48h tokens/digests, before-proof masking, strict local operator authorization | DONE local deployment adapter; actual console capabilities/branch roles require external configuration |
| CP1-T04 | Persisted challenge/proof/attempt/resend/contact bindings; private encrypted capture provider, actual expiry/replay/quotas tests | DONE capture-only staging; actual provider credentials/sender/provenance are external |
| CP1-T05 | Existing application orchestration + mysql2 UoW; authoritative type/section/deduction/calendar locks; reviewed fingerprint; header/evidence/token/receipt/audit/3outbox intents atomic | DONE local;38 SQL/integration checks include20requests/twoOSprocesses and real lost-COMMIT-ack recovery |
| CP1-T06 | `/simpanan-sukarela`, reusable client/signature/form/review/receipt states, new-link credential reset, safe retries and consent renewal | DONE automated Chromium local acceptance; physical Safari/WhatsApp/screen-reader UAT unverified |
| CP1-T07 | Encrypted artifacts, snapshot-only A4 PDF, renderer/template metadata, integrity/READY, member+operations captures, backup escalation, durable retry/backoff/deadletter, worker/maintenance/reconcile scripts | DONE local capture/storage/worker; actual storage quotas/backup/keys/provider/holiday configuration remain external |
| CP1-T08 | Real database/HTTP/browser, regression, typecheck/lint/build, additive migration interruption/re-run checks | VERIFIED_LOCAL; actual PHP/production acceptance PARTIAL |
| CP2-T01 | Synthetic-local operator workbench: exact member lookup, issuance, private-link copy, metadata/revocation | DONE local operator path; operational ConsoleFrame/menu/action/branch integration requires actual role/configuration evidence |
| CP2-T02 | Actual header visibility/source/status, quarantined corrupt evidence, private operator PDF; no Next approval controls; CI2 command fixture | DONE local handoff; real CI2 menu/private print hook unavailable |
| CP2-T03 | Operator-key negatives, no cookie-as-public-authority, original guard scanner extended for exact custom routes; denied direct DML and public/mobile mutation regressions | VERIFIED_LOCAL; actual roles/menu/branch/legacy sessions unverified |
| CP2-T04 | Repeatable local guide, rollback/intake-OFF receipt test, worker/recovery and final gate matrix | READY_FOR_EXTERNAL_RUNTIME_VALIDATION; deployment remains unauthorized |
| CP3-T01..T04 | Retain legacy approval owner; no parallel Next approval/payroll engine introduced | DEFERRED_COMPATIBILITY: actual canonical PHP/runtime parity unavailable; native migration is not needed to operate the tested local intake/handoff |

| Gate | Local result | Actual operational status / exact next prerequisite |
|---|---|---|
| O-02 | Explicit typed Latin1/NIK10/mandatory-column/status/period/signature translation; metadata preflight; recovered-DDL roundtrip; no inferred zero/first enrollment | PARTIAL: technical part verified on recovered production DDL ([20_CP2](20_CP2_LEGACY_INTEGRATION_AND_RELEASE.md)); owner L1/L4 confirmation and authoritative evidence/calendar sources remain |
| O-05 | Shared member reservation for enrolled legacy writers, PUBLIC command-only header/master, duplicate-reference guard, retry/idempotency/rollback/race tests | PARTIAL: verified with real CI2 PHP on recovered DDL ([20_CP2](20_CP2_LEGACY_INTEGRATION_AND_RELEASE.md)); needs approved CI2 hook PHP scope, real Laravel execution, principal split |
| O-06 | Immutable encrypted v2 envelope/private PNG, READY hash-bound PDF, byte-identical historical reprint after master changes/approval | PARTIAL: CI2 print defect characterized and hook tested on PHP 5.6 ([20_CP2](20_CP2_LEGACY_INTEGRATION_AND_RELEASE.md)); print route wiring and internal proof resolver remain |

Evidence and commands: [verification](verification.md), [repeatable staging/manual guide](../../../../integration/public-savings/README.md), [legacy mapping/writer contract](../../../../integration/public-savings/legacy/README.md). All rows below this section retain dated historical decisions; they are not the current authorization gate.


**Current continuation29 Oktober2026:** use Business Policy KKISI-PSS-2026-V1 v1.0.0 (15 §5); B-01..B-14 business approvals recorded24 Oct remain in force. Historical CP0/spike paragraphs and earlier decision requests below are not current approval blockers. T01A is DONE; T01B-1 is DONE. T01B form/reference guards and submit rechecks are now implemented/tested; full T01B remains **BLOCKED_TECHNICAL_EVIDENCE** pending actual O-02/O-05/O-06 reference/compatibility acceptance. CP1-T02..T08 are still dependency-gated, not silently started. Staging target/metadata and runtime all-writer proof are not supplied by pure unit tests.

[06 controlled implementation plan](06_IMPLEMENTATION_PLAN.md) separates CP1 public intake, CP2 management/legacy handoff and CP3 native approval. All application tasks unchecked; independent BLOCKED gates in12/13. CP0 documentation/read-only metadata is not permission to start CP1.

CP0.5 current review: P0-01..06 all open, detailed matrix13 §5, owner questions15, cross-channel runtime protocol16. User U-01 prevention direction recorded; actual controls unproven. [17 CP1-T01 checklist](17_CP1_T01_READINESS_CHECKLIST.md) is current scoped start gate. No app task checked complete;14A is an executed abstract analysis experiment, not CP1 integration implementation.

Later U-02 explicitly permits bounded prototype engineering **outside official CP1 tasks**:18 short plan/action sheet,19 actual frontend test results. Only prototype tasks checked in18; CP1-T01 remains unchecked/no-go, no domain/application policy/ports or writer begun.

CP0.6,23 October: TSC-01 full application/workspace baseline CLOSED19 using installed Next generators, no source/config/index changes. Final P0 matrix13 §5, owner sign-off sheet15 §2, safety coverage16 §7 and exact T01 package06 are prepared;17 narrows start to approved pure policies/contracts. No parent P0 closed and no CP1 task started. First authorised future unit is fail-first `packages/domain/tests/public-savings-policy.test.mjs` for approved policy/strict fields, then minimal pure implementation; do not create it from preparation permission.

| Requirement | Task |
|---|---|
| `REQ-001` | P0-01 |
| `REQ-002` | CP1-T03 |
| `REQ-003` | CP1-T03 |
| `REQ-004` | CP1-T01,CP1-T06,CP2-T01 |
| `REQ-005` | CP1-T05 |
| `REQ-006` | CP1-T02,CP1-T05 |
| `REQ-007` | CP1-T05 |
| `REQ-008` | CP2-T02,CP3-T02,CP1-T06,CP2-T01 |
| `REQ-009` | CP2-T02,CP3-T02 |
| `REQ-010` | CP1-T03,CP1-T06,CP2-T01 |
| `REQ-011` | CP1-T05,CP1-T07 |
| `REQ-012` | CP1-T06,CP2-T01 |
| `REQ-013` | CP1-T04 |
| `REQ-014` | CP1-T05,CP2-T02,CP3-T02,CP1-T08,CP2-T04,CP3-T04 |
| `REQ-015` | P0-01,CP1-T08,CP2-T04,CP3-T04 |
| `BR-001` | CP1-T01,CP1-T03,CP1-T05 |
| `BR-002` | CP1-T01,CP1-T05 |
| `BR-003` | CP1-T01,CP1-T05,CP1-T08,CP2-T04,CP3-T04 |
| `BR-004` | CP2-T02,CP3-T02 |
| `BR-005` | P0-01,CP1-T01 |
| `VAL-001` | CP1-T01,CP1-T05 |
| `VAL-002` | CP1-T01,CP1-T05 |
| `VAL-003` | CP1-T05,CP1-T06,CP2-T01 |
| `SEC-001` | CP1-T03 |
| `SEC-002` | CP1-T03,CP2-T02,CP3-T02 |
| `SEC-003` | CP1-T04,CP1-T05 |
| `SEC-004` | CP1-T02,CP1-T04 |
| `SEC-005` | CP1-T03,CP1-T06,CP2-T01,CP1-T07 |
| `SEC-006` | CP1-T05,CP2-T02,CP3-T02 |
| `NFR-001` | CP1-T05,CP1-T08,CP2-T04,CP3-T04 |
| `NFR-002` | CP1-T02,CP1-T07 |
| `OBS-001` | CP1-T02,CP1-T05,CP2-T02,CP3-T02 |
| `OBS-002` | CP1-T07 |
| `MIG-001` | CP1-T02 |
| `MIG-002` | P0-01,CP2-T02,CP3-T02,CP1-T08,CP2-T04,CP3-T04 |
| `MIG-003` | CP1-T07,CP1-T08,CP2-T04,CP3-T04 |
| `REQ-016` | CP1-T08,CP2-T04,CP3-T03 |
| `REQ-017` | P0-01,CP1-T02 |
| `REQ-018` | P0-03,P0-04,CP1-T04 |
| `REQ-019` | P0-05,CP1-T07,CP2-T02 |
| `REQ-020` | P0-07,CP1-T08,CP2-T04,CP3-T04 |

## Execution ledger and status reconciliation — 24 Oktober 2026

Single lightweight reconciliation of the original backlog (06), no new discovery. Statuses: DONE · READY · IN_PROGRESS · BLOCKED_DEPENDENCY · BLOCKED_EXTERNAL_APPROVAL · BLOCKED_TECHNICAL_EVIDENCE · DEFERRED_NOT_AUTHORIZED. Inventory: 7 P0 items + 17 application tasks (CP1-T01A, CP1-T01B, CP1-T02..T08, CP2-T01..T04, CP3-T01..T04). Application tasks DONE: **1/17** (T01A). READY: **0**.

| Task | Refs | CP | Depends on | Implementation evidence | Status | Approval needed | Next concrete code action |
|---|---|---|---|---|---|---|---|
| P0-01 | REQ-001/015/017, MIG-002 | P0 | operator DB-01..04 | 09A historical local metadata only | BLOCKED_TECHNICAL_EVIDENCE | DB operator + hosting (O-01/O-07) | none until metadata/grants/capacity evidence |
| P0-02 | REQ-008/009 | P0 | KOSIPA owner | source+staging prefer L1; no production confirmation | BLOCKED_TECHNICAL_EVIDENCE | KOSIPA operational owner (O-02) | none (gates CP3; CP2-T02 handoff) |
| P0-03 | REQ-018, BR-001..003, VAL-001/002 | P0 | B-01..08 (business) + O-03 | business decisions APPROVED 24 Oct (15 §5); effective payroll semantics unconfirmed | BLOCKED_TECHNICAL_EVIDENCE | payroll operator (O-03) | none |
| P0-04 | REQ-018, SEC-003/004 | P0 | B-09/10 (business) + O-04 | business decisions APPROVED 24 Oct; provider identity/capability unproven | BLOCKED_TECHNICAL_EVIDENCE | provider operator + security (O-04) | none |
| P0-05 | REQ-019, MIG-002 | P0 | B-05/11/12 (business) + O-05/06 | business decisions APPROVED 24 Oct; U-01 binding; all-writer mechanism and XC-01..10 runtime proof missing | BLOCKED_TECHNICAL_EVIDENCE | Laravel/CI2 + DB + security (O-05/O-06) | none |
| P0-06 | REQ-019 | P0 | B-13/14 (business) + O-08 | business decisions APPROVED 24 Oct; real role/recipient configuration not attested | BLOCKED_TECHNICAL_EVIDENCE | KOSIPA + security operator (O-08) | none |
| P0-07 | REQ-020 | P0 | Project Owner | T01A and T01B started by explicit owner instruction (24 Oct) | DONE for T01 scope (CP2/CP3 starts still separate) | — | none |
| CP1-T01A | REQ-004, BR-001/002/005, VAL-001/002 | CP1 | U-03 + §2B exception | `feat/public-savings-cp1-t01a` worktree; six-file hashes = manifest, patch `faae69f7…` (applies to main HEAD, check only); re-run 24 Oct: targeted 116/116, domain 251/251, application 146/146, full typecheck PASS | **DONE** (uncommitted) | — | none |
| CP1-T01B | REQ-004/010, BR-001..005, VAL-001/002, SEC-001..005 | CP1 | T01A + Policy v1.0.0 + T01B start | T01A worktree, uncommitted on top of `80d9e200`: approved policy `savings-policy.ts`; B-01/02 `savings-monetary.ts` (adopted from `2ae3cb5f`); B-03/09 `savings-eligibility.ts`; B-04 `savings-period.ts`; B-05/§16 `savings-lifecycle.ts`; B-07 `savings-link.ts`; B-06/10/12 `savings-snapshot.ts`; B-11 `savings-idempotency.ts`; B-13/14 `savings-access.ts`; application ports, read-only `public-savings-precheck.ts`, fake-UoW `public-savings-submit.ts` (activation gate closed). Tests: 35 new domain (11 monetary + 24 other) + 11 application; domain 286/286, application 157/157, typecheck, lint PASS. **T01B-1 DONE**; all B-01..B-14 rule contracts implemented | BLOCKED_TECHNICAL_EVIDENCE (remaining T01-G06 portion: legacy expected-reference contract, i.e. binding of client `sectionId`/type/current-deduction fields to the real Laravel/CI2 records and states, needs O-02/O-05/O-06) | KOSIPA owner + Laravel/CI2 maintainers (O-02/05/06) | field-binding rule/fixtures implemented29 Oct; obtain actual O-02/O-05/O-06 attestation, reconcile mappings, then accept T01B and open T02 |
| CP1-T02 | MIG-001, REQ-017, NFR-002 | CP1 | full T01 + P0-01/05 + isolated target approval | none | BLOCKED_DEPENDENCY | DB operator, target approval | none |
| CP1-T03 | REQ-002/003/010, SEC-001/002/005 | CP1 | T02 + B-07/09/13 | none | BLOCKED_DEPENDENCY | — | none |
| CP1-T04 | REQ-013/018, SEC-003/004 | CP1 | T03 + B-09/10, O-04 | none | BLOCKED_DEPENDENCY | — | none |
| CP1-T05 | REQ-005..007/011/014, SEC-006 | CP1 | T04 + B-01..06/11/12, XC-01..10 | none | BLOCKED_DEPENDENCY | — | none |
| CP1-T06 | REQ-004/010/012, VAL-003 | CP1 | T05 contracts | U-02 prototype only (not CP1 evidence) | BLOCKED_DEPENDENCY | — | none |
| CP1-T07 | REQ-011/019, OBS-002, MIG-003 | CP1 | T05 + B-08/12/14 | none | BLOCKED_DEPENDENCY | — | none |
| CP1-T08 | REQ-014..016/020 | CP1 | T01..T07 | none | BLOCKED_DEPENDENCY | — | none |
| CP2-T01..T04 | REQ-004/008/009/012/014..016 | CP2 | accepted CP1 + explicit CP2 authorisation + B-13/14 | none | BLOCKED_DEPENDENCY | Project Owner CP2 start after CP1 acceptance | none |
| CP3-T01..T04 | REQ-008/009/014..016 | CP3 | CP1/CP2 accepted, P0-02 canonical, parity, D-CP3 | none | DEFERRED_NOT_AUTHORIZED | explicit CP3 authorisation | none |

### Ledger

| Date | Batch | Result |
|---|---|---|
| 24 Oct 2026 | Priority A baseline protection | T01A and monetary candidate unchanged and recoverable: file hashes match their manifests, both patches verified (`git apply --check`, no tree/index change), tests/typecheck/lint re-run as above; records `reverification-20261024.json` in both artefact folders outside the repository. No source edit, no commit, main staging (23 entries) untouched |
| 24 Oct 2026 | Priority B/C selection | No READY task: T01B-1 waits only for B-01/B-02 signatures and its start; every other application task depends on full T01 or later gates. No new spike created. Restart decisions below |
| 24 Oct 2026 | Phase 1 local commits (Project Owner authorisation: local only, no push/merge/deploy) | Integrity re-verified before commit (manifest hashes match). `feat/public-savings-cp1-t01a` → **`80d9e200`** = exactly the six approved T01A files (reverse-apply of patch `faae69f7…` PASS). `spike/public-savings-monetary-policy` → **`2ae3cb5f`** on top of `80d9e200`, exactly the two monetary files (reverse-apply of delta `d99d7745…` PASS); targeted tests after commit 116/116 and 135/135. Main checkout HEAD `6a5d57b3` and its 23 staged entries untouched. Commits are recoverability only: no policy approval, T01B-1 still not started |
| 24 Oct 2026 | Phase 2 B-01/B-02 gate | No signed B-01/B-02 evidence received: both **PROVISIONAL**. CP1-T01B-1 **BLOCKED_EXTERNAL_APPROVAL**; not started |
| 24 Oct 2026 | T01B-1 execution request (Project Owner authorises T01B-1 only, subject to verified B-01/B-02) | Gate verification FAILED: decision register 13 and sign-off sheet 15 §2 still show B-01/B-02 "Not received / OPEN / PROVISIONAL"; no final values, approver, date, policy version or evidence reference recorded anywhere in the repository. T01B-1 remains **BLOCKED_EXTERNAL_APPROVAL**; no code changed; baselines `80d9e200` / `2ae3cb5f` unchanged |
| 24 Oct 2026 | Policy v1.0.0 recorded | Owner directive KKISI-PSS-2026-V1 v1.0.0 recorded in 15 §5 and 13 (history kept); business portions of P0-03..06 closed, technical evidence kept separate; 06/17 updated in place |
| 24 Oct 2026 | CP1-T01B-1 executed (TDD) | RED: new approved-example tests failed on the synthetic-only candidate (missing export). GREEN: candidate adopted, simulation mode replaced by `resolveApprovedPolicy` (exact match with the registered approved version; proposed/revoked/synthetic/altered envelopes rejected). All approved B-01/B-02 examples pass (10.000/11.000/5.000.000 valid; 10.500 INVALID_INCREMENT; 5.001.000 AMOUNT_EXCEEDS_MAXIMUM; 0 ASSISTED_REQUIRED; negative/decimal/NaN/Infinity INVALID_AMOUNT; 100.000->150.000 INCREASE; 150.000->100.000 DECREASE; unchanged UNCHANGED_REJECTED; 1.000,49 and 1.000,50 ASSISTED_REQUIRED). Approved example "1.000,00 -> 2.000 valid if other constraints pass" evaluates to AMOUNT_BELOW_MINIMUM because 2.000 < B-01 minimum (recorded as consistent with the wording). `evaluatePublicSavingsSubmission` unchanged and still POLICY_NOT_IMPLEMENTED. **DONE** |
| 24 Oct 2026 | CP1-T01B other units (TDD) | B-03/04/05/06/07/09/10/11/12/13/14 pure contracts + application ports and read-only precheck: 24 domain + 4 application tests RED then GREEN; one real type defect (narrowed record lost `state` in `savings-period.ts`) caught by the T01A type-contract test and fixed. Verification: domain 286/286, application 150/150, `pnpm typecheck` PASS, zero-warning lint on all new files, no Node/Prisma/framework import in domain, web presentation regression 5/5. Worktree `node_modules/@koperasi` link pointed at the worktree domain package (local, untracked). Not run: DB, HTTP, browser, provider, PDF, concurrency. No commit, push or merge; main staging (23) untouched |
| 24 Oct 2026 | CP1-T01B submit orchestration contract (06 T01 test group I) | 7 application tests RED then GREEN with a fake unit of work: activation gate closed -> nothing read/written; digest before the transaction; idempotency lookup, re-check on locked facts (link precedence, proof, contact version, eligibility, unchanged authoritative deduction -> FORM_CHANGED, amount rule, duplicates); append with NOTIFY_OPERATIONS + RENDER_PDF intents, consume and receipt in one unit; every rejection rolls back; lost acknowledgement -> COMMIT_OUTCOME_UNKNOWN; adapter failure -> DEPENDENCY_UNAVAILABLE without detail; ports expose no approval/payroll/profile/SQL. Fake proves the contract only, not DB atomicity. Domain 286/286, application 157/157, typecheck and lint PASS |
| 29 Oct 2026 | T01B authoritative-form guard and submit hardening (TDD) | Added `savings-form-binding.ts` and reference read/lock ports; immutable snapshot **pss-snapshot/v2** now includes sectionId/savingsType in canonical digest and material changes (v1 lacked these fields; no deployed snapshots/migration). Precheck requires trusted reference facts; submit rechecks member/section/type/form/consent plus payroll calendar under lock and reads fresh time after waiting. RED→GREEN demonstrates calendar/proof-expiry omissions; nested policy getter/revoked-proxy cases hardened without changing signed policy values. Targeted41/41, domain293/293, application161/161, full typecheck, zero-warning lint and frontend5/5 PASS. These are injected/fake reference and transaction tests only: no actual legacy mapping, DB atomicity or XC proof. No T02+, writer, live OTP/public route, commit/push/merge/deploy; original main staging preserved |

### Historical decision set to restart implementation — superseded by Policy v1.0.0 where signed

1. **Savings + payroll owners — sign B-01 and B-02** (enables T01B-1 adoption of the existing candidate). Required values, matching the candidate's `MonetaryRules`: `minAmount`; `increment` and `incrementBasis` (multiples of the increment from 0, or steps from the minimum); `maxAmount` or explicit `NO_ADDITIONAL_BUSINESS_CAP`; `technicalMaxAmount` (representation ceiling); `allowIncrease` / `allowDecrease`; unchanged amount rejected or not; zero handling (`REJECT` / `ASSISTED_ONLY` / `ALLOW`); legacy old-value treatment (`HALF_UP` rounding or `REJECT_FRACTIONAL`) with worked examples; comparison basis (`EXACT` / `NORMALIZED`). Record approver role and identity, date, policy version, scope and evidence reference (15 §4).
2. **Project Owner — explicit T01B-1 start** after item 1, limited to monetary/deduction validation in the T01A integration worktree.
3. **Project Owner — baseline protection:** allow local, unpushed commits on `feat/public-savings-cp1-t01a` (and the spike branch) so that verified work is not held only as uncommitted files. No push or merge.
4. For the rest of T01B (in parallel, owners per 15 §2): B-03..B-06 (eligibility, calendar, duplicates, form), B-07..B-10 (token/OTP, retention scope, contact, assurance), B-11/B-12 with O-05/O-06 (ownership, idempotency, print), B-13/B-14 with O-08 (staff actions, routing).
