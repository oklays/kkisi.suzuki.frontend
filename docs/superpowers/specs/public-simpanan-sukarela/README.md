# Public Secure Link — Pengajuan Potongan Simpanan Sukarela

**Current execution —29 October2026:** Owner's MASTER EXECUTION PROMPT authorizes Policy v1.0.0 implementation, STG-01 local staging, additive migrations, integrations/tests and local feature-branch commits. Earlier CP0 permission/blocker paragraphs below are historical. Implemented local flow: operator issue → token → captured OTP → authoritative form → consent/signature/review → atomic OPEN request → immutable PDF and post-commit notifications. Start with [integration/manual-testing guide](../../../../integration/public-savings/README.md), [current task ledger](tasks.md), and [executed verification](verification.md). Actual PHP/runtime deployment compatibility remains explicitly unverified; no production activation/push/merge/deployment is authorized.


Audit baseline:20 Oktober 2026. **Checkpoint0 architecture/readiness update:21 Oktober 2026 (Asia/Jakarta)**. Status: **documentation complete; implementation NOT authorised**. Current recommendation: Next PUBLIC intake → unchanged CI2 approval initially; native approval only separate CP3. No full KOSIPA migration bundled.

**Latest CP0.5,22 Oktober2026:** user U-01 mandates preventive cross-channel protection before activation; manual-only exceptions removed from release options. **0/6 parent P0 closed; CP1-T01 NO-GO pending signed policies/contracts; operational activation NO-GO pending all-writer proof and owner approval.** Safe isolated analysis/model testing authorised; no CP1 code started. Current local reader unavailable/P1001;09A is historical local evidence. See13 §5 for full per-blocker matrix and17 for exact start gates.

**Controlled preparation, later22 Oktober:** U-02 explicitly authorises safe frontend/mock prototype, separate from official CP1-T01. [18 concise decision/evidence package](18_DECISION_CLOSURE_AND_PROTOTYPE.md) is the owner approval entry point; [19 test results](19_PROTOTYPE_VERIFICATION.md); [20 CP2 legacy integration, UAT and release plan](20_CP2_LEGACY_INTEGRATION_AND_RELEASE.md) and [prototype instructions](../../../../apps/web/src/prototypes/public-savings/README.md) describe isolated engineering. Preview is loopback-only, has no App Router route/API or real business service; parent P0 count and official/operational NO-GO remain unchanged.

**Latest CP0.6,23 Oktober:** full app and workspace TypeScript **PASS**, generated-cache blocker TSC-01 closed without source/config/index change;19 records root cause/recovery. [13 final P0 matrix](13_DECISION_AND_BLOCKER_REGISTER.md), [15 final owner answer sheet](15_CP05_DECISIONS_REQUIRED.md), [16 nine-concern safety contract](16_CROSS_CHANNEL_CONSISTENCY_STRATEGY.md), [17 minimal four-gate assessment](17_CP1_T01_READINESS_CHECKLIST.md) and [06 T01 execution package](06_IMPLEMENTATION_PLAN.md) updated in place. **Prototype GO within U-02; official T01 NO-GO for approvals, DB integration NO-GO for evidence/authority, activation NO-GO for real all-writer proof.** Parent P0 closure0/6; no official CP1 files created.

| CP0.5 deliverable | Review entry |
|---|---|
| A Updated P0 matrix | [13 findings/evidence/missing/resolution/options/owner/acceptance/status](13_DECISION_AND_BLOCKER_REGISTER.md) |
| B Technical verification | [14 source/connection/config verification](14_CP05_TECHNICAL_VERIFICATION.md), [14A executed isolated model](14A_CP05_CONCURRENCY_MODEL.md) |
| C Business/owner decisions | [15 explicit questions, choices/trade-offs and accepted U-01](15_CP05_DECISIONS_REQUIRED.md) |
| D Cross-channel consistency | [16 operation matrix, preventive alternatives and planned XC-01..10](16_CROSS_CHANNEL_CONSISTENCY_STRATEGY.md) |
| E Database/security readiness | [14 assessment and bounded operator evidence intake](14_CP05_TECHNICAL_VERIFICATION.md) |
| F CP1-T01 checklist / G Go-No-Go | [17 offline/staging/operational/native gates and exact closure ownership](17_CP1_T01_READINESS_CHECKLIST.md) |

13 is canonical approval/blocker register.14 adds scoped22 October evidence;15 records owner questions/approved direction;16 supersedes earlier manual-exception release alternatives;17 is current start/activation checklist. No numeric business/security default becomes approved through document precedence.

## Current decisions and readiness

**RECOMMENDED:** opaque256bit token/digest, member/exact-NIK binding, verified-contact OTP, new Next submission route without mobile API, existing business record and one InnoDB transaction for request+token+database-notif+audit/outbox. Default link48h/OTP5m are proposed policies needing approval. Signature and public authorization PDF are retained, privately snapshotted; compatibility with current CI2 profile-based PDF is an explicit gate.

