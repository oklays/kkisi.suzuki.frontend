-- Secondary indexes that stop the legacy PHP POS from locking whole sales tables (production n1608204_smart_kopkar).
-- REVIEW-ONLY. Nothing in this repository executes this file. Run it manually, by the owner, after review, outside
-- shop hours, right after a fresh backup. It adds indexes only: no table, column, data, user or grant changes.
--
-- Why: production has only PRIMARY keys on these tables. The PHP POS runs, for every sale it saves or edits,
--   UPDATE db_sales        ... WHERE sales_code = ?                         (Pos_model.php:137/293, Pos.php several)
--   UPDATE db_salesitems   ... WHERE sales_id = ?                           (Pos_model.php:158/307)
--   DELETE FROM db_salespayments WHERE sales_id = ?                         (Pos_model.php:186/334/664, Sales_model, Pos_ppob_model)
--   DELETE FROM db_salesitems    WHERE sales_id = ?                         (Pos_model.php:663, Sales_model.php:234/544)
--   SELECT ... FROM db_salesitems WHERE sales_code = ? OR sales_id = ?      (Pos_model.php:171/319)
--   UPDATE db_cart ... WHERE sales_code = ? AND item_id = ?                 (Pos.php:759)
-- Without an index each of those scans and, under the server default REPEATABLE-READ, locks EVERY row of the table
-- until the PHP request commits. Every other cashier (PHP or genesis.web, all branches) then waits up to 50 s:
-- this is the "Periksa/Ulangi Pembayaran" hang. With the indexes the same statements lock only the rows of that sale.
--
-- Effect on the applications: none functionally. Equality lookups through a secondary index still return rows in
-- PRIMARY KEY order, so receipts and lists keep their order. Writes get marginally slower (one extra index entry).
-- Sizes measured 2026-10-13: db_sales ~200k rows/59 MB, db_salesitems ~543k/101 MB, db_salespayments ~218k/34 MB,
-- db_cart ~335 rows. MariaDB 10.11 builds each index online (ALGORITHM=INPLACE, LOCK=NONE): reads and writes continue;
-- expect seconds to about a minute per table.
--
-- How to run (cPanel > phpMyAdmin, logged in as the cPanel owner, database n1608204_smart_kopkar, tab SQL):
--   0. Make a fresh backup (cPanel > Backup, or phpMyAdmin Export of the four tables) and keep it.
--   1. Run section 1 (pre-check). It must list only PRIMARY indexes, otherwise stop and send the output for review.
--   2. Run section 2 one statement at a time. If a statement fails with "Lock wait timeout" (1205) a long PHP request
--      was holding the table: simply run the same statement again a minute later. Nothing is half-applied.
--   3. Run section 3 (verification) and keep the output.
-- The genesis.web accounts cannot run this (they have no INDEX/ALTER privilege, by design).

-- Section 1: pre-check ------------------------------------------------------------------------------------------------
SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'n1608204_smart_kopkar' AND TABLE_NAME IN ('db_sales','db_salesitems','db_salespayments','db_cart')
GROUP BY TABLE_NAME, INDEX_NAME ORDER BY TABLE_NAME, INDEX_NAME;

-- Section 2: indexes --------------------------------------------------------------------------------------------------
-- An ALTER needs a brief metadata lock at its start and end. Cap that wait at 10 s so the ALTER gives up (and is
-- simply re-run) instead of queueing every cashier behind a long PHP request.
SET SESSION lock_wait_timeout = 10;

ALTER TABLE `db_sales`         ADD INDEX `idx_nx_sales_code` (`sales_code`),                           ALGORITHM=INPLACE, LOCK=NONE;
ALTER TABLE `db_salesitems`    ADD INDEX `idx_nx_sales_id` (`sales_id`),
                               ADD INDEX `idx_nx_sales_code` (`sales_code`),                           ALGORITHM=INPLACE, LOCK=NONE;
ALTER TABLE `db_salespayments` ADD INDEX `idx_nx_sales_id` (`sales_id`),                               ALGORITHM=INPLACE, LOCK=NONE;
ALTER TABLE `db_cart`          ADD INDEX `idx_nx_sales_code_item` (`sales_code`, `item_id`),
                               ADD INDEX `idx_nx_sales_id` (`sales_id`),                               ALGORITHM=INPLACE, LOCK=NONE;

-- Section 3: verification ---------------------------------------------------------------------------------------------
-- Expect the six idx_nx_* rows next to PRIMARY.
SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'n1608204_smart_kopkar' AND TABLE_NAME IN ('db_sales','db_salesitems','db_salespayments','db_cart')
GROUP BY TABLE_NAME, INDEX_NAME ORDER BY TABLE_NAME, INDEX_NAME;
-- Expect key = idx_nx_sales_id / idx_nx_sales_code (not NULL) and rows in the single digits.
EXPLAIN UPDATE db_salesitems SET sales_qty = sales_qty WHERE sales_id = 1;
EXPLAIN DELETE FROM db_salespayments WHERE sales_id = 1;
EXPLAIN UPDATE db_sales SET sales_code = sales_code WHERE sales_code = 'none';

-- Rollback (only if ever needed; also online) -------------------------------------------------------------------------
-- SET SESSION lock_wait_timeout = 10;
-- ALTER TABLE `db_sales`         DROP INDEX `idx_nx_sales_code`,                                         ALGORITHM=INPLACE, LOCK=NONE;
-- ALTER TABLE `db_salesitems`    DROP INDEX `idx_nx_sales_id`, DROP INDEX `idx_nx_sales_code`,           ALGORITHM=INPLACE, LOCK=NONE;
-- ALTER TABLE `db_salespayments` DROP INDEX `idx_nx_sales_id`,                                          ALGORITHM=INPLACE, LOCK=NONE;
-- ALTER TABLE `db_cart`          DROP INDEX `idx_nx_sales_code_item`, DROP INDEX `idx_nx_sales_id`,     ALGORITHM=INPLACE, LOCK=NONE;
