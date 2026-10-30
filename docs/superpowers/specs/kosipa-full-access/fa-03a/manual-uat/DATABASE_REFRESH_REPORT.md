# Database refresh report — 30 October 2026

**Replication is NOT complete. `kkisi_staging` was not replaced.** The owner explicitly chose to await an authorized routine export when no additional export credential was confirmed. No production privilege, credential, schema or business-record change was performed. No push or production deployment occurred.

## Actual result

| Field | Verified result |
|---|---|
| Authoritative source | `n1608204_smart_kopkar`, `srv149.niagahoster.com`, MariaDB `10.11.19-MariaDB-cll-lve` |
| Transport | Existing SSH account on port 65002; strict ED25519 host verification, matching the project-pinned fingerprint |
| Source inventory | 283 InnoDB tables, 45 views, 10 procedures, 0 functions, 0 triggers, 0 events; latin1 / latin1_swedish_ci database default |
| Source estimated table/index size | 792,330,240 bytes from metadata; not an exact data-export size |
| Production data export | `mysqldump --single-transaction --quick --skip-lock-tables --no-tablespaces --skip-routines --triggers --events --hex-blob --default-character-set=utf8mb4`; one full table snapshot, no date filtering, no source table locks |
| Backup execution began | **2026-10-30 15:43:10.551 Asia/Jakarta** (`08:43:10.551Z`) |
| Export completed | **2026-10-30 15:44:46.104 Asia/Jakarta** (`08:44:46.104Z`) |
| Timestamp precision boundary | These are exact recorded process timestamps. The dump establishes its consistent snapshot during startup within that interval; its exact database transaction timestamp was not independently captured. No remainder-of-day/future freshness claim |
| Compressed artifact | 91,996,559 bytes; gzip verified; SQL completion marker present; outside repository |
| SHA-256 | `aefc68355186ccbde385c2c28cdaa46e107d656879b6893f481be75aa2047bc8` |
| Candidate restore | `kkisi-staging` container, loopback `127.0.0.1:3307`, schema `kkisi_refresh_20261030`; **candidate only, never activated** |
| Restored candidate | 283 tables, 45 views, **0 of 10 required procedures**; all 45 views pass `CHECK TABLE` |
| Existing target | `kkisi_staging`, existing 30 September-derived baseline; 283 tables, 45 views, 0 procedures/functions/triggers/events locally. Existing objects, data and consumer processes retained |
| Target engine | MariaDB `11.4.13-MariaDB-ubu2404`, persistent Docker volume `kkisi-staging-data`; event scheduler OFF |
| Previous staging backup | Full dump plus metadata/config/grant recovery files; independent scratch restore and count/aggregate comparison passed |
| Writable UAT | Existing isolated `kkisi-kosipa-fa01`, `127.0.0.1:3322/kkisi_kfa_synthetic`; synthetic data only |
| Realistic read UAT | SELECT-only overlay `kkisi_kosipa_read_uat` over existing `kkisi_staging`, synthetic identities and scrubbed credential views; **does not use the incomplete candidate** |

Private artifacts: `/Users/macbookprom2/KKISI-Backups/kosipa-20261030/` (directory 700, files 600, FileVault ON). `production-backup.json` explicitly records `schemaComplete: false`. The script's success text concerns the completed data export, not complete replication.

Discovery disclosure: an initial private access-note filter missed API-key field labels and over-displayed that note. File display stopped and subsequent configuration inspection emitted field names/target metadata only. No credential values were written to these reports or committed.

## Source-versus-candidate comparison

The pre-export source probe was at 15:34:21 WIB; the post-export probe was at **15:51:45.581611 WIB**. They are live observations outside the dump transaction and may differ from it.

| Measure | Source before | Candidate snapshot | Source after |
|---|---:|---:|---:|
| Members | 9,351 | 9,351 | 9,351 |
| Loans | 33,497 | 33,498 | 33,498 |
| Savings headers | 5,992 | 5,992 | 5,992 |
| Payroll batches | 138 | 138 | 138 |
| Recorded loan plan sum | 157073913268.42 | 157073965268.42 | 157073965268.42 |
| Recorded voluntary-savings mirror sum | 346012689.11 | 346012689.11 | 346012689.11 |

