# FA-03A — Production readiness gates and operator instructions

Date: 30 October 2026. **Nothing in this document has been executed against production or real-data staging.** Engineering has no production access. Every step is for the authorized operator, from reviewed SQL, with a dedicated least-privilege account per feature, and needs separate explicit authorization. Cutover gates are in [11](../11_CUTOVER_AND_ROLLBACK_PLAN.md).

## 1. Gate status

| Gate | What | Status 30 Oct 2026 | Blocks |
|---|---|---|---|
| B1 | Production view and procedure definitions | **Open.** Tool rehearsed (`kosipa-b1-export-db.test.mjs` passing). Not run in production | any financial parity; payroll; loans |
| B3 | Production triggers, indexes, `sql_mode`, EVENTs, host crontab | **Open** | FD-22; numbering index decision |
| B5/B8 | Connection budget for the KOSIPA writer | **Open: does not fit as configured** (§3) | every KOSIPA write in production |
| B6 | Production console store + grant table | **Open.** Scripts ready and statically validated (§4) | grants, therefore every KOSIPA write |
| FD-01b | Ledger database in production | **Open.** Script validated statically (§4) | every KOSIPA write |
| FD-01c | Tamper evidence against the cPanel owner | **Open.** Candidate controls in §5; neither approved nor built | production audit sign-off |
| FD-03 / gate 5 | smartkkisi admin panel does not write the five masters | **Open** (operator confirmation) | masters cutover |
| FD-22 | Ownership guard (triggers) | **PROPOSED**, proven on synthetic only | any `m_anggota` mutation |
| FD-23 | Numbering strategy per family | **PROPOSED** (legacy basis implemented) | first document command |
| Writer guard | `validateKosipaMasterWriteConfig` refuses every non-synthetic target | **By design.** A reviewed code change at cutover | production enablement |
| G-01 | Production source = local copy (hashes) | **Open** | trust in legacy-runtime results |

## 2. B1 — export production definitions

The full procedure is in [fa-01.5/B1-operator-instructions.md](../fa-01.5/B1-operator-instructions.md). The interrupted FA-03A record reports `kosipa-b1-export-db.test.mjs` 1/1 on the synthetic stack; continuation execution evidence belongs in [CHECKPOINT_REPORT](CHECKPOINT_REPORT.md). Summary for the operator:

1. A **read-only** account with `SELECT`, `SHOW VIEW` and `TRIGGER` on the KOSIPA database, plus `SHOW CREATE ROUTINE` (MariaDB ≥ 11.3) or `SELECT` on `mysql.proc`.
2. An option file `~/kosipa-b1.cnf` (mode 600). The password never goes on the command line.
3. `apps/web/scripts/kosipa-b1-schema-export.sh` writes definitions only: tables, views, routines, triggers, indexes, server variables. `DEFINER` and `AUTO_INCREMENT` are stripped.
4. Hand the output file to engineering. Then also: re-run the legacy-runtime structure fixture against it (`discover-structure.mjs` reads structure from the staging copy today).
5. **New in FA-03A:** add `SHOW EVENTS` output and `crontab -l` of the hosting account (both read-only) to settle B3 "background writers".

## 3. B5/B8 — connection budget

**Finding (FA-03A).** The production pool registry (`apps/web/src/infrastructure/db/capacity-plan.ts` `POOLS`) and the startup budget check (`startup-check.ts` `enabledWriters`) do **not** include the KOSIPA writer. Today that is correct: the writer can only reach the synthetic database. At cutover it must be added. The existing pools already reach the ceiling:

| Pool | Limit |
|---|---|
| reader | 3 |
| auth | 2 |
| console | 1 |
| pos | 2 |
| register | 1 |
| inventory | 1 |
| products | 1 |
| returns | 1 |
| **Sum (all TOKO writers on)** | **12 = `MAX_CONNECTION_BUDGET`** |
| KOSIPA writer (NFR-102) | +1 or +2 → **exceeds** |

**Operator evidence needed** (read-only):

```sql
-- as each application account (shows that account's own limit; 0 = server-wide max_user_connections applies)
SELECT CURRENT_USER(), @@max_user_connections, @@max_connections;
-- legacy PHP peak since the last server restart (if the hosting refuses SHOW GLOBAL STATUS, ask the provider for the figure)
SHOW GLOBAL STATUS LIKE 'Max_used_connections';
SHOW GLOBAL STATUS LIKE 'Uptime';
```

Plus the hosting provider's written answer: is `max_user_connections` counted **per account** or **hosting-wide**?

**Engineering then:**

1. Feeds the answers to `assessCapacityEvidence` (`capacity-plan.ts`).
2. Chooses one of:
   - (a) KOSIPA writer limit 1 with one TOKO writer pool reduced;
   - (b) KOSIPA writes only while the matching TOKO writer is disabled;
   - (c) a raised ceiling, if per-account counting is confirmed.
3. Adds `kosipa` to `POOLS` and to `enabledWriters`, so that the startup guard enforces the result.

## 4. B6 and FD-01b — console store, grant table and ledger database

### Static validation (executed)

