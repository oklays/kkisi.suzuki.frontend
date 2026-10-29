# 13 — Decision, blocker and risk register

**Current resolution29 October2026:** Policy v1.0.0/B-01..B-14 are approved; do not reopen them. Owner MASTER EXECUTION PROMPT explicitly approves STG-01 and engineering work on O-02/O-05/O-06, including isolated DDL/writer integration and local commits. Local implementation/SQL/browser evidence now exists. O-02/O-05/O-06 remain **PARTIAL for actual legacy operational integration**, not a new business approval request: exact current PHP, deployed metadata/privileges/all-writer routing and CI2 private print hook are unavailable. The local representative boundary is tested, not production-equivalent certification. The dated CP0 matrices below are retained history.


Updated23 Oktober2026, CP0.6. Status vocabulary: **VERIFIED, RECOMMENDED, NEEDS BUSINESS APPROVAL, BLOCKED, NOT APPLICABLE**. VERIFIED = observed scoped fact, not sign-off for production. RECOMMENDED = selected design recommendation. Owner approval is recorded separately with scope/date/evidence; no default is approved by implication. **U-01 user direction accepted: preventive cross-channel protection mandatory; activation postponed until proven. Operational exception cannot clear P0-05.** Full P0 matrix §5; evidence14, decisions15, strategy16, gates17. No parent P0-01..06 closed.

## 1. Decisions and blockers

