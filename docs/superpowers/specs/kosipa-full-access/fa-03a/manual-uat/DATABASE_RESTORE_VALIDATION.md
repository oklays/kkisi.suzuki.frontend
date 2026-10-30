# Restore and UAT validation evidence

Date: 30 October 2026. **Candidate validation is partial; replication activation remains blocked on 10 routine bodies. Owner manual acceptance is pending.**

## Data and schema checks executed

| Check | Actual evidence | Status |
|---|---|---|
| Mac encryption/storage | `fdesetup status`: FileVault ON; disk checked before backups/imports; no Docker prune or unrelated deletion | Pass |
| Existing staging backup | `kkisi_staging-before.sql.gz`, 90,114,940 bytes, SHA-256 `39a878231ca992d9d665b14497eacb88f0001c6c5e995f24de1e3b7f1da28bd5`; gzip test passes | Pass |
| Recovery rehearsal | Restored that backup into `kkisi_recovery_check_20261030`, compared object count, nine table counts and two aggregate sums to pre-backup metadata; dropped only this newly created scratch schema after verification | Pass |
| Candidate data export | Pinned SSH stream; gzip/footer/size/hash checks; full data, no date-column filtering | Pass for data/view export only |
| Candidate object inventory | 283 InnoDB tables, 45 views, 0 local procedures; source has 10 procedures | **Incomplete; no activation** |
| View compatibility | `CHECK TABLE` on all 45 candidate views returns OK | Pass |
| Index structure | Candidate metadata records 287 indexes / 291 index columns; no performance index or financial correction added | Recorded, not an independent source-index equality proof |
| Foreign keys/dependencies | Candidate exported FK metadata empty; source cross-schema FK probe empty. Routine dependencies cannot be checked without their definitions | Partial |
| Counts and aggregates | Source-after/candidate member, loan, savings and payroll header counts plus recorded loan-plan/savings-mirror sums match; see refresh report | Selected comparisons pass; not bit-for-bit verification |
| Existing baseline preservation | Existing `kkisi_staging` object inventory, nine table counts and both aggregates match the pre-preparation record; no DDL/DML was issued to it | Pass |
| Raw candidate protection | No application writer granted access; UAT browser points to existing baseline, not candidate; root retained for maintenance only; event scheduler OFF | Pass |
| Read overlay | Nine synthetic identity tables; remaining objects are SELECT-only views of `kkisi_staging`; 24 credential-bearing view columns verified NULL; reader UPDATE refused for baseline and overlay | Pass |
| Five-master schema provenance | All 35 columns of the five native master tables match the new production candidate's names/types/nullability/defaults/extras against the synthetic fixture | Pass |
| Production changes | Read-only metadata, SELECTs and non-locking export only; no privilege/credential/schema/business mutation or deployment | Zero performed |

Source and destination defaults are latin1/latin1_swedish_ci where the database requires it; exported per-table charsets/collations remain in the dump. Restore adjusts only schema-qualified definition references and production DEFINER clauses to local `CURRENT_USER`. INSERT data lines are not rewritten. No production accounts are imported; no routines/events are executed. The original export remains unmodified. This is not a byte-identical environment copy.

## Executed application checks

