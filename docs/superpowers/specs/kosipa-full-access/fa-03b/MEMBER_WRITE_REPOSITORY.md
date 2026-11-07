# FA-03B T04 — native member write repository (register + profile)

Date: 2026-11-06. Scope: infrastructure behind `MemberRepository.create/update` (T03 core), proven on the **isolated synthetic stack only** (`kkisi-kosipa-fa01`, 127.0.0.1:3322). **No HTTP route, UI, status command, grantability, production writer or activation is part of this task**; a passing test here is synthetic evidence, not production readiness.

## Delivered

| Piece | Path |
|---|---|
| Repository (`create`, `update`, read `detail`) | `apps/web/src/infrastructure/repositories/kosipa-member-write.repository.ts` |
| Opaque version (HMAC-SHA256) | `apps/web/src/infrastructure/repositories/kosipa-member-version.ts` |
| Writer config guard (flag, DSN, ledger, version secret) | `apps/web/src/infrastructure/db/prisma-kosipa-member-write.ts`; shared `validateKosipaWriterConfig` in `prisma-kosipa-master-write.ts` |
| Ownership feature `member` (flag `KOSIPA_MEMBER_WRITES_ENABLED`; fence = `master/anggota_c`, `anggota/anggota_c`, `mobile/users_c`) | `apps/web/src/infrastructure/console/kosipa-ownership.ts` |
| Least-privilege grants (synthetic) | `apps/web/db/kosipa/006_member_writer_grants.sql.tpl`, `apps/web/scripts/setup-kosipa-member-write.mjs`, `local-stack.mjs member-writer` |
| Production grants, **review only, not executed** | `docs/migration/sql/kosipa-member-writer-production.sql` |
| Tests | `apps/web/tests/kosipa-member-write-db.test.mjs` (21), `kosipa-member-native-legacy-compat-db.test.mjs` (MC12, real legacy PHP) |

## Decisions

- **Locks / uniqueness.** `m_anggota` has no unique index on `nik_kar` or `no_anggota` (legacy). Registration therefore locks every `m_anggota (id, nik_kar, no_anggota)` row `FOR UPDATE` and judges NIK uniqueness in code with the T03 write key (numeric leading zeros stripped, ASCII case-folded, so legacy aliases such as `00123`/`123` collide). Active bagian/lokasi are read under `LOCK IN SHARE MODE`, so a concurrent master rename or deactivation waits. Order: fence → members → bagian → lokasi (→ users for updates).
- **Numbers.** `doc_no` = `REG`+`YYYYMM`+n through the native registry (scheme `member-registration`, rolled back with the transaction). `no_anggota` keeps the legacy shape `pad(count+1) + NIK` (`000n`/`00n`/`0n`, then NIK) and moves past an existing value rather than duplicating it. FD-23 stays pending: no format was invented.
- **Create columns.** Posted fields; `sim_pokok/wajib/sukarela` = `initialDeductions` (including `0`); `gaji` explicit (`0` when omitted); `gaji_minus`, `limit_toko_old`, `limit_toko`, `limit_persen`, `surat_kuasa` explicit `0`; `tgl_daftar` defaults to the Jakarta registration day; `cd` = Jakarta now. Strict SQL mode is never changed. One active `m_simpanan_aktif` row per strictly positive amount (`doc_no/cd/ud` NULL as legacy); no users row, token or savings posting.
- **`cd_usr` / `ud_usr`** hold the actor's KOSIPA display name (`ref_users.nama_lengkap`; fallback `console:<id>`), the legacy intent; the legacy session key it asked for never existed so it stored `'0'`. Authoritative identities are in the ledger row.
- **Version.** 64-hex HMAC-SHA256 (server secret `KOSIPA_MEMBER_VERSION_SECRET`, ≥ 32 chars) over the database text rendering of every `m_anggota` column except `password`, in a fixed order. Any committed change to the row — native or legacy, including `ud` — makes a held version `STALE`. `detail(id)` returns the stored fields and the version for the (later) edit form.
- **Repository → domain contract (T03 review addendum).** `MemberStoredFields` values are the database's own text (`CAST … AS CHAR`): dates `'YYYY-MM-DD'` strings, never `Date`; decimals strings; `NULL` stays `null`.
- **Profile update.** Locks the member by validated id; checks the version before planning; writes only changed allowlisted columns plus `ud/ud_usr`; mirrors the *changed* ktp/name/phone/email/street_address values to the users row found from the **locked** member's NIK (never a client key), after checking unique `email`, `nik` and `(ktp, phone)` under lock (`MEMBER_MIRROR_CONFLICT`). No users row → no mirror, no account. Bank/group/location/wallet, status, limits, deductions and `m_simpanan_aktif` are untouched; the bank-change reason lives only in the ledger `reason` column.
- **Ledger / result PII-free.** Ledger `after_json` = id, `doc_no`, changed field *names*, bank/salary flags. Result = `{id, version}`.
- **Command name.** The ledger DDL constrains `command` to `^[a-z][a-z0-9_.]{2,63}$`; T03's `member.updateProfile` would have failed every update with SQL 4025 on a real ledger (the T03 tests use a fake ledger). Renamed to `member.update_profile`; the audit action `kosipa.member.updateProfile` is unchanged.
- **Writer.** Own account `kosipa_member_w` (pool ≤ 2). Column-level: SELECT all `m_anggota` columns except `password`; INSERT the registration columns; UPDATE only profile/employment/bank/salary + `ud/ud_usr` (never identity, status, `sim_*`, limits, `gaji_minus`, credentials, `cd/cd_usr`); INSERT-only on `m_simpanan_aktif`; SELECT/UPDATE the five mirrored `users` columns; no DELETE or DDL anywhere; ledger database SELECT, INSERT. The config guard refuses production, any target but `3322/kkisi_kfa_synthetic`, root, a login shared with the master writer, and pools above 2.

