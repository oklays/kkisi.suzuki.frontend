-- Console store schema v1 (Checkpoint 3). Target: database kkisi_console_staging on the LOCAL staging container.
-- Owner: the Next.js console. It holds ONLY console<->KOSIPA identity links and console audit events: no sessions,
-- credentials, roles, permissions or business records. Every object is fully qualified; there is NO `USE`.
-- No foreign keys to other schemas (users live in the business database; ids are referenced by value only).
-- Idempotent (IF NOT EXISTS). Times are UTC, supplied by the application.

CREATE DATABASE IF NOT EXISTS `kkisi_console_staging` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `kkisi_console_staging`.`console_identity_link` (
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

CREATE TABLE IF NOT EXISTS `kkisi_console_staging`.`console_audit_event` (
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
CREATE TRIGGER IF NOT EXISTS `kkisi_console_staging`.`trg_console_audit_no_update` BEFORE UPDATE ON `kkisi_console_staging`.`console_audit_event`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'console_audit_event is append-only'; END//
CREATE TRIGGER IF NOT EXISTS `kkisi_console_staging`.`trg_console_audit_no_delete` BEFORE DELETE ON `kkisi_console_staging`.`console_audit_event`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'console_audit_event is append-only'; END//
CREATE TRIGGER IF NOT EXISTS `kkisi_console_staging`.`trg_console_link_no_delete` BEFORE DELETE ON `kkisi_console_staging`.`console_identity_link`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'identity links are revoked, never deleted'; END//
CREATE TRIGGER IF NOT EXISTS `kkisi_console_staging`.`trg_console_link_revoke_only` BEFORE UPDATE ON `kkisi_console_staging`.`console_identity_link`
FOR EACH ROW BEGIN
  IF OLD.`status` <> 'active' OR NEW.`status` <> 'revoked' OR NEW.`console_user_id` <> OLD.`console_user_id`
     OR NEW.`external_user_id` <> OLD.`external_user_id` OR NEW.`system` <> OLD.`system`
     OR NEW.`linked_by` <> OLD.`linked_by` OR NEW.`linked_at` <> OLD.`linked_at` THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'identity links may only change from active to revoked';
  END IF;
END//
DELIMITER ;
