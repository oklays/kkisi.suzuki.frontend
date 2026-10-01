-- Auth store account + minimum privileges (Stage 2A). Template: scripts/setup-auth-store.sh substitutes
--   __AUTH_HOST__  the client IP MariaDB sees for the APPLICATION'S OWN connection path (detected, never '%')
--   __AUTH_PW__    a generated password (never printed, never committed)
-- Idempotent and self-correcting: it first strips EVERY privilege of this account, then grants exactly the set below.

CREATE USER IF NOT EXISTS 'kkisi_auth'@'__AUTH_HOST__' IDENTIFIED BY '__AUTH_PW__' WITH MAX_USER_CONNECTIONS 10;
ALTER USER 'kkisi_auth'@'__AUTH_HOST__' IDENTIFIED BY '__AUTH_PW__' WITH MAX_USER_CONNECTIONS 10;
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'kkisi_auth'@'__AUTH_HOST__';

GRANT SELECT, INSERT, DELETE ON `kkisi_auth_staging`.`auth_session`
  TO 'kkisi_auth'@'__AUTH_HOST__';
GRANT UPDATE (`company_id`, `last_seen_at`, `idle_expires_at`, `revoked_at`, `revoked_reason`)
  ON `kkisi_auth_staging`.`auth_session` TO 'kkisi_auth'@'__AUTH_HOST__';

GRANT SELECT, INSERT, DELETE ON `kkisi_auth_staging`.`auth_throttle`
  TO 'kkisi_auth'@'__AUTH_HOST__';
GRANT UPDATE (`failures`, `locked_until`, `first_failure_at`, `last_failure_at`, `purge_after`)
  ON `kkisi_auth_staging`.`auth_throttle` TO 'kkisi_auth'@'__AUTH_HOST__';