## Evidence (6 Nov 2026, synthetic stack)

`KOSIPA_FA01=1 node --experimental-strip-types --test --test-concurrency=1` over the member write suite, MC12, foundation, masters, legacy-fence, document-number, production-SQL static, migrations-rollback and member-fixture suites: **59 tests, 59 pass**. Domain + application member unit tests 24 pass / 4 todo. HTTP regression 20 pass. Root typecheck clean; lint of changed files clean.

MC12 (real PHP 5.6 / CI2): legacy `master/anggota_c/ajax_edit/<id>` returns the natively registered and edited row (doc_no, no_anggota, sim_*, multi-line alamat, gaji) and `ajax_list` lists it. `simpanan/master_payroll_c` has no menu row in the synthetic stack, so its `ajax_edit_nik` join query was replayed verbatim against SQL instead of through PHP.

## Residual gaps (not claimed)

HTTP/UI for members; status/deactivate (WI-07 remainder), limits and imports (WI-08), deduction edits (WI-09); `KOSIPA_MEMBER_VERSION_SECRET` is not yet wired into `services.ts`; production writer enablement (guard extension + grant run + fence + ownership are separate, owner-approved cutover steps); FD-23 numbering deviations; `mobile/users_c`/TOKO competing writers beyond the fence; read-side version for pages.

---

# T05 — member status command, HTTP and console UI (6 Nov 2026)

Still **synthetic stack only**; no production writer, fence, grant or deployment. Flags stay off by default (`KOSIPA_MEMBER_WRITES_ENABLED`, `KOSIPA_WRITE_OWNERSHIP` containing `member`, `KOSIPA_MEMBER_VERSION_SECRET`).

| Piece | Path |
|---|---|
| Status domain (`parseMemberStatus`, `planMemberStatus`, `MEMBER_STATUSES`) | `packages/domain/src/kosipa/member-command.ts` |
| Application (`changeMemberStatus`, `getMemberForEdit`) | `packages/application/src/kosipa/commands/member.ts` |
| Repository `changeStatus`, `fenceState` | `apps/web/src/infrastructure/repositories/kosipa-member-write.repository.ts` |
| HTTP: `POST /api/kosipa/members`, `GET/PATCH /api/kosipa/members/[id]`, `POST /api/kosipa/members/[id]/status` | `kosipa-command-http.ts`, `src/app/api/kosipa/members/**` |
| UI: `/console/kosipa/anggota/baru`, `/console/kosipa/anggota/[id]/ubah`, links from list and profile | `src/app/console/kosipa/anggota/**`, `components/console/kosipa/Member*.tsx` |
| Tests | `kosipa-member-status.test.mjs` (domain), `kosipa-member-command.test.mjs` (application), `kosipa-member-http.test.mjs` (6), `kosipa-member-write-db.test.mjs` (24), `kosipa-member-browser.mjs` (E1–E8, Playwright) |

