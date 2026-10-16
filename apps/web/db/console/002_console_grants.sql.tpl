-- Console store account + minimum privileges. Template: scripts/setup-console-store.sh substitutes
--   __AUTH_HOST__  the client IP MariaDB sees for the application's own connection path (detected, never '%')
--   __AUTH_PW__    a generated password (never printed, never committed)
-- Idempotent: strips EVERY privilege of this account, then grants exactly the set below. No DELETE, no DDL.

CREATE USER IF NOT EXISTS 'kkisi_console'@'__AUTH_HOST__' IDENTIFIED BY '__AUTH_PW__' WITH MAX_USER_CONNECTIONS 2;
ALTER USER 'kkisi_console'@'__AUTH_HOST__' IDENTIFIED BY '__AUTH_PW__' WITH MAX_USER_CONNECTIONS 2;
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'kkisi_console'@'__AUTH_HOST__';

GRANT SELECT, INSERT ON `kkisi_console_staging`.`console_identity_link` TO 'kkisi_console'@'__AUTH_HOST__';
GRANT UPDATE (`status`, `revoked_by`, `revoked_at`, `revoke_reason`)
  ON `kkisi_console_staging`.`console_identity_link` TO 'kkisi_console'@'__AUTH_HOST__';
GRANT SELECT, INSERT ON `kkisi_console_staging`.`console_audit_event` TO 'kkisi_console'@'__AUTH_HOST__';
