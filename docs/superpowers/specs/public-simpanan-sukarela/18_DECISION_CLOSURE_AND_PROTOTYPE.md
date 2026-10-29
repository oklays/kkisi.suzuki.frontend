# 18 — Decision closure package and bounded prototype plan

22 Oktober2026. Track A/B authorised by latest user instruction. **U-02 APPROVED: isolated frontend/mock preparation only; official CP1-T01, DB writes, legacy mutation and operational activation remain deferred.** U-01 mandatory prevention remains approved; no repeat approval requested. No new owner policy/evidence supplied: P0-01..06 remain open. This is the concise action sheet over13–17, not another architecture audit.

**CP0.6 update23 October:** final consolidated decision matrix13 §5 and final approve/reject/modify sheet15 §2 supersede this grouped presentation; evidence checklist and actual integration protocol below remain applicable. Full app/workspace typecheck blocker now CLOSED19; exact T01 gate17 and proposed execution package06 distinguish signed contracts from later production/runtime proof. No new business policy approved.

## Owner approval sheet

Each choice is PENDING unless U-01/U-02. Sign-off format: ID, chosen option/exact values, approver role, date, scope/version and evidence ref. Agent recommendation is not approval. Existing15 B/O IDs remain stable.

| Group / decision IDs | Context and recommended option/default | Other choice / trade-off | Owner / required sign-off |
|---|---|---|---|
| Product: B-06 (presentation portion), U-02 | mobile-first readonly member context; amount/signature/explicit consent; clear requested-period wording, loading/error/simulation-success states; mock-only preparation approved | editing authoritative fields widens master ownership; separate membership/business approval required | product owner may approve copy/layout/accessibility; cannot approve payroll semantics by proxy |
| Product + system: B-11/12 | existing business entity; Next PUBLIC create later, CI2 processor; private immutable signature/PDF based on approved template | requiring unchanged CI2 profile PDF for PUBLIC needs reader integration; no profile overwrite/omission; scope change separately authorised | product approves presentation/template proposal; data/legacy/security owners endorse ownership and enforceable print/control contract |
| Business/payroll: B-01..06 | concrete recommended policy below; preserve observed legacy behavior where policy is unproven | more permissive/restrictive business rules change who/when/how much; do not infer approval from mobile UI alone | savings/payroll+membership approve exact bounds/key/calendar/status/groups and expected existing/new-master outcomes |
| Business/security/records: B-07/08 |48h link/5min OTP proposal; explicit retention controls below |24h reduces exposure/increases reissue; retention period affects dispute/privacy/storage | business+security+records approve values, custody and deletion authority |
| DB/infra: O-01/07 | scoped metadata/account/trigger/topology evidence14; restricted grant specification and measured capacity; no provisioning now | source-equivalent staging enables isolated proof but does not prove production parity | DB/hosting/infra attestation and engineering semantic delta review |
| Legacy: O-02/03/05/06 | canonical route confirmation; all-writer prevention BEFORE first effect, coherent full-command config/header transition, correct PUBLIC print route | shared boundary vs coordinated writer change16; if unavailable, hold activation and separately scope compatibility work | KOSIPA/Laravel/CI2 owners sign active-path inventory, payroll behavior and chosen mechanism; runtime evidence below mandatory |
| Security/OTP: B-09/10,O-04 | current contact evidence, bound proof; direct approved provider adapter later, no mobile OTP/reset reuse; no independent MFA claim for same-channel link+OTP | final-payload OTP increases binding but changes challenge/review contract; requires explicit choice | membership+security+provider operator: provenance/freshness/assurance/sender/template/quota/timeout/custody + future sandbox permission |
| Authority/routing: B-13/14,O-08 | explicit issue/revoke/proof grants under existing identity/menu upper bound; configured DB notification+postcommit email | blanket view/admin grants inappropriate; dual control or optional mail require owner choice | KOSIPA/security/operator sign action/recipient/fallback mapping; real IDs kept in private config |

## P0-03 concrete recommendations — still unapproved

