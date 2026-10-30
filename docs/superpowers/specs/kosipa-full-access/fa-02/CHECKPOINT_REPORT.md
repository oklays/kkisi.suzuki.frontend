# FA-01.5 (foundation hardening) and FA-02 (core master data): checkpoint report

Date: 30 October 2026. Branch: `feat/currency-rupiah-standard` (not committed).

**Scope:** this checkpoint continues FA-01 ([report](../fa-01/CHECKPOINT_REPORT.md)). Everything was built and tested on the isolated synthetic stack, plus an isolated DEV LOCAL runtime for regression.

**Status:**

- **Local work: complete.**
- **Production readiness: not claimed.** The gates are in §1.
- **KOSIPA Full Access: not complete.** There are still no financial commands.

## 1. FA-01.5 results and remaining production gates

| Item | Local result | Remaining before production |
|---|---|---|
| FD-01b ledger isolation | **Done.** The ledger is in its own database on the same server. The writer has database-level `SELECT, INSERT` there, which is what cPanel can express. One transaction covers both databases. Under that privilege model every ledger mutation, DDL and trigger creation is refused. [Note](../fa-01.5/FD-01b-ledger-isolation.md) | Operator creates the ledger database and the account from `docs/migration/sql/kosipa-command-ledger-production.sql`, then pastes the `SHOW GRANTS` output. Allow-list the production ledger name in the writer guard. Optional FD-01c (tamper evidence against the cPanel owner) |
| FD-03 fencing gap (`adm_menu_c`) | **Closed on the native side.** Every command share-locks the feature's `ref_menu` rows and refuses with 503 `LEGACY_ACTIVE` if any of them is enabled. All three ways `adm_menu_c` can reopen a fence were rehearsed, including a concurrent race. [FD-03 §FA-01.5](../fa-01/FD-03-legacy-fence-verification.md#fa-015--closing-the-adm_menu_c-gap-native-writes-fail-closed) | Operator runs the fence SQL per feature. Drain in-flight legacy requests before switching ownership (gate 6) |
| Shared writers | **Documented.** No writer outside each master's own KOSIPA controller (15 rows in 02A). Readers and contracts are listed, including the case-sensitive Next.js public-savings join on `m_bagian`. [Audit](../fa-01.5/SHARED_WRITER_OWNERSHIP.md) | Operator confirms the smartkkisi **web admin** does not write these tables (its source is unavailable) and what `pinjaman/master-jw` does |
| Two-administrator grants | **Done.** Request, then approval by a *different* administrator within 24 h, re-checked at approval time; reject; single-admin revoke. Self-request, self-approval, approval by the beneficiary, duplicate or concurrent approval, expired and stale requests are refused in the application **and** by the database (open-key unique index, CHECKs, transition trigger) | Production grant table from reviewed SQL (B6 console store) |
| Browser regression in an isolated runtime | **Done.** DEV LOCAL profile on :3203 from its own build folder (`.next-devlocal`), every other env key masked; the user's `next dev` on :3000 was not touched. Navigation 13/13, KOSIPA UI/UX 59/59, DEV LOCAL smoke 11 checks pass then stops on a **pre-existing** stale assertion (§8) | Full run of `dev-local-smoke-browser`, `dev-local-writes-smoke` (pinned to :3200) and the e2e suites (`e2e-run.sh`, which loads `.env.local` writers) by the owner's environment |
| Concurrency, rollback, idempotency, revocation, audit | **Re-verified** on the new layout (§7) | — |
| B1 tooling | **Validated** against synthetic views, procedures, functions, triggers and events with a sentinel row. [Operator instructions](../fa-01.5/B1-operator-instructions.md) | The operator's production run (still the gate for any financial parity) |

## 2. FD-01b: implementation and privilege evidence

**Code:**

