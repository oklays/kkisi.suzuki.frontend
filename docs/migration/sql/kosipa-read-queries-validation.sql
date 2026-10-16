-- kosipa-read-queries-validation.sql — READ-ONLY (SELECT / EXPLAIN / SHOW only). Safe to run anywhere with SELECT.
-- Purpose: the exact KOSIPA read queries behind docs/superpowers/specs/unified-console-kosipa-warehouse/index-proposal.md,
-- run BEFORE and AFTER a candidate index on a DISPOSABLE copy (local staging) to compare plans and latency.
-- Set the three variables below to values that exist in the copy (pick a typical member, one of the three heavy members, and a loan).
--   SET @nik  = '<member nik_kar as stored>';   SET @loan = '<trans_pinjaman_dtl.doc_no>';   SET @per = '<trans_potongan_bulanan.doc_no>';
-- Run each EXPLAIN, then run the statement 3x with `SET STATEMENT max_statement_time=60 FOR ...` and record the median.
-- NOTE: do not compare tgl_cicilan with '0000-00-00' without testing under the production sql_mode (non-strict there).

-- Q1 member instalments (planned TASK-026; paginate in the application: three members hold ~80% of the rows)
EXPLAIN SELECT doc_no, ke_cicilan, tgl_cicilan, angsuran_cicilan, status_cicilan, type_cicilan
FROM trans_pinjaman_dtl WHERE nik_kar = @nik ORDER BY tgl_cicilan, id LIMIT 200;

-- Q2 loan schedule (loan detail; legacy pinjaman_c::detail reads by doc_no)
EXPLAIN SELECT ke_cicilan, tgl_cicilan, pokok_cicilan, bunga_cicilan, angsuran_cicilan, status_cicilan
FROM trans_pinjaman_dtl WHERE doc_no = @loan ORDER BY ke_cicilan;

-- Q3 member payroll history (planned TASK-027)
EXPLAIN SELECT m.periode, b.periode_potongan, b.doc_status, m.total_potongan, m.TOKO_TAMBUN, m.TOKO_MJ, m.TOKO_GIIC
FROM trans_potongan_matrix m JOIN trans_potongan_bulanan b ON b.doc_no = m.periode
WHERE m.nik_kar = @nik ORDER BY b.periode_potongan DESC LIMIT 24;

-- Q4 batch totals and page (legacy matrix_c: SUM(...) / SELECT * ... WHERE periode = doc_no)
EXPLAIN SELECT COUNT(*), SUM(total_potongan) FROM trans_potongan_matrix WHERE periode = @per;
EXPLAIN SELECT nik_kar, nama, total_potongan FROM trans_potongan_matrix WHERE periode = @per ORDER BY nik_kar LIMIT 50;

-- Index state and size (compare before/after)
SELECT table_name, index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols
FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name IN ('trans_pinjaman_dtl', 'trans_potongan_matrix')
GROUP BY table_name, index_name ORDER BY table_name, index_name;
SELECT table_name, table_rows AS estimated_rows, ROUND(data_length/1048576,1) AS data_mb, ROUND(index_length/1048576,1) AS index_mb
FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('trans_pinjaman_dtl', 'trans_potongan_matrix');
