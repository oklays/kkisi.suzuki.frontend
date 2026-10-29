# 20 — CP2 real legacy integration, UAT and release preparation

**Date:** 29 October 2026 · **Branch:** `feat/public-simpanan-sukarela-e2e` · **Policy:** KKISI-PSS-2026-V1 v1.0.0 (unchanged, B-01..B-14 not reopened)
**Authority:** local engineering only. No production migration, deployment, push, merge, real delivery or operational financial data was used or authorized.

## 1. What "actual legacy" means in this checkpoint

| Item | Source | How obtained |
|---|---|---|
| CI2 KOSIPA source | `mobile/` and `simpanan/` `pengajuan_mobile_c`/`_m`, `simpanan_c`, `print_pengajuan_simpanan_pdf` (6 files, SHA-256 pinned in `legacy-runtime/runtime.mjs`) | Read-only copy from the deployed host, kept private under `.local/public-savings/legacy-source/` (never committed) |
| Laravel smartkkisi source | `SimpananController.php`, `routes/api/v1/api.php`, helpers | same |
| Runtime | CodeIgniter 2.1.4 on PHP 5.6.40 (`lsphp56`); Laravel v8.83.25 on PHP 8.1 (`lsphp81`) | read-only probe |
| Database | MariaDB 10.11.19-cll-lve, `sql_mode=NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION`, 0 triggers, legacy account with broad DML+DDL on the schema | `SHOW CREATE TABLE`/`SHOW GRANTS` in a `READ ONLY` transaction, **no row read** |
| Recovered DDL | 10 tables (`m_anggota`, `m_bagian`, `m_simpanan_mobile`, `m_simpanan_aktif`, `trans_simpanan_pengajuan`, `trans_simpanan_dtl`, `db_notifikasi`, `m_jenis_simpanan`, `ref_menu`, `users`) | hashed in `integration/public-savings/actual-schema-evidence.json` |

Execution targets (all loopback, sentinel-verified, synthetic rows only):
- **Actual-schema stage**: `mariadb:10.11.19` on `127.0.0.1:3321`, exact recovered DDL plus migration 001 (`integration/public-savings/actual-schema-stage.mjs`).
- **Real PHP**: the unmodified deployed CI2 controller/model methods run in `php:5.6.40-cli` on an internal Docker network, read-only mounts, no capabilities (`legacy-runtime/`). Only constructors/authentication are stubbed (`boundary/`).
- **Synthetic stage**: `mariadb:11.4` on `127.0.0.1:3318` (`staging.mjs`) for the Next.js service, browser and worker.

## 2. Findings from the real legacy runtime

| # | Finding | Consequence | Resolution in this checkpoint |
|---|---|---|---|
| F1 | Deployed `trans_simpanan_pengajuan` has **no UNIQUE(doc_no)**; `m_anggota.nik_kar` and `m_simpanan_aktif(nik_kar,jenis_simpanan)` are not unique either | A reused reference aliases two requests; the earlier local schema hid this | `pss_header_insert` refuses `DUPLICATE_HEADER_REFERENCE`; preflight refuses existing duplicates. Verified on the recovered DDL (`duplicateHeaderGuardVerified: true`) |
| F2 | The earlier migration 001 refused **every** header insert/update not made by a PSS command | Installing it would have broken the unmodified Laravel mobile create/edit/"delete" and CI2 approval of all ordinary requests | Triggers redesigned: only PUBLIC references are command-only; ordinary rows keep legacy behaviour |
| F3 | CI2 `ajax_proses` writes `m_simpanan_aktif` → `m_anggota.sim_sukarela` → header, each autocommit | Unmodified CI2 approving a PUBLIC request would commit both financial writes before any header guard fires | New `pss_master_insert`/`pss_master_update` refuse binding configuration to an unprocessed PUBLIC reference — the **first** effect. Proven with real PHP: header OPEN, deduction and master unchanged, `CONTROLLED_LEGACY_COMMAND_REQUIRED` |
| F4 | CI2 `print_pengajuan_pdf` renders the member's **current profile signature** (`m_anggota.foto_ttd`), not the submitted one | Unchanged CI2 print is not valid proof for a PUBLIC request (B-12) | Hook `printProof` serves the frozen, hash-verified PDF; READY is enforced by `pss_legacy_transition` (`PROOF_NOT_READY`) |
| F5 | Both `mobile/` and `simpanan/` controller variants are deployed and functional; only `mobile/` emits the print link | Both are processing entry points (O-02 L1/L4) | Both variants exercised in every runtime case |
| F6 | Laravel create also inserts `db_notifikasi` and emails CS with a CI2 deep link; public intake does neither | PUBLIC requests are visible in the CI2 list but **not** in the KOSIPA notification bell | Open gap: staff are notified via the PSS outbox recipients (O-08); bell parity needs an approved decision |
| F7 | Eligibility treats any non-REJECTED/CANCELLED SUKARELA header (including APPROVED) as conflicting, and approval keeps the reservation (B-05: blocking until POSTED_CONFIRMED) | With no trusted posting-confirmation source (O-03), a member with **any** historical approved request cannot use a public link, and an **enrolled** member's next mobile request after approval is refused | Rule kept as approved. Pilot blocker: needs the O-03 posting-confirmation release before enrolling members (see §7) |