- `kosipa-unit-of-work.ts`: `ledgerTable(KOSIPA_LEDGER_DATABASE)`, fully qualified ledger statements, an `afterLedgerWrite` failure hook for tests.
- `prisma-kosipa-master-write.ts`: `validateKosipaLedgerDatabase`, which is mandatory, allow-listed, and must differ from the business database.
- `services.ts`: wiring.

**SQL:**

- `db/kosipa/001_command_ledger.sql.tpl` now creates `__LEDGER_DB__`.
- `002_master_writer_grants.sql.tpl` grants `SELECT, INSERT ON __LEDGER_DB__.*`.
- `003_cpanel_model_writer.sql.tpl` is a test-only account with exactly cPanel-expressible grants.

**Evidence** (`kosipa-foundation-db.test.mjs`):

| Test | What it shows |
|---|---|
| `SHOW GRANTS` | Only `GRANT SELECT, INSERT ON kkisi_kfa_ledger.*`; no table or column privilege is needed |
| Refused for the cPanel-model account | UPDATE, DELETE, TRUNCATE, ALTER, DROP, RENAME, CREATE TABLE, CREATE TRIGGER, REPLACE, `INSERT … ON DUPLICATE KEY UPDATE` |
| Failure injected after the ledger insert | Business row 0, ledger row 0. Retry: 1 and 1. Replay: `replayed: true` |
| Application reader | Refused even SELECT on the ledger database |

## 3. FD-03: ownership and fencing verification

| Layer | Mechanism |
|---|---|
| Legacy (operator, reviewed SQL) | `ref_menu.status = 0` per controller (generator `apps/web/scripts/kosipa-legacy-fence.mjs`, now driven by the 5 master definitions) |
| Native ownership | Feature flag **and** `KOSIPA_WRITE_OWNERSHIP` per master (`master.lokasi`, `master.bagian`, `master.jenis_dokumen`, `master.rekening_bank`, `master.periode_angsuran`) |
| Fail-closed bridge (new) | In every transaction: lock the feature's `ref_menu` rows, refuse if any is enabled; the UI shows read-only with an explanation |

Rehearsals: status by id, duplicate row, renamed row, the race (the admin UPDATE waited about 1.5 s for the native commit), per-feature scope, and the browser view (E7). Direct, alternative and AJAX routes are covered by the legacy constructor gate. The application has no background jobs.

## 4. smartkkisi integration findings

| Area | Finding |
|---|---|
| API (`routes/api/v1/api.php`, complete) | Reads `master-lokasi` and `master-bagian`. `POST pinjaman/master-jw` probably reads `m_jangka_waktu` (body unavailable). No write route to these five tables |
| Member registration | Stores the lokasi and bagian **names** in `users`. The native rules never change a stored name |
| Unknown | The web admin panel |

Full matrix: [SHARED_WRITER_OWNERSHIP](../fa-01.5/SHARED_WRITER_OWNERSHIP.md).

## 5. FA-02 feature-by-feature completion matrix

Each master's legacy semantics and rules are in [MASTER_SEMANTICS](MASTER_SEMANTICS.md).

| Master | Create | Update | Deactivate / reactivate | Hard delete | Protected data | Legacy-compatible writes | Tests (DB / HTTP / E2E) |
|---|---|---|---|---|---|---|---|
| Lokasi (FA-01) | ✅ | ✅ code; name if unreferenced | ✅ with reason | Not offered (deactivate instead) | Names stored by members or accounts | `status` 1/0 | ✅ / ✅ / ✅ |
| **Bagian** | ✅ | ✅ name if unreferenced (case-only changes too) | ✅ | Not offered | Names in `m_anggota.bagian`, `users.bagian`; public-savings BINARY join | `status` 1/0, `id_lokasi` untouched | ✅ / via shared handlers / ✅ |
| **Jenis Dokumen** | ✅ | ✅ all fields | ✅ | Not offered | No readers | `is_active` `'1'`/`'0'`, `cd/cd_usr`, `ud/ud_usr` | ✅ / shared / ✅ |
| **Rekening Bank** | ✅ | ✅ labels; code only if no loan stores it | ✅ (hidden from the new bank-loan form) | Not offered | `trans_pinjaman.bank_pembiaya`; loan checksum unchanged | Same as above | ✅ / shared / ✅ |
| **Periode Angsuran** | ✅ (months 1–360, unique) | ✅ labels; **code never** (domain + DB privilege) | ✅ | Not offered | Meaning of existing terms; loan checksum unchanged | Same as above | ✅ / shared / ✅ |

