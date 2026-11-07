# FA-03B membership legacy characterization contract

Date: 2026-11-06. Scope: T01, the MC01–MC11 CI2 membership slice of M-01. **Synthetic real-PHP characterization only; native member commands are not implemented or activated by this work.** Both `anggota/anggota_c` and `master/anggota_c` ran against PHP 5.6 / CodeIgniter 2.1.4 and the isolated FA-01 database. A passing defect assertion establishes the legacy defect, not native acceptance or production readiness.

## Executed case map

`apps/web/tests/kosipa-member-legacy-runtime.test.mjs` executes every row below for both controllers: 32 scenarios, including four status targets and two token-preservation guard scenarios per controller. All 32 passed. The fixture/guard suite adds four passing tests, including live additive idempotency and sentinel rejection.

| Case | Actual PHP/SQL evidence | Native requirement or remaining work |
|---|---|---|
| MC01 | Create with 100/200/300: one member, exactly three configs with the six fields below; no mobile user, member-keyed loan or savings posting; supplied paguyuban amounts add nothing. Server-generated REG/member number retained. | Resolve REQ-108 registration config input contract before implementing. No invented default amounts. |
| MC02 | Blank/zero/negative become 0/0/-1; no config rows. Blank gaji/gaji_minus and omitted surat_kuasa store zero under the explicit non-strict session. Unwritten password/photo remain NULL; limit_persen defaults to zero. Non-AKTIVE create retains posted limits. | Explicit server values and validated amount parsing under strict mode; a non-strict coercion is not a financial-policy default. |
| MC03 | Minimum-input create under STRICT_ALL_TABLES returns HTTP 500 / SQL 1364 for omitted surat_kuasa, with no member. Separate strict SQL probes establish missing gaji and gaji_minus defaults. Controllers always sanitize and supply the latter two. | Native strict mode stays enabled. Native server defaults have not been implemented or validated here. |
| MC04 | Distinct employment dates on create and edit both persist tgl_karyawan=tgl_masuk. Empty optional dates persist NULL. | Preserve independently supplied dates; copied dates are a legacy discrepancy, not an approved business rule. |
| MC05 | Member A's PK plus B's posted NIK changes A's member profile but B's users/config rows; A's users/config and B's member remain unchanged. | Derive side-table identity from the locked member, never from a second client key. |
| MC06 | Existing users starts with all five fields distinct from the submitted values; each of ktp/name/phone/email/street_address actually changes to its submitted value. Wallet=(gaji_minus,0) when positive, otherwise (limit_toko,limit_ppob). Existing users bank/group/location fields remain unchanged. | Preserve the verified normal subset subject to FD-24 authority; validate all target lengths/unique conflicts transactionally. No account is created. |
| MC07 | AKTIVE→each LUAR BIASA, KONTRAK, RESIGN, PENSIUN: member limits zero but positive gaji_minus survives; user is disabled/deleted/unverified, temporary token cleared, then wallet recredited from gaji_minus. Existing config remains unchanged. | REQ-110 zeroes all three member limits and writes the final user mirror once. No disabled-account wallet recredit. Config disable semantics remain explicit policy work. |
| MC08 | Two users, two tokens for A and unrelated B tokens including id=String(A.id): master deletes all A tokens by user_id, preserving B. anggota deletes the unrelated trap by token id and leaves A's two real tokens. | Delete all and only matching user_id tokens. Mobile/TOKO variants are source findings, not executed in T01. |
| MC09 | Non-AKTIVE edit with no users row succeeds, creates no users or linked token; legacy still preserves positive gaji_minus. | Native no-user transition and atomic ledger behavior remain unimplemented. |
| MC10 | Zero leaves positive configs unchanged while the member configured amount becomes zero. Positive edit changes all matching duplicates, preserving inactive status and stale stored name/group. | WI-09 must define zero/disable/reactivate behavior and uniqueness. Do not copy these defects silently. |
| MC11 | Member with owned synthetic loan, savings header/detail, payroll matrix, sales and orders is hard-deleted; configs set inactive; all histories, user flags/wallet and token remain unchanged. | REQ-111 prevents unsafe hard deletion; complete history and status effects must be implemented after removal-target decisions. |
| MC12 | **Native → legacy (T04).** Real legacy `master/anggota_c/ajax_edit` and `ajax_list` render a member registered and edited by the native commands (doc_no, no_anggota, sim_*, multi-line address, salary); the `master_payroll_c` config join returns the two config rows. | Synthetic only; see `MEMBER_WRITE_REPOSITORY.md`. |

## Precise recovered writes

Source references below are relative to `legacy/kosipa/application`; the ignored legacy source was read-only throughout execution. Controller line numbers describe the current local source, not a production source identity.