## Status semantics (REQ-110, FD-30, FD-31)

- **To any non-AKTIVE** (`LUAR BIASA`, `KONTRAK`, `RESIGN`, `PENSIUN`): in one transaction set `status_anggota`; `limit_toko`, `limit_ppob`, `gaji_minus` = 0 (other columns, `limit_persen`, `limit_toko_old`, `sim_*`, `gaji`, config rows untouched); for an **existing** users row (from the locked member's NIK) delete all and only its `oauth_access_tokens` by `user_id` and write the disabled mirror once: `is_active 0, is_delete 1, admin_verifikasi 0, temporary_token '', wallet_balance 0, wallet_balance_ppob 0` (no legacy recredit from `gaji_minus`). Non-AKTIVE → another non-AKTIVE repeats these safe effects; same status = `NO_CHANGE`.
- **To AKTIVE** (FD-30): `status_anggota` only. Ceilings stay 0; the mobile identity and tokens are not restored.
- One authorized operator, **mandatory reason** (ledger `reason` only; the console audit event carries no reason), optimistic version, idempotent. No automatic expiry job (FD-31).
- Writer grants extended by exactly: UPDATE `status_anggota, limit_toko, limit_ppob, gaji_minus` on `m_anggota`; SELECT/UPDATE the six disabled-mirror columns on `users`; SELECT(`id`,`user_id`) + DELETE on `oauth_access_tokens`. Updated in both the synthetic template and the review-only production SQL; the static test asserts nothing wider.

## Decisions taken by the implementer (owner review requested)

1. **Command name** `member.change_status` (ledger regex is lowercase), audit action `kosipa.member.changeStatus`.
2. **Grantable capabilities** now include `kosipa.member.create`, `kosipa.member.update`, `kosipa.member.status` (previously master-only). Still two-administrator grants; inert unless the feature flag, ownership, the legacy fence and a guarded writer are all present.
3. **View entitlement vs. fence.** Linked-mode member VIEW is derived from `ref_menu.status = 1` of `anggota/anggota_c` / `master/anggota_c`, which the cutover fence sets to 0, so fencing would have removed native member access from every linked user (found by the browser suite). When Next.js owns `member`, `PrismaKosipaDirectory` now lets those two controllers' **group access rows** keep granting view although their menu status is 0. All other menus, the active-group requirement and the default (flag off) behaviour are unchanged. Role-monitoring users were never affected (they ignore menus).
4. **PII-rich edit record.** `GET /api/kosipa/members/[id]` (bank, NPWP, salary…) needs the view capability **and** a member write capability; view alone is not enough. The record never contains credentials, photos, ceilings or deduction configuration.
5. **FD-08** (mobile wallet mirror/token revocation) is implemented per REQ-110 as recommended option (a); the decision remains open on the owner/smartkkisi side, so this stays behind the member ownership flag.

## Evidence

Synthetic stack, 6 Nov 2026: 172 pass, 0 fail, 3 skipped over the member write/HTTP/MC12/foundation/masters/fence/numbering/static-SQL/rollback/directory/console suites; domain + application unit 570 pass, 0 fail, 4 todo; typecheck clean; changed files lint clean. Browser E1–E8 pass (no-capability views, two-administrator grant, register incl. duplicate NIK and validation feedback, edit with bank reason, stale version after a legacy-style write, deactivate/reactivate with a seeded mobile account and tokens, legacy menu re-enabled, revocation, no console errors, 375/768/1440 without horizontal overflow); the existing master browser suite still passes.

## Residual gaps

Members list/detail pages do not yet show the new `doc_no`/`no_anggota` in search results; deduction edits (WI-09), limits and imports (WI-08), hard-delete refusal UI (REQ-111) and the member photo/QR flows are absent; production activation (guard extension, grants, fence, ownership, secret) and owner UAT remain separate gated steps.