| ID | Decision | Recommended Option | Evidence | Status | Blocking Checkpoint |
|---|---|---|---|---|---|
| D-SCOPE | phased feature ownership | CP1 public intake, CP2 staff management with legacy processor, CP3 separate native migration | current user workstreamsA/B/G;08 | RECOMMENDED | scope control all phases |
| D-SOT | canonical business entity | existing trans_simpanan_pengajuan by PK; no shadow business table | B2/L1/L2,02 | VERIFIED | no blocker; preserve all phases |
| D-WRITER | concurrent creation ownership | command/origin-bounded Laravel MOBILE+Next PUBLIC INSERT, CI2-only status/config initially; explicit scoped baseline amendment/grants approval |08 ownership; DATA_OWNERSHIP table-only rule conflicts with current/requested multi-channel behavior | NEEDS BUSINESS APPROVAL | CP1/CP2 writes; CP3 own cutover |
| D-SCHEMA-LOCAL | local metadata baseline | use09A only as live LOCAL_STAGING evidence, not production equivalence | C0-DB1:9 tables / 219 columns, InnoDB, SELECT-only grant | VERIFIED | no production inference |
| D-SCHEMA-PROD | production schema/trigger/SQL-mode equivalence | authorised operator returns scoped metadata with full visibility and transitive trigger effects |09 §7; no prod DB query this checkpoint | BLOCKED | CP1 production-compatible adapter acceptance; CP3 payroll writes |
| D-GRANTS | intended app/worker privileges | dedicated restricted CP1 public writer, no config/profile UPDATE; CP3 separate processor |09 §4; only local reader exists as inspected | BLOCKED | CP1 staging setup, CP3 separately |
| D-CAPACITY | connection headroom/transport | one capped public client after total pool+instances+PHP measured; validate target transport/identity | N7; local settings differ from hosting baseline | BLOCKED | CP1/2 rollout; CP3 new client budget |
| D-APPROVAL | preferred integration/reference | L1 mobile/Pengajuan_mobile_c; leave CI2 as sole processor in CP1/CP2 | B2 notif URLs, C0-DB1 staging menu, L1/L4 source hashes stable | RECOMMENDED | no migration based on name alone |
| D-CANONICAL | active production approval and obsolete variant | operator production menu+actual workflow confirmation; keep L4 unclassified until proven unused | source+staging supports L1, not production use;08 compatibility | BLOCKED | initial production handoff CP1/CP2; mandatory CP3 migration |
| D-NUMBER | public doc_no/source marker | SP+32hex+00000, is_mobile0 + aux origin; test MAX RIGHT5 global mobile interaction | B6,05 mapping, I-09 | RECOMMENDED | CP1 compatibility tests must pass before enable |
| D-DUP | business duplicate semantics vs token invariant | owner defines conflict key/pending/release policy, then all-writer preventive coordination; public precheck alone insufficient; manual review only supplementary, no NIK-only permanent unique | U-01; B2 no create guard; C05-MODEL1;16 | NEEDS BUSINESS APPROVAL | CP1 contracts; cross-channel runtime proof before activation |
| D-MUTATION | existing mobile edit/cancel can target public row | mandatory tested preventive origin/actor/state boundary for all affected commands, before first side effect; no operational waiver fallback or global mobile shutdown | U-01; C05-MUT1/ORDER1: late header guard cannot guarantee config rollback | BLOCKED | protected CP1/2 activation; competing writes before CP3 also |
| D-CONTACT | trusted member/contact source | member master contact plus verifiable current approved KYC/assisted verification ref; bind per-link MAC/version/verifier/time; not users flag alone | C0-OTP1;09A users lacks phone verification timestamp;11 | BLOCKED | CP1 issue/verify; CP2 usable generation |
| D-PROVIDER | OTP infrastructure reuse | verify actual existing active provider/sender capability, then new Next adapter direct provider; no mobile OTP API | C0-OTP2 source includes Fonnte under2factor label; active config/delivery not checked | BLOCKED | CP1 OTP end-to-end |
| D-TTL | public expiry/security limits |48h default/max48h, shortening1..48; OTP5m/5attempt/60s resend/3per15min link; proof15m |11 threat model; values proposals only | NEEDS BUSINESS APPROVAL | CP1 policy activation |
| D-AMOUNT | min/max/change/rounding | positive integer Rp1floor, allow positive decreases/increases, unchanged reject, zero assisted; owner explicitly sets max or approves no business max plus technical cap | B2 no proven bounds; M3 WAJIB-only increase;10 matrix | NEEDS BUSINESS APPROVAL | CP1 parser/policy acceptance |
| D-ELIG | eligible member statuses/groups | unique AKTIVE member, approved groups; other status/expired contract assisted until policy defined; reread all mutations | B2 no full eligibility; N8 credit policy not savings | NEEDS BUSINESS APPROVAL | CP1 issue/submit |
| D-PERIOD | requested vs effective payroll period/cutoff | owner supplies payroll calendar/cutoff; public requests next allowed period; no promised effective month without confirmed CI2 behavior | M3 month bug; L1 existing-master retains periods+immediate config update | BLOCKED | CP1 business correctness; CP3 parity |
| D-FORM | section/old/source profile mutation | authoritative readonly section/type/old/period; no public profile mutation, immutable submitted snapshot |01 parity deviation/B2 profile updates;10 contract | NEEDS BUSINESS APPROVAL | CP1 public form, CP2 details |
| D-PDF | signature/PDF compatibility with unchanged CI2 | private immutable mandatory PNG+snapshot PDF, approved print ownership and enforced public proof/READY routing when required before processing; manual handoff alone cannot satisfy U-01 | C05-PDF1; L5 current member.foto_ttd;15 B-12,16 | BLOCKED | CP1 artifacts/compatibility; CP2 operator use |
| D-NOTIFY | required recipients / audit/outbox | configured legacy notif recipient/bagian/email, explicit required fields, aftercommit mail; no hardcoded9/5 copied blindly | B2/L6;09A NOT NULL columns | NEEDS BUSINESS APPROVAL | CP1 required notification parity |
| D-RBAC | generator/revoker/view/proof access authority | active identity+legacy menu upperbound+explicit staff action policy, same framework as export; no auto admin/maker grant | N2/N4;12 contracts | NEEDS BUSINESS APPROVAL | CP1 secure APIs; CP2 UI; CP3 process separate |
| D-RETENTION | proof/tombstone/audit cleanup |90d tombstone proposal, financial proof retention owner-defined, deletion OFF until explicit policy; no regulatory duration invented |11;10 §3 | NEEDS BUSINESS APPROVAL | CP1 lifecycle/operations before activation |
| D-CP3 | payroll processor cutover | native only after canonical parity/reconciliation; freeze conflicting process/config paths; separate approval and rollback rehearsal |08 §5;12 §7; untouched CI2 legacy writes | BLOCKED | CP3 only, not requirement to replace legacy in CP1/CP2 |
| D-MOBILE-LOGIN | mobile authentication on public page | no mobile login/PIN/GPS/account requirement | user requirement, M8 audit and new scoped verification design | NOT APPLICABLE | no mobile-session dependency introduced |

## 2. Exact clearance actions / responsible role