**Financial side effects: none.** No posting, recalculation, settlement or historical correction exists. The writer cannot write any financial table: its only privilege on `trans_pinjaman` is `SELECT` on one column. Mutation features are enabled **only** in the synthetic profile `.env.kosipa-fa01`; the writer guard refuses every other database.

## 6. Code and database changes

**Domain** (`packages/domain`):

- `kosipa/master.ts`: rewritten as **one generic rule set** plus 5 definitions (the Lokasi-only functions are gone).
- `console/kosipa-grants.ts`: request and decision rules.
- `console/identity-link.ts`: audit actions `kosipa.grant.request|approve|reject`.

**Application** (`packages/application`):

- `kosipa/commands/master.ts`: generic `createMaster`, `updateMaster`, `setMasterStatus`, `listMaster`, plus the `fenceState` port.
- `console/kosipa-grants.ts`: `requestKosipaGrant`, `decideKosipaGrant`, `revokeKosipaGrant`.

**Infrastructure** (`apps/web/src/infrastructure`):

- `repositories/kosipa-master-write.repository.ts`: generic, with the constant table map; it replaces `kosipa-location-write.repository.ts`.
- `db/kosipa-unit-of-work.ts`: separate ledger database and the legacy fence.
- `db/prisma-kosipa-master-write.ts`: ledger guard.
- `console/kosipa-ownership.ts`: features from the definitions.
- `console/kosipa-grant-store.ts`: conditional-UPDATE decisions.
- `console/kosipa-grant-handlers.ts` and `console/kosipa-command-http.ts`: new codes `LEGACY_ACTIVE`, `MASTER_FIELD_IMMUTABLE`, `SELF_APPROVAL`, `GRANT_*`.

**Routes and UI:**

- Routes: `api/console/kosipa-grants/[id]/[action]` (approve, reject, revoke); `console/kosipa/master` (index) and `console/kosipa/master/[type]`.
- Components: `MasterDataManager.tsx` (replaces `LocationMasterManager.tsx`) and `KosipaGrantManager.tsx` (pending and active).
- Navigation: entry "Master Data", shown only when the write foundation is deployed.
- CSS: form layout fixes.

**Database** (synthetic stack only):

- `db/kosipa/001` (ledger database), `002` (writer: the 5 masters, reference columns, `ref_menu`, `ref_users`, ledger database), `003` (cPanel-model test account).
- `db/console/004_kosipa_grants.sql`: **amended in place** (unreleased; applied only to synthetic stores) for the two-administrator workflow, plus `005` grants and `004` rollback.
- Fixture `legacy-structure.sql`: the 4 FA-02 tables (staging DDL).

**Documentation:**

- `docs/migration/sql/kosipa-command-ledger-production.sql`: review-only, option (b).

**Tooling:**

- `integration/kosipa-full-access/local-stack.mjs`: ledger database, cPanel-model account, fenced menus, `adm_menu_c` row, FA-02 seed, two grant administrators.
- `app-server.mjs`: `--profile devlocal`; refuses an occupied port and rebuilding a running profile.
- `kosipa-b1-schema-export.sh`: reports invisible events.

No index was created on any legacy table. No legacy file, real-data staging row, DEV LOCAL schema object or production object changed.

## 7. Executed test commands and results (30 Oct 2026, final tree)

