# Public Simpanan Sukarela — isolated integration and manual testing

Target: **LOCAL_SYNTHETIC**, MariaDB11.4, Docker container `kkisi-public-savings-integration`, database `kkisi_public_savings`, bound exclusively to `127.0.0.1:3318`. The Next application uses `127.0.0.1:3489`. No production database, notifications, payroll system or remote PHP endpoint is contacted.

## Manual testing Wajib / Sukarela — 7 November 2026

Owner confirmed: “sama sistem nya seperti potongan simpanan sukarela yang saat ini sudah dibuat, NAMUN ini untuk simpanan WAJIB”. The Wajib extension uses the same rules under its own approved policy `KKISI-PSW-2026-V1@1.0.0`; original Sukarela policy and historical PDFs retain their original versions. This extends **local simulation**, not operational member activation.

Use the existing feature worktree:

```sh
cd ../kkisi.suzuki.web-worktrees/public-savings-e2e-20261029
pnpm pss:setup        # start/reuse, additive upgrade, preserve existing requests
pnpm build
pnpm pss:console
```

1. Open <http://127.0.0.1:3204/console/kosipa/simpanan-sukarela>. The original menu/route name is retained; the issuer now selects **SIMPANAN WAJIB** or **SIMPANAN SUKARELA**.
2. Sign in as `synth_koperasi`, password from the main checkout's ignored `apps/web/.env.dev-local-accounts.json` (`koperasi`). No password is included here.
3. Click **Terbitkan tautan**, choose **SIMPANAN WAJIB**, and search exact NIK `SYN0000002` or `SYN0000003`. `SYN0000001` already has an active request in the retained test database; do not delete it to bypass duplicate protection.
4. Click **Terbitkan** beside the synthetic member; copy **Tautan privat anggota**. Open the complete link in a private browser window on the same computer. The historical `/simpanan-sukarela` route serves both types; the type is bound to the token in the database, never chosen by a public URL/query/body.
5. Click **Kirim kode verifikasi**. In another terminal, from the same feature worktree, run `pnpm pss:ops capture --latest`. Use the latest unexpired challenge's six-digit OTP. This is local capture only: nothing is sent to real email/SMS/WhatsApp.
6. Verify that the form says **SIMPANAN WAJIB**. Enter `150000` (initial deduction `100000`), draw a signature, check the Wajib consent, review and submit. The inherited limits are Rp10,000–Rp5,000,000, increment Rp1,000; increase/decrease allowed, unchanged rejected, zero assisted.
7. Download the PDF and confirm its **PENGAJUAN SIMPANAN WAJIB** title. Refresh the console: the application must show **SIMPANAN WAJIB / Menunggu proses**. Submission does not change deductions/balances or approve payroll.

Links expire after48hours. Reissuing replaces the member's previous active link. A submitted active application prevents another change, including across Wajib/Sukarela. Use the other unused synthetic member for another test; never reset the database just to bypass the control.

**Why the ordinary server looked inactive:** the dedicated public-savings container was stopped even though the main checkout already had the opt-in flags; a failed initial database readiness check was cached until restart; the console launcher additionally inherited newer native KOSIPA writer DSNs outside its isolated profile. Failed readiness checks can now retry safely. The launcher explicitly disables only those three native writers and validates the remaining targets. It does not weaken the ordinary DEV LOCAL preflight or activate a production endpoint.

`127.0.0.1` links work only on this computer. They are not operational links to send to real members or another device. Real external UAT still requires the CI2/Laravel writer/print integration, approved deployment adapter/HTTPS, verified contact sources and configured delivery provider described below. Never expose this synthetic server with a tunnel.

Migration `002_wajib_savings.sql` adds immutable link type binding and updates the local controlled command for the matching deduction column. Existing links default to Sukarela. `setup` applies the checksum-checked upgrade without reset; existing monetary values are retained. No production migration is executed.

## Manual testing on the main app (:3000) with the production-copy replica — LOCAL_REPLICA_UAT

Target: the ordinary DEV LOCAL app on `127.0.0.1:3000` against the local Docker replica `kkisi-staging` (`127.0.0.1:3307/kkisi_staging`) with the **existing registered members**. Mode `LOCAL_REPLICA_UAT` needs its own opt-in (`PSS_LOCAL_REPLICA_UAT=1`), is refused when `APP_ENV=production`, accepts only the exact loopback replica and the restricted `pss_replica_public` / `pss_replica_legacy` accounts, and keeps its private config/keys/captures in `.local/public-savings-replica/` (mode 0700/0600, git-ignored).