| Action | Owner | Decision IDs closed by evidence | Completion evidence |
|---|---|---|---|
| P0-01 source-schema intake | DB operator + engineering | D-SCHEMA-PROD/D-GRANTS/D-CAPACITY | metadata-only tables/index/FK/engines/defaults/trigger effects/version/sqlmode/timezone/effective grants; actual topology and pool accounting, no credentials/member export |
| P0-02 canonical workflow confirmation | KOSIPA process owner | D-CANONICAL/D-APPROVAL | dated production menu route/config and actual operator walkthrough confirmation; no live approve/write test; identify both variant access paths and conflicting edit/cancel routes |
| P0-03 business policy pack | savings/payroll owner | D-AMOUNT/D-ELIG/D-PERIOD/D-DUP/D-FORM/D-TTL/D-RETENTION | written values/allowed changes/statuses/groups/cutoff/effective period and duplicate handling accepted; supported by source semantics, not default as approval |
| P0-04 identity/provider proof | membership/security/operator | D-CONTACT/D-PROVIDER | current verification provenance workflow/source/ref; provider/sender/template/channel/timeout agreement; approved sandbox recipient and next-stage UAT, no sends now |
| P0-05 compatibility/security controls | security + legacy/mobile owners | D-WRITER/D-MUTATION/D-PDF/D-NUMBER | U-01 requires all-writer preventive control before operational activation; reviewed design+actual staging XC-01..10 proof; if legacy changes required, separate approved scope; hold activation |
| P0-06 operator authority / routing | KOSIPA/security/operator | D-RBAC/D-NOTIFY | explicit actions/recipient mapping with no real IDs/contacts exposed in public docs; audit policy; safe role test personas |
| P0-07 authorise scoped CP1 start | user + engineering reviewer | CP1 implementation permission, distinct from defaults | concrete approved design/policy scope and isolated worktree/staging constraints; no implicit approve from checkpoint0 request |
| P3-01 native migration authorisation | payroll owner/operator/user | D-CP3 | CP1/2 acceptance, signed parity/reconciliation, one-writer switch plan and restore order, separate cutover permission |

If a mandatory policy is unresolved, implementation readiness stays BLOCKED. Read-only evidence/documentation work can continue without pretending CP1 completed or partially approved. CP2 readiness not implied by UI-only reversibility; CP3 readiness not implied by CP1 atomic submission success.

## 3. Prioritised risk register

Probability is qualitative engineering assessment, **not measured incident rate**. B = mandatory blocker unless approved/tested mitigation; N = nonblocking improvement after safety gate. Owner acceptance alone cannot prove a technical invariant: documentation must state residual limitations accurately.

| Risk | Severity | Probability | Impact | Mitigation | Detection / monitoring | Owner | Acceptance gate / B or N |
|---|---|---|---|---|---|---|---|
| R01 Cross-channel duplicate intake | HIGH | MEDIUM | conflicting pending or double payroll config processing | signed D-DUP key/status rules plus all-writer preventive coordination16; precheck/reconciliation supplementary | key reservation conflicts and invariant monitoring | savings/legacy/mobile owner | XC-02/C0-T02 before activation, B |
| R02 Conflicting approval writers | CRITICAL | HIGH if native enabled early | last-writer payroll errors | CI2-only CP1/2, native flag/account absent; CP3 scoped freeze | DB grants/control inventory, process audit/config reconciliation | payroll/operator | C0-T07/08 / CP3, B |
| R03 Incorrect payroll period | CRITICAL | MEDIUM | deduction effective earlier/later than consent | D-PERIOD owner calendar/cutoff, no invented dates; test L1 existing-master behavior | requested vs actual active-period reconciliation | payroll owner | C0-T03 / CP1, B |
| R04 Incorrect amount/range/rounding | HIGH | MEDIUM | wrong recurring deduction | canonical integer parser, approved min/max/change, authoritative old snapshot | compare approved request/config, field validation metrics | savings owner/engineering | F-04/11 / CP1, B |
| R05 Token replay/race | HIGH | MEDIUM | duplicate records/notif | real UoW row locks/unique refs, saved receipt | S-04/05 SQL counts, replay conflicts | engineering | CP1, B |
| R06 URL/token leakage | HIGH | MEDIUM | unauthorised form access | fragment, redact headers/log/APM, expiry+OTP, no analytics | S-09/12 sanitized log/network inspection | security/infra | CP1, B |
| R07 Unverified/stale contact | CRITICAL | HIGH without provenance | payroll consent attributed wrong person | D-CONTACT current-verification proof, no arbitrary recipient/flag-only trust | C0-T05 rejects missing/changed source | membership/security | CP1, B |
| R08 OTP abuse/provider uncertainty | HIGH | MEDIUM | account abuse/flood/cost/lockout | shared rate limits/attempt caps, approved provider/timeouts, no secret outbox | provider error/quota metrics, resend limits across instances | security/operations | S-10/11,C0-T05 / CP1, B |
| R09 Incomplete signature/PDF compatibility | HIGH | HIGH under current profile print | wrong signature/consent proof | private immutable snapshot+approved template, enforced public print/proof-ready prerequisite; no omission | XC-07/C0-T04 render/hash/direct-bypass checks; PDF pending alarm | KOSIPA/security | CP1/2 activation, B |
| R10 Missing/excess DB grants | CRITICAL | HIGH now no writer | failure or unintended master/payroll writes | D-GRANTS restricted writer, no DDL/admin; deny config UPDATE CP1 | effective grants+negative privilege tests | DB operator | C0-T01 / CP1, B |
| R11 Schema drift / hidden triggers | HIGH | MEDIUM | coercion/errors/nontransactional side effects | D-SCHEMA-PROD metadata visibility+schema-equivalent staging | schema fingerprint diff + trigger effect review | DB operator | C0-T01 / CP1, B |
| R12 Race/partial DB writes | CRITICAL | MEDIUM | consumed link without request / partial notification | one InnoDB connection transaction, affectedRows assertions | fault injection each statement, unknown-commit alerts | engineering | I-02/03 / CP1, B |
| R13 Notification delivery failure | MEDIUM | MEDIUM | operator misses request | DB notif+durable outbox, leases/backoff/DEAD alert; no business retry | oldest pending age>5min proposed, retry counts | operations | I-05 / CP1, B for required delivery controls; optional extra channels N |
| R14 Connectivity/capacity exhaustion | HIGH | MEDIUM | overload legacy services | measured topology/account budget, capped client, bounded tx+timeouts | pool waits/deadlocks/source DB errors | infra/operator | O-01 / CP1/2/3, B |
| R15 Production switch/rollback failure | CRITICAL | MEDIUM | dual processing/lost evidence | stage rehearsal, independent flags, preserve receipts, explicit processor switch | O-03 reconciliation/no simultaneous writers | operator/payroll | CP1/2 rollout and CP3 cutover, B |
| R16 Mobile edit/cancel public record | CRITICAL | MEDIUM | snapshot/body/status diverges; rogue rejection | U-01 mandatory all-writer prevention before first effect; no operational exception, doc_no secrecy insufficient | XC-03/04/05 + supplemental fingerprint/status reconciliation; actor gaps honest | security/mobile/legacy | CP1/2 activation, B |
| R17 Nonrepresentable charset/truncation/NIK length | HIGH | MEDIUM | wrong member/proof or failed approval | strict encoded lengths/exact identity; active master NIK10 check, no coercion | schema+boundary fixtures, rejected encoding metrics | engineering/DB | C0-T01 / CP1, B |
| R18 Lost response / orphan storage | HIGH | MEDIUM | duplicate resubmit or deleted valid proof | saved receipt, same-key retry, staged immutable objects, delayed reference-safe cleanup | I-03/08, orphan age/unknown commit | engineering/operations | CP1, B |
| R19 Invalid RBAC / PII exposure | HIGH | MEDIUM | link issuance/proof access by wrong staff | existing gates+approved explicit grants+audit, masked default | S-07 direct API probes/role fixtures | security/KOSIPA owner | CP1/2, B |
| R20 Premature financial proof cleanup | HIGH | MEDIUM | lost consent/recovery evidence | D-RETENTION deletion disabled until approved; backups/immutable reference preservation | cleanup dry-run reports, restore rehearsal | records owner/operator | O-02 / CP1 operation, B |
| R21 UX/copy/share polish beyond functional accessibility | LOW | LOW | extra operator effort | native share/copy fallback first; later polish after verified core | browser feedback; no security bypass to improve UX | product/frontend | CP2, N after U-01/U-02 safety pass |