- `modules/anggota/controllers/anggota_c.php`: create 210–449, edit 451–804, delete 976–991. `modules/master/controllers/anggota_c.php`: create 172–411, edit 413–777, delete 930–943. Corresponding `models/anggota_m.php` save/update/delete operate independently, without an encompassing transaction.
- Create sets generated doc_no/no_anggota, posted NIK and profile/employment/bank fields, supplied dates, sim_pokok/sim_wajib/sim_sukarela, gaji/gaji_minus/limits and cd/cd_usr. id_card is blank in these tests, so no file or QR action runs. Create does not create/link a mobile account or post savings balances.
- **Field-class correction:** sim_pokok/sim_wajib/sim_sukarela are current/configured payroll deduction amounts, not cumulative savings balances. These create/edit cases demonstrate their coupling to m_simpanan_aktif.potongan_payroll. The coordinator's separate source audit also found mobile deduction approval copying potongan into both stores and payroll-detail save overwriting sim_* with detail amounts; savings balance comes from transaction sums. Those additional writer paths were not executed in T01. The older plan's “balance mirrors” label is disputed factual classification and cannot authorize omitting registration deduction config. Profile-only updates still keep deduction configuration separate.
- Each strictly positive sim amount inserts **only** jenis_simpanan, nik_kar, nama_kar, kd_group, potongan_payroll, status=1 into m_simpanan_aktif. Exact types are SIMPANAN POKOK, SIMPANAN WAJIB, SIMPANAN SUKARELA. doc_no/cd/ud remain NULL; required potongan_old/is_mobile become implicit zero only in the selected legacy non-strict environment. No opening accounting entry is inferred.
- Edit chooses m_anggota by posted PK but users/config by separately posted NIK. It does not change stored NIK/doc_no/no_anggota, but does change tgl_daftar/id_card. It bundles profile, financial and status changes. Native command boundaries deliberately separate those responsibilities.
- Five-field mirror is member ktp→users.ktp, nama_kar→name, no_telp→phone, email→email, alamat_tinggal→street_address. No users row means no mirror. users.bagian/lokasi/no_rek/bank_rek/kd_group are not updated by these member blocks.
- Positive config edits UPDATE potongan_payroll on every exact (NIK,jenis_simpanan) match; no status/name/group refresh. Nonpositive edits do nothing to existing config. Hard delete deletes by member PK then updates config status=0 by former NIK, without checking any of the exercised history stores.
- **Audit attribution defect discovered at runtime:** create stores cd_usr='0'. These controllers request session key `nama`, while `libraries/autentifikasi.php:42–45` sets `nama_lengkap`; missing CI2 userdata returns FALSE and is persisted as zero. The earlier source audit's assumption that it stores the KOSIPA display name is disproven. Native attribution must use authenticated actor identity, not reproduce the missing-key defect.
- Source inspection (not an extra runtime amount test): FILTER_SANITIZE_NUMBER_INT followed by integer cast strips decimal separators, e.g. 1.25→125. Native strict monetary validation must not inherit this sanitizer. Canonical duplicates, numbering concurrency, partial-write rollback and stale updates are not tested here.

## Captured side-table schema provenance and safe installation

Authoritative input: coordinator-captured structure-only `SHOW CREATE TABLE`, private `.local/kosipa-full-access-completion-20261106/schema-contracts.json`, observed `2026-11-06T07:27:28+00:00`. Only the two required table contracts were read. SHA-256 of each captured raw CREATE string:

| Table | Columns / storage | Captured CREATE SHA-256 |
|---|---|---|
| m_simpanan_aktif | 20; InnoDB, latin1_swedish_ci, DYNAMIC; PK(id), no invented NIK/type uniqueness; nik_kar VARCHAR(10); required potongan_old/is_mobile lack defaults | `66a17eee992df6f1646af7922499ac3d4e4a9950a20520206a343ebee30864f4` |
| oauth_access_tokens | 9; InnoDB, utf8mb4_unicode_ci, DYNAMIC; PK(id VARCHAR(100)); nullable BIGINT user_id and user_id index | `a8f75cd673f1937fa79fc978872877a067938a49635aca04a1606c6a41899084` |

Tracked fixture: `integration/kosipa-full-access/fixtures/member-side-tables.sql`. Changes from captured DDL are only CREATE IF NOT EXISTS, `__KOSIPA_DB__` qualification, semicolons and removal of the instance AUTO_INCREMENT counter. No rows, credentials, actual source database names, guessed constraints, ALTER or DROP. Fresh schema setup includes it; **fresh setup/reset was not executed** on the preserved stack.

Existing-stack command:

```sh
node integration/kosipa-full-access/local-stack.mjs member-tables
```

It uses fixed loopback port 3322, loads only the private LOCAL_SYNTHETIC config and verifies installation id/mode via rootConnection before DDL. It checks both preexisting shapes before creating either missing table, executes only the two CREATE IF NOT EXISTS statements, and compares actual SHOW CREATE afterward. Comparison ignores qualification/existence-clause/whitespace/instance counters only; incompatible definitions fail closed. Initial execution created two missing tables; subsequent execution created zero. Wrong-sentinel connection is rejected in the live guard test. No setup/reset, existing table recreation, grants or protected source configuration changes are performed by this command.

