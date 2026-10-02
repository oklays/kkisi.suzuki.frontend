-- Auth store schema (Stage 2A). Target: database kkisi_auth_staging on the LOCAL staging MariaDB container.
-- Every object is fully qualified and there is NO `USE` and NO default database: if this file is ever fed to
-- a connection without an explicit target it fails with "No database selected" instead of landing elsewhere.
-- Idempotent (IF NOT EXISTS). It never touches kkisi_staging (the legacy schema).

CREATE DATABASE IF NOT EXISTS `kkisi_auth_staging` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `kkisi_auth_staging`.`auth_session` (
  `sid_hash`        BINARY(32)   NOT NULL COMMENT 'SHA-256 of the opaque session id; the id itself is never stored',
  `user_id`         INT UNSIGNED NOT NULL COMMENT 'kkisi_staging.db_users.id (no FK: different schema, legacy stays untouched)',
  `company_id`      INT UNSIGNED NOT NULL COMMENT 'branch selected for this session (db_company.id)',
  `pwf`             BINARY(8)    NOT NULL COMMENT 'password fingerprint at login: first 8 bytes of SHA-256(password hash)',
  `created_at`      DATETIME     NOT NULL COMMENT 'UTC, supplied by the app',
  `last_seen_at`    DATETIME     NOT NULL,
  `idle_expires_at` DATETIME     NOT NULL,
  `abs_expires_at`  DATETIME     NOT NULL,
  `revoked_at`      DATETIME     NULL,
  `revoked_reason`  ENUM('logout','forced','user_disabled','password_changed','superseded') NULL,
  `purge_after`     DATETIME     NOT NULL COMMENT 'row may be deleted after this instant (abs_expires_at + 24h)',
  PRIMARY KEY (`sid_hash`),
  KEY `ix_auth_session_user`  (`user_id`, `revoked_at`),
  KEY `ix_auth_session_purge` (`purge_after`),
  CONSTRAINT `ck_auth_session_times`  CHECK (`abs_expires_at` >= `created_at` AND `idle_expires_at` >= `created_at` AND `purge_after` >= `abs_expires_at`),
  CONSTRAINT `ck_auth_session_revoke` CHECK ((`revoked_at` IS NULL) = (`revoked_reason` IS NULL))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `kkisi_auth_staging`.`auth_throttle` (
  `key_hash`         BINARY(32)   NOT NULL COMMENT 'HMAC-SHA256(throttle subkey, kind|value): usernames/IPs are not readable from a dump',
  `kind`             ENUM('user','pair','ip') NOT NULL,
  `failures`         INT UNSIGNED NOT NULL,
  `first_failure_at` DATETIME     NOT NULL COMMENT 'start of the current fixed window',
  `last_failure_at`  DATETIME     NOT NULL,
  `locked_until`     DATETIME     NULL,
  `purge_after`      DATETIME     NOT NULL,
  PRIMARY KEY (`key_hash`),
  KEY `ix_auth_throttle_purge` (`purge_after`)
) ENGINE=InnoDB;