## 4. Independent readiness summary

- **CP1 BLOCKED:** policy/contact/provider/schema/writer/PDF/duplicate+mutation prerequisites above mandatory and unresolved. Local InnoDB metadata is a useful VERIFIED fact, not permission to write.
- **CP2 BLOCKED:** CP1 contracts/acceptance absent plus actual staff authority/canonical handoff not final; can scope isolated UI work separately only on explicit request, not inferred from this readiness phase.
- **CP3 BLOCKED:** actual production canonical and payroll side effects/parity/cutover not proven or authorised; initial public delivery does not require starting this migration.

No checkpoint marked READY or READY WITH CONDITIONS: U-01 permits safe isolated work but mandatory business/contract inputs remain unapproved and control proof absent.17 distinguishes pure contract start from staging/operational acceptance. Next action = P0-01..06 owner pack; no automatic CP1 start or production activation.

## 5. Final consolidated P0 matrix — CP0.6,23 Oktober2026

Readiness impact: **T01** = pure policy/contracts only; **INT** = DB/actual-channel integration; **ACT** = operational activation. A parent may remain open for ACT while its **signed contract portion** is sufficient for T01.13 remains the single blocker register;15 is the answer sheet,16 the safety contract,17 the four gates and06 the execution package. No new business approval or operator evidence has arrived.

Evidence classes: **AP** approved direction U-01 (mandatory prevention/hold activation); **AUTH** authorised prototype U-02 (permission, not business policy); **PR** provisional rules10/11/18; **VF** scoped verified fact; **AS** unsupported assumption; **EX** external owner decision; **RT** actual runtime control not proven. No amount/eligibility/calendar/TTL/retention policy is AP. Historical LOCAL metadata21 October and source22 October are not current production proof. Full typecheck baseline **VF/CLOSED TSC-01**23 October19; not a P0 parent closure.