## 3. Migration 001 boundary (current)

Identical in `schema.sql` and `migrations/001_public_savings.sql` (drift test `integration/public-savings/migration-drift.test.mjs`).

| Write | PUBLIC reference (`pss_application` row) | Ordinary legacy row |
|---|---|---|
| Header INSERT | only from public intake with matching reservation/NIK/OPEN/SUKARELA/`is_mobile=0`; `PSS…00000` pattern reserved | allowed; for an **enrolled** member and SIMPANAN SUKARELA it takes the shared B-05 reservation or fails `PENDING_CONFLICT`; audited `LEGACY_RESERVED` |
| Header UPDATE | only inside `pss_legacy_transition` / mobile commands | allowed; reserved row's identity (doc_no/NIK/type) immutable; REJECTED/CANCELLED releases (`LEGACY_RELEASED`) |
| Header DELETE | refused | allowed; releases its reservation |
| `m_simpanan_aktif` INSERT/UPDATE binding the reference | only inside the controlled command (guard is now taken **before** the first master write) | allowed; edits after a controlled approval remain possible |
| Duplicate `doc_no` | refused | refused |

Members without a `pss_member_control` row are untouched by reservation logic, so enrollment is the pilot scoping lever. All audit rows now carry `actor_ref` (and `reason` for staff revocation).

## 4. O-02 / O-05 / O-06 status

None is closed. Each is narrowed to named external steps, with executable evidence for everything that could be run here.

| Item | Executable evidence now | Status | Remaining to close |
|---|---|---|---|
| **O-02** schema / mapping / canonical route | Recovered production DDL applied verbatim; legacy DDL signatures unchanged by migration; preflight; real CI2 `ajax_list` (both variants) shows the PUBLIC reference with source-specific actions; field mapping round-trips | **PARTIAL (technical part verified)** | Dated KOSIPA operator confirmation of L1/L4 usage and processing owner; authoritative sources to populate `pss_member_evidence` (branch, roster, contact provenance) and `pss_calendar` — today these are synthetic |
| **O-05** all-writer prevention, ownership, concurrency, no duplicate financial write | Real PHP 5.6 CI2 against recovered DDL + migration as a broad-DML principal: PUBLIC approval refused before any effect (2 cases), ordinary approve/reject unchanged (4 cases), hook path approves through the command; races on recovered DDL: mobile/mobile and public/mobile each exactly one winner; 15 SQL control tests incl. Laravel column-set replay; 43 integration tests incl. 20-request two-process idempotency | **PARTIAL (mechanism verified)** | Approved PHP change scope to install the CI2 entry hook (`PublicSavingsLegacyHook::process`) with a session-bound actor; Laravel controller executed for real (only its SQL was replayed); Laravel mapping of `PENDING_CONFLICT`/`DUPLICATE_HEADER_REFERENCE` to a user message (today a 500); production grant split (F1 account has DDL) |
| **O-06** print hooks and snapshot PDF | Real CI2 print shows the mutable-signature defect (F4); `hook.test.php` on PHP 5.6.40 (frozen PDF, hash mismatch refused, disabled/forbidden fail closed); READY gate proven with real PHP (`guarded-proof-missing`); byte-identical historical reprint after a controlled approval (integration) | **PARTIAL (mechanism verified)** | Wire `printProof` into the CI2 print route and implement its authenticated internal proof resolver (CI2 → private PDF); owner sign-off of the PDF template |

## 5. Operational hardening delivered