**VERIFIED:** source still routes mobile notification to L1; local staging menu matches L1. Read-only live LOCAL metadata covers9 tables / 219 columns; reader has SELECT only. Active production canonical controller, production schema/grants/capacity, contact provenance and provider activation are not proven. L4 is not declared obsolete.

**Readiness independently:** CP1 BLOCKED; CP2 BLOCKED; CP3 BLOCKED. See12 §7 and13 for exact owners/actions. This does not require replacing legacy approval before developing a separately approved public intake; it prohibits calling unresolved policies ready.

## Review entry points

| Current deliverable | Content |
|---|---|
| [08 Architecture decision record](08_ARCHITECTURE_DECISION_RECORD.md) | complete writer/approval compatibility matrices, duplicate/mutation strategy and staged ownership |
| [09 Database readiness](09_DATABASE_READINESS.md) | local-vs-production evidence, transaction/grants/index/migration/recovery assessment |
| [09A Local metadata appendix](09A_LOCAL_SCHEMA_METADATA.md) | actual restricted metadata only,9 tables / 219 columns, no member rows/credentials |
| [10 Business/form contract](10_BUSINESS_RULES_AND_FORM_CONTRACT.md) | all form fields, proposed min/max/eligibility/cutoff/duplicate and mandatory signature/PDF |
| [11 Security policy](11_SECURITY_POLICY.md) |48h proposed token lifecycle, contact/provider findings, OTP recovery, threat model |
| [12 Implementation readiness](12_IMPLEMENTATION_READINESS.md) | endpoint contracts, exact phase file plan/dependencies/tests/flags, independent Go/No-Go |
| [13 Decision/blocker/risk register](13_DECISION_AND_BLOCKER_REGISTER.md) | status-controlled decisions, responsible owners, clearance actions and21 prioritised risks |
| [06 Controlled implementation plan](06_IMPLEMENTATION_PLAN.md) | CP1 public foundation, CP2 operator management, CP3 native migration; all app tasks unchecked |

Baseline evidence remains [01 mobile](01_AUDIT_EXISTING_MOBILE_FLOW.md), [02 legacy](02_AUDIT_LEGACY_KOSIPA_FLOW.md), [03 gaps](03_CROSS_SYSTEM_GAP_ANALYSIS.md), [04 token design](04_SECURITY_AND_TOKEN_DESIGN.md), [05 technical design](05_TECHNICAL_DESIGN.md), [07 acceptance](07_ACCEPTANCE_CRITERIA.md), [source register](evidence.md).04/05 updated for phase/default conflicts;08–13 authoritative for Checkpoint0 decisions. Existing numbered SQL in05 is conceptual, amended by09, not an executable migration.

Conventional spec entry points: [requirements](requirements.md), [design](design.md), [tasks](tasks.md), [verification](verification.md), [current state](current-state.md), [impact analysis](impact-analysis.md). Baseline requirement IDs retained, CP0 requirements added and mapped to controlled checkpoints.

## Evidence labels and limitations

- **VERIFIED:** observed in specified source or environment; local/schema snapshot proof is never relabelled production.
- **RECOMMENDED:** selected design, pending review; not deployed functionality.
- **NEEDS BUSINESS APPROVAL:** proposed business/security default, not an approved value.
- **BLOCKED:** mandatory evidence/policy/control absent, exact clearing action in13.
- **NOT APPLICABLE:** mobile login/GPS/IMEI dependencies do not belong to public feature.

Assumptions/risks are explicit in09–13. New tables/columns/endpoints/flags/capabilities named there are **PROPOSED**, not fabricated existing contracts. Source current approval may remain non-atomic; atomic public intake does not magically harden legacy approval or prevent all other-channel edits.

## Historical audit scope preserved

At CP0/CP0.5 only docs in this directory were created/updated. No application/mobile/legacy code, migration files, database DDL/DML, write-based tests, OTP/email/provider messages, commit/push/merge/deploy. CP0 used guarded SELECT-only **local staging** metadata and targeted remote source reads; no production DB query or member-row/contact-value extraction. Credentials loaded internally were not printed. Later U-02 Track B authorises isolated prototype presentation/tests only; see18/19, not an official CP1 start.

Historical CP0 scope preserved unrelated `.DS_Store`/`.kiro` edits. At CP0.5 start the workspace is now `master` HEAD `6a5d57b373e833b36b19a7af53a724d06cfb5f13`;22 spec documents and one separate PRD were **already staged by user before this task**. CP0.5 does not stage/unstage/commit them; edits remain working-tree changes and new CP0.5 docs untracked. No app/PHP/DB/provider/publication action performed. Future dependent implementation and operational activation follow17; CP1 does not start automatically.