One-time provisioning (already done on 7 Nov 2026; repeatable and non-destructive — a verified full `mariadb-dump` backup is taken before any SQL write):

```sh
pnpm pss:replica setup    # backup, migrations 001+002, restricted accounts
pnpm pss:replica enroll   # auxiliary pss_* rows only; member/master/header digest is verified unchanged
```

`apps/web/.env.local` then needs `PSS_LOCAL_STAGING=1`, `PSS_LOCAL_REPLICA_UAT=1`, `PSS_OPERATOR_AUTH=CONSOLE`, `PSS_LOCAL_DIRECTORY` / `PSS_OPERATOR_POLICY_FILE` pointing at `.local/public-savings-replica`, and `KOSIPA_READ_ACCESS_MODE=non-cashier` (the previous profile is saved as `.local/public-savings-replica/env.local.before-replica-uat`). Restart `pnpm dev` after changing it.

1. Sign in on <http://127.0.0.1:3000/login> with a console account of role 1 or 2 (the replica operator policy maps those roles to `STAFF_OPERATOR`; cashiers have no access).
2. Open <http://127.0.0.1:3000/console/kosipa/simpanan-sukarela> (banner **LOCAL REPLICA UAT · SIMULASI**), click **Terbitkan tautan**, choose **SIMPANAN WAJIB**, search the member's exact NIK, then **Terbitkan** and copy **Tautan privat anggota**.
3. Open the link in a private window on this computer, click **Kirim kode verifikasi**, then read the OTP with `pnpm pss:replica capture --latest`. The member's real email is never contacted: OTP delivery goes to encrypted local capture only.
4. Fill the new deduction, draw the signature, tick consent, review and submit. The PDF says **PENGAJUAN SIMPANAN WAJIB** and carries the `LOCAL_CAPTURE_SIMULATION` marker; the console shows **SIMPANAN WAJIB / Menunggu proses**.

Submission inserts exactly one OPEN `trans_simpanan_pengajuan` header (copied verbatim from the masters, including legacy trailing blanks in `bagian`/`nama`) and never changes `m_anggota` or `m_simpanan_aktif`. Members with an existing OPEN/POSTING request (mobile or public), without a unique active `SIMPANAN WAJIB` master that matches `m_anggota.sim_wajib`, or without an active `m_bagian` row are refused fail-closed — choose another member rather than editing data. Contact, roster and calendar facts in this mode are labelled simulation evidence (`SIMULATED_LOCAL_CAPTURE`, `LOCAL_REPLICA_SIMULATION_CALENDAR`, `lokasi=LOCAL_REPLICA_KOSIPA`), so it does not count as operational verification.

Automated acceptance (logs in, issues a Wajib link for `manual-member.json`, completes OTP/signature/submit, checks the PDF and console row and that member/master rows are unchanged; never prints tokens, OTPs or credentials):

```sh
cd apps/web && PSS_LOCAL_REPLICA_UAT=1 node --experimental-strip-types tests/public-savings-replica-browser.mjs
```

After a successful run that member holds an active request, so point `manual-member.json` at another eligible member before re-running.

## Setup

Run from this feature worktree, not the original checkout:

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm pss:setup
pnpm pss:status
pnpm pss:dev
```

Docker Desktop must be running (`open -a Docker` on macOS). Prisma generation generates code only; it does not migrate or connect to the legacy database. `setup` creates a labeled disposable container only if needed, otherwise starts/reuses the verified installation. It never reads repository `.env` files. Unknown container labels, an existing unknown database, or mismatched sentinel fail closed.

Secrets are generated locally in `.local/public-savings/config.json` and `admin.json` (directory0700, files0600, ignored by Git). Public runtime configuration contains `pss_public` credentials, not administrative credentials. The separate `pss_legacy` account has SELECT/EXECUTE only on the controlled legacy commands. Neither public nor legacy account can directly update member deductions or protected headers. Runtime pool limit2 per service instance, queue32, connection timeout3s and row-lock timeout5s; this is local capacity configuration, not production capacity evidence.

`PSS_LOCAL_STAGING=1` plus a matching database sentinel is required. Host/database/user/key checks run before connection. The HTTP boundary also rejects a non-loopback direct Host, foreign Origin and cross-site fetch. Forwarded-host headers are not trusted. No management cookie authorizes public submission. All public routes are disabled outside this deliberately local deployment adapter.

## Manual member flow

1. Open `http://127.0.0.1:3489/simpanan-sukarela/operator`.
2. Read `operatorKey` from the private local `config.json` in your editor and enter it in the password field. This synthetic operator key is not a replacement for production console RBAC.
3. Search exact NIK `SYN0000001`, `SYN0000002`, or `SYN0000003`. Seed names are visibly synthetic; all delivery destinations end in `@example.invalid`.
4. Click **Terbitkan tautan**. The UI shows the private absolute link only on issuance. Copy it to another local browser window. Its fragment is immediately removed from the address bar; keep the original link privately for receipt recovery.
5. Click **Kirim kode verifikasi**. In a second local terminal run:

   ```sh
   pnpm pss:ops capture
   ```

   This explicit manual-testing command reveals only synthetic captured OTPs and challenge references. There is no HTTP endpoint exposing OTPs. Match the latest challenge; never copy this capture provider or its disclosure behavior to production.