| Command (repository root unless noted) | Result |
|---|---|
| `cd apps/web && node tests/kosipa-master-browser.mjs` | E1–E9 pass: synthetic roles, two-administrator grants, all five masters, duplicate submit, stale edit, fence and revocation, ledger/access-audit correlation |
| `KOSIPA_FA01=1 node --experimental-strip-types --test --test-concurrency=1 apps/web/tests/kosipa-legacy-runtime.test.mjs apps/web/tests/kosipa-foundation-db.test.mjs apps/web/tests/kosipa-document-number-db.test.mjs` | **28/28 pass, 0 skipped**; dedicated synthetic server stopped during DB run |
| `cd apps/web && node --experimental-strip-types --test --test-concurrency=1 tests/kosipa-presentation.test.mjs tests/kosipa-directory.test.mjs tests/kosipa-master-http.test.mjs tests/console-shell.test.mjs tests/auth-route-guard-scan.test.mjs` | **43/43 pass, 0 skipped** |
| `node --experimental-strip-types --test apps/web/tests/kosipa-presentation.test.mjs` | **6/6 pass**; new read-data banner regression observed failing before implementation |
| Changed-file ESLint | Passed for launcher/setup, KOSIPA layout/presentation and presentation tests |
| `pnpm typecheck` | Domain/application/web passed |
| `node integration/kosipa-full-access/app-server.mjs build` | Optimized production build passed in isolated `.next-kfa01`; existing instrumentation Edge `process.exit` advisory remains |
| Local read browser smoke | Six protected page routes return 200, correct production-copy/read-only banner, no master create form; authenticated mutation returns 503; **7 checks passed** |
| Final running-server smoke | Both `/health/ready` endpoints return 200; write operator sees the create form and viewer does not; synthetic/read banners stay distinct |

The read smoke uses synthetic authentication over existing `kkisi_staging`, not real passwords. A separate executed check passed private member search with no personal query in the URL, then clicked `Muat pinjaman lebih lama` and verified a different rendered first row through the private POST cursor. No member values were printed or screenshot. The initial pagination probe incorrectly expected a public link/cursor URL; correcting it to the existing private button contract passed. Query-count instrumentation and aggressive/load testing were not performed. Financial posting and member-mutation tests were intentionally not enabled.

Private evidence/log locations: `.local/kosipa-manual-uat/`, `/tmp/kosipa-manual-uat-browser.log`, `/tmp/kosipa-manual-uat-db.log`, `/tmp/kosipa-uat-focused-tests.log`, `/tmp/kosipa-read-smoke-final.log`, `/tmp/kosipa-uat-build.log`. Raw backup metadata and source aggregate probes are in the protected backup directory. Logs contain synthetic accounts, routes, aggregate numbers and timings, not member records or passwords.

## Read timings on the existing baseline

Five sequential local authenticated HTTP samples per list, including complete response-body receipt. Small warm-ish samples; not a production SLO or a source-production load test. Query count: **not instrumented**.

| Route | p50 | p95 | n |
|---|---:|---:|---:|
| Master lokasi list | 33 ms | 70 ms | 5 |
| Loan list | 25 ms | 51 ms | 5 |
| Payroll list | 23 ms | 32 ms | 5 |

Separate first navigations: dashboard 97 ms, lokasi 65 ms, member search entry 61 ms, loans 409 ms, payroll 386 ms, **report center 18,783 ms**. The report-center latency is a concrete slow-read finding; it was not hidden by the faster warm list samples or “fixed” with raw-baseline indexes. Current production routine/view parity remains unresolved, so synthetic/read tests do not close production financial readiness.

## Failures and reruns

- PHP subprocess execution restrictions initially produced an unusable empty export. The empty artifact was rejected and never restored. Moving credential-file preparation into PHP and invoking the dump in the SSH shell resolved transport execution; production account privileges stayed unchanged.
- The full routine export failed on actual procedure-definition permissions. This remains an **external gate**, not a passing test. Data-only export and candidate restore succeeded separately.
- Read-overlay console-schema setup initially sent CLI `DELIMITER` directives through mysql2. Reusing the MariaDB CLI for the existing template completed its triggers; explicit resume preserved the already-created overlay objects.
- The first read-browser probe used a URL pattern that excluded the normal `?entry=login` query. After correcting the probe's pathname check, it identified missing synthetic read-menu fixtures. Adding the four local read-menu rows completed the intended readonly persona; the rerun passed all seven checks. No production/baseline permissions or rows changed.
- Complete source-routine restore, procedure dependency validation, cutover, production acceptance and owner manual checklist are **not passed**. They await the authorized export and subsequent full snapshot.

The shared-build launcher also refused a build while either UAT profile was active, as expected. This was a guard check, not a failed build. Both dedicated servers remain running after final verification.