| Policy / ID | Recommended choice | Legacy baseline / alternative and safe fallback |
|---|---|---|
| Minimum / B-01 | integer Rp1 positive enrollment/change floor, increment Rp1 | positive minimum not proven in CREATE; this is a proposed change requiring sign-off.0 assisted pending explicit stop-flow decision |
| Maximum / B-01 | preserve **no additional business cap** observed in legacy CREATE only if payroll owner explicitly approves; otherwise require exact business cap before operational use | no safe salary-based percentage or arbitrary Rp ceiling can be inferred. Technical proposed ceiling is min(owner cap if any,9007199254740991,DB safe integer round-trip limit); prove actual legacy/PHP/DB representation, not just TypeScript parsing. Missing maximum decision blocks activation |
| Eligibility / B-03 | unique AKTIVE + owner-approved kd_group allowlist; unresolved/expired/resign/pensiun assisted; new enrollment requires approval | a new stricter public policy, not a claim legacy CREATE enforces it; broader statuses need exact rules/source |
| Cutoff / B-04,O-03 | server Jakarta next eligible payroll period; **no invented cutoff day**. Require actual calendar date+time+holiday handling; failclosed if unknown | requested month differs from effective payroll because existing-master approval retains periods and updates config immediately. Owner must reconcile this before release; no payroll change now |
| Changes / B-02/06 | positive increase/decrease allowed, unchanged rejected,0 assisted; readonly section/type/old/period, correction via approved reject+new consent | SUKARELA increase-only rule not observed; WAJIB rule not imported. No silent rewrite/reopen or automatic financial reversal |
| Duplicates / B-05 | block OPEN/POSTING all savings types per mobile UI intent; owner signs exact pending business key and terminal release policy, then enforce across every writer | backend CREATE lacks this guard; implementing it changes enforcement, so sign-off required. Per-type/per-period policy is alternative; no permanent NIK-only unique, manual review not a substitute for U-01 |
| Link TTL / B-07 | default/max48h, may shorten1..48h, no sliding extension; raw256bit/digest |24h alternative lowers exposure at cost of reissue; value not standard-mandated |
| OTP / B-07/10 |6digits,5min TTL,5 attempts, resend≥60s,≤3/15min/link and≤5/member/hour, proof≤15min capped by link expiry | limits provisional until security/provider endorsement; attempts/shared quotas and final consent gate mandatory; clarify pre-form contact proof vs final-payload OTP |
| Retention / B-08 | candidate tombstone90days; prototype stores nothing persistently. Financial proof/audit deletion OFF until records owner specifies duration; backups/keys must preserve referenced evidence |90days is not financial-document retention. No statutory period invented; no operational activation with undefined retention/custody policy |

