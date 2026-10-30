-- FD-01b evidence account (FA-01.5): EXACTLY the privileges a cPanel "Add User To Database" screen can express, which are database-level
-- only (docs/migration/sql/console-store-production.sql). Used by tests to prove, under the production privilege model, that
--   * a business mutation and its ledger row commit or roll back together (one connection, one transaction, two databases), and
--   * the account cannot UPDATE / DELETE / REPLACE / TRUNCATE / ALTER / DROP the ledger or create objects in the ledger database.
-- Never used by the application. Template: __KOSIPA_DB__, __LEDGER_DB__, __HOST__, __PW__.

CREATE USER IF NOT EXISTS 'kosipa_cpanel_w'@'__HOST__' IDENTIFIED BY '__PW__' WITH MAX_USER_CONNECTIONS 2;
ALTER USER 'kosipa_cpanel_w'@'__HOST__' IDENTIFIED BY '__PW__' WITH MAX_USER_CONNECTIONS 2;
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'kosipa_cpanel_w'@'__HOST__';

-- Business database: what the operator would tick for a master writer (no DELETE, no structure privileges).
GRANT SELECT, INSERT, UPDATE ON `__KOSIPA_DB__`.* TO 'kosipa_cpanel_w'@'__HOST__';
-- Ledger database: SELECT + INSERT only.
GRANT SELECT, INSERT ON `__LEDGER_DB__`.* TO 'kosipa_cpanel_w'@'__HOST__';