| Blocker / decision IDs | Current status | Existing evidence | Outstanding decision | Recommended option | Consequences / trade-offs | Required owner | Exact acceptance criteria | Impact T01 / INT / ACT |
|---|---|---|---|---|---|---|---|---|
| P0-01 D-SCHEMA-PROD/GRANTS/CAPACITY | BLOCKED EX/AS | VF historical09A:9 tables/219 columns/17 index entries, local InnoDB/reader; last22 Oct reader P1001.14; no production introspection | actual schema/transitive triggers/account scopes/transport/capacity | operator DB-01..04 sanitized metadata and reviewed restricted-grant design; no provisioning now | source-equivalent staging supports development only; broad legacy account or local settings cannot substitute production evidence | DB+hosting/infra; engineering review | dated target/visibility attestation; normalized9-table columns/index/constraints+all trigger effects; effective existing/planned privilege boundaries; transport and full pool/PHP budget assessed. Runtime privilege/atomicity proof separately required | T01: no DB access required; explicit encoding/precision assumptions in approved fixtures. INT: mandatory source-equivalent target/account approval. ACT: mandatory actual production evidence |
| P0-02 D-CANONICAL/APPROVAL | BLOCKED EX | VF B2/L1/L4 hashes22 Oct; source+historical local menu prefer L1, not production usage | active canonical controller, alternate/direct lifecycle paths | confirm L1/L4 menu/permissions and actual workflow; keep CI2 processor | choosing by source name alone can preserve wrong approval/period/PDF behavior; mixed routes require delta review | KOSIPA operator+CI2 owner | dated canonical actor/action/route attestation incl edit/cancel/delete/manual-config/print; safe readonly walkthrough; explicit classification of both variants | T01: signed expected behavior contract, no live controller required; no unknown payroll outcome assumed. INT: actual staging handlers/reference. ACT: production canonical and bypass inventory mandatory |
| P0-03 D-AMOUNT/ELIG/PERIOD/DUP/FORM/TTL/RETENTION | NEEDS BUSINESS APPROVAL PR/EX; period BLOCKED | VF required signature/consent+OPEN create; WAJIB-only increase rule; mobile pending UI all types; L1 immediate config update/retained existing periods.10/11 | B-01..08: amounts/eligibility/change/calendar/key/TTL/retention; no current final values | signed options15/18; integer Rp1 floor proposed, explicit cap-or-no-cap decision, positive changes/0 assisted proposed, owner calendar, preventive pending-key policy,48h/OTP5m proposals | stricter public checks change legacy enforcement; no cutoff/financial retention duration can be invented; pending UI is not DB uniqueness | savings/payroll+membership; security/records for respective limits | exact values/formulas/status/group/enrollment/key/release/calendar/rounding/correction fixtures + approved version/approver/effective scope; unknown mandatory final rule fails closed | T01: every rule actually implemented as final must be approved; unapproved dependent item BLOCKED. INT: source/legacy outcome boundary tests. ACT: complete policy pack and effective-payroll proof |
| P0-04 D-CONTACT/PROVIDER | BLOCKED PR/EX/RT | VF users flag lacks proven currency/provenance; OTP source hash22 Oct and provider-label ambiguity11/14; no active provider/dispatch proof | B-09/10 current contact evidence/assurance; O-04 actual provider capabilities/custody | attributable approved contact ref+exact binding; provider-neutral port, approved direct provider adapter later; no mobile OTP/reset reuse | same-channel OTP is not independent MFA; final-payload OTP adds binding/flow change; no phone override or bearer-only fallback | membership+security+provider/infra | signed contact currentness/change/verification/assurance and challenge/proof semantics; actual account/sender/template/quota/timeout contract and approved sandbox results before activation | T01: approved facts/assurance/port contracts; no real provider/key/send needed. INT: approved provider/sandbox and resolver implementation. ACT: current contact provenance+real delivery/failure evidence |
| P0-05 D-WRITER/MUTATION/PDF/NUMBER + D-DUP | BLOCKED; AP U-01 direction; EX/RT mechanism | VF B10 origin/state gap; CI2 config-before-header order; profile-based PDF; numbering global RIGHT5.14; abstract model is not proof | B-05/11/12 key/ownership/print and chosen all-writer preventive mechanism; legacy scope approval if needed | one authenticated, state/version-aware business-command boundary before effects, whole-command transaction and immutable snapshot; CI2 still processor; hold activation until16/18 pass | Next-only locks/token uniqueness/late header guard/manual review insufficient; may require separately authorised Laravel/CI2 or DB-boundary changes; no covert CP3 | data/system+Laravel/CI2+DB+security; KOSIPA/records for proof | approve ownership/key/state/idempotency/snapshot/error contract for T01; actual XC-01..10 / INT-01..04 cover every path with source-equivalent MariaDB, rollback and mobile regression; correct public print/no bypass; actor sign-off | T01: approved prevention/UoW/receipt/snapshot contract, **not completed runtime tests**. INT: approved mechanism/scope+actual handlers. ACT: actual all-writer runtime proof and system-owner approval mandatory |
| P0-06 D-RBAC/NOTIFY | NEEDS BUSINESS APPROVAL EX | VF active identity/menu read upper bound and required db_notifikasi columns; not issue/revoke/proof authority.09/12/14 | B-13/14,O-08 actions, scope, recipient/fallback and actual config | explicit action matrix under identity/menu upper bound, controlled server recipient map; DB notif atomic/email postcommit | view/admin blanket grant or copied9/5 widens authority; optional email/dual control needs explicit owner choice | KOSIPA+security+notification operator | signed role/action/revocation/proof-access/recipient/fallback/audit contracts and synthetic personas; dated actual menu/config refs private; negative/runtime delivery tests before activation | T01: signed role/routing descriptors+failclosed contracts, no real IDs/secrets. INT: approved config/fixtures and auth integration. ACT: active authority/routing and delivery evidence |

