# 08 — Authorization, security and audit design

Status: current state = E1; everything else **PROPOSED**.

## 1. Current authorization (E1)

| Aspect | Legacy KOSIPA | Next.js console today |
|---|---|---|
| Identity | `ref_users` (md5(md5)), own login | `db_users` (bcrypt) session in `kkisi_auth`, re-validated per request (`validateSession`) |
| Link to KOSIPA | — | `console_identity_link` (active/revoked, admin `iam.link.manage` = `users_edit` + branch chooser) |
| Grant model | `ref_group` → `ref_menu_akses` → controller URL; per controller, every method (`ANO-K02`); also rows of a "public" user id (private `ANO-K49`) | `kosipaCapabilitiesFromMenus`: legacy menu URLs → **view** capabilities only (`kosipa.member/savings/loan/payroll/store-credit.view`); export = flag + operator allow-list (OD-5) |
| Write capabilities | implicit in page access | **none exist** (`capabilities.ts`: "No write capability exists yet") |
| Scope | cooperative-wide; `id_ref_site` unused | cooperative-wide for KOSIPA (UCKW:BR002); TOKO uses branch |
| CSRF | POST only (CI `csrf_protection`) | Origin check on every state change (`infrastructure/auth/origin.ts`) |

## 2. Principles

1. Server-side only: every command checks capability, ownership state and document state in the use case; hiding a button is presentation, not control.
2. **Identity link ≠ write right.** A link proves who the person is in KOSIPA; it yields view capabilities from legacy menus (existing) and nothing else. Write capabilities require an explicit console grant (§3).
3. Least privilege per action, maker-checker on money-moving and status-finalising actions, reason on reject/reverse/override.
4. Same rules for UI and API; bulk = N single authorised commands.
5. No legacy credential, session or md5 hash is accepted.

## 3. Capability vocabulary and grant source

New capabilities (PROPOSED; extend `KOSIPA_CAPABILITIES` in `packages/domain/src/console/capabilities.ts`):

| Capability | Actions | Requires also |
|---|---|---|
| `kosipa.master.manage` | create/update/deactivate KOSIPA reference data | `kosipa.member.view` |
| `kosipa.member.create` | register, import (stage/apply) | `kosipa.member.view` |
| `kosipa.member.update` | profile/employment/bank fields, salary | `kosipa.member.view` |
| `kosipa.member.status` | change status, deactivate (+ token revoke, limit zero) | `kosipa.member.view` |
| `kosipa.member.limits` | set/import credit limits | `kosipa.member.view` |
| `kosipa.member.pii` | unmask phone/address/bank/salary (existing SEC-006 intent) | `kosipa.member.view` |
| `kosipa.deduction.manage` | payroll deduction configuration | `kosipa.savings.view` |
| `kosipa.request.decide` | approve/reject mobile and public-link requests | view of the target area |
| `kosipa.savings.prepare` | create/edit/submit/cancel savings, deposit, withdrawal, opening-balance documents | `kosipa.savings.view` |
| `kosipa.savings.approve` | approve/reject them | `kosipa.savings.view`; maker ≠ checker |
| `kosipa.savings.reverse` | reversal documents | approve + reason |
| `kosipa.loan.prepare` | apply, edit OPEN, documents, rollover links, cancel own OPEN | `kosipa.loan.view` |
| `kosipa.loan.approve` | approve/reject | maker ≠ checker |
| `kosipa.loan.disburse` | disburse (fees, netting, schedule) | approve ≠ disburse actor when FD-17 requires 3 eyes |
| `kosipa.loan.settle` | early settlement / over-kredit preparation | `kosipa.loan.view` |
| `kosipa.loan.reverse` | void/reverse loans and settlements | reason; maker ≠ checker |
| `kosipa.payroll.prepare` | create, generate, adjust, import | `kosipa.payroll.view` |
| `kosipa.payroll.approve` | approve batch (settlement) | maker ≠ checker |
| `kosipa.exit.prepare` / `kosipa.exit.approve` | member exit | maker ≠ checker |
| `kosipa.shu.prepare` / `kosipa.shu.approve` | SHU | maker ≠ checker |
| `kosipa.report.export` | existing | view of report area |
| `kosipa.config.manage` | business settings, product rules (ratio, withdrawal policy, settlement formula) | 2-person change (FD-16) |