General random/single-use/rate-limited token and server-side authorization principles: [OWASP URL token guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [OWASP transaction authorization](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html). Numeric defaults above are engineering proposals, not mandates from these sources.

## Evidence collection checklist — human-owned, not sent automatically

- [ ] **DB — O-01:** environment/time-attested9-table metadata, full trigger/routine visibility+transitive engines, session SQL mode/timezone/isolation/autocommit, sanitized actual/planned effective privileges and same/distinct channel trust boundaries.14 DB-01..03 specifies exact scope; no member export or credentials.
- [ ] **Infra — O-07:** hosting limit scope, pool×process×instances+PHP peak+worker+reserve, transport identity/allowlist, private object/backup/key custody, HTTPS/proxy/log redaction and monitoring owner.
- [ ] **Membership — B-03/09:** eligibility/group/enrollment decision; current contact evidence workflow/ref/verifier/time/currentness and changed/lost-phone procedure; flag alone insufficient.
- [ ] **Payroll — B-01..05,O-03:** signed numerical/period/duplicate fixtures; actual effective existing/new master outcomes and late-approval handling; no live mutation for evidence collection.
- [ ] **Security/provider — B-07/08/10,O-04:** exact assurance/limits/retention/custody decisions and active provider/sender/template/channel/timeout/delivery capabilities; future approved sandbox recipient stored privately, no sends now.
- [ ] **Legacy — O-02/05/06:** canonical and alternate/direct process/delete/edit/cancel/manual-config/print paths; authenticated actor boundary; selected prevention design and separately approved change scope if needed.
- [ ] **Operator — B-13/14,O-08:** signed action/recipient/fallback policy and active role/menu/config reference; synthetic positive/negative personas; no real contacts/IDs in shared docs.

## P0-05 real-integration proof contract (supplements16 XC-01..10)

No simulated model counts toward release. On future **explicitly approved source-equivalent disposable MariaDB staging**, run actual Laravel Mobile HTTP handlers and actual canonical/alternate CI2 handlers plus future Next endpoints, each authenticated with synthetic identities and intended restricted DB principals. Capture app/source/control/schema fingerprints and exact account-role scopes, not source-equivalence by assertion. No production URL/account/data permitted.

| Evidence ID / cases16 | Required artifact and pass condition |
|---|---|
| INT-01 / XC-01/02/09 | barrier-controlled real HTTP create races PUBLIC/PUBLIC, PUBLIC/MOBILE, MOBILE/MOBILE; independent DB sessions; pre/post actual rows/reservations/notif/audit/consume/receipts; exactly permitted winner/count per signed key, exact retry stable, no mixed doc_no lookup; legitimate different-key requests proceed |
| INT-02 / XC-03/04/06 | valid authenticated other/own mobile actor with known encrypted PUBLIC doc_no attempts edit/cancel before/during/after process; direct L1/L4/delete/manual paths exercised. Denied before first effect, zero unauthorized body/status/config/proof changes; same-scope legitimate MOBILE regression |
| INT-03 / XC-04/05 | actual CI2 approve/reject/cancel/replay races, plus independently observed DB sessions; deterministic fault after active-master write, after member write, before header/audit/commit and lost response. Full effect set rolls back or exactly one coherent committed outcome; **late-header-only rejection leaving config changed fails** |
| INT-04 / XC-07/08/10 | real profile/contact/cutoff changes invalidate stale context; immutable signature/PDF render/hash stable after profile changes, proof-not-ready/direct wrong-print bypass denied; restore/flags retain receipts/proof; actual ordinary mobile workflow remains compatible |

Each run records fixture IDs, command/correlation IDs, actor/channel, barrier schedule, affected-row counts, before/after hashes/status/config, HTTP outcomes, rollback/receipt evidence and denied-write audit. Repeat both serial extremes and controlled overlapping schedules; cover2+processes and concurrent instances, deadlocks/timeouts/retries. Summarized logs redact PII/secrets. Owners engineering+DB+Laravel+CI2+security+payroll review artifacts and sign pass/fail/skip per case. Missing handler, privilege boundary or fault point = incomplete evidence; all operational activation stays NO-GO. This document defines the protocol, **does not authorise or claim these runs**.

## Bounded frontend plan — not CP1-T01

Use existing React/TypeScript and KOSIPA colors (`#0754e8`, `#003399`, `#111b30`, `#64748b`, `#e5ebf3`, white), existing exact-rupiah presentation helper, system/body font and tabular amounts. Desktop: form with a quiet authorization-summary side panel; mobile: one column and clear sequential review. Persistent amber simulation label; signature review is the main distinguishing element. No new visual library, remote fonts or production route.

Files: `apps/web/src/prototypes/public-savings/{types.ts,fixture.ts,PublicSavingsPrototype.tsx,SignatureField.tsx,prototype.css,preview.tsx,README.md}`; preview server `apps/web/scripts/public-savings-prototype.mjs`; tests `apps/web/tests/public-savings-prototype*.mjs`. Only presentation/mock adapter, not domain/application policy/ports. No `src/app` import/route, no feature flag/DSN/env/account/token/proof persistence or real OTP/provider call. Preview loopback-only, exact GET asset allowlist, no mutation endpoints. External build/browser tools, if needed, installed in temporary directory, not repository manifests/lockfile.

- [x] Write failing fixture/view-validation, React markup and browser interaction/isolation tests; capture red.
- [x] Implement provisional fixture context and memory-only mock adapter, reusable form/signature, loading/invalid/expired/revoked/consumed/error/simulation-success states, retry preserving draft, responsive scoped styles.
- [x] Preview through temporary browser harness, run keyboard/axe/responsive200% checks and screenshot review; no production app server/env/database needed.
- [x] Run focused unit/component tests, scoped TypeScript, lint and existing relevant regression; results19 records full-app generated-type failure separately; update13/17 without closing P0 or starting CP1.
