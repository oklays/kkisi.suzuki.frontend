-- KOSIPA savings writer (FA-03C T07: voluntary-savings deposits). Template: __KOSIPA_DB__ __LEDGER_DB__ __HOST__ __PW__. Idempotent.
--   trans_simpanan / trans_simpanan_dtl: SELECT (versions, numbering uniqueness, balances), INSERT exactly the columns legacy sim_setor_c writes plus the
--   NOT NULL ones legacy left to non-strict SQL mode (is_mobile, saldo_awal_penarikan, line saldo); UPDATE only doc_no (row-id numbering), status, tgl_cair,
--   ud/ud_usr. No DELETE (FD-37: never deleted), no amount/member/date UPDATE.
--   m_anggota, m_jenis_simpanan: SELECT the identity/status/product columns only. ref_menu fence; ref_users display name; ledger SELECT, INSERT.
CREATE USER IF NOT EXISTS 'kosipa_savings_w'@'__HOST__' IDENTIFIED BY '__PW__' WITH MAX_USER_CONNECTIONS 2;
ALTER USER 'kosipa_savings_w'@'__HOST__' IDENTIFIED BY '__PW__' WITH MAX_USER_CONNECTIONS 2;
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'kosipa_savings_w'@'__HOST__';

GRANT SELECT ON `__KOSIPA_DB__`.`trans_simpanan` TO 'kosipa_savings_w'@'__HOST__';
GRANT INSERT (`doc_date`, `doc_status`, `start_date`, `finish_date`, `periode_bl`, `periode_th`, `doc_type`, `jenis_simpanan`, `payment_type`, `remarks`, `jenis_transaksi`, `cd`, `cd_usr`, `is_mobile`, `saldo_awal_penarikan`) ON `__KOSIPA_DB__`.`trans_simpanan` TO 'kosipa_savings_w'@'__HOST__';
GRANT UPDATE (`doc_no`, `doc_status`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`trans_simpanan` TO 'kosipa_savings_w'@'__HOST__';
GRANT SELECT ON `__KOSIPA_DB__`.`trans_simpanan_dtl` TO 'kosipa_savings_w'@'__HOST__';
GRANT INSERT (`doc_no`, `doc_no_dtl`, `nik_kar`, `nama`, `kd_group`, `jenis_simpanan`, `rek_bank`, `rek_nama`, `rek_no`, `remark_detail`, `periode_th`, `periode_bl`, `start_date`, `finish_date`, `debit`, `kredit_cash`, `kredit`, `jasa_kredit`, `saldo`, `doc_status`, `cd`, `cd_usr`) ON `__KOSIPA_DB__`.`trans_simpanan_dtl` TO 'kosipa_savings_w'@'__HOST__';
GRANT UPDATE (`doc_status`, `tgl_cair`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`trans_simpanan_dtl` TO 'kosipa_savings_w'@'__HOST__';
GRANT SELECT (`id`, `nik_kar`, `nama_kar`, `kd_group`, `status_anggota`) ON `__KOSIPA_DB__`.`m_anggota` TO 'kosipa_savings_w'@'__HOST__';
GRANT SELECT (`id`, `jenis_simpanan_code`, `is_active`) ON `__KOSIPA_DB__`.`m_jenis_simpanan` TO 'kosipa_savings_w'@'__HOST__';
GRANT SELECT (`id`, `url`, `status`) ON `__KOSIPA_DB__`.`ref_menu` TO 'kosipa_savings_w'@'__HOST__';
GRANT SELECT (`id_ref_user`, `nama_lengkap`) ON `__KOSIPA_DB__`.`ref_users` TO 'kosipa_savings_w'@'__HOST__';
GRANT SELECT, INSERT ON `__LEDGER_DB__`.* TO 'kosipa_savings_w'@'__HOST__';
