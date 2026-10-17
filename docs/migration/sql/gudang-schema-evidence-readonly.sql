-- gudang-schema-evidence-readonly.sql
-- Warehouse schema evidence (WH-EVID) — READ-ONLY metadata. Run by an authorised OPERATOR against the Gudang database; never by the application or the agent.
-- The Gudang schema has NOT been obtained yet (current-state.md §3). Table names below are the ones the older TOKO template is known to use
-- (db_items, db_items_stock, db_sales, db_sales_items, db_purchase, ...) PLUS discovery queries, because Gudang is an older FORK and must not be assumed
-- to match TOKO. information_schema only: no table data is read. Save the output outside version control and review it (handoff §5) before committing anything.

SET @g = 'n1608204_smart_kopkar_gudang';

-- G1. Discovery: every table and view, with estimates (find the real names, do not guess).
SELECT TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_ROWS, AUTO_INCREMENT, UPDATE_TIME FROM information_schema.TABLES WHERE TABLE_SCHEMA = @g ORDER BY TABLE_TYPE, TABLE_NAME;

-- G2. Columns of the tables that carry items, stock, documents and units (extend the IN list with what G1 reveals: dispatch / delivery / invoice tables).
SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @g
  AND (TABLE_NAME REGEXP '^(db_items|db_items_stock|db_sales|db_sales_items|db_salesitems|db_purchase|db_purchaseitems|db_stock|db_units|db_unit|db_category|db_brands|db_warehouse|db_company|db_customers|db_stockadjustment|db_stocktransfer)'
       OR TABLE_NAME REGEXP '(stock|stok|dispatch|delivery|kirim|terima|invoice|unit|satuan|gudang)')
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- G3. Keys / indexes on the same tables (identifier uniqueness: which column uniquely identifies an item, a document and a document line).
SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = @g
  AND (TABLE_NAME REGEXP '^(db_items|db_items_stock|db_sales|db_sales_items|db_salesitems|db_purchase|db_purchaseitems|db_stock|db_units|db_unit)' OR TABLE_NAME REGEXP '(stock|stok|dispatch|delivery|kirim|terima|invoice|unit|satuan|gudang)')
GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE ORDER BY TABLE_NAME, INDEX_NAME;

-- G4. Declared FKs, triggers, routines, events (anything that changes stock behind the application's back).
SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = @g AND REFERENCED_TABLE_NAME IS NOT NULL;
SELECT TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE, ACTION_TIMING, ACTION_STATEMENT FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = @g;
SELECT ROUTINE_TYPE, ROUTINE_NAME, ROUTINE_DEFINITION FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = @g;
SELECT EVENT_NAME, STATUS, EVENT_DEFINITION FROM information_schema.EVENTS WHERE EVENT_SCHEMA = @g;

-- G5. View definitions (a stock figure shown by Gudang may come from a view).
SELECT TABLE_NAME, VIEW_DEFINITION FROM information_schema.VIEWS WHERE TABLE_SCHEMA = @g;

-- G6. Reference-data CARDINALITY only (counts, never rows): how Gudang names the customer that represents each store.
--     The row VALUES are deliberately not requested; the operator answers the question in the handoff §4 instead.
SELECT COUNT(*) AS items FROM n1608204_smart_kopkar_gudang.db_items;
SELECT COUNT(*) AS company_rows FROM n1608204_smart_kopkar_gudang.db_company;
SELECT @@sql_mode AS sql_mode, @@version AS version, @@collation_database AS collation;