6. Verify, enter a different whole-rupiah deduction, draw a signature, read/check consent, review, and submit. Initial deduction is100000; policy min10000/max5000000/increment1000. An example valid request is150000.
7. Verify the reference, download the actual private PDF, and refresh the operator list. The legacy header is `OPEN`. Submission has not approved or posted payroll or changed a savings balance.
8. A completed link supports receipt recovery through fresh OTP within its original48h deadline. It cannot reopen the application. Revoked/expired links cannot recover through public routes; staff-assisted recovery is required.

Only local synthetic links are usable here. Do not send them to actual members as an operational service. A phone on another network cannot reach a loopback URL; external activation requires the actual-runtime prerequisites below, not a development tunnel.

## Console management (DEV LOCAL login)

The same synthetic data can be managed from the real console UI with real console sessions, CSRF and capabilities:

```sh
docker start kkisi-staging            # DEV LOCAL auth/console/KOSIPA read databases (127.0.0.1:3307)
pnpm build
pnpm pss:console                      # http://127.0.0.1:3204/console/kosipa/simpanan-sukarela
```

`console-local.sh` reuses the main checkout's DEV LOCAL profile (`apps/web/.env.dev-local`, preflight-checked), adds `PSS_LOCAL_STAGING=1`, `PSS_OPERATOR_AUTH=CONSOLE` and a private synthetic policy `.local/public-savings/operator-policy.json` (0600). Sign in as `synth_koperasi` (password in the ignored `.env.dev-local-accounts.json`, key `koperasi`): role 2 is STAFF_OPERATOR for company 9001, which holds the synthetic members. `synth_kasir2` (role 4, company 9002) is STAFF_VIEWER of an empty branch: it sees the page but no applications and cannot search or issue. `synth_kasir1` has no KOSIPA link and is refused. Approval stays in KOSIPA CI2.

With either flag unset the console entry is hidden and `/console/kosipa/simpanan-sukarela`, `/simpanan-sukarela` and `/simpanan-sukarela/operator` answer 404; all APIs answer 503 (`apps/web/tests/public-savings-isolation.test.mjs`).

## Persistence and migration

`schema.sql` is a **disposable representative fixture**, never an upgrade script for existing legacy tables. It includes a deliberately stricter unique NIK/doc_no/active-master fixture boundary; these indexes are not asserted to exist in production. Known field contracts come from existing09A metadata, including varchar department, Latin1, nullable old deduction, `status_notif`, NIK10 active master and legacy DOUBLE persistence.

`migrations/001_public_savings.sql` contains additive auxiliary objects, guarded commands and triggers; it does not rebuild existing `m_*`/`trans_*` tables. `preflight.mjs` checks representative legacy signatures, engines, required nullability, precision, indexes and duplicate business keys. It applies/reapplies an interrupted migration only to the allowlisted sibling `kkisi_public_savings_migration_check` with the same sentinel, verifies a checksum, and checks unchanged legacy-table signatures:

```sh
node integration/public-savings/preflight.mjs
pnpm pss:migration:verify
```

DDL is not transactional. Recover by restoring the exact version/checksum and re-running it on the isolated target; never drop financial records or disable guards as a rollback. Operational rollback is intake OFF, durable outbox drain and receipt recovery, not destructive schema rollback. Applying this migration/grants to any actual legacy environment is outside this local execution and requires verified current metadata and writer routing first.

## Verification

```sh
pnpm test
pnpm pss:test:integration
pnpm typecheck
pnpm lint
pnpm build
```

Tests require Node22+, Docker, and `pdftotext` for actual PDF extraction. Install Playwright Chromium once with `pnpm --filter @koperasi/web exec playwright install chromium`. With `pnpm pss:dev` running in another terminal:

```sh
pnpm pss:test:browser
```

