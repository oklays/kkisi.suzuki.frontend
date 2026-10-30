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
