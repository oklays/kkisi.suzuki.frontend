-- kosipa-command-ledger-production.sql — REVIEW-ONLY. NOT executed by engineering (kosipa-full-access FD-01 + FD-01b option b; TASK-105).
-- Nothing here may run before: owner sign-off, the cutover gates of 11 for the first feature, and an explicit authorisation.
--
-- DESIGN (FA-01.5, evidence: docs/superpowers/specs/kosipa-full-access/fa-01.5/FD-01b-ledger-isolation.md):
--   The command ledger lives in its OWN database on the SAME MariaDB server as the KOSIPA business database. cPanel grants privileges per
--   database only, which is exactly the granularity needed: the writer account gets SELECT + INSERT on the ledger database and nothing else
--   there, so it cannot UPDATE, DELETE, REPLACE, TRUNCATE, ALTER, DROP or create objects in it. The legacy PHP accounts are NOT added to it.
--   One connection (the writer's) writes both databases inside one InnoDB transaction, so a business row and its ledger row commit or roll back
--   together. No trigger is needed (the PRD's no-trigger rule for the business database is kept). Rehearsed with a database-level-only account
--   on the isolated synthetic stack (apps/web/tests/kosipa-foundation-db.test.mjs, "FD-01b" tests).
--   Residual: the cPanel OWNER account (and the hosting provider) can still change any database; tamper evidence beyond privileges is a later
--   decision (FD-01c: hash chain or off-host copy).
--
-- Replace before running (operator only):
--   __LEDGER_DB__     e.g. n1608204_kosipa_ledger   (new database, cPanel prefix; never the business, auth or console database)
--   __WRITER_USER__   the KOSIPA master writer account created for the feature (never the reader, a TOKO writer or a legacy PHP account)
--
-- STEP 0 (cPanel UI, operator): MySQL Databases -> Create database __LEDGER_DB__.
--   "Add User To Database": __WRITER_USER__ -> __LEDGER_DB__ with ONLY  SELECT, INSERT.  (No UPDATE, DELETE, CREATE, ALTER, DROP, INDEX,
--   TRIGGER, LOCK TABLES, EVENT, ROUTINE privileges, no ALL PRIVILEGES.) Do NOT add any legacy PHP / smartkkisi account to __LEDGER_DB__.
-- STEP 1 (phpMyAdmin as the cPanel owner): run the DDL below (identical to apps/web/db/kosipa/001_command_ledger.sql.tpl).

CREATE TABLE IF NOT EXISTS `__LEDGER_DB__`.`kosipa_command_ledger` (
  `id`                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `command`                 VARCHAR(64)     NOT NULL,
  `capability`              VARCHAR(48)     NOT NULL,
  `idempotency_key`         CHAR(36)        NOT NULL,
  `request_hash`            CHAR(64)        NOT NULL,
  `request_id`              VARCHAR(40)     NOT NULL,
  `actor_console_user_id`   INT UNSIGNED    NOT NULL,
  `actor_kosipa_user_id`    INT UNSIGNED    NOT NULL,
  `subject_type`            VARCHAR(32)     NOT NULL,
  `subject_ref`             VARCHAR(64)     NOT NULL,
  `from_state`              VARCHAR(32)     NULL,
  `to_state`                VARCHAR(32)     NULL,
  `maker_console_user_id`   INT UNSIGNED    NULL,
  `checker_console_user_id` INT UNSIGNED    NULL,
  `reason`                  VARCHAR(200)    NULL,
  `before_json`             JSON            NULL,
  `after_json`              JSON            NULL,
  `result_json`             JSON            NOT NULL,
  `outcome`                 ENUM('committed') NOT NULL DEFAULT 'committed',
  `created_at`              DATETIME(3)     NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_ledger_idem` (`actor_console_user_id`, `idempotency_key`),
  KEY `ix_ledger_subject` (`subject_type`, `subject_ref`, `created_at`),
  CONSTRAINT `ck_ledger_key`     CHECK (`idempotency_key` REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  CONSTRAINT `ck_ledger_hash`    CHECK (`request_hash` REGEXP '^[0-9a-f]{64}$'),
  CONSTRAINT `ck_ledger_command` CHECK (`command` REGEXP '^[a-z][a-z0-9_.]{2,63}$'),
  CONSTRAINT `ck_ledger_result`  CHECK (JSON_VALID(`result_json`) AND JSON_TYPE(`result_json`) = 'OBJECT')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- STEP 2 — verification as __WRITER_USER__ (read-only; paste the output into the cutover log). Expected:
--   SHOW GRANTS shows  GRANT SELECT, INSERT ON `__LEDGER_DB__`.*  and nothing else on __LEDGER_DB__;
--   the two statements below fail with error 1142 (command denied).
SHOW GRANTS FOR CURRENT_USER();
-- UPDATE `__LEDGER_DB__`.`kosipa_command_ledger` SET reason = 'x' WHERE id = 0;   -- expected: ERROR 1142
-- DELETE FROM `__LEDGER_DB__`.`kosipa_command_ledger` WHERE id = 0;                -- expected: ERROR 1142
-- STEP 3 — application setting: KOSIPA_LEDGER_DATABASE=__LEDGER_DB__ (the writer guard must be extended to allow it: FA-01.5 allows only the
--   synthetic ledger; production enablement is a deliberate code change reviewed with the cutover).

-- ROLLBACK (only with every KOSIPA write flag off): retire, never drop a ledger that holds rows.
-- RENAME TABLE `__LEDGER_DB__`.`kosipa_command_ledger` TO `__LEDGER_DB__`.`kosipa_command_ledger_retired`;
