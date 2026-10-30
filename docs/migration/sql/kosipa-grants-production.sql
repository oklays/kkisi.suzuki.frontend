-- kosipa-grants-production.sql — REVIEW-ONLY. NOT executed by engineering (FA-03A, gate B6). Adds the KOSIPA write-capability grant table
-- (two-administrator confirmation; FD-16, TASK-110) to the EXISTING production console store of console-store-production.sql.
-- Creating tables or triggers in production needs a separate, explicit authorisation and is done by the operator.
-- The DDL below is byte-for-byte apps/web/db/console/004_kosipa_grants.sql with the database name replaced
-- (apps/web/tests/kosipa-production-sql-static-db.test.mjs proves it and applies it to a scratch database).
--
-- Replace before running (operator only):
--   __CONSOLE_DB__   the production console database of console-store-production.sql (e.g. n1608204_kkisi_console)
--   __CONSOLE_USER__ its application account (e.g. n1608204_nxcon)
--
-- PRECONDITIONS: console-store-production.sql applied and verified (4 triggers present). KOSIPA_WRITE_GRANTS_ENABLED stays unset.
-- STEP 0 (cPanel UI): nothing to create; __CONSOLE_USER__ keeps ONLY SELECT, INSERT, UPDATE on __CONSOLE_DB__ (no DELETE, no DDL).
--   cPanel cannot grant column-level UPDATE: the account may UPDATE any column of the grant table. The trigger below is what keeps
--   requester, beneficiary, capability, reason and expiry immutable and allows only pending->active|rejected|expired and active->revoked;
--   the CHECKs keep a second, different administrator on every approval. What cPanel CANNOT prevent: an attacker holding the console
--   account password could write a well-formed approval naming two real administrators. Tamper evidence for that case is the console audit
--   trail (every request/approve/revoke has a console_audit_event row; a grant without matching audit rows is a finding) — see
--   fa-03a/PRODUCTION_READINESS_GATES.md (FD-01c).
-- STEP 1 (phpMyAdmin as the cPanel owner account): run the DDL below. If CREATE TRIGGER is refused, STOP and report: without the triggers
--   the grant table must not be enabled (KOSIPA_WRITE_GRANTS_ENABLED stays unset; native writes then have no capability source).
-- STEP 2: run the verification query at the end; every row must return ok = 1. Paste the output into the cutover log.
-- STEP 3 (application): KOSIPA_WRITE_GRANTS_ENABLED=true and KOSIPA_GRANT_ADMIN_USER_IDS=<two or more console user ids> only after UAT.
--
-- ROLLBACK: application first (unset KOSIPA_WRITE_GRANTS_ENABLED, restart: no write capability is granted and the table is not read).
--   Schema (grant history is evidence: retire, never drop):
--     DROP TRIGGER IF EXISTS `__CONSOLE_DB__`.`trg_console_grant_no_delete`; DROP TRIGGER IF EXISTS `__CONSOLE_DB__`.`trg_console_grant_transitions`;
--     RENAME TABLE `__CONSOLE_DB__`.`console_kosipa_grant` TO `__CONSOLE_DB__`.`console_kosipa_grant_retired`;

