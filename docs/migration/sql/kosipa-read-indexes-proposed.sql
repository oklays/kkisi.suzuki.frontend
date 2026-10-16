-- kosipa-read-indexes-proposed.sql — REVIEW-ONLY PROPOSAL. NO DDL HAS BEEN EXECUTED ANYWHERE (not on production, not on staging).
-- Rationale, evidence and trade-offs: docs/superpowers/specs/unified-console-kosipa-warehouse/index-proposal.md
--
-- Rules (existing project policy): production schema changes are made ONLY by the operator after separate, explicit approval,
-- as the cPanel owner account (the application accounts have no INDEX/ALTER privilege, by design). Engineering never runs this.
--
-- PRECONDITIONS (operator):
--   1. Run section 1 (read-only). If an equivalent index already exists, STOP: do not add a duplicate.
--   2. Fresh backup (same procedure as docs/migration/GENESIS_DEV_DEPLOYMENT.md §7) and >= 150 MB free disk for temporary space.
--   3. Off-peak window; PHP KOSIPA payroll approval is not running.
--   4. First validated on a disposable copy with docs/migration/sql/kosipa-read-queries-validation.sql (acceptance criteria in the proposal).
-- Only TIER 1 is proposed for production. TIER 3 (payroll matrix) is NOT recommended on current evidence and is kept commented.

-- ============================== 1. PRE-CHECK (read-only) ==============================
SELECT table_name, index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols
FROM information_schema.statistics
WHERE table_schema = DATABASE() AND table_name IN ('trans_pinjaman_dtl', 'trans_potongan_matrix')
GROUP BY table_name, index_name ORDER BY table_name, index_name;
SELECT table_name, table_rows, ROUND(data_length/1048576,1) AS data_mb, ROUND(index_length/1048576,1) AS index_mb
FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('trans_pinjaman_dtl', 'trans_potongan_matrix');
-- Expected (30 Sep copy): only PRIMARY on both tables; ~1.2M and ~85k rows. Anything else = re-evaluate before continuing.

-- ============================== 2. TIER 1 DDL (trans_pinjaman_dtl) ====================
-- Online, in place, no table lock. Run ONE statement at a time and wait for it to finish.
-- Q1: member instalments (equality on nik_kar, ordered by tgl_cicilan; no filesort).
ALTER TABLE `trans_pinjaman_dtl` ADD INDEX `idx_nx_pdtl_nik_tgl` (`nik_kar`, `tgl_cicilan`), ALGORITHM=INPLACE, LOCK=NONE;
-- Q2: loan schedule (equality on doc_no, ordered by ke_cicilan; no filesort).
ALTER TABLE `trans_pinjaman_dtl` ADD INDEX `idx_nx_pdtl_doc_ke` (`doc_no`, `ke_cicilan`), ALGORITHM=INPLACE, LOCK=NONE;

-- ============================== 3. POST-CHECK (read-only) =============================
SELECT table_name, index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols
FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'trans_pinjaman_dtl' GROUP BY index_name;
SELECT ROUND(index_length/1048576,1) AS index_mb FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'trans_pinjaman_dtl';
-- Then run kosipa-read-queries-validation.sql (Q1, Q2): expect type=ref on the new index and no "Using filesort".

-- ============================== 4. ROLLBACK ===========================================
-- Dropping an index is metadata-only and instant for readers; the application does not depend on these indexes for correctness.
-- ALTER TABLE `trans_pinjaman_dtl` DROP INDEX `idx_nx_pdtl_nik_tgl`, ALGORITHM=INPLACE, LOCK=NONE;
-- ALTER TABLE `trans_pinjaman_dtl` DROP INDEX `idx_nx_pdtl_doc_ke`,  ALGORITHM=INPLACE, LOCK=NONE;

-- ============================== 5. TIER 3 — NOT RECOMMENDED NOW (payroll matrix) ======
-- Measured on the 30 Sep copy: 84,924 rows, full scans of Q3/Q4 take 14-65 ms. Add only if production measurements disagree.
-- ALTER TABLE `trans_potongan_matrix` ADD INDEX `idx_nx_pm_periode_nik` (`periode`, `nik_kar`), ALGORITHM=INPLACE, LOCK=NONE;
-- ALTER TABLE `trans_potongan_matrix` ADD INDEX `idx_nx_pm_nik_periode` (`nik_kar`, `periode`), ALGORITHM=INPLACE, LOCK=NONE;
-- Rollback: DROP INDEX `idx_nx_pm_periode_nik` / `idx_nx_pm_nik_periode` with the same ALGORITHM/LOCK clauses.
