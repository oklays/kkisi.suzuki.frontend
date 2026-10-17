-- TOKO stock-POSTING TEST STORE (checkpoint 11) — local staging container ONLY. This is NOT the TOKO schema and never touches it.
-- It is a second, independent transactional store that models the CONTRACT the future TOKO stock writer must meet, so the cross-database
-- hand-off can be exercised against real constraints:
--   * one posting row per intent_key (PRIMARY KEY = target-side idempotency), immutable once written (triggers);
--   * the posting row and the stock change commit in ONE transaction (the application does both; a crash leaves neither);
--   * the stock row can only be changed by the same writer account, never deleted.
-- Invariant checked by the tests: for every (company, item), stock.quantity = SUM(posting.quantity) over its postings.
CREATE DATABASE IF NOT EXISTS `kkisi_toko_posting_test` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kkisi_toko_posting_test`.`toko_test_marker` (
  `purpose` VARCHAR(40) NOT NULL, PRIMARY KEY (`purpose`)
) ENGINE=InnoDB;
INSERT IGNORE INTO `kkisi_toko_posting_test`.`toko_test_marker` (`purpose`) VALUES ('test-only-posting-contract');

CREATE TABLE IF NOT EXISTS `kkisi_toko_posting_test`.`toko_test_stock` (
  `store_company_id` INT UNSIGNED NOT NULL, `store_item_id` INT UNSIGNED NOT NULL, `quantity` BIGINT NOT NULL,
  PRIMARY KEY (`store_company_id`, `store_item_id`),
  CONSTRAINT `ck_tt_stock_qty` CHECK (`quantity` >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `kkisi_toko_posting_test`.`toko_test_stock_posting` (
  `intent_key` VARCHAR(190) NOT NULL, `source_ref` VARCHAR(80) NOT NULL, `event_key` VARCHAR(80) NOT NULL,
  `store_company_id` INT UNSIGNED NOT NULL, `store_item_id` INT UNSIGNED NOT NULL, `mapping_ref` VARCHAR(64) NOT NULL,
  `quantity` BIGINT UNSIGNED NOT NULL, `applied_at` VARCHAR(40) NOT NULL,
  PRIMARY KEY (`intent_key`), KEY `ix_tt_posting_item` (`store_company_id`, `store_item_id`),
  CONSTRAINT `ck_tt_posting_qty` CHECK (`quantity` > 0)
) ENGINE=InnoDB;

DROP TRIGGER IF EXISTS `kkisi_toko_posting_test`.`trg_tt_posting_no_update`;
DROP TRIGGER IF EXISTS `kkisi_toko_posting_test`.`trg_tt_posting_no_delete`;
DROP TRIGGER IF EXISTS `kkisi_toko_posting_test`.`trg_tt_stock_no_delete`;
DELIMITER //
CREATE TRIGGER `kkisi_toko_posting_test`.`trg_tt_posting_no_update` BEFORE UPDATE ON `kkisi_toko_posting_test`.`toko_test_stock_posting`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'postings are immutable'; END//
CREATE TRIGGER `kkisi_toko_posting_test`.`trg_tt_posting_no_delete` BEFORE DELETE ON `kkisi_toko_posting_test`.`toko_test_stock_posting`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'postings are never deleted'; END//
CREATE TRIGGER `kkisi_toko_posting_test`.`trg_tt_stock_no_delete` BEFORE DELETE ON `kkisi_toko_posting_test`.`toko_test_stock`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'stock rows are never deleted'; END//
DELIMITER ;
