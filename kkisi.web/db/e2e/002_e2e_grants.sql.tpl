-- E1 accounts (Gate A). Placeholders: __E2E_HOST__ (client IP detected from the app's connection path, never '%'),
-- __SEED_PW__ / __READ_PW__ (generated, never printed). Idempotent; REVOKE ALL first so drift is repaired.
CREATE USER IF NOT EXISTS 'kkisi_e2e_seed'@'__E2E_HOST__' IDENTIFIED BY '__SEED_PW__' WITH MAX_USER_CONNECTIONS 5;
ALTER USER 'kkisi_e2e_seed'@'__E2E_HOST__' IDENTIFIED BY '__SEED_PW__' WITH MAX_USER_CONNECTIONS 5;
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'kkisi_e2e_seed'@'__E2E_HOST__';
GRANT SELECT, INSERT, DELETE ON `kkisi_e2e_legacy`.* TO 'kkisi_e2e_seed'@'__E2E_HOST__';

CREATE USER IF NOT EXISTS 'kkisi_e2e_read'@'__E2E_HOST__' IDENTIFIED BY '__READ_PW__' WITH MAX_USER_CONNECTIONS 10;
ALTER USER 'kkisi_e2e_read'@'__E2E_HOST__' IDENTIFIED BY '__READ_PW__' WITH MAX_USER_CONNECTIONS 10;
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'kkisi_e2e_read'@'__E2E_HOST__';
GRANT SELECT ON `kkisi_e2e_legacy`.* TO 'kkisi_e2e_read'@'__E2E_HOST__';