### P0-01 — Database, privileges, topology and capacity

| Field | Current assessment |
|---|---|
| Current finding |09A local219-column mapping is historical LOCAL_STAGING, not production proof. Current reader connect fails P1001; no metadata refreshed22 Oktober. New writer/grants absent as inspected feature design. |
| Available evidence | C0-DB1/ENV1,09/09A; C05-DB1 unavailable; C05-CFG1 existing guards/pool ceilings. |
| Missing evidence | production columns/index/charset/engines/defaults+fully visible trigger/routine effects; sanitized effective actual/planned grant boundaries, target-version lock privilege requirements, deployment/account/PHP capacity+transport. |
| Recommended resolution / choices | operator metadata intake14 DB-01..04; review semantic deltas and restricted grant design. Alternative source-equivalent sanitized staging can support explicitly scoped development, but **does not close production part of P0-01**. No root/legacy credential fallback. |
| Decision owner | DB operator+hosting/infra; engineering reviews mapping; data/security owner approve privilege design. |
| Acceptance criteria | dated environment-attested bounded metadata complete; visibility proven; transitive effects transactional or incompatible cases blocked; ownership/account/transport/capacity fit documented; planned restricted privileges approved. Actual grants/lock/fault tests remain future staging/activation acceptance, no grant change now. |
| Dependencies / risk | DB-02 visibility+DB-04 hosting evidence; R10/11/12/14/17. |
| Status | **BLOCKED**, no parent closure; schema-local investigation fact retained VERIFIED historical only. |

### P0-02 — Canonical processing and alternate paths

| Field | Current assessment |
|---|---|
| Current finding | L1/L4 stored source hashes unchanged. Routing+historical local menu support L1; actual production use/access and all alternate process/delete paths not confirmed. |
| Available evidence | B1/B2/L1/L4,C0-AUTH1,C05-SRC1/ORDER1; L1 master→member→header ordering observed. |
| Missing evidence | dated production active menu/permission routes and operator walkthrough; direct L4/delete/manual-config availability and actual canonical owner. |
| Recommended resolution / choices | O-02 confirms both variants without live mutation. Prefer L1 if operator corroborates; if L4/mixed use is active, targeted delta compatibility review, not obsolete declaration or unilateral route shutdown. |
| Decision owner | KOSIPA processing owner + CI2 operational maintainer. |
| Acceptance criteria | canonical route/actions/process owner explicitly attested, other active routes classified with protected-scope ownership; readonly walkthrough/config ref dated; no production approve/reject used as test. |
| Dependencies / risk | informs period/print/authority/prevention P0-03/05/06; R02/03/09/15. |
| Status | **BLOCKED**; preferred integration fact/recommendation only. |

### P0-03 — Signed business/payroll/security policy

| Field | Current assessment |
|---|---|
| Current finding | no approved nominal/eligibility/cutoff/duplicate/form/TTL/retention pack. Existing-master approval changes amount without rewriting period; next-month form is not effective payroll proof. |
| Available evidence |10/11,M3/B2/B3/L1; C05-ORDER1; values in10/11 are proposals. U-01 does not approve duplicate key or cutoff. |
| Missing evidence | B-01..08/10 exact values/rules/version, O-03 effective payroll source confirmation, approver records and before/at/after boundary examples. |
| Recommended resolution / choices | answer business table15 with owner endorsement. Choices/trade-offs for each amount/cap/change/zero/status/group/key/cutoff/48vs24h/retention/assurance are explicit there. No permissive unspecified maximum, invented cutoff or imported WAJIB rule. |
| Decision owner | savings/payroll+membership; security endorses assurance/TTL, records owner retention; sponsor identifies actual role holders. |
| Acceptance criteria | all mandatory policies signed with exact fixtures and effective versions, actual legacy effective-period behavior reconciled; unresolved mandatory fields failclosed. Rules do not depend on unimplemented control claimed as existing. |
| Dependencies / risk | P0-02/O-03 production workflow; B-05 key constrains P0-05 mechanism; R01/03/04/07/20. |
| Status | **NEEDS BUSINESS APPROVAL**; D-PERIOD still BLOCKED. None of these business choices made by agent. |

