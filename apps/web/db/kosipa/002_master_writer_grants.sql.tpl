-- KOSIPA reference-master writer (FA-01 Lokasi, FA-02 Bagian / Jenis Dokumen / Rekening Bank / Periode Angsuran; TASK-114, SEC-107). Template:
--   __KOSIPA_DB__  business database   __LEDGER_DB__  ledger database (same server)   __HOST__  client host   __PW__  generated password
-- Idempotent: strips EVERY privilege of the account, then grants exactly this set. No DELETE anywhere, no DDL, no GRANT OPTION.
-- Local least privilege is column-level; production (cPanel) can only grant per database: see 003_cpanel_model_writer.sql.tpl and FD-01b.
--   master tables            SELECT, INSERT, UPDATE(the columns each legacy controller writes)     (the legacy hard delete is not offered)
--   reference columns        SELECT  m_anggota.lokasi/bagian, users.lokasi/bagian, trans_pinjaman.bank_pembiaya   (before a protected change)
--   ref_menu (id,url,status) SELECT  legacy fence, share-locked inside every command (FD-03)
--   ref_users (id,nama)      SELECT  legacy cd_usr/ud_usr display name
--   ledger database          SELECT, INSERT at DATABASE level: append-only by privilege

CREATE USER IF NOT EXISTS 'kosipa_master_w'@'__HOST__' IDENTIFIED BY '__PW__' WITH MAX_USER_CONNECTIONS 2;
ALTER USER 'kosipa_master_w'@'__HOST__' IDENTIFIED BY '__PW__' WITH MAX_USER_CONNECTIONS 2;
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'kosipa_master_w'@'__HOST__';

