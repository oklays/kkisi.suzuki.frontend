-- console-store-production.sql — REVIEW-ONLY. NOT executed by engineering. Owner decision 16 Oct 2026: Option B
-- (dedicated console database). This file prepares production; creating databases, accounts, grants or running DDL in
-- production needs a separate, explicit authorisation and is done by the operator.
--
-- Replace before running (operator only):
--   __CONSOLE_DB__   e.g. n1608204_kkisi_console   (cPanel prefixes the name; must NOT be the business or auth database)
--   __CONSOLE_USER__ e.g. n1608204_nxcon            (new account; never the reader, auth or a writer account)
--
-- STEP 0 (cPanel UI, operator): MySQL Databases -> Create database __CONSOLE_DB__; create user __CONSOLE_USER__ with a
--   generated password; "Add user to database" with ONLY: SELECT, INSERT, UPDATE  (no DELETE, no CREATE/ALTER/DROP/INDEX,
--   no TRIGGER, no ALL PRIVILEGES). cPanel cannot express the stricter local column grants; the triggers below enforce
--   append-only audit and revoke-only links regardless of grants.
-- STEP 1 (phpMyAdmin as the cPanel owner account, which can run DDL on __CONSOLE_DB__): run the DDL below.
--   Trigger creation may be refused on shared hosting (binary logging / missing TRIGGER privilege). If so, STOP: do not
--   enable the console store; report back (the application-account grants would then allow UPDATE on audit rows).
-- STEP 2: run the verification queries at the end; every row must return ok = 1.
-- STEP 3 (DEV host): set DATABASE_URL_CONSOLE (connection_limit=1&max_idle_connection_lifetime=10, through the same tunnel),
--   CONSOLE_DB_TRANSPORT / CONSOLE_DB_HOST / CONSOLE_DB_PORT / CONSOLE_DB_NAME / CONSOLE_DB_SERVER_HOSTNAME /
--   CONSOLE_DB_SERVER_PORT (as for AUTH_DB_*), and raise LEGACY_DB_CONNECTION_BUDGET from 11 to 12 (the ceiling).
--   The startup guard refuses to start if the budget would be exceeded. Then KOSIPA_READ_ENABLED=true only after UAT.
--
-- ROLLBACK (data is kept unless the owner decides otherwise):
--   application: unset DATABASE_URL_CONSOLE and KOSIPA_READ_ENABLED, restore LEGACY_DB_CONNECTION_BUDGET=11, restart.
--   schema (only if the owner decides to discard the audit trail):
--     DROP TRIGGER IF EXISTS `__CONSOLE_DB__`.`trg_console_link_revoke_only`; DROP TRIGGER IF EXISTS `__CONSOLE_DB__`.`trg_console_link_no_delete`;
--     DROP TRIGGER IF EXISTS `__CONSOLE_DB__`.`trg_console_audit_no_delete`;  DROP TRIGGER IF EXISTS `__CONSOLE_DB__`.`trg_console_audit_no_update`;
--     DROP TABLE IF EXISTS `__CONSOLE_DB__`.`console_identity_link`; DROP TABLE IF EXISTS `__CONSOLE_DB__`.`console_audit_event`;
--     then delete the database and user in cPanel.
--
-- Schema evolution: v1 = 2 tables + 4 triggers. Adding a linked system later is `ALTER TABLE ... MODIFY system ENUM(...)`
-- in a new reviewed file; never edit rows by hand (links are revoked, audit rows are never changed).