### P0-04 — Contact trust, OTP assurance and provider readiness

| Field | Current assessment |
|---|---|
| Current finding | source phone flag/lifecycle insufficient current verified contact evidence; active provider cannot be inferred from2factor label. No provider calls/current values examined. |
| Available evidence |11,C0-OTP1/2/3; source hashes refreshed C05-SRC1;09A historical users lacks verification timestamp. |
| Missing evidence | B-09/10 current contact workflow/ref/currentness/verifier, actual provider/sender/template/channel/limits/timeout/secret owner, approved future sandbox recipient and assurance sign-off. |
| Recommended resolution / choices | owner-verified master contact+attributable evidence; no arbitrary public recipient; direct approved provider adapter future. Alternative enrolled independent factor/assisted process requires explicit reviewed authorization contract; no bearer-only downgrade. |
| Decision owner | membership+security; provider/infra operator confirms capability and custody. |
| Acceptance criteria | trusted contact source+freshness/change/reissue contract approved; proof scope explicit; provider capability/quotas/timeout/delivery semantics evidenced and sandbox plan approved. Actual delivery/abuse/failure tests deferred to authorised staging and required before activation. |
| Dependencies / risk | P0-03 limits/assurance and infra custody/capacity; R06/07/08. |
| Status | **BLOCKED**; rejection of unsafe legacy OTP reuse is technical conclusion, not provider readiness. |

### P0-05 — Prevention, ownership, atomic submission, signature/PDF and numbering

| Field | Current assessment |
|---|---|
| Current finding | U-01 requires tested prevention and postpones activation. Current source permits unguarded body/status operations; late CI2 header rejection may leave earlier config writes. Private snapshot alone does not fix CI2 print. No deployed/prototyped all-writer mechanism evidenced. |
| Available evidence |08–11,C05-MUT1/ORDER1/PDF1/NUM1;14A isolated model88 unguarded/12 atomic-reference schedules, not runtime proof; user decision U-01. |
| Missing evidence | B-05/11/12 approved key/ownership/print semantics; P0-01 account/trigger metadata; O-05/06 feasible enforcement covering every writer before effects and whole-command consistency; source-equivalent runtime XC-01..10 results. |
| Recommended resolution / choices |16 compares shared command coordination vs proven DB/control boundary; **current choice hold activation**, isolated analysis only until scoped start gate. Operational exception is not acceptable. If required compatible enforcement needs PHP/DB change, produce separate reviewed scope; do not implement under CP0.5. |
| Decision owner | security+data/system owners+Laravel/CI2 maintainers+DB; savings owner duplicate policy; KOSIPA/records owner proof content/printing. User U-01 direction already approved. |
| Acceptance criteria | signed writer/key/actor/state/immutable snapshot+atomic UoW/proof/numbering contract; selected compatible enforcement independently reviewed and demonstrated via **actual** XC-01..10 on authorised source-equivalent staging, including all entrypoints, rollback before/after each config write, mobile regressions. No partial header-only prevention or model-only proof. Gate17 distinguishes contract-start approval from completed operational test gate. |
| Dependencies / risk | P0-01/02/03/04; R01/02/05/09/12/16/17/18. |
| Status | **BLOCKED** parent; **U-01 direction closed** only. Mechanism correctness/implementation and system/security approval outstanding. |

### P0-06 — Operator capabilities and notification routing

| Field | Current assessment |
|---|---|
| Current finding | active identity+legacy menu upper bound exists for reads; cannot infer generate/revoke/proof/process authority. Required notif fields known, recipient roles not approved. |
| Available evidence | N2/N4/N6,C0-AUTH1,C05-CFG1;09A required db_notifikasi columns; legacy hardcoded routing is historical behavior only. |
| Missing evidence | B-13/14 staff action and recipient/fallback/alert policy, O-08 current config attestation and controlled reference; synthetic safe personas. |
| Recommended resolution / choices | explicit action grants+existing upper bound; server recipient config; DB notif in same UoW, email postcommit. Decide dual control/creator revoke/email mandatory vs optional with trade-offs15; no admin/view blanket grant or copied9/5. |
| Decision owner | KOSIPA process owner+security+notification operator. |
| Acceptance criteria | signed action/scope/revocation/proof-access matrix, actual identity/menu confirmation, configured required recipient mapping+complete field defaults/fallback+audit ownership; synthetic positive/negative tests designed (runtime execution later) with real IDs/contact kept private. |
| Dependencies / risk | P0-02 menu/canonical, P0-04 verifier roles, P0-05 protected proof/handoff; R13/19. |
| Status | **NEEDS BUSINESS APPROVAL** plus **BLOCKED** operational confirmation; no parent closure. |