Grant source (**FD-16**): (a) derive from legacy menus — **rejected for writes** (per controller, includes delete/approve, `ANO-K02`); (b) **recommended**: `console_kosipa_grant (console_user_id, capability, granted_by, granted_at, revoked_by, revoked_at, reason)` in the console store, managed in `/console/settings/akses-kosipa` by `iam.kosipa.grant` holders, with the rule that a grant to oneself is refused and every grant/revoke is audited; production rows initially by reviewed SQL; (c) interim: deployment allow-list per capability (same mechanism as OD-5 export), acceptable for DEV LOCAL/staging only.

Suggested role bundles for owner mapping (not policy until approved): **Operator** (prepare capabilities), **Supervisor** (approve capabilities), **Finance** (disburse, payroll approve, exit approve), **Admin** (master, config, grants), **Auditor** (views + export).

## 4. Authorization matrix (command × capability × extra rule)

| Command | Capability | State rule | Maker-checker | Reason | Confirmation UI |
|---|---|---|---|---|---|
| master.create/update | master.manage | — | no | no | standard |
| master.deactivate | master.manage | unreferenced for hard delete only | no | yes | shows reference count |
| member.register / importBatch.apply | member.create | canonical NIK unique | no | no | preview for import |
| member.updateProfile | member.update | member exists | no | no | diff view |
| member.changeStatus / deactivate | member.status | not already target | no (FD-17 may require) | yes | typed NIK |
| member.setLimits / importLimits | member.limits | member AKTIVE (except to 0) | no | yes (change note) | diff + preview |
| deduction.set | deduction.manage | member AKTIVE | no | no | standard |
| request.approve/reject | request.decide | request OPEN | requester is the member (n/a) | reject: yes | standard |
| savingsDoc.create/addLine/submit/cancel | savings.prepare | OPEN | — | cancel: yes | standard |
| savingsDoc.approve/reject | savings.approve | OPEN | **yes** | reject: yes | summary |
| withdrawal.approve | savings.approve | OPEN; balance re-check | **yes** | — | balance shown |
| savingsDoc.reverse | savings.reverse | APPROVED; not in an approved payroll period it affects | **yes** | **yes** | typed doc no |
| loan.apply/edit/linkRollover/attach | loan.prepare | OPEN | — | — | standard |
| loan.approve/reject | loan.approve | OPEN | **yes** | reject: yes | ratio result shown (D1) |
| loan.disburse | loan.disburse | APPROVED, not disbursed | **yes** | — | netting + fees summary |
| loan.settleEarly (prepare/approve) | loan.settle / loan.approve | disbursed, BELUM LUNAS | **yes** | yes | payoff breakdown |
| loan.cancel / reverse | loan.prepare (own OPEN) / loan.reverse | per 05 §4 | reverse: **yes** | yes | typed doc no |
| payroll.createBatch/generate/adjust/import | payroll.prepare | OPEN | — | adjust: yes | preview |
| payroll.approve | payroll.approve | OPEN; exceptions acknowledged | **yes** | — | exception list |
| exit.prepare / exit.approve | exit.prepare / exit.approve | member AKTIVE; no OPEN docs | **yes** | yes | full settlement statement |
| shu.* / shu.approve | shu.prepare / shu.approve | OPEN; Σ = pool | **yes** | — | allocation summary |
| kosipaGrant.set/revoke | iam.kosipa.grant | not self | **yes** (second admin confirms, FD-16) | yes | — |

Maker = the console user recorded as creator of the document in the ledger (not the legacy `cd_usr` string). For documents created by legacy before cutover, maker is unknown → approval in Next.js allowed only for documents created in Next.js, or with an explicit "legacy document" confirmation by a Supervisor (FD-17).

