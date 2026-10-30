-- Console account privileges on the grant table: append + the decision/revocation columns only; no DELETE. Template: __CONSOLE_USER__, __HOST__.
-- Applied with 004_kosipa_grants.sql, after 002_console_grants.sql.tpl (which first strips and re-grants the account).

GRANT SELECT, INSERT ON `kkisi_console_staging`.`console_kosipa_grant` TO '__CONSOLE_USER__'@'__HOST__';
GRANT UPDATE (`status`, `decided_by`, `decided_at`, `decision_note`, `revoked_by`, `revoked_at`, `revoke_reason`)
  ON `kkisi_console_staging`.`console_kosipa_grant` TO '__CONSOLE_USER__'@'__HOST__';