GRANT SELECT, INSERT ON `__KOSIPA_DB__`.`m_lokasi` TO 'kosipa_master_w'@'__HOST__';
GRANT UPDATE (`code_lokasi`, `name_lokasi`, `status`) ON `__KOSIPA_DB__`.`m_lokasi` TO 'kosipa_master_w'@'__HOST__';
GRANT SELECT, INSERT ON `__KOSIPA_DB__`.`m_bagian` TO 'kosipa_master_w'@'__HOST__';
GRANT UPDATE (`name_bagian`, `status`) ON `__KOSIPA_DB__`.`m_bagian` TO 'kosipa_master_w'@'__HOST__';
GRANT SELECT, INSERT ON `__KOSIPA_DB__`.`m_jenis_dokumen` TO 'kosipa_master_w'@'__HOST__';
GRANT UPDATE (`jenis_dokumen_code`, `jenis_dokumen_name`, `jenis_dokumen_remarks`, `is_active`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`m_jenis_dokumen` TO 'kosipa_master_w'@'__HOST__';
GRANT SELECT, INSERT ON `__KOSIPA_DB__`.`m_rekening` TO 'kosipa_master_w'@'__HOST__';
GRANT UPDATE (`rekening_code`, `rekening_name`, `rekening_remarks`, `is_active`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`m_rekening` TO 'kosipa_master_w'@'__HOST__';
GRANT SELECT, INSERT ON `__KOSIPA_DB__`.`m_jangka_waktu` TO 'kosipa_master_w'@'__HOST__';
GRANT UPDATE (`jangka_waktu_name`, `jangka_waktu_remarks`, `is_active`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`m_jangka_waktu` TO 'kosipa_master_w'@'__HOST__';
GRANT SELECT (`lokasi`, `bagian`) ON `__KOSIPA_DB__`.`m_anggota` TO 'kosipa_master_w'@'__HOST__';
GRANT SELECT (`lokasi`, `bagian`) ON `__KOSIPA_DB__`.`users` TO 'kosipa_master_w'@'__HOST__';
GRANT SELECT (`bank_pembiaya`) ON `__KOSIPA_DB__`.`trans_pinjaman` TO 'kosipa_master_w'@'__HOST__';
GRANT SELECT (`id`, `url`, `status`) ON `__KOSIPA_DB__`.`ref_menu` TO 'kosipa_master_w'@'__HOST__';
GRANT SELECT (`id_ref_user`, `nama_lengkap`) ON `__KOSIPA_DB__`.`ref_users` TO 'kosipa_master_w'@'__HOST__';
GRANT SELECT, INSERT ON `__LEDGER_DB__`.* TO 'kosipa_master_w'@'__HOST__';

-- BEGIN product masters (FA-03B T06; generated from packages/domain/src/kosipa/product-master.ts)
--   product tables: SELECT every column read (incl. legacy-only ones, for the row version), INSERT the written columns + status + cd/cd_usr,
--   UPDATE the written columns EXCEPT codes/keys fixed at creation (jenis_simpanan_code, suku_bunga.field) + status + ud/ud_usr. No DELETE.
--   m_acc_coa: SELECT only (COA description is derived on the server). Reference columns: SELECT only (reference counts).
GRANT SELECT (`id`, `jenis_simpanan_code`, `jenis_simpanan_name`, `jenis_simpanan_remarks`, `bunga_simpanan`, `akun_code`, `is_active_tarik_deposito`, `akun_desc`, `is_active`, `cd`, `cd_usr`, `ud`, `ud_usr`, `status_perorangan`) ON `__KOSIPA_DB__`.`m_jenis_simpanan` TO 'kosipa_master_w'@'__HOST__';
GRANT INSERT (`jenis_simpanan_code`, `jenis_simpanan_name`, `jenis_simpanan_remarks`, `bunga_simpanan`, `akun_code`, `is_active_tarik_deposito`, `akun_desc`, `is_active`, `cd`, `cd_usr`) ON `__KOSIPA_DB__`.`m_jenis_simpanan` TO 'kosipa_master_w'@'__HOST__';
GRANT UPDATE (`jenis_simpanan_name`, `jenis_simpanan_remarks`, `bunga_simpanan`, `akun_code`, `is_active_tarik_deposito`, `akun_desc`, `is_active`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`m_jenis_simpanan` TO 'kosipa_master_w'@'__HOST__';
GRANT SELECT (`id`, `jenis_pinjaman_code`, `jenis_pinjaman_name`, `jenis_pinjaman_remarks`, `parent_id`, `jenis_pembiayaan`, `jenis_bunga`, `biaya_asuransi`, `biaya_jasa`, `biaya_admin`, `biaya_bunga`, `biaya_pinalty`, `tgl_tempo`, `lock_1angsuran`, `max_angsuran`, `max_pinjaman`, `akun_code`, `akun_code_pembiayaan`, `akun_code_pendapatan`, `akun_desc`, `akun_desc_pembiayaan`, `akun_desc_pendapatan`, `is_active`, `cd`, `cd_usr`, `ud`, `ud_usr`, `dd`, `dd_usr`, `is_payroll`) ON `__KOSIPA_DB__`.`m_jenis_pinjaman` TO 'kosipa_master_w'@'__HOST__';
GRANT INSERT (`jenis_pinjaman_code`, `jenis_pinjaman_name`, `jenis_pinjaman_remarks`, `parent_id`, `jenis_pembiayaan`, `jenis_bunga`, `biaya_asuransi`, `biaya_jasa`, `biaya_admin`, `biaya_bunga`, `biaya_pinalty`, `tgl_tempo`, `lock_1angsuran`, `max_angsuran`, `max_pinjaman`, `akun_code`, `akun_code_pembiayaan`, `akun_code_pendapatan`, `akun_desc`, `akun_desc_pembiayaan`, `akun_desc_pendapatan`, `is_active`, `cd`, `cd_usr`) ON `__KOSIPA_DB__`.`m_jenis_pinjaman` TO 'kosipa_master_w'@'__HOST__';
GRANT UPDATE (`jenis_pinjaman_code`, `jenis_pinjaman_name`, `jenis_pinjaman_remarks`, `parent_id`, `jenis_pembiayaan`, `jenis_bunga`, `biaya_asuransi`, `biaya_jasa`, `biaya_admin`, `biaya_bunga`, `biaya_pinalty`, `tgl_tempo`, `lock_1angsuran`, `max_angsuran`, `max_pinjaman`, `akun_code`, `akun_code_pembiayaan`, `akun_code_pendapatan`, `akun_desc`, `akun_desc_pembiayaan`, `akun_desc_pendapatan`, `is_active`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`m_jenis_pinjaman` TO 'kosipa_master_w'@'__HOST__';
GRANT SELECT (`id`, `pembiayaan_code`, `pembiayaan_name`, `pembiayaan_remarks`, `jenis_bunga`, `biaya_asuransi`, `biaya_jasa`, `biaya_admin`, `biaya_bunga`, `biaya_pinalty`, `tgl_tempo`, `akun_code`, `lock_1angsuran`, `akun_desc`, `is_active`, `cd`, `cd_usr`, `ud`, `ud_usr`, `doc_no`, `doc_date`) ON `__KOSIPA_DB__`.`m_jenis_pembiayaan` TO 'kosipa_master_w'@'__HOST__';
GRANT INSERT (`pembiayaan_code`, `pembiayaan_name`, `pembiayaan_remarks`, `jenis_bunga`, `biaya_asuransi`, `biaya_jasa`, `biaya_admin`, `biaya_bunga`, `biaya_pinalty`, `tgl_tempo`, `akun_code`, `lock_1angsuran`, `akun_desc`, `is_active`, `cd`, `cd_usr`) ON `__KOSIPA_DB__`.`m_jenis_pembiayaan` TO 'kosipa_master_w'@'__HOST__';
GRANT UPDATE (`pembiayaan_code`, `pembiayaan_name`, `pembiayaan_remarks`, `jenis_bunga`, `biaya_asuransi`, `biaya_jasa`, `biaya_admin`, `biaya_bunga`, `biaya_pinalty`, `tgl_tempo`, `akun_code`, `lock_1angsuran`, `akun_desc`, `is_active`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`m_jenis_pembiayaan` TO 'kosipa_master_w'@'__HOST__';
GRANT SELECT (`id`, `code_suku_bunga`, `desc_suku_bunga`, `field`, `nilai_persen`, `remarks_suku_bunga`, `is_active`, `cd`, `cd_usr`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`m_suku_bunga` TO 'kosipa_master_w'@'__HOST__';
GRANT INSERT (`code_suku_bunga`, `desc_suku_bunga`, `field`, `nilai_persen`, `remarks_suku_bunga`, `is_active`, `cd`, `cd_usr`) ON `__KOSIPA_DB__`.`m_suku_bunga` TO 'kosipa_master_w'@'__HOST__';
GRANT UPDATE (`code_suku_bunga`, `desc_suku_bunga`, `nilai_persen`, `remarks_suku_bunga`, `is_active`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`m_suku_bunga` TO 'kosipa_master_w'@'__HOST__';
GRANT SELECT (`id`, `coa_no`, `coa_desc`, `coa_group`) ON `__KOSIPA_DB__`.`m_acc_coa` TO 'kosipa_master_w'@'__HOST__';
GRANT SELECT (`jenis_pinjaman`, `jenis_potongan`, `bank_pembiaya`, `pembiayaan_code`) ON `__KOSIPA_DB__`.`trans_pinjaman` TO 'kosipa_master_w'@'__HOST__';
GRANT SELECT (`jenis_simpanan`) ON `__KOSIPA_DB__`.`trans_simpanan` TO 'kosipa_master_w'@'__HOST__';
GRANT SELECT (`jenis_simpanan`) ON `__KOSIPA_DB__`.`trans_simpanan_dtl` TO 'kosipa_master_w'@'__HOST__';
GRANT SELECT (`jenis_simpanan`) ON `__KOSIPA_DB__`.`m_simpanan_aktif` TO 'kosipa_master_w'@'__HOST__';
-- END product masters
