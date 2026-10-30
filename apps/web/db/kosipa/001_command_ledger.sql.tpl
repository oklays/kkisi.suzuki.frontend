-- KOSIPA command ledger v1 (kosipa-full-access FD-01 + FD-01b option b, TASK-105; REQ-105, OBS-101, NFR-105).
-- Template: __LEDGER_DB__ = a DEDICATED ledger database on the SAME MariaDB server as the KOSIPA business database (FA-01.5). It holds this
-- table only. Applied ONLY to the isolated synthetic stack (integration/kosipa-full-access/local-stack.mjs). Production:
-- docs/migration/sql/kosipa-command-ledger-production.sql, operator-run after review (OD-4). No legacy database object is touched.
-- Every object is fully qualified; there is NO `USE`.
--
-- One row per COMMITTED native command, written in the same InnoDB transaction as the business rows, so:
--   * a row exists  <=> the business effect exists (rollback leaves neither);
--   * the unique key (actor, idempotency key) lets at most one transaction per logical submission commit;
--   * result_json is what a retry with the same key and the same request hash receives (`replayed: true`).
-- Failed or refused attempts are NOT stored here (they leave no effect); they go to the console audit (console_audit_event).
-- Append-only by privilege: writer accounts receive DATABASE-LEVEL SELECT, INSERT on __LEDGER_DB__ (the granularity cPanel offers), and the
-- legacy application accounts receive nothing there. One connection writes both databases in one InnoDB transaction (atomic).
-- subject_ref and the JSON snapshots never carry NIK, names, phone, address, salary or bank data (allow-listed by the application).

CREATE DATABASE IF NOT EXISTS `__LEDGER_DB__` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `__LEDGER_DB__`.`kosipa_command_ledger` (
  `id`                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `command`                 VARCHAR(64)     NOT NULL COMMENT 'e.g. master.lokasi.create',
  `capability`              VARCHAR(48)     NOT NULL COMMENT 'authorized scope used (console write capability)',
  `idempotency_key`         CHAR(36)        NOT NULL COMMENT 'UUID v4 from the client, lower case',
  `request_hash`            CHAR(64)        NOT NULL COMMENT 'SHA-256 of command + subject + canonical payload',
  `request_id`              VARCHAR(40)     NOT NULL COMMENT 'correlation id shared with console_audit_event',
  `actor_console_user_id`   INT UNSIGNED    NOT NULL COMMENT 'db_users.id of the console session (by value)',
  `actor_kosipa_user_id`    INT UNSIGNED    NOT NULL COMMENT 'ref_users.id_ref_user behind the active identity link',
  `subject_type`            VARCHAR(32)     NOT NULL,
  `subject_ref`             VARCHAR(64)     NOT NULL COMMENT 'doc no or numeric id; never NIK or name',
  `from_state`              VARCHAR(32)     NULL,
  `to_state`                VARCHAR(32)     NULL,
  `maker_console_user_id`   INT UNSIGNED    NULL,
  `checker_console_user_id` INT UNSIGNED    NULL,
  `reason`                  VARCHAR(200)    NULL,
  `before_json`             JSON            NULL COMMENT 'allow-listed fields before the change',
  `after_json`              JSON            NULL COMMENT 'allow-listed fields after the change',
  `result_json`             JSON            NOT NULL COMMENT 'response returned on replay',
  `outcome`                 ENUM('committed') NOT NULL DEFAULT 'committed',
  `created_at`              DATETIME(3)     NOT NULL COMMENT 'UTC',
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_ledger_idem` (`actor_console_user_id`, `idempotency_key`),
  KEY `ix_ledger_subject` (`subject_type`, `subject_ref`, `created_at`),
  CONSTRAINT `ck_ledger_key`     CHECK (`idempotency_key` REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  CONSTRAINT `ck_ledger_hash`    CHECK (`request_hash` REGEXP '^[0-9a-f]{64}$'),
  CONSTRAINT `ck_ledger_command` CHECK (`command` REGEXP '^[a-z][a-z0-9_.]{2,63}$'),
  CONSTRAINT `ck_ledger_result`  CHECK (JSON_VALID(`result_json`) AND JSON_TYPE(`result_json`) = 'OBJECT')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