## Runtime isolation, modes and cleanup

The existing harness creates an internal-only Docker network, mounts original source and harness read-only, runs a tmpfs copy and uses its generated synthetic development database override. This suite adds generated environment config files **inside its own runtime container** for one standard CI2 post_controller_constructor hook that sets only that request connection's sql_mode. MariaDB global/native defaults are untouched. CI2 stricton=FALSE alone does not unset the server default; this was first observed as SQL1364 on both create routes.

The suite snapshots private directory names before starting its runtime, requires exactly one new legacy-suffix directory, and derives that exact runtime container name. There is no broad Docker selection. Base config is retained; a guard requires its original enable_hooks=FALSE, then generated development/hooks.php enables only the session-mode hook. Original hooks remain untouched and disabled. No provider hook is enabled. The exact session mode `NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION` reproduces the non-strict coercion path; MC03 switches only this connection to STRICT_ALL_TABLES and restores it in finally. The coordinator supplied a separate read-only 2026-11-06 production capture: GLOBAL and SESSION were both `NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION`, with PHP stricton=false. The legacy-only hook matches that captured mode; MC03 still uses STRICT_ALL_TABLES. This task made no production connection and does not establish broader production runtime parity.

Each case generates unused synthetic NIKs (prechecked across member/user/config), SYNTH names and .invalid email addresses. User allocation scans at most 1,000 safe integer candidates from the current AUTO_INCREMENT boundary without resetting it, checks users.id and both token predicates with parameterized numeric/string comparisons, then inserts an explicit collision-free id. Before each non-AKTIVE edit, a scenario-scoped guard rechecks user ownership and both token predicates, allowing only intentionally inserted scenario tokens (including MC08's wrong-id trap). Unexpected users/tokens fail before the HTTP request. Adversarial fixtures force skips for exact numeric token ids, numeric coercion aliases and orphan user_id rows, then prove both controller paths preserve every fixture field. Separate late-collision cases prove the guard refuses the request without changing member/user/token rows. Preservation fixtures are inserted only at prechecked unused keys and removed by those exact keys plus their SYNTH ownership marker in finally; unknown token rows are never deleted or restored from snapshots. Only owned PK/NIK rows are snapshotted and deleted in finally; cleanup continues after an individual cleanup failure. Synthetic login history is matched to its exact session marker and PK before removal; ambiguous ownership fails without deleting those rows. The existing operator password and member-menu statuses are restored even on setup failure. Autoincrement counters are never reset. No original legacy files or application behavior are edited, no external sends or provider/device checks run.

## Decisions and exclusions

No FD-07/08/22/23/24/25 or D3 policy is approved by passing these tests. The owner separately confirmed FD-17 bank/status actions may use one authorized operator as legacy, with reason and audit mandatory; no extra checker is introduced by T01. This does not resolve amounts, removal status, sync authority, reactivation or expiry policy.

**REQ-108 gap remains:** registration requires initial deduction rows but the plan forbids client sim_* inputs. Recovered source provides no approved payroll amount default. The implementation direction is a separate `initialDeductions` registration config, with deductions kept outside profile-only updates (REQ-108/113/109). Its validated interface and command implementation remain follow-up; zero rows and fabricated defaults are not silent substitutes.

**REQ-109 gap remains:** salary gaji is required through a member command (BR-113), while FA-03B's plan defers it. This characterization does not complete salary scope.

MC12–MC24 are **pending**, including competing mobile/TOKO writers, TOKO expiry/sale behavior, native reads/writes/HTTP/UI, canonical concurrency, numbering policy, rollback/idempotency/stale handling, restricted grants and reactivation. File/QR behavior is excluded. MC01–MC11 native correction assertions, transactional rollback and native ledger effects remain unimplemented. Full smartkkisi writer/logout contracts and production ownership evidence remain separate gaps. IAK sales sandbox expansion does not authorize paid production transactions or add any T01 provider operation.

## Verification

```sh
KOSIPA_FA01=1 node --test apps/web/tests/kosipa-member-fixture.test.mjs apps/web/tests/kosipa-member-legacy-runtime.test.mjs
# 36 tests passed: 4 fixture/guard + 32 member scenarios (28 real-PHP characterizations + 4 preservation guards)
```

Existing `kosipa-legacy-runtime.test.mjs` was run once after the fixture changes with Node --experimental-strip-types and KOSIPA_FA01=1: six cases passed. A private wrapper restored and compared the existing synthetic member/user/operator/menu/ownership values touched by that older suite; no reset was used. Its normal newly created synthetic master/ledger rows remain as regression artifacts. Changed-file lint and git diff --check also passed. These checks prove the bounded local synthetic result only.