## 6. Explicit security/transaction/artifact decision status

| Topic | Explicit technical recommendation | Approval / proof state |
|---|---|---|
| Token |256bit opaque/digest, fragment, memberPK+exact NIK+purpose, terminal lifecycle/receipt11 | recommendation explicit; B-07/security limits pending, not implemented |
| OTP/contact binding | current approved evidence+contact MAC/version; per-link secure challenge/proof; contact OTP separate from final consent | B-09/10/O-04 pending; boolean flag not accepted by default; no provider dispatch |
| Atomic submission | one connection request+mandatory notif+audit/outbox+snapshot binding+conditional consume; private PNG stage before, PDF/mail after | source-schema/grants and future actual failure/race proof pending; no claim storage/provider atomic with DB |
| Immutable signature | mandatory private per-submission PNG+hash+encrypted snapshot; no profile overwrite | technical recommendation explicit, B-12 content/access/retention ownership pending |
| PDF compatibility | snapshot-based public authorization PDF and approved enforced proof/print routing; unchanged CI2 profile PDF not compatible by itself | B-12/O-06 pending and XC-07 NOT RUN; no artifact omission |
| Cross-channel prevention | user-selected mandatory prevention covering submit/edit/cancel/approve/reject/data integrity16 | **U-01 approved direction**, control implementation/proof/system endorsement BLOCKED; no operational exception |

**Exact closure count:0 of6 parent P0 closed.** Technical investigation questions may close as scoped facts14; user prevention-direction decision U-01 is closed. Business questions15 and operational/infra evidence intake14 remain required. Final CP1-T01 and operational Go/No-Go: [17](17_CP1_T01_READINESS_CHECKLIST.md).

## 7. Controlled engineering preparation —22 Oktober2026

**U-02 APPROVED scope:** user explicitly authorised Track A consolidated decision closure package and Track B isolated frontend/mock engineering, component/a11y/responsive checks; no official CP1-T01 transition, production route, submission service, real OTP issuance, DB/legacy/payroll change or Git publication. [18](18_DECISION_CLOSURE_AND_PROTOTYPE.md) is the concise owner action sheet, with concrete P0-03 recommendations and actual Laravel/CI2/MariaDB evidence protocol INT-01..04. [19](19_PROTOTYPE_VERIFICATION.md) reports prototype validation. No new business/security/operational sign-off or evidence has arrived, so **P0-01..06 remain open; U-01 is not re-requested**. Prototype progress clears only G0.5 scope17, never production compatibility/control proof.

## Business Policy KKISI-PSS-2026-V1 v1.0.0 (24 Oktober 2026)

B-01..B-14 are **BUSINESS_APPROVED** by the session user acting as Authorized Project & Business Owner (self-declared; no external attestation), recorded in 15 §5 with the evidence reference. Earlier PROVISIONAL rows above remain as history. Effect on the parent P0 items: the **business-decision portions** of P0-03 (B-01..08), P0-04 (B-09/10), P0-05 (B-05/11/12) and P0-06 (B-13/14) are closed; every parent P0 stays open for its **technical evidence** (P0-01 metadata/grants/capacity, P0-02 canonical route, O-03 payroll semantics, O-04 provider, O-05/O-06 all-writer control and print path with XC-01..10 runtime proof, O-07 storage/keys, O-08 role/recipient configuration). U-01 is unchanged: no operational activation without proven cross-channel prevention. Business approval is not provider, database, legacy or production evidence.


##29 October2026 closure outcome

- P0-01: local database/client/DDL/grants/transactions verified. Actual production schema/grants/topology/capacity remain unverified; parent operational gate PARTIAL.
- P0-02: explicit mapping plus local CI2-owned command fixture; actual canonical controller/session/print path unavailable; PARTIAL.
- P0-03: Business Policy v1.0.0 remains APPROVED, with exact monetary rules and positive payroll-calendar/reference evidence in local staging. Actual payroll/source semantics and calendar ingestion remain external; no payroll-posting claim.
- P0-04: approved contact/OTP lifecycle implemented/tested with capture-only destinations. Actual provider/sender/template and live contact provenance remain external. No approval re-request.
- P0-05: mandatory prevention decision remains APPROVED. Enrolled local public/mobile/CI2 boundary tested; immutable PDF ready before processing. Actual unmodified PHP writers and private legacy print are not attested: O-05/O-06 PARTIAL.
- P0-06: local key/DB role isolation, atomic jobs and private evidence verified. Actual console role/branch/recipient configuration and operator identity binding remain external; PARTIAL.

No parent operational P0 is prematurely marked fully resolved. This does not block the already-authorized local engineering, which is implemented and tested. No additional business-policy decision is required to continue the unavailable-runtime integration once source/configuration is supplied.