| Command | Result |
|---|---|
| `pnpm lint` | 0 errors, 6 warnings, all in files FA-01.5/FA-02 did not touch |
| `pnpm typecheck` | exit 0 |
| `pnpm -r test` | domain **340/340**, application **174/174**, web 603: **474 pass, 0 fail**, 129 skipped (opt-in suites) |
| `KOSIPA_FA01=1 node --experimental-strip-types --test --test-concurrency=1 tests/kosipa-{foundation,masters,legacy-fence,migrations-rollback,b1-export}-db.test.mjs` (app server stopped) | **22/22**. Foundation 13, masters 6, fence 1, migrations 1, B1 1. Masters re-run 3 times (stable). Run with parallel files, the writer's 2-connection cap refuses the second pool; that is the cap working, so files run sequentially |
| `node integration/kosipa-full-access/app-server.mjs build && … start`, then `node tests/kosipa-master-browser.mjs` | **PASS E1–E9**: index, read-only, unlinked, two-admin grant, Lokasi CRUD, stale tab, the four FA-02 masters with protections, legacy-active, revoke, ledger and audit evidence. Screenshots in `/private/tmp/kfa01-browser` |
| `… build --profile devlocal && … start --profile devlocal`, then `DEV_LOCAL_URL=http://127.0.0.1:3203 node tests/console-kosipa-nav-browser.mjs` | **13/13** |
| `DEV_LOCAL_URL=… node tests/kosipa-uiux-browser.mjs` | **59/59**, 0 page errors |
| `DEV_LOCAL_URL=… node tests/dev-local-smoke-browser.mjs` | **11 PASS, then fail** on `/console/kosipa/payroll/…/rekonsiliasi` expecting the text "ditinjau", which no longer exists in the payroll pages (removed in commit `f014caa2`, before FA-01; files untouched since) |
| Test fix made | `dev-local-smoke-browser.mjs` `main()` waited for `^Memuat` but `<main>` starts with the synthetic banner; the predicate now ignores the banner (the page renders in about 400 ms) |
| Not run | `dev-local-writes-smoke.mjs` (hard-pinned to :3200, the owner's server); `e2e-run.sh` suites (would load `.env.local`, whose writers point at the real-data staging copy) |

## 8. Unresolved limitations

1. **Production gates:**
   - FD-01b operator steps and the allow-listed production ledger name;
   - the per-feature fence;
   - the smartkkisi admin confirmation;
   - writer accounts from reviewed SQL;
   - the B5/B8 connection budget;
   - the B6 console store;
   - cutover gates 1–8.
2. **B1 is not run**, so no financial parity is verified and no financial command exists.
3. **FD-01c:** no tamper evidence against the cPanel owner.
4. **Pre-existing test debt:** the stale "ditinjau" assertion in the DEV LOCAL smoke; the e2e runner's `.env.local` exposure.
5. **Stale-approval check:** it uses the allow-list and the requester's active account, not a full recomputation of the requester's legacy permissions.
6. **Remaining legacy reference masters:** 12 of 17 are not native yet (`jenis_simpanan`, `jenis_pinjaman`, `jenis_pembiayaan` and `suku_bunga` need D6 and B1; the rest are not in the menu).
7. **Legacy-runtime proof:** no PHP proof that legacy pages read native rows (TASK-104/131). Compatibility is shown by the legacy readers' own SQL, not by running PHP.

## 9. Recommended next checkpoint: FA-03, "legacy runtime harness + membership read/write preparation"

1. **TASK-104 / TASK-131: PHP 5.6 CI2 characterization harness for KOSIPA.** Reuse the public-savings `legacy-runtime` Docker image. Render the legacy master and member forms and the bank-loan form against native-written rows. This turns the compatibility contracts into runtime evidence and is the prerequisite for anything `m_anggota`-related.
2. **TASK-109: document numbering under lock.** Needed by every document command.
3. **WI-07/08 membership (TASK-115), behind the same pipeline.** Start with profile updates and status changes on synthetic data only. `m_anggota` is shared with TOKO and smartkkisi, so the shared-writer audit pattern used here must be repeated for it first.
4. **Before any production enablement:** the operator steps of §1 and the B1 run.
