-- toko-stock-posting-idempotency-proposed.sql — REVIEW-ONLY PROPOSAL (checkpoint 12). NOT executed anywhere but the local contract database.
-- Do not run until: owner decision D7 (which ledger represents a Gudang->TOKO movement), capacity decision B5/B9 (a dedicated writer account), the
-- technical single-writer mechanism B4, and a review of the POS lock order against production. Operator-only; never run by the application or an agent.
--
-- Why a schema change is unavoidable: no existing TOKO ledger table carries a business key that could hold the Warehouse intent key
-- (db_stockentry: surrogate id + fixed note ENUM; db_purchase/db_purchaseitems: non-unique references). Without a UNIQUE key written in the SAME
-- transaction as the stock change, a retry after a lost acknowledgement would post twice. The cache column db_items.stock alone is not enough either:
-- legacy Pos_model::update_items_quantity() recomputes it from five ledgers, so the writer must also insert a ledger row those sums include.
--
-- Replace __DB__ (e.g. n1608204_smart_kopkar) and __WRITER__ (a NEW dedicated account, never the POS, return, product or inventory writer).

CREATE TABLE IF NOT EXISTS `__DB__`.`nx_stock_posting` (
  `intent_key` VARCHAR(190) NOT NULL, `source_ref` VARCHAR(80) NOT NULL, `event_key` VARCHAR(80) NOT NULL,
  `company_id` INT NOT NULL, `item_id` INT NOT NULL, `mapping_ref` VARCHAR(64) NOT NULL, `quantity` INT NOT NULL,
  `ledger_table` VARCHAR(32) NOT NULL, `ledger_id` INT NOT NULL, `posted_at` DATETIME NOT NULL,
  PRIMARY KEY (`intent_key`), KEY `ix_nx_posting_item` (`company_id`, `item_id`),
  CONSTRAINT `ck_nx_posting_qty` CHECK (`quantity` > 0)
) ENGINE=InnoDB;
-- Immutability (shared hosting may refuse TRIGGER creation: if so STOP and report; do not enable the writer without it)
DELIMITER //
CREATE TRIGGER `__DB__`.`trg_nx_posting_no_update` BEFORE UPDATE ON `__DB__`.`nx_stock_posting` FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'nx_stock_posting is immutable'; END//
CREATE TRIGGER `__DB__`.`trg_nx_posting_no_delete` BEFORE DELETE ON `__DB__`.`nx_stock_posting` FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'nx_stock_posting rows are never deleted'; END//
DELIMITER ;

-- Grants for the dedicated writer (where cPanel cannot express column grants, the operator must report it: the column-level UPDATE(stock) is part of the contract).
-- GRANT SELECT ON `__DB__`.`db_items` TO '__WRITER__'@'<host>';
-- GRANT UPDATE (`stock`) ON `__DB__`.`db_items` TO '__WRITER__'@'<host>';
-- GRANT SELECT, INSERT ON `__DB__`.`<ledger table chosen by D7>` TO '__WRITER__'@'<host>';   -- db_stockentry, or db_purchase + db_purchaseitems
-- GRANT SELECT, INSERT ON `__DB__`.`nx_stock_posting` TO '__WRITER__'@'<host>';
-- No DELETE, no ALTER/CREATE/DROP/INDEX/TRIGGER, no access to other schemas.

-- Rollback: the table is append-only and unread by legacy PHP; disabling the writer is a flag change. Dropping the table is an operator decision after export.