| Area | State | Evidence |
|---|---|---|
| Console authentication & RBAC | Real console session + CSRF + server capabilities; explicit 0600 owner-only policy file mapping roles→PSS roles, company→branch; unknown/missing mapping fails closed; `APPROVE_DEDUCTION` stays CI2-only | `public-savings-operator-authorization/-http` tests (synthetic session store) |
| Operator branch scoping | Service now scopes member search, link list, issuance, revocation, application list and operator PDF to the actor's branch from **persisted** member evidence | integration test "console operator scope…" |
| Console page | `/console/kosipa/simpanan-sukarela`, in KOSIPA navigation; shows "belum diaktifkan" unless `PSS_OPERATOR_AUTH=CONSOLE` | console-shell, persona-matrix tests |
| Console CSRF fix | Member lookup is a GET bound to `ISSUE_LINK`, which requires CSRF; client now sends same-origin Referer + JSON type in console mode (previously always 403) | ui test |
| OTP / notification adapters | SMTP (Nodemailer, verified TLS, bounded timeouts, stable Message-ID, no retries inside the adapter) and HTTPS gateway adapter (fixed endpoint, no redirects, idempotency header) | provider tests incl. real SMTP wire to loopback capture. **Not wired**: runtime still uses local capture by design |
| Signature/PDF storage | Encrypted local immutable artifacts, READY hash-bound | integration; production object store/key custody open |
| Audit | `actor_ref`, `reason`; legacy reservation/release audited by trigger; procedure audits carry the CI2 actor | controls tests |
| Error recovery & monitoring | Outbox with backoff, attempts cap, dead letters; worker reconciliation counts | `pnpm pss:worker --once` |
| Token expiry/revocation | 48 h links, revoke, supersede on reissue, proof expiry, OTP lockout/resend caps | integration |
| Backup & recovery | Encrypted SQL+artifact+key backup restored into a sibling DB | `PSS_RECOVERY_TEST=1` pass on the new schema |

## 6. UAT — executed scenarios and actual results (29 Oct 2026)

All on loopback synthetic data. "Real PHP" = deployed CI2 source on PHP 5.6.40 against recovered production DDL.

| # | Scenario | Executed by | Result |
|---|---|---|---|
| U1 | Public member page, invalid/revoked/consumed links | `pnpm pss:test:browser` (Chromium, 5 widths) | PASS |
| U2 | OTP request/verify, lockout, resend caps | browser + integration | PASS (local capture provider, not real delivery) |
| U3 | Submission: validation, drawn signature, stale-review recovery, lost-response exact retry, receipt | browser + integration | PASS |
| U4 | KOSIPA visibility of a PUBLIC request | Real PHP `ajax_list`, both variants | PASS (list); notification bell parity FAIL by design (F6) |
| U5 | Approval/rejection lifecycle | Real PHP + hook → `pss_legacy_transition`; maker≠checker; proof missing; late failure | PASS (approve, reject, proof-missing refused, late failure rolls back all effects) |
| U6 | Unmodified CI2 on a PUBLIC request | Real PHP, migration installed, broad principal | PASS — refused before any financial effect |
| U7 | Existing legacy workflow regression | Real PHP approve/reject ordinary requests, both variants; other savings types; unenrolled members; Laravel column-set insert | PASS (Laravel PHP not executed) |
| U8 | PDF generation and reprint | integration (byte-identical reprint), browser download, hook PHP test | PASS; unchanged CI2 print FAIL as expected (F4) |
| U9 | Duplicate, concurrency, rollback | recovered-DDL races, duplicate header, idempotency replay/conflict, two-process race, migration interrupted-apply rerun, backup restore | PASS |
| U10 | Console operator access | HTTP/unit with synthetic session store | PASS; live console UAT against the real auth DB **NOT RUN** |

## 7. Tests, skips and regressions

| Suite | Result |
|---|---|
| `pnpm test` (domain 293, application 161, web 521) | 869 pass, 0 fail, 106 skipped |
| `pnpm typecheck`, `pnpm lint`, `pnpm build` | pass (lint: 4 pre-existing POS warnings) |
| `pnpm pss:test:integration` | 43/43 |
| Real PHP runtime, recovered DDL | 21/21 · synthetic schema 14 pass + 7 intentionally skipped (need recovered DDL) |
| Actual-schema stage verify, gated recovery + actual-schema tests | pass |
| Browser UAT, worker once, migration rehearsal | pass |

