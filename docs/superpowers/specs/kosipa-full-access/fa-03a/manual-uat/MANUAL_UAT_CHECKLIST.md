# Owner manual UAT checklist

Machine smoke results are in [DATABASE_RESTORE_VALIDATION](DATABASE_RESTORE_VALIDATION.md). Every checkbox below remains **owner acceptance pending** until the owner performs it. Use [account retrieval](UAT_TEST_ACCOUNTS.md); never modify member-linked real data.

## 1. Login and navigation

- [ ] Open `http://127.0.0.1:3230/login` as the operator. Confirm the synthetic-data banner and KOSIPA → Master Data navigation.
- [ ] Open `/console/kosipa/master`; confirm all five modules.
- [ ] Sign in as viewer in another browser context. Lists are visible; create/edit/status actions are absent. A forged POST without CSRF must return 403.
- [ ] Sign in as unlinked user. KOSIPA shows the account-link notice and refuses protected data.
- [ ] Open `http://localhost:3231/login` in the read console. This is production-derived sensitive read data, not a writable or anonymized dataset. Never copy member data into defect reports. Follow the refresh limitations in the database report.

## 2. Five native modules

Use a unique test suffix such as `UAT-20261030-A01`. Run this sequence on each **synthetic write** module, never the read console:

| Module | Path | Safe test values / constraints |
|---|---|---|
| Lokasi | `/console/kosipa/master/lokasi` | code `UAT-A01`, name `SYNTH UAT Lokasi A01`; only unreferenced names can change |
| Bagian | `/console/kosipa/master/bagian` | name `SYNTH UAT Bagian A01`; referenced names, including case-only changes, are protected |
| Jenis Dokumen | `/console/kosipa/master/jenis-dokumen` | code `UATA01`, name `SYNTH UAT DOKUMEN`, remarks `uji manual` |
| Rekening Bank | `/console/kosipa/master/rekening-bank` | code `UAT BANK A01`, name `SYNTH UAT BANK`; no real banking details |
| Periode Angsuran | `/console/kosipa/master/periode-angsuran` | unused integer months 1–360; if the code exists choose another. The code is immutable after creation; edit its label/remarks |

For each module:

- [ ] Open list; record the starting row count.
- [ ] Locate the synthetic test label. **Native master lists currently have no dedicated search/status-filter controls**; use browser Find to locate a label. Do not record unavailable controls as passed. Private search/filter controls exist on the member/loan/report read pages.
- [ ] Create the record; expect `Data ditambahkan.`. Reload and confirm persistence, exactly one row and `Aktif`.
- [ ] Change an allowed field; expect `Perubahan disimpan.`. Reload and confirm the new value.
- [ ] Deactivate with reason `uji manual nonaktif`; expect `Tidak aktif`. The record remains listed, never hard-deleted.
- [ ] Reactivate with reason `uji manual aktif kembali`; expect `Aktif`.
- [ ] Try an empty required value and an existing code/name; expect validation/duplicate rejection and no additional row.
- [ ] On periode, confirm the code is read-only. On referenced synthetic lokasi/bagian, a rename is refused without breaking existing references.
- [ ] Verify the ledger and access-audit correlation using the privacy-safe evidence instructions below.

## 3. Two-administrator authorization

- [ ] As A, open `/console/settings/akses-kosipa`. Revoke the operator's existing active grant first if testing the full lifecycle; supply a reason.
- [ ] Reload operator tab. Mutations disappear/refuse immediately; view access remains.
- [ ] As A, request `Kelola master KOSIPA` for the operator. Expect pending state and `Administrator lain harus menyetujuinya`.
- [ ] Confirm A cannot approve its own request. Operator remains read-only while pending.
- [ ] As B in a separate context, approve. Expect `Hak disetujui dan berlaku.`.
- [ ] Reload operator. CRUD is available. Viewer still cannot mutate.
- [ ] Revoke as A or B, then verify the operator loses write permission on its next request. Re-request/approve if leaving CRUD enabled for further manual testing.

## 4. Duplicate submission, concurrency and rollback

- [ ] Double-click create for a uniquely labeled record. Expect one business row, one authoritative ledger effect; do not use two different codes to simulate a duplicate.
- [ ] Open the same synthetic row in two operator tabs. Save a change in tab A, then save the stale edit in tab B. Expect a stale-data notice and preservation of A's committed value.
- [ ] For injected rollback, concurrent API retries, missing/forged CSRF and ledger atomicity, use the existing executable suites below. There is no production-facing failure-injection switch.

```bash
# Stop only the dedicated synthetic UAT server before DB tests (writer connection cap).
node integration/kosipa-full-access/app-server.mjs stop
cd apps/web
KOSIPA_FA01=1 node --experimental-strip-types --test --test-concurrency=1 \
  tests/kosipa-foundation-db.test.mjs tests/kosipa-document-number-db.test.mjs \
  tests/kosipa-legacy-runtime.test.mjs
cd ../..
node integration/kosipa-full-access/app-server.mjs start
```

## 5. Audit and legacy compatibility

There is no newly added audit-log browser page in this checkpoint. The command ledger is the atomic audit of record; the console access trail is appended after commit. Existing `kosipa-master-browser.mjs` E9 verifies the exact ledger/access-audit commands and grant lifecycle. Run it while the synthetic server is up:

```bash
cd apps/web
node tests/kosipa-master-browser.mjs
```

This automated test creates labeled synthetic records and **revokes the operator grant at the end**. Re-request/approve before continuing manual CRUD. The real PHP harness in the DB command above uses synthetic records only and removes its temporary runtime/network/account. It does not connect to the production PHP app. Three legacy search paths have pre-existing CI2/CI3 API defects; identical seed/native failure characterization is recorded in the FA-03A report.

## 6. Realistic read performance

- [ ] Use the read-only console for member private search, loan pagination, payroll batch filters and reports. Do not copy personal search values to URL query strings or defect reports.
- [ ] Record route, role, HTTP result, elapsed time, returned row count/page size and whether next-page cursor changes. Record only opaque internal ids if needed; never NIK, names, balances per person or banking details.
- [ ] Repeat a small bounded sequence; report sample count, p50/p95 and warm/cold distinction. Query count is unavailable unless explicitly instrumented; do not infer it from request count.
- [ ] Missing routine parity, refused procedure execution, slow queries and unavailable controls remain findings, not acceptance passes. No source-production load testing, financial posting or data repair is authorized here.

## Reset and shutdown

Prefer new labeled records/deactivation to resetting. The disruptive **synthetic-only** fixture reset and exact stop/start commands are in [UAT_ENVIRONMENT_SETUP](UAT_ENVIRONMENT_SETUP.md). Never run `setup-staging.sh --reset`, drop `kkisi_staging`, or run a test script that loads unknown `.env.local` writers.