`apps/web/tests/kosipa-production-sql-static-db.test.mjs`, **2/2 recorded in the interrupted checkpoint; consult [CHECKPOINT_REPORT](CHECKPOINT_REPORT.md) for continuation reruns**. It applies the review-only scripts to scratch databases in the isolated FA container, with placeholders replaced, and proves three things:

- **DDL only.** Each script contains only `CREATE TABLE IF NOT EXISTS`, `CREATE TRIGGER IF NOT EXISTS` and read-only checks. It has no data statement, `DROP`, `USE` or broad `GRANT`, and every object is in the placeholder database.
- **Same structure as tested.** The resulting structure equals what the tested templates produce: comment-free `SHOW CREATE TABLE`, and triggers compared by name, timing, event and body MD5.
  - ledger script = `db/kosipa/001`;
  - console script + grant script = `db/console/001` + `004`, with 6 triggers.
- **Checks pass.** Every verification query in the synthetic rehearsal returns `ok = 1`, and the scratch grant table refuses DELETE. This does not verify production privileges or objects.

### Operator steps (in order; each needs explicit authorization)

1. **Console store** (if not already live): `docs/migration/sql/console-store-production.sql`, steps 0–3, unchanged.
2. **Grant table (B6, new):** `docs/migration/sql/kosipa-grants-production.sql`:
   1. Preconditions: step 1 verified, `KOSIPA_WRITE_GRANTS_ENABLED` unset.
   2. Run the DDL as the cPanel owner in phpMyAdmin. **If `CREATE TRIGGER` is refused: stop.** Without the triggers the grant table must not be enabled.
   3. Run the verification query: 6 rows, all `ok = 1`. Paste the output into the cutover log.
   4. After UAT only: `KOSIPA_WRITE_GRANTS_ENABLED=true`, `KOSIPA_GRANT_ADMIN_USER_IDS=<at least two console user ids>`.
3. **Ledger database (FD-01b):** `docs/migration/sql/kosipa-command-ledger-production.sql`:
   1. Create the database in cPanel. Add **only** the dedicated KOSIPA writer with `SELECT, INSERT` for application use; owner DDL remains a separately controlled operator privilege. Confirm both databases are on the same server and business/ledger tables use InnoDB.
   2. Run the DDL.
   3. Verify as the writer: `SHOW GRANTS`; UPDATE and DELETE fail with 1142.
4. **Numbering registry:** only when the first document command is approved (FD-23). `apps/web/db/kosipa/005_document_number_registry.sql.tpl` goes into the same ledger database; no new grant is needed.
5. **Rollback** for every step: application flag off first, then retire (`RENAME … _retired`). Never drop tables that hold rows.

## 5. FD-01c — owner bypass and the pending tamper-evidence decision

| Control | Holds against the application account | Holds against the cPanel owner / phpMyAdmin |
|---|---|---|
| Ledger append-only (`SELECT, INSERT`) | yes (1142, tested) | **no**: the owner has all privileges |
| Grant-table and audit triggers | yes (tested) | **no**: the owner can drop the triggers |
| Column privileges on business tables | yes | **no** |
| FD-22 ownership guard | yes (tested, incl. root DML) | **no**: the owner can drop the triggers or edit `kosipa_write_owner` |
| Two-administrator approval (CHECKs) | yes for a stolen session | **no**: a forged well-formed row naming two real administrators is possible with the console account password or as the owner |

**Proposed controls for owner/operator decision before production audit sign-off.** FD-01c remains open: choose and approve hash chaining with an independently protected anchor, off-host append-only copies, or an equivalent reviewed design. The following candidate is neither approved nor implemented:

1. **Hash chain.** Add a `prev_hash`/`row_hash` pair to `kosipa_command_ledger`, `console_audit_event`, `console_kosipa_grant` decisions and `kosipa_write_owner` changes: SHA-256 over the canonical row + the previous hash, computed by the application. Editing or deleting any row breaks the chain from that point.
2. **Off-host anchor.** A daily job outside cPanel (the DEV host) reads the latest chain head of each table read-only and stores it with a timestamp off the hosting account. Without an anchor, the owner could recompute the whole chain.
3. **Reconciliation report.** These are findings:
   - a grant without request, approve and revoke audit rows;
   - a ledger row without a console audit row with the same `request_id`;
   - a business row changed natively without a ledger row;
   - a missing guard trigger (`information_schema.TRIGGERS` count).
4. **Operational rules.**
   - Named operator accounts for phpMyAdmin where the hosting allows it.
   - The cPanel owner password held by the owner, not by engineering.
   - Every owner session recorded in the cutover log.

## 6. Cutover order (unchanged gates 1–8 of [11](../11_CUTOVER_AND_ROLLBACK_PLAN.md), with FA-03A additions)

B1/B3 evidence → B5/B8 decision and code → console store + grant table (B6) → ledger database (FD-01b) → writer guard extension (code review) → per feature, in this order:

1. fence;
2. drain;
3. if FD-22 is approved, owner `NATIVE`; otherwise verify the complete alternative exclusion controls;
4. flag on;
5. smoke test.

FD-01c needs an approved control and evidence before production audit sign-off; this plan requires it before membership activation and the first **financial** command. Synthetic append-only tests do not close it. None of the instructions above authorizes production execution.
