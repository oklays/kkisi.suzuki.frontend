-- KOSIPA loan writer (FA-04: loan decision post/approve/reject). Template: __KOSIPA_DB__ __LEDGER_DB__ __HOST__ __PW__. Idempotent.
--   trans_pinjaman: SELECT (decision facts, version); UPDATE only doc_status, keterangan_riject and the decision stamp columns legacy never filled
--     (posting_doc/_usr, approved_doc/_usr, rejected_doc/_usr) plus ud/ud_usr. NOT cd_usr (ANO-K27), no amount, disbursement or settlement column, no INSERT, no DELETE.
--   trans_pinjaman_pengajuan: SELECT the identity/status columns; UPDATE doc_status, keterangan_riject (exactly what legacy ajax_posting writes).
--   m_anggota: SELECT id, nik_kar, status_anggota (approval member check). orders: SELECT order_code (PPOB pay-later guard).
--   No trans_pinjaman_dtl, trans_pinjaman_rollover: a decision never touches the schedule or roll-over links (REQ-120 settles them at disbursement).
--   ref_menu fence; ref_users display name; ledger SELECT, INSERT.
CREATE USER IF NOT EXISTS 'kosipa_loan_w'@'__HOST__' IDENTIFIED BY '__PW__' WITH MAX_USER_CONNECTIONS 2;
ALTER USER 'kosipa_loan_w'@'__HOST__' IDENTIFIED BY '__PW__' WITH MAX_USER_CONNECTIONS 2;
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'kosipa_loan_w'@'__HOST__';

GRANT SELECT ON `__KOSIPA_DB__`.`trans_pinjaman` TO 'kosipa_loan_w'@'__HOST__';
GRANT UPDATE (`doc_status`, `keterangan_riject`, `posting_doc`, `posting_doc_usr`, `approved_doc`, `approved_doc_usr`, `rejected_doc`, `rejected_doc_usr`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`trans_pinjaman` TO 'kosipa_loan_w'@'__HOST__';
GRANT SELECT (`id`, `doc_no`, `doc_status`, `keterangan_riject`) ON `__KOSIPA_DB__`.`trans_pinjaman_pengajuan` TO 'kosipa_loan_w'@'__HOST__';
GRANT UPDATE (`doc_status`, `keterangan_riject`) ON `__KOSIPA_DB__`.`trans_pinjaman_pengajuan` TO 'kosipa_loan_w'@'__HOST__';
GRANT SELECT (`id`, `nik_kar`, `status_anggota`) ON `__KOSIPA_DB__`.`m_anggota` TO 'kosipa_loan_w'@'__HOST__';
GRANT SELECT (`id`, `order_code`) ON `__KOSIPA_DB__`.`orders` TO 'kosipa_loan_w'@'__HOST__';
GRANT SELECT (`id`, `url`, `status`) ON `__KOSIPA_DB__`.`ref_menu` TO 'kosipa_loan_w'@'__HOST__';
GRANT SELECT (`id_ref_user`, `nama_lengkap`) ON `__KOSIPA_DB__`.`ref_users` TO 'kosipa_loan_w'@'__HOST__';
GRANT SELECT, INSERT ON `__LEDGER_DB__`.* TO 'kosipa_loan_w'@'__HOST__';