CREATE TABLE IF NOT EXISTS `__CONSOLE_DB__`.`console_identity_link` (
  `id`                  BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `console_user_id`     INT UNSIGNED     NOT NULL COMMENT 'business db: db_users.id (by value, no FK)',
  `system`              ENUM('kosipa')   NOT NULL COMMENT 'linked application; extended by ALTER when another system is approved',
  `external_user_id`    INT UNSIGNED     NOT NULL COMMENT 'kosipa: ref_users.id_ref_user (by value, no FK)',
  `status`              ENUM('active','revoked') NOT NULL DEFAULT 'active',
  `linked_by`           INT UNSIGNED     NOT NULL COMMENT 'console user id of the administrator',
  `linked_at`           DATETIME         NOT NULL,
  `revoked_by`          INT UNSIGNED     NULL,
  `revoked_at`          DATETIME         NULL,
  `revoke_reason`       VARCHAR(200)     NULL,
  `active_console_key`  VARCHAR(40) AS (IF(`status` = 'active', CONCAT(`system`, ':', `console_user_id`), NULL)) STORED,
  `active_external_key` VARCHAR(40) AS (IF(`status` = 'active', CONCAT(`system`, ':', `external_user_id`), NULL)) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_link_active_console`  (`active_console_key`),
  UNIQUE KEY `ux_link_active_external` (`active_external_key`),
  KEY `ix_link_console_user` (`console_user_id`, `status`),
  CONSTRAINT `ck_link_not_self`  CHECK (`linked_by` <> `console_user_id`),
  CONSTRAINT `ck_link_revocation` CHECK ((`status` = 'active'  AND `revoked_at` IS NULL AND `revoked_by` IS NULL AND `revoke_reason` IS NULL)
                                     OR (`status` = 'revoked' AND `revoked_at` IS NOT NULL AND `revoked_by` IS NOT NULL AND `revoke_reason` IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `__CONSOLE_DB__`.`console_audit_event` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `occurred_at`   DATETIME(3)     NOT NULL,
  `actor_user_id` INT UNSIGNED    NOT NULL COMMENT 'console user id',
  `action`        VARCHAR(64)     NOT NULL,
  `subject_type`  VARCHAR(32)     NOT NULL,
  `subject_id`    VARCHAR(64)     NOT NULL COMMENT 'opaque id (e.g. console:12, link:3, member:4410); never a name or NIK',
  `outcome`       ENUM('success','denied','failed') NOT NULL,
  `request_id`    VARCHAR(40)     NOT NULL,
  `detail`        JSON            NULL COMMENT 'sanitised by the application: flat allow-listed identifiers only',
  PRIMARY KEY (`id`),
  KEY `ix_audit_subject` (`subject_type`, `subject_id`, `occurred_at`),
  KEY `ix_audit_actor`   (`actor_user_id`, `occurred_at`),
  CONSTRAINT `ck_audit_action` CHECK (`action` REGEXP '^[a-z][a-z0-9_.]{2,63}$'),
  CONSTRAINT `ck_audit_detail` CHECK (`detail` IS NULL OR (JSON_VALID(`detail`) AND JSON_TYPE(`detail`) = 'OBJECT' AND LENGTH(`detail`) <= 1000))
) ENGINE=InnoDB;

-- Enforcement independent of grants (production cPanel accounts may only receive database-level privileges):
-- audit rows are append-only; links are never deleted and may only move active -> revoked.
DELIMITER //
CREATE TRIGGER IF NOT EXISTS `__CONSOLE_DB__`.`trg_console_audit_no_update` BEFORE UPDATE ON `__CONSOLE_DB__`.`console_audit_event`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'console_audit_event is append-only'; END//
CREATE TRIGGER IF NOT EXISTS `__CONSOLE_DB__`.`trg_console_audit_no_delete` BEFORE DELETE ON `__CONSOLE_DB__`.`console_audit_event`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'console_audit_event is append-only'; END//
CREATE TRIGGER IF NOT EXISTS `__CONSOLE_DB__`.`trg_console_link_no_delete` BEFORE DELETE ON `__CONSOLE_DB__`.`console_identity_link`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'identity links are revoked, never deleted'; END//
CREATE TRIGGER IF NOT EXISTS `__CONSOLE_DB__`.`trg_console_link_revoke_only` BEFORE UPDATE ON `__CONSOLE_DB__`.`console_identity_link`
FOR EACH ROW BEGIN
  IF OLD.`status` <> 'active' OR NEW.`status` <> 'revoked' OR NEW.`console_user_id` <> OLD.`console_user_id`
     OR NEW.`external_user_id` <> OLD.`external_user_id` OR NEW.`system` <> OLD.`system`
     OR NEW.`linked_by` <> OLD.`linked_by` OR NEW.`linked_at` <> OLD.`linked_at` THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'identity links may only change from active to revoked';
  END IF;
END//
DELIMITER ;

-- VERIFICATION (read-only)
SELECT 'exactly two tables' AS check_name, COUNT(*) = 2 AS ok FROM information_schema.tables WHERE table_schema = '__CONSOLE_DB__'
UNION ALL SELECT 'four triggers', COUNT(*) = 4 FROM information_schema.triggers WHERE trigger_schema = '__CONSOLE_DB__'
UNION ALL SELECT 'unique active-link keys', COUNT(DISTINCT index_name) = 2 FROM information_schema.statistics WHERE table_schema = '__CONSOLE_DB__' AND table_name = 'console_identity_link' AND non_unique = 0 AND index_name LIKE 'ux_link_active_%'
UNION ALL SELECT 'no DELETE/DDL for the application account', COUNT(*) = 0 FROM information_schema.schema_privileges WHERE table_schema = '__CONSOLE_DB__' AND grantee LIKE '%__CONSOLE_USER__%' AND privilege_type NOT IN ('SELECT', 'INSERT', 'UPDATE')
UNION ALL SELECT 'application account has no rights on any other database', COUNT(*) = 0 FROM information_schema.schema_privileges WHERE table_schema <> '__CONSOLE_DB__' AND grantee LIKE '%__CONSOLE_USER__%';
