-- legacy-schema-objects-readonly.sql
-- REQ-003 / TASK-003 — READ-ONLY. Dijalankan operator dengan akun yang memiliki SHOW VIEW + SELECT pada
-- information_schema (bukan akun aplikasi). Tidak ada statement yang menulis. Simpan output ke
-- docs/migration/_baseline/schema-objects-<YYYYMMDD>.sql (gitignored). Jangan menyertakan baris data.
--
-- Alternatif satu perintah (shell operator, tanpa data):
--   mysqldump --single-transaction --no-data --routines --events --triggers \
--     n1608204_smart_kopkar > schema-smart_kopkar.sql
--   mysqldump --single-transaction --no-data --routines --events --triggers \
--     n1608204_smart_kopkar_gudang > schema-gudang.sql
--   (--no-data tetap mengekspor CREATE VIEW lengkap bila akun punya SHOW VIEW; periksa bahwa view
--    bukan stub "NULL AS" seperti pada dump 30 Sep)

-- 1. Inventaris objek
SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_ROWS, UPDATE_TIME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA IN ('n1608204_smart_kopkar', 'n1608204_smart_kopkar_gudang', 'n1608204_smart_kopkar_toko')
ORDER BY TABLE_SCHEMA, TABLE_TYPE, TABLE_NAME;

SELECT ROUTINE_SCHEMA, ROUTINE_TYPE, ROUTINE_NAME, CREATED, LAST_ALTERED, DEFINER
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA IN ('n1608204_smart_kopkar', 'n1608204_smart_kopkar_gudang', 'n1608204_smart_kopkar_toko');

SELECT TRIGGER_SCHEMA, TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE, ACTION_TIMING
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA IN ('n1608204_smart_kopkar', 'n1608204_smart_kopkar_gudang');

SELECT EVENT_SCHEMA, EVENT_NAME, STATUS, EXECUTE_AT, INTERVAL_VALUE, INTERVAL_FIELD
FROM information_schema.EVENTS
WHERE EVENT_SCHEMA IN ('n1608204_smart_kopkar', 'n1608204_smart_kopkar_gudang');

-- 2. Definisi view (seluruhnya; diprioritaskan yang dipakai KOSIPA)
SELECT TABLE_NAME, VIEW_DEFINITION
FROM information_schema.VIEWS
WHERE TABLE_SCHEMA = 'n1608204_smart_kopkar'
ORDER BY TABLE_NAME;

SHOW CREATE VIEW n1608204_smart_kopkar.v_trans_pinjaman_flat;
SHOW CREATE VIEW n1608204_smart_kopkar.v_trans_pinjaman_anuitas;
SHOW CREATE VIEW n1608204_smart_kopkar.v_trans_pinjaman_simulasi;
SHOW CREATE VIEW n1608204_smart_kopkar.v_kartu_simpanan;
SHOW CREATE VIEW n1608204_smart_kopkar.v_saldo_awal;
SHOW CREATE VIEW n1608204_smart_kopkar.v_trans_potongan_bulanan;
SHOW CREATE VIEW n1608204_smart_kopkar.v_matrix_toko;
SHOW CREATE VIEW n1608204_smart_kopkar.v_matrix_toko_dtl;

-- 3. Procedure/function (generator payroll = patch target MIG-004)
SHOW CREATE PROCEDURE n1608204_smart_kopkar.x_proc_create_matrix;
SHOW CREATE PROCEDURE n1608204_smart_kopkar.proc_hari_simpanan;

-- 4. Konsumen DB/tabel yang belum diketahui (ANO-X07, m_barang): hanya metadata
SELECT TABLE_NAME, TABLE_ROWS, UPDATE_TIME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'n1608204_smart_kopkar_toko'
ORDER BY UPDATE_TIME DESC
LIMIT 20;

SELECT TABLE_NAME, TABLE_ROWS, UPDATE_TIME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'n1608204_smart_kopkar'
  AND TABLE_NAME IN ('m_barang', 'inventory', 'inventory_barang', 'gudang_pembelianproduks', 'temp_stock_barang');

-- 5. Index existing pada kolom kunci KOSIPA (untuk NFR-003, tanpa membuat index)
SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols, NON_UNIQUE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'n1608204_smart_kopkar'
  AND TABLE_NAME IN ('m_anggota', 'trans_simpanan', 'trans_simpanan_dtl', 'trans_pinjaman', 'trans_pinjaman_dtl',
                     'trans_potongan_bulanan', 'trans_potongan_matrix', 'ref_menu', 'ref_menu_akses', 'ref_group_akses')
GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE
ORDER BY TABLE_NAME, INDEX_NAME;
