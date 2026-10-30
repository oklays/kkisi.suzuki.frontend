-- Console store v4: KOSIPA write-capability grants with TWO-ADMINISTRATOR confirmation (kosipa-full-access FD-16 option b, TASK-110,
-- FA-01.5; REQ-130, SEC-102). Unreleased: applied only to isolated synthetic console stores so far, so FA-01.5 amended it in place.
-- Target: kkisi_console_staging. NOT for the shared local console store and NOT for production (production SQL after review, OD-4).
-- Same conventions as 001_console_schema.sql: fully qualified, no `USE`, no FK across schemas, UTC times from the application, and a
-- grant/trigger pair that keeps rows append-only and moves them only along the allowed transitions, independently of account privileges.
--
--   pending --(second administrator)--> active --(any administrator)--> revoked
--   pending --(any administrator but the beneficiary)--> rejected        pending --(after expires_at)--> expired

CREATE TABLE IF NOT EXISTS `kkisi_console_staging`.`console_kosipa_grant` (
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
CREATE TRIGGER IF NOT EXISTS `kkisi_console_staging`.`trg_console_grant_no_delete` BEFORE DELETE ON `kkisi_console_staging`.`console_kosipa_grant`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'KOSIPA grants are never deleted'; END//
CREATE TRIGGER IF NOT EXISTS `kkisi_console_staging`.`trg_console_grant_transitions` BEFORE UPDATE ON `kkisi_console_staging`.`console_kosipa_grant`
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
