-- Rollback of 004_kosipa_grants.sql. First turn KOSIPA_WRITE_GRANTS_ENABLED off (the application then grants no write capability
-- and never reads this table). Grant history is audit evidence: the table is retired (renamed, rows kept), not dropped.

DROP TRIGGER IF EXISTS `kkisi_console_staging`.`trg_console_grant_no_delete`;
DROP TRIGGER IF EXISTS `kkisi_console_staging`.`trg_console_grant_transitions`;
RENAME TABLE `kkisi_console_staging`.`console_kosipa_grant` TO `kkisi_console_staging`.`console_kosipa_grant_retired`;