CREATE TABLE IF NOT EXISTS `__CONSOLE_DB__`.`console_kosipa_grant` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `console_user_id` INT UNSIGNED    NOT NULL COMMENT 'beneficiary; business db: db_users.id (by value, no FK)',
  `capability`      VARCHAR(48)     NOT NULL COMMENT 'one KOSIPA write capability (packages/domain/src/console/capabilities.ts)',
  `status`          ENUM('pending','active','rejected','expired','revoked') NOT NULL DEFAULT 'pending',
  `requested_by`    INT UNSIGNED    NOT NULL COMMENT 'first administrator',
  `requested_at`    DATETIME        NOT NULL,
  `grant_reason`    VARCHAR(200)    NOT NULL,
  `expires_at`      DATETIME        NOT NULL COMMENT 'a pending request cannot be approved after this instant',
  `decided_by`      INT UNSIGNED    NULL COMMENT 'second administrator (approve) or any administrator (reject)',
  `decided_at`      DATETIME        NULL,
  `decision_note`   VARCHAR(200)    NULL,
  `revoked_by`      INT UNSIGNED    NULL,
  `revoked_at`      DATETIME        NULL,
  `revoke_reason`   VARCHAR(200)    NULL,
  `open_key`        VARCHAR(80) AS (IF(`status` IN ('pending','active'), CONCAT(`console_user_id`, ':', `capability`), NULL)) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_grant_open` (`open_key`),
  KEY `ix_grant_user` (`console_user_id`, `status`),
  CONSTRAINT `ck_grant_not_self`      CHECK (`requested_by` <> `console_user_id`),
  CONSTRAINT `ck_grant_second_admin`  CHECK (`status` <> 'active' OR (`decided_by` IS NOT NULL AND `decided_by` <> `requested_by` AND `decided_by` <> `console_user_id`)),
  CONSTRAINT `ck_grant_capability`    CHECK (`capability` REGEXP '^kosipa\\.[a-z-]+\\.[a-z]+$'),
  CONSTRAINT `ck_grant_expiry`        CHECK (`expires_at` > `requested_at`),
  CONSTRAINT `ck_grant_shape`         CHECK (
       (`status` IN ('pending','expired') AND `decided_by` IS NULL AND `decided_at` IS NULL AND `revoked_by` IS NULL AND `revoked_at` IS NULL)
    OR (`status` IN ('active','rejected') AND `decided_by` IS NOT NULL AND `decided_at` IS NOT NULL AND `revoked_by` IS NULL AND `revoked_at` IS NULL)
    OR (`status` = 'revoked' AND `decided_by` IS NOT NULL AND `revoked_by` IS NOT NULL AND `revoked_at` IS NOT NULL AND `revoke_reason` IS NOT NULL))
) ENGINE=InnoDB;

DELIMITER //
CREATE TRIGGER IF NOT EXISTS `__CONSOLE_DB__`.`trg_console_grant_no_delete` BEFORE DELETE ON `__CONSOLE_DB__`.`console_kosipa_grant`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'KOSIPA grants are never deleted'; END//
CREATE TRIGGER IF NOT EXISTS `__CONSOLE_DB__`.`trg_console_grant_transitions` BEFORE UPDATE ON `__CONSOLE_DB__`.`console_kosipa_grant`
FOR EACH ROW BEGIN
  IF NEW.`console_user_id` <> OLD.`console_user_id` OR NEW.`capability` <> OLD.`capability` OR NEW.`requested_by` <> OLD.`requested_by`
     OR NEW.`requested_at` <> OLD.`requested_at` OR NEW.`grant_reason` <> OLD.`grant_reason` OR NEW.`expires_at` <> OLD.`expires_at`
     OR NOT ((OLD.`status` = 'pending' AND NEW.`status` IN ('active','rejected','expired')) OR (OLD.`status` = 'active' AND NEW.`status` = 'revoked'))
     OR (OLD.`status` = 'active' AND (NOT (NEW.`decided_by` <=> OLD.`decided_by`) OR NOT (NEW.`decided_at` <=> OLD.`decided_at`))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'KOSIPA grants move only pending->active|rejected|expired and active->revoked';
  END IF;
  IF OLD.`status` = 'pending' AND NEW.`status` = 'active' AND OLD.`expires_at` <= UTC_TIMESTAMP() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'expired KOSIPA grant requests cannot be approved';
  END IF;
END//
DELIMITER ;

-- VERIFICATION (read-only)
SELECT 'grant table present' AS check_name, COUNT(*) = 1 AS ok FROM information_schema.tables WHERE table_schema = '__CONSOLE_DB__' AND table_name = 'console_kosipa_grant'
UNION ALL SELECT 'six triggers in the console store', COUNT(*) = 6 FROM information_schema.triggers WHERE trigger_schema = '__CONSOLE_DB__'
UNION ALL SELECT 'grant triggers: no delete + transitions', COUNT(*) = 2 FROM information_schema.triggers WHERE trigger_schema = '__CONSOLE_DB__' AND event_object_table = 'console_kosipa_grant'
UNION ALL SELECT 'one open request or grant per user and capability', COUNT(*) = 1 FROM information_schema.statistics WHERE table_schema = '__CONSOLE_DB__' AND table_name = 'console_kosipa_grant' AND index_name = 'ux_grant_open' AND non_unique = 0
UNION ALL SELECT 'five CHECK constraints', COUNT(*) = 5 FROM information_schema.check_constraints WHERE constraint_schema = '__CONSOLE_DB__' AND table_name = 'console_kosipa_grant'
UNION ALL SELECT 'no DELETE/DDL for the application account', COUNT(*) = 0 FROM information_schema.schema_privileges WHERE table_schema = '__CONSOLE_DB__' AND grantee LIKE '%__CONSOLE_USER__%' AND privilege_type NOT IN ('SELECT', 'INSERT', 'UPDATE');
