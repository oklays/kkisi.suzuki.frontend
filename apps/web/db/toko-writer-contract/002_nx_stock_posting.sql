-- PROPOSED idempotency table for the future TOKO stock writer (checkpoint 12). Applied here ONLY to the local contract database
-- kkisi_toko_writer_contract; the production version is docs/migration/sql/toko-stock-posting-idempotency-proposed.sql (review-only, not executed).
-- One row per applied Warehouse intent, written in the SAME transaction as the ledger row (db_stockentry or a purchase, per decision D7) and the
-- db_items.stock cache update. PRIMARY KEY (intent_key) is the target-side idempotency invariant; rows are immutable and never deleted.
CREATE TABLE IF NOT EXISTS `kkisi_toko_writer_contract`.`nx_stock_posting` (
  `intent_key` VARCHAR(190) NOT NULL, `source_ref` VARCHAR(80) NOT NULL, `event_key` VARCHAR(80) NOT NULL,
  `company_id` INT NOT NULL, `item_id` INT NOT NULL, `mapping_ref` VARCHAR(64) NOT NULL, `quantity` INT NOT NULL,
  `ledger_table` VARCHAR(32) NOT NULL, `ledger_id` INT NOT NULL, `posted_at` DATETIME NOT NULL,
  PRIMARY KEY (`intent_key`), KEY `ix_nx_posting_item` (`company_id`, `item_id`),
  CONSTRAINT `ck_nx_posting_qty` CHECK (`quantity` > 0)
) ENGINE=InnoDB;
DROP TRIGGER IF EXISTS `kkisi_toko_writer_contract`.`trg_nx_posting_no_update`;
DROP TRIGGER IF EXISTS `kkisi_toko_writer_contract`.`trg_nx_posting_no_delete`;
DELIMITER //
CREATE TRIGGER `kkisi_toko_writer_contract`.`trg_nx_posting_no_update` BEFORE UPDATE ON `kkisi_toko_writer_contract`.`nx_stock_posting`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'nx_stock_posting is immutable'; END//
CREATE TRIGGER `kkisi_toko_writer_contract`.`trg_nx_posting_no_delete` BEFORE DELETE ON `kkisi_toko_writer_contract`.`nx_stock_posting`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'nx_stock_posting rows are never deleted'; END//
DELIMITER ;