One loan and 52,000 in recorded plan value arrived between the pre-probe and snapshot. No attempt was made to “correct” that legitimate production change. The mirror sum is a stored-field comparison, not an official balance assertion. Candidate detail counts: loan lines 1,202,150; savings lines 114,916; payroll matrix 86,741. No person-level data was logged. These selected comparisons do not prove bit-for-bit or all-table row equality.

## Why activation is blocked

The existing backup account cannot see the procedures at all. Read-only inspection through the application account reveals 10 procedure names, but a complete `--routines` export fails with insufficient `SHOW CREATE PROCEDURE` privileges. No definition was invented or substituted from old source. The owner account had no confirmed passwordless database login; the available read-only UAPI routine listing returned no definitions. No credentials were guessed, no grants changed and no new API token created.

Two unusable transport attempts and the failed routine export were rejected, never restored or activated. A separate successful data-only export was then taken. Its candidate restore is useful validation evidence but cannot replace the complete target.

## Authorized operator: export the missing definitions

Use an **existing authorized account** that owns/can read the procedure definitions, or have the hosting administrator perform the export. Do not change production grants/credentials for this task. Store its client option file outside the web root, mode 600; never put a password in shell arguments or reports. cPanel documents using `mysqldump` for database backups and including routines/events/triggers: [official backup guidance](https://support.cpanel.net/hc/en-us/articles/360041291913-MySQL-backups-with-mysqldump).

Run in Bash on the source host, after verifying the option file's actual authorized path:

```bash
set -euo pipefail
umask 077
task_cnf="$HOME/.authorized-kosipa-export.cnf"
task_dir="$HOME/kkisi-backups/kosipa-routines-20261030"
mkdir -p "$task_dir"
chmod 700 "$task_dir"
test -r "$task_cnf"

# No data or business-table DDL in this supplemental routine export.
mysqldump --defaults-extra-file="$task_cnf" \
  --single-transaction --quick --skip-lock-tables --no-tablespaces \
  --no-data --no-create-info --routines --skip-triggers --skip-events \
  n1608204_smart_kopkar > "$task_dir/routines.sql"
chmod 600 "$task_dir/routines.sql"
test -s "$task_dir/routines.sql"
sha256sum "$task_dir/routines.sql" > "$task_dir/routines.sql.sha256"
```

Required observed procedures (re-inventory if production changes): `proc_hari_simpanan`, `proc_outstanding_pinjman`, `proc_simpanan`, `proc_simpanan_outstanding`, `proc_stock_opname`, `xproc_report_outstanding_cicilan`, `xproc_update_saldo_akhir`, `x_proc_create_matrix`, `x_proc_create_matrix_dtl`, `x_proc_create_shu`. Verify actual non-empty `CREATE PROCEDURE` bodies for all 10; a list of names or NULL definitions is insufficient. Record observation time, source version, SQL modes, routine charset/collation and definers without passwords or member data. Never execute the routines in production as an export “test”.

Transfer over the existing pinned SSH channel to the protected local backup directory; verify SHA-256 at both ends. The export must not enter Git. A hosting-admin/owner phpMyAdmin **structure export with routines enabled** is an alternative only if it yields all actual bodies and the object inventory is verified.

## Eventual complete refresh

Once authorized routine access/export is available, take a **new full data-and-object snapshot** using the same non-locking flags with `--routines` instead of `--skip-routines`. Do not call the 15:43 snapshot “latest” at that later time. If routines are supplied separately, verify their schema version and repeat a current full table/view export; record both observation times and the consistency boundary. Compare fresh inventories and selected aggregates, restore into a new isolated candidate, verify every routine body/dependency, and rehearse recovery before activation.

Follow [DATABASE_RESTORE_VALIDATION](DATABASE_RESTORE_VALIDATION.md) and [DATABASE_ROLLBACK_PLAN](DATABASE_ROLLBACK_PLAN.md). Activation requires complete object verification and a controlled local-consumer maintenance window. MariaDB has no atomic database rename. Existing objects must never disappear because an incomplete candidate has fewer routines or views.

## Retention and isolation

Keep the current baseline and its verified backup until the owner accepts the complete replacement and recovery procedure. Failed data-containing export artifacts may be removed after recording their failure and verifying the successful data export; never use them for restore. Review raw backup retention by **6 November 2026**, then remove extra copies unless the owner extends retention. This is an encrypted-local-storage retention review, not a guarantee of physical secure erase on APFS/SSD. No cloud upload or external delivery was performed. Local app UAT accounts cannot write the protected candidate; only the local administrator retains maintenance rights.
