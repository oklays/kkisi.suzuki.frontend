-- kosipa-savings-writer-production.sql — REVIEW-ONLY. NOT executed by engineering (FA-03C T07; cutover gate B6). Nothing here has run on production.
-- Order: 1 legacy fence of simpanan/sim_setor_c (apps/web/scripts/kosipa-legacy-fence.mjs savings.deposit), 2 STEP 0-2 below,
-- 3 application: DATABASE_URL_KOSIPA_SAVINGS_WRITE, KOSIPA_SAVINGS_WRITES_ENABLED=true, KOSIPA_WRITE_OWNERSHIP += savings.deposit.
-- The application refuses any production writer until its guard is extended in a separately reviewed change.
-- Replace: __KOSIPA_DB__ production business database; __LEDGER_DB__ ledger database; __WRITER_USER__ a NEW dedicated account (cPanel, own password,
--   MAX_USER_CONNECTIONS 2). If the host refuses column-level GRANTs, STOP and report; never fall back to table-wide UPDATE.
--   trans_simpanan / trans_simpanan_dtl: SELECT (versions, numbering uniqueness, balances), INSERT exactly the columns legacy sim_setor_c writes plus the
--   NOT NULL ones legacy left to non-strict SQL mode (is_mobile, saldo_awal_penarikan, line saldo); UPDATE only doc_no (row-id numbering), status, tgl_cair,
--   ud/ud_usr. No DELETE (FD-37: never deleted), no amount/member/date UPDATE.
--   m_anggota, m_jenis_simpanan: SELECT the identity/status/product columns only. ref_menu fence; ref_users display name; ledger SELECT, INSERT.
-- STEP 1:
GRANT SELECT ON `__KOSIPA_DB__`.`trans_simpanan` TO `__WRITER_USER__`@'%';
GRANT INSERT (`doc_date`, `doc_status`, `start_date`, `finish_date`, `periode_bl`, `periode_th`, `doc_type`, `jenis_simpanan`, `payment_type`, `remarks`, `jenis_transaksi`, `cd`, `cd_usr`, `is_mobile`, `saldo_awal_penarikan`) ON `__KOSIPA_DB__`.`trans_simpanan` TO `__WRITER_USER__`@'%';
GRANT UPDATE (`doc_no`, `doc_status`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`trans_simpanan` TO `__WRITER_USER__`@'%';
GRANT SELECT ON `__KOSIPA_DB__`.`trans_simpanan_dtl` TO `__WRITER_USER__`@'%';
GRANT INSERT (`doc_no`, `doc_no_dtl`, `nik_kar`, `nama`, `kd_group`, `jenis_simpanan`, `rek_bank`, `rek_nama`, `rek_no`, `remark_detail`, `periode_th`, `periode_bl`, `start_date`, `finish_date`, `debit`, `kredit_cash`, `kredit`, `jasa_kredit`, `saldo`, `doc_status`, `cd`, `cd_usr`) ON `__KOSIPA_DB__`.`trans_simpanan_dtl` TO `__WRITER_USER__`@'%';
GRANT UPDATE (`doc_status`, `tgl_cair`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`trans_simpanan_dtl` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id`, `nik_kar`, `nama_kar`, `kd_group`, `status_anggota`) ON `__KOSIPA_DB__`.`m_anggota` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id`, `jenis_simpanan_code`, `is_active`) ON `__KOSIPA_DB__`.`m_jenis_simpanan` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id`, `url`, `status`) ON `__KOSIPA_DB__`.`ref_menu` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id_ref_user`, `nama_lengkap`) ON `__KOSIPA_DB__`.`ref_users` TO `__WRITER_USER__`@'%';
GRANT SELECT, INSERT ON `__LEDGER_DB__`.* TO `__WRITER_USER__`@'%';
-- STEP 2 (read-only): must show these grants and NO DELETE, DROP, ALTER, CREATE or GRANT OPTION.
SHOW GRANTS FOR `__WRITER_USER__`@'%';
-- ROLLBACK: application first (KOSIPA_SAVINGS_WRITES_ENABLED unset), then: REVOKE ALL PRIVILEGES, GRANT OPTION FROM `__WRITER_USER__`@'%'; DROP USER `__WRITER_USER__`@'%';
