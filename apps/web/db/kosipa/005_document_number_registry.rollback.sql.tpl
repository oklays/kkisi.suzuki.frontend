-- Rollback of 005_document_number_registry.sql.tpl. Only with every document command switched off. Issued numbers are evidence: the registry
-- is RETIRED (renamed, rows kept), never dropped while it holds rows.
RENAME TABLE `__LEDGER_DB__`.`kosipa_document_number` TO `__LEDGER_DB__`.`kosipa_document_number_retired`;
