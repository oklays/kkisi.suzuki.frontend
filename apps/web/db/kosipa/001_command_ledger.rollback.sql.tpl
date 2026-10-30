-- Rollback of 001_command_ledger.sql.tpl (FD-01). Run only after every KOSIPA write feature is switched back to legacy
-- (flags off, ref_menu.status restored) so no writer can append. The ledger is financial audit evidence: it is RETIRED
-- (renamed, rows kept), never dropped while it holds rows. The forward migration can then be applied again unchanged.

RENAME TABLE `__LEDGER_DB__`.`kosipa_command_ledger` TO `__LEDGER_DB__`.`kosipa_command_ledger_retired`;

-- Only if the retired table is provably empty (SELECT COUNT(*) = 0), and only on a non-production database:
-- DROP TABLE `__LEDGER_DB__`.`kosipa_command_ledger_retired`;
