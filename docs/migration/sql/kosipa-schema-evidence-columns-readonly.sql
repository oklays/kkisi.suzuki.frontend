-- kosipa-schema-evidence-columns-readonly.sql
-- TASK-003 (part B) — READ-ONLY metadata. Run by an authorised OPERATOR, never by the application or the agent.
-- Reads only information_schema (no table data, no SELECT on business tables). Companion of legacy-schema-objects-readonly.sql (views / procedures).
-- Replace the schema name if the production schema differs. Save the output OUTSIDE version control first (docs/migration/_baseline/ is gitignored)
-- and review it with docs/migration/operator-handoff-schema-evidence.md §5 before anything is added to the repository.

SET @s = 'n1608204_smart_kopkar';

-- B1. Column definitions (type, precision, nullability, default) of every table the console reads. Monetary precision matters:
--     the console parses decimals exactly and the legacy matrix mixes decimal(18,4) amounts with double(18,4) header totals.
SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA, COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @s
  AND TABLE_NAME IN ('m_anggota', 'trans_simpanan', 'trans_simpanan_dtl', 'trans_pinjaman', 'trans_pinjaman_dtl',
                     'trans_potongan_bulanan', 'trans_potongan_matrix', 'db_sales', 'db_salesreturn', 'db_company',
                     'ref_users', 'ref_group', 'ref_group_akses', 'ref_menu', 'ref_menu_akses')
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- B2. Keys and indexes (unique / primary / secondary) — needed to confirm which lookups are indexed in PRODUCTION (index-proposal.md §2).
SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = @s
  AND TABLE_NAME IN ('m_anggota', 'trans_simpanan', 'trans_simpanan_dtl', 'trans_pinjaman', 'trans_pinjaman_dtl',
                     'trans_potongan_bulanan', 'trans_potongan_matrix', 'db_sales', 'db_salesreturn')
GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE
ORDER BY TABLE_NAME, INDEX_NAME;

-- B3. Declared foreign keys (the legacy schema is expected to declare none; confirm instead of assuming).
SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = @s AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY TABLE_NAME, CONSTRAINT_NAME;

-- B4. Row estimates and storage (TABLE_ROWS is an ESTIMATE; AUTO_INCREMENT is a counter, NOT a row count).
SELECT TABLE_NAME, ENGINE, TABLE_ROWS, AUTO_INCREMENT, DATA_LENGTH, INDEX_LENGTH, UPDATE_TIME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = @s AND TABLE_TYPE = 'BASE TABLE'
  AND TABLE_NAME IN ('m_anggota', 'trans_simpanan', 'trans_simpanan_dtl', 'trans_pinjaman', 'trans_pinjaman_dtl', 'trans_potongan_bulanan', 'trans_potongan_matrix', 'db_sales', 'db_salesreturn');

-- B5. Triggers on the financial tables (they can change values behind the application's back: relevant to every parity claim).
SELECT TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE, ACTION_TIMING, ACTION_STATEMENT
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA = @s
  AND EVENT_OBJECT_TABLE IN ('trans_simpanan', 'trans_simpanan_dtl', 'trans_pinjaman', 'trans_pinjaman_dtl', 'trans_potongan_bulanan', 'trans_potongan_matrix', 'db_sales', 'db_salesreturn');

-- B6. Server settings that change how dates and numbers behave (zero dates, strictness, collation).
SELECT @@sql_mode AS sql_mode, @@version AS version, @@max_user_connections AS max_user_connections, @@character_set_database AS charset, @@collation_database AS collation;
