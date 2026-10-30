# FD-01b — An append-only command ledger under the cPanel privilege model

Date: 30 October 2026 (FA-01.5). Decision applied: **option (b)**, a separate ledger database on the same MariaDB server. It is built and tested on the isolated synthetic stack only. Nothing was changed in production.

## Problem

In FA-01 the ledger table sat inside the business database. Locally it was append-only by **table-level** grants (writer: SELECT, INSERT).

Production runs on Niagahoster cPanel, where a database user can only be given privileges **per database**. The repo already records this (`docs/migration/sql/console-store-production.sql`: "cPanel cannot express the stricter local column grants"). A master writer needs UPDATE on the business database. So with the ledger in that same database, the writer could also UPDATE or DELETE ledger rows.

## What was verified

| Constraint | Evidence | Result |
|---|---|---|
| Privileges are per database on cPanel, and the operator can choose which ones | `console-store-production.sql` STEP 0 ("Add user to database with ONLY: SELECT, INSERT, UPDATE") | Met: **SELECT + INSERT only** can be chosen for one database |
| One user can be added to several databases | Same cPanel model; the console store is already a separate database used by the same application | Met |
| Both databases are on the same server | All databases of one cPanel account are on its MariaDB host. The startup check pins `@@hostname` and `@@port` per connection (`deployment-guard.ts`) | Met. The operator confirms by running `SELECT @@hostname` as the writer in both databases |
| One transaction covers both databases | InnoDB transactions span databases on one server and one connection. Tested: a failure injected **after** the ledger insert rolls back both the business row and the ledger row | Met (test `FD-01b: one transaction spans…`) |
| The application account cannot alter or delete committed history | Account `kosipa_cpanel_w`, with exactly what cPanel can express (`SELECT, INSERT, UPDATE ON business.*`, `SELECT, INSERT ON ledger.*`), is refused all of: UPDATE, DELETE, TRUNCATE, ALTER, DROP, RENAME, CREATE TABLE, CREATE TRIGGER, REPLACE, `INSERT … ON DUPLICATE KEY UPDATE` | Met (test `FD-01b: with database-level grants only…`; errors 1142/1044) |
| Idempotency across databases | A replay with the same key returns the stored result using the cPanel-model account | Met |
| The legacy PHP application cannot touch the ledger | Its accounts are not added to the ledger database (production SQL STEP 0) | Operator step; check with `SHOW GRANTS` |

The application-side safeguards:

- The writer refuses to start without `KOSIPA_LEDGER_DATABASE`.
- That name must be on an allow-list and must differ from the business database (`prisma-kosipa-master-write.ts`).
- Every ledger statement is fully qualified (`kosipa-unit-of-work.ts`, `ledgerTable`).
- The application reader has **no** access to the ledger database. This is tested.

## What is still not protected (honest limits)

- **Privileged accounts:** the cPanel owner account, phpMyAdmin as owner, and the hosting provider can still modify the ledger. Privileges cannot stop the account that owns the databases.
  - If tamper *evidence* against those is required, choose **FD-01c**: either a per-row hash chain (needs serialized inserts) or a periodic off-host copy of new ledger rows plus SHA-256. This is an owner decision. It is not needed for application-level append-only.
- **Ledger history:** it is only as durable as the server's backups (the same as the business data).

## Minimal production steps (operator, after authorization)

`docs/migration/sql/kosipa-command-ledger-production.sql`: create the database, add the writer with SELECT + INSERT only, run the DDL, then verify with `SHOW GRANTS` and the two expected 1142 refusals.

The writer guard's allow-list must then be extended deliberately for the production ledger name. That code change belongs to the cutover review.