All 106 web skips are individually classified in [skip-inventory.md](../../../../integration/public-savings/skip-inventory.md): 76 irrelevant to this feature (other subsystems' opt-in DB fixtures, still required for those subsystems), 30 environment-dependent and each **resolved by its own executed run**, 0 needing remediation. Regressions found and fixed in this checkpoint: navigation registry/persona matrix (new page), SMTP header-folding assertion, lockfile churn (restored; only nodemailer entries added).

## 8. Production-readiness assessment

**Not production-ready. Ready for owner-controlled staging UAT once §9 items 1–4 exist.** The DB boundary, intake, proof and recovery mechanics are verified against the real CI2 code and the recovered production schema. What is missing is not engineering inside this repo: approval to change legacy PHP, payroll-posting semantics, real providers, real custody, and named operators.

## 9. Exact remaining external prerequisites

1. **Approved legacy PHP scope** — install the CI2 entry hook in both `pengajuan_mobile_c::ajax_proses` variants and the print route; bind `authorize()` to the CI2 session user and branch; implement the internal proof resolver.
2. **O-03 posting confirmation** — a trusted source/command that moves APPROVED→POSTED_CONFIRMED and releases the reservation (F7). Without it, do not enroll members.
3. **Authoritative member evidence & calendar** — sources and job to populate `pss_member_evidence` (branch, payroll roster, verified contact) and `pss_calendar`.
4. **Production staging replica** — a restorable copy of the real DB on the same MariaDB version, plus a deployed Laravel/CI2 copy pointing at it, to run U4–U9 with real Laravel code.
5. **Database principals** — separate app / legacy / worker / migration accounts; the current legacy account also holds DDL and TRIGGER rights.
6. **Providers** — approved SMTP or SMS/WA gateway, sender identity, templates, credentials; then wire the adapter by configuration.
7. **Custody** — private object store, evidence/hash key escrow and rotation, backup custodian and a restore from that custodian.
8. **People** — KOSIPA owner confirmation (O-02), operator role/branch mapping file (O-08), recipients, alert owners, pilot sign-off; decision on notification-bell parity (F6).

## 10. Deployment, migration and rollback plan

**Migration strategy (additive, reversible by disabling, never by dropping):**
1. Take and verify a full backup (DB + artifacts + keys); restore it into a separate replica.
2. On the replica: `node integration/public-savings/preflight.mjs` (signatures, engines, duplicates must be empty) → apply 001 → `pnpm pss:migration:verify`-equivalent checks → re-run U4–U9.
3. Production window: preflight read-only → apply 001 statements in order with a recorded checksum in `pss_schema_migration`; on interruption, rerun the same version (idempotent `IF NOT EXISTS`/`CREATE OR REPLACE`). Legacy tables are never created, altered or rebuilt.
4. With **no** member enrolled, the only legacy-visible behaviour change is the duplicate-`doc_no` refusal — monitor Laravel errors for it.

**Feature flags (all default off / fail closed):** `PSS_INTAKE_ENABLED=0` stops issuance and submission and keeps receipts; `PSS_OPERATOR_AUTH=CONSOLE` plus `PSS_OPERATOR_POLICY_FILE` enables the console; the CI2 hook `enabled` config enables PUBLIC processing; enrollment (`pss_member_control` rows) scopes members; the provider is selected by configuration only after authorization.

**Deployment checklist:** prerequisites 1–8 signed · replica U4–U9 green · build artifact from the reviewed commit · secrets outside the repo (0600, owner-only) · flags off · migration applied with checksum · CI2 hook deployed disabled · smoke checks · enable console for pilot operators · enroll pilot members · enable intake.

**Rollback:** intake OFF → hook disabled (PUBLIC requests then stay unprocessable but intact) → keep all tables, triggers, applications and evidence → drain or dead-letter the outbox → reconcile. If the triggers themselves must be lifted, drop **only** the `pss_header_*`/`pss_master_*` triggers after confirming no OPEN PUBLIC request exists. Never delete applications or revert financial rows to "undo" a release. Uncertain commits are resolved by idempotency key.

**Monitoring/alerting:** worker counts (`consumedWithoutApplication`, `missingLegacyHeader`, `invalidReservation`, `incompleteProof`, `failedJobs`, `staleStaffReviews`, `deadLetters`) — alert on any non-zero integrity count and on dead letters; outbox age, OTP failure and lockout rates, `PENDING_CONFLICT`/`DUPLICATE_HEADER_REFERENCE`/`CONTROLLED_LEGACY_COMMAND_REQUIRED` SIGNAL rates from Laravel and CI2 logs, PDF READY latency, and backup success with periodic restore. Named owners and response targets must be agreed before the pilot.

**Pilot:** one branch, a small set of enrolled members, named operators; daily reconciliation; exit criteria are zero integrity alerts, every PUBLIC request processed only through the hook, reprints byte-identical, and members/staff confirming the flow. Widen per branch.

**Final acceptance criteria:** §9 closed with dated evidence; U1–U10 re-run on the production staging replica with real Laravel/CI2 and real providers; O-02/O-05/O-06 marked CLOSED with that evidence; backup restore from the custodian; pilot exit criteria met.