## 5. Scope rules

- **Branch:** none for KOSIPA (cooperative-wide, UCKW:BR002; `id_ref_site` unused in legacy). If FD-15 introduces site scope later, it is added to the capability resolver, not to handlers.
- **Cross-member access:** staff with view capability see all members; PII masked unless `kosipa.member.pii`; every unmask audited. Members themselves never use console commands (PWA is P3).
- **Forged parameters:** commands take identifiers only (doc no, member id); amounts that legacy took from the browser (balance, payoff, remaining principal, status) are computed server-side and any client value is ignored or compared and refused on mismatch.

## 6. Security test plan (PRD §8)

| Threat | Test | Expected |
|---|---|---|
| Unauthorized endpoint access | call each command without session / with view-only capability | 401 / 403, `denied` audit row, no DB change |
| Privilege escalation | user grants itself; prepare-only user calls approve | 403 |
| Cross-branch | n/a for KOSIPA (cooperative-wide) — test that TOKO branch switch does not change KOSIPA results | identical results |
| Cross-member | withdrawal for member A with line of member B; loan rollover linking another member's loan | 422 `MEMBER_MISMATCH` |
| Forged parameters | send `status`, `total_saldo`, `pelunasan_total`, `sisa_pinjaman` in body | ignored or 422; server values used |
| SQL injection | NIK/doc no/search with quotes, `%`, `\`, unicode; all repositories parameterised (`Prisma.sql`) | no error leakage, exact-match semantics |
| Duplicate submission | same idempotency key twice, double click, network retry | one effect, second response `replayed: true` |
| Concurrent approval | two checkers approve the same document simultaneously; legacy + Next.js race on staging (legacy menu disabled vs enabled) | exactly one transition; other gets 409 |
| Session expiration | expire session between form load and submit | 401; resubmit after login with same key → single effect |
| Sensitive disclosure | error bodies, logs, audit details, CSV | no NIK/name/phone/salary in logs/audit; masked by default in UI |
| CSRF | cross-origin POST, GET to any command URL | 403 / 405 |
| Identity link revoked mid-session | revoke link, then submit | 403 on next request |

## 7. Audit trail design

Two stores with different jobs:

| Store | Location | Written | Content | Integrity |
|---|---|---|---|---|
| **Command ledger** (financial audit of record) | business DB, `kosipa_command_ledger` (**FD-01**, additive DDL, PROPOSED) | inside the business transaction | `id`, `command`, `idempotency_key`, `request_hash`, `request_id`, `actor_console_user_id`, `actor_kosipa_user_id`, `subject_type`, `subject_ref` (doc no or member id — never NIK/name), `from_state`, `to_state`, `before_json`/`after_json` (allow-listed fields: amounts, statuses, dates, codes; PII fields recorded as `changed:true` only), `reason`, `maker_id`, `checker_id`, `outcome='committed'`, `created_at` (UTC, ms) | append-only by grant (writer accounts have INSERT/SELECT only on it); optional trigger guard is a later DDL decision |
| **Console audit** (access, denials, failures, exports, PII unmask, grants) | console store `console_audit_event` (exists, append-only triggers) | after the outcome is known | existing schema: actor, action, subject, outcome (`success/denied/failed`), request id, sanitised detail | exists |

Fallback if FD-01 is refused: ledger fields go to the console store after commit (non-atomic) + a nightly reconciliation that compares business rows changed by writer accounts (`ud_usr` marker) with ledger rows and alerts on gaps. Documented as weaker (crash window).

Required fields mapping to PRD §9: actor identity (console + KOSIPA ids), operation type (`command`), target entity (`subject_type/ref`), record ids (`subject_ref`, line ids in `after_json`), timestamp, authorized scope (capability used), previous/new state, change reason, approval metadata (maker/checker), correlation id (`request_id`), transaction outcome.

Retention and review: ledger kept for the legal retention period of financial records (owner to state, FD-18); monthly review of `denied`/`failed` and reversals by a named owner (extends E2).
