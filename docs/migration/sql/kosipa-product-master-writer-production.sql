-- kosipa-product-master-writer-production.sql — REVIEW-ONLY. NOT executed by engineering (FA-03B T06; cutover gate B6). Nothing here has run on production,
-- staging or DEV LOCAL. Adds the product-master privileges (Jenis Simpanan / Pinjaman / Pembiayaan, Suku Bunga; FD-32, FD-34) to the EXISTING dedicated
-- KOSIPA master-writer account. Exactly the block the synthetic template apps/web/db/kosipa/002_master_writer_grants.sql.tpl applies (static test).
-- Order per product (11 §3): 1 legacy fence of its controller (apps/web/scripts/kosipa-legacy-fence.mjs master.<key>), 2 these GRANTs + STEP 2,
-- 3 KOSIPA_WRITE_OWNERSHIP += master.<key>. The application still refuses any production writer until its guard is extended in a separately reviewed change.
--
-- Replace before running (operator only): __KOSIPA_DB__ production KOSIPA database; __WRITER_USER__ the existing master-writer account.
-- If the host refuses column-level GRANTs, STOP and report: never fall back to a table-wide UPDATE.
-- STEP 1:
-- BEGIN product masters (FA-03B T06; generated from packages/domain/src/kosipa/product-master.ts)
--   product tables: SELECT every column read (incl. legacy-only ones, for the row version), INSERT the written columns + status + cd/cd_usr,
--   UPDATE the written columns EXCEPT codes/keys fixed at creation (jenis_simpanan_code, suku_bunga.field) + status + ud/ud_usr. No DELETE.
--   m_acc_coa: SELECT only (COA description is derived on the server). Reference columns: SELECT only (reference counts).
GRANT SELECT (`id`, `jenis_simpanan_code`, `jenis_simpanan_name`, `jenis_simpanan_remarks`, `bunga_simpanan`, `akun_code`, `is_active_tarik_deposito`, `akun_desc`, `is_active`, `cd`, `cd_usr`, `ud`, `ud_usr`, `status_perorangan`) ON `__KOSIPA_DB__`.`m_jenis_simpanan` TO `__WRITER_USER__`@'%';
GRANT INSERT (`jenis_simpanan_code`, `jenis_simpanan_name`, `jenis_simpanan_remarks`, `bunga_simpanan`, `akun_code`, `is_active_tarik_deposito`, `akun_desc`, `is_active`, `cd`, `cd_usr`) ON `__KOSIPA_DB__`.`m_jenis_simpanan` TO `__WRITER_USER__`@'%';
GRANT UPDATE (`jenis_simpanan_name`, `jenis_simpanan_remarks`, `bunga_simpanan`, `akun_code`, `is_active_tarik_deposito`, `akun_desc`, `is_active`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`m_jenis_simpanan` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id`, `jenis_pinjaman_code`, `jenis_pinjaman_name`, `jenis_pinjaman_remarks`, `parent_id`, `jenis_pembiayaan`, `jenis_bunga`, `biaya_asuransi`, `biaya_jasa`, `biaya_admin`, `biaya_bunga`, `biaya_pinalty`, `tgl_tempo`, `lock_1angsuran`, `max_angsuran`, `max_pinjaman`, `akun_code`, `akun_code_pembiayaan`, `akun_code_pendapatan`, `akun_desc`, `akun_desc_pembiayaan`, `akun_desc_pendapatan`, `is_active`, `cd`, `cd_usr`, `ud`, `ud_usr`, `dd`, `dd_usr`, `is_payroll`) ON `__KOSIPA_DB__`.`m_jenis_pinjaman` TO `__WRITER_USER__`@'%';
GRANT INSERT (`jenis_pinjaman_code`, `jenis_pinjaman_name`, `jenis_pinjaman_remarks`, `parent_id`, `jenis_pembiayaan`, `jenis_bunga`, `biaya_asuransi`, `biaya_jasa`, `biaya_admin`, `biaya_bunga`, `biaya_pinalty`, `tgl_tempo`, `lock_1angsuran`, `max_angsuran`, `max_pinjaman`, `akun_code`, `akun_code_pembiayaan`, `akun_code_pendapatan`, `akun_desc`, `akun_desc_pembiayaan`, `akun_desc_pendapatan`, `is_active`, `cd`, `cd_usr`) ON `__KOSIPA_DB__`.`m_jenis_pinjaman` TO `__WRITER_USER__`@'%';
GRANT UPDATE (`jenis_pinjaman_code`, `jenis_pinjaman_name`, `jenis_pinjaman_remarks`, `parent_id`, `jenis_pembiayaan`, `jenis_bunga`, `biaya_asuransi`, `biaya_jasa`, `biaya_admin`, `biaya_bunga`, `biaya_pinalty`, `tgl_tempo`, `lock_1angsuran`, `max_angsuran`, `max_pinjaman`, `akun_code`, `akun_code_pembiayaan`, `akun_code_pendapatan`, `akun_desc`, `akun_desc_pembiayaan`, `akun_desc_pendapatan`, `is_active`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`m_jenis_pinjaman` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id`, `pembiayaan_code`, `pembiayaan_name`, `pembiayaan_remarks`, `jenis_bunga`, `biaya_asuransi`, `biaya_jasa`, `biaya_admin`, `biaya_bunga`, `biaya_pinalty`, `tgl_tempo`, `akun_code`, `lock_1angsuran`, `akun_desc`, `is_active`, `cd`, `cd_usr`, `ud`, `ud_usr`, `doc_no`, `doc_date`) ON `__KOSIPA_DB__`.`m_jenis_pembiayaan` TO `__WRITER_USER__`@'%';
GRANT INSERT (`pembiayaan_code`, `pembiayaan_name`, `pembiayaan_remarks`, `jenis_bunga`, `biaya_asuransi`, `biaya_jasa`, `biaya_admin`, `biaya_bunga`, `biaya_pinalty`, `tgl_tempo`, `akun_code`, `lock_1angsuran`, `akun_desc`, `is_active`, `cd`, `cd_usr`) ON `__KOSIPA_DB__`.`m_jenis_pembiayaan` TO `__WRITER_USER__`@'%';
GRANT UPDATE (`pembiayaan_code`, `pembiayaan_name`, `pembiayaan_remarks`, `jenis_bunga`, `biaya_asuransi`, `biaya_jasa`, `biaya_admin`, `biaya_bunga`, `biaya_pinalty`, `tgl_tempo`, `akun_code`, `lock_1angsuran`, `akun_desc`, `is_active`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`m_jenis_pembiayaan` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id`, `code_suku_bunga`, `desc_suku_bunga`, `field`, `nilai_persen`, `remarks_suku_bunga`, `is_active`, `cd`, `cd_usr`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`m_suku_bunga` TO `__WRITER_USER__`@'%';
GRANT INSERT (`code_suku_bunga`, `desc_suku_bunga`, `field`, `nilai_persen`, `remarks_suku_bunga`, `is_active`, `cd`, `cd_usr`) ON `__KOSIPA_DB__`.`m_suku_bunga` TO `__WRITER_USER__`@'%';
GRANT UPDATE (`code_suku_bunga`, `desc_suku_bunga`, `nilai_persen`, `remarks_suku_bunga`, `is_active`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`m_suku_bunga` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id`, `coa_no`, `coa_desc`, `coa_group`) ON `__KOSIPA_DB__`.`m_acc_coa` TO `__WRITER_USER__`@'%';
GRANT SELECT (`jenis_pinjaman`, `jenis_potongan`, `bank_pembiaya`, `pembiayaan_code`) ON `__KOSIPA_DB__`.`trans_pinjaman` TO `__WRITER_USER__`@'%';
GRANT SELECT (`jenis_simpanan`) ON `__KOSIPA_DB__`.`trans_simpanan` TO `__WRITER_USER__`@'%';
GRANT SELECT (`jenis_simpanan`) ON `__KOSIPA_DB__`.`trans_simpanan_dtl` TO `__WRITER_USER__`@'%';
GRANT SELECT (`jenis_simpanan`) ON `__KOSIPA_DB__`.`m_simpanan_aktif` TO `__WRITER_USER__`@'%';
-- END product masters
-- STEP 2 (read-only): the output must contain these grants and NO DELETE, DROP, ALTER, CREATE or GRANT OPTION.
SHOW GRANTS FOR `__WRITER_USER__`@'%';
-- ROLLBACK: application first (remove master.<key> from KOSIPA_WRITE_OWNERSHIP, restart), then per product table:
--   REVOKE INSERT, UPDATE ON `__KOSIPA_DB__`.`<table>` FROM `__WRITER_USER__`@'%';
