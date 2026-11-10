-- KOSIPA member-request writer (P1): PWA intake of mobile loan / deduction-change requests, rejection of mobile loan requests, and
-- deduction-change approval/rejection (legacy F45). Template: __KOSIPA_DB__, __LEDGER_DB__, __HOST__, __PW__. Applied ONLY to the synthetic stack
-- (integration/kosipa-full-access/local-stack.mjs request-writer). Production: docs/migration/sql/kosipa-member-request-writer-production.sql, run by
-- the operator after review. Exact column grants, no DDL, no GRANT OPTION, at most 2 connections (NFR-102).
CREATE USER IF NOT EXISTS 'kosipa_request_w'@'__HOST__' IDENTIFIED BY '__PW__' WITH MAX_USER_CONNECTIONS 2;
ALTER USER 'kosipa_request_w'@'__HOST__' IDENTIFIED BY '__PW__' WITH MAX_USER_CONNECTIONS 2;
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'kosipa_request_w'@'__HOST__';

-- Intake + rejection of mobile loan requests (conversion into trans_pinjaman stays legacy F47: no grant on trans_pinjaman beyond reading doc_no).
GRANT SELECT, INSERT ON `__KOSIPA_DB__`.`trans_pinjaman_pengajuan` TO 'kosipa_request_w'@'__HOST__';
GRANT UPDATE (`doc_status`, `keterangan_riject`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`trans_pinjaman_pengajuan` TO 'kosipa_request_w'@'__HOST__';
GRANT SELECT (`id`, `doc_no`) ON `__KOSIPA_DB__`.`trans_pinjaman` TO 'kosipa_request_w'@'__HOST__';
GRANT SELECT (`id`, `jenis_pinjaman`, `min_nominal`, `max_nominal`, `min_jw`, `max_jw`, `jasa`, `status`) ON `__KOSIPA_DB__`.`m_pinjaman_mobile` TO 'kosipa_request_w'@'__HOST__';
GRANT SELECT (`id`, `jenis_pinjaman_name`, `jenis_bunga`, `is_active`) ON `__KOSIPA_DB__`.`m_jenis_pinjaman` TO 'kosipa_request_w'@'__HOST__';

-- Intake + decisions of deduction-change requests.
GRANT SELECT, INSERT ON `__KOSIPA_DB__`.`trans_simpanan_pengajuan` TO 'kosipa_request_w'@'__HOST__';
GRANT UPDATE (`doc_status`, `posting_date`, `updated_at`, `ud_usr`) ON `__KOSIPA_DB__`.`trans_simpanan_pengajuan` TO 'kosipa_request_w'@'__HOST__';
GRANT SELECT, INSERT ON `__KOSIPA_DB__`.`m_simpanan_aktif` TO 'kosipa_request_w'@'__HOST__';
GRANT UPDATE (`doc_no`, `potongan_payroll`, `status`, `ud`, `usr_ud`) ON `__KOSIPA_DB__`.`m_simpanan_aktif` TO 'kosipa_request_w'@'__HOST__';

-- The member row: identity re-check, the per-member intake lock (SELECT ... FOR UPDATE), and the two deduction amounts F45 writes.
GRANT SELECT (`id`, `nik_kar`, `nama_kar`, `status_anggota`, `bagian`, `lokasi`, `no_telp`, `kd_group`, `sim_wajib`, `sim_sukarela`) ON `__KOSIPA_DB__`.`m_anggota` TO 'kosipa_request_w'@'__HOST__';
GRANT UPDATE (`sim_wajib`, `sim_sukarela`) ON `__KOSIPA_DB__`.`m_anggota` TO 'kosipa_request_w'@'__HOST__';

-- Legacy fence and decision stamps.
GRANT SELECT (`id`, `url`, `status`) ON `__KOSIPA_DB__`.`ref_menu` TO 'kosipa_request_w'@'__HOST__';
GRANT SELECT (`id_ref_user`, `nama_lengkap`) ON `__KOSIPA_DB__`.`ref_users` TO 'kosipa_request_w'@'__HOST__';
GRANT SELECT, INSERT ON `__LEDGER_DB__`.* TO 'kosipa_request_w'@'__HOST__';