Browser tests create their own unique synthetic members without resetting the database. They exercise real HTTP/OTP capture/submission/PDF, lost-response exact retry, refreshed review/consent/signature, five responsive widths, invalid/revoked/consumed links, operator authorization and empty browser storage. Screenshots and sanitized results are under `/private/tmp/kkisi-public-savings-browser` by default; override `PSS_BROWSER_OUTPUT` for another private directory. They are Chromium emulation, not physical WhatsApp/Safari or screen-reader acceptance.

Database tests use distinct synthetic identities, actual transactions, separate restricted accounts, two-process20-request races, a TCP proxy dropping a real commit acknowledgement, failure injection and cross-channel commands. The commands model documented legacy transitions; they are **not execution of actual CI2/Laravel PHP**. See [legacy compatibility evidence](legacy/README.md).

## Operations and recovery

```sh
pnpm pss:worker --once
pnpm pss:ops reconcile
pnpm pss:ops dispatch
pnpm pss:ops maintenance
pnpm pss:ops maintenance --apply
pnpm pss:ops escalate
pnpm pss:ops retry PSS_REPLACE_WITH_AN_ACTUAL_REFERENCE
```

Maintenance defaults to rollback/dry-run. Applying it clears expired OTP hashes/capture data and expired security tombstones/logs only; financial snapshots, signatures, PDFs, submission/approval audit and legal holds are never automatically deleted. Ten-year financial retention requires records/key/backup custody and legal-hold review before any destruction. Artifacts staged by failed or uncertain requests are retained conservatively; production object quotas/orphan collection require actual storage integration.

`pss_notification_recipient` supplies the active branch OPERATIONS/SUPERVISOR destinations. Seeds contain only example.invalid contacts; service code has no default staff address. Missing/ambiguous configuration leaves a failed retryable delivery and never discards intake. Reconciliation flags unresolved applications older than30days for staff review; no automatic financial cancellation occurs.

Outbox insertion is atomic with request/header/token consumption. Dispatch starts after commit, uses per-job transactional row locks (`SKIP LOCKED`), durable next-attempt deadlines with exponential60s..1h backoff, and a five-attempt dead-letter limit. Delivery IDs bind application reference+job kind, including across a fixture reset; local capture delivery deduplicates them. Provider adapters must honor the same idempotency contract. Rendering/capture currently occur under a short local job lock; a remote-provider deployment must use its configured timeout/lease adapter. A failed notification cannot repeat financial submission. `retry` resets only failed jobs for the exact reference after investigating the cause. `escalate` queues one backup notice after two synthetic weekdays; actual holidays/operations recipients require deployed configuration.

To pause new intake while retaining receipt/PDF access, restart with `PSS_INTAKE_ENABLED=0 PSS_LOCAL_STAGING=1`. Do not change the sentinel or point the service at another database. No Next endpoint can approve/reject/post. The CI2-owned SQL fixture may be invoked only using its dedicated account by integration tests; actual actor identity must come from authenticated legacy roles before deployment.

For a continuous local worker, run `pnpm pss:worker` in a separate terminal (`--once` runs one cycle for verification). It runs every30seconds, handles SIGINT/SIGTERM, logs counts only, and never sends network messages. Maintenance uses the separate synthetic administrative configuration; the public HTTP runtime never reads that file. Production requires a separately scoped maintenance identity. Alternatively schedule `dispatch`, `maintenance --apply`, and `escalate` using the existing local task scheduler. Do not send capture data to external logging. Reconciliation returns counts only; deliberate negative fixtures can produce quarantined evidence/dead letters and are not production incidents.

## Reset / teardown

```sh
pnpm pss:seed
pnpm pss:reset
pnpm pss:stop
```

`seed` is idempotent and does not overwrite existing synthetic requests. `reset` verifies the dedicated synthetic sentinel, recreates only its disposable database and restores three seeds; it destroys synthetic test records, never another database. Private artifact/capture files are conservatively retained, and delivery dedupe identities cannot collide with new references. Stop the local Next server before reset. `stop` verifies the Docker installation label and stops only this container, retaining its data. `setup` restarts it. No volume/global Docker cleanup is used.

## Remaining actual-runtime prerequisites

Actual CI2/Laravel PHP sources/runtime and authenticated actor binding; current deployed schema/trigger/index/SQL-mode/grant metadata; enrollment of **every** financial writer into the controlled command boundary; CI2 private-proof/print hook; actual contact/roster/calendar/holiday provenance; approved provider sender/template/credentials; console role/branch/recipient configuration; private object-store/key/backup recovery and TLS/log-redaction configuration. These are deployment integrations unavailable in this workspace. Local functionality is verified separately and does not close actual-runtime O-02/O-05/O-06 or authorize deployment.
