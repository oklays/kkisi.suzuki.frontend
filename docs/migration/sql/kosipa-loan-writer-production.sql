-- kosipa-loan-writer-production.sql — REVIEW-ONLY. NOT executed by engineering (FA-04 loan decision; cutover gate B6). Nothing here has run on production.
-- Order: 1 no loan waiting on a legacy screen mid-decision, 2 legacy fence of every loan controller (apps/web/scripts/kosipa-legacy-fence.mjs loan.decision:
--   pinjaman/pinjaman_c, pinjaman_reguler_c, pinjaman_bank_c, kasbon_c, pembiayaan_c, gaji_minus_c, kpr_btn_c, mobile/pinjaman_mobile_c — this also closes legacy
--   application, edit and DISBURSEMENT on those screens; the UAT coexistence flag KOSIPA_LOAN_DECISION_LEGACY_SHARED skips this step and needs a fresh owner
--   decision before production, see docs/superpowers/specs/kosipa-full-access/fa-04/LOAN_DECISION.md §6), 3 STEP 1-2 below,
-- 4 application: DATABASE_URL_KOSIPA_LOAN_WRITE, KOSIPA_LOAN_WRITES_ENABLED=true, KOSIPA_WRITE_OWNERSHIP += loan.decision; grant kosipa.loan.prepare /
--   kosipa.loan.approve to named officers (two administrators).
-- The application refuses any production writer until its guard is extended in a separately reviewed change.
-- Replace: __KOSIPA_DB__ production business database; __LEDGER_DB__ ledger database; __WRITER_USER__ a NEW dedicated account (cPanel, own password,
--   MAX_USER_CONNECTIONS 2). If the host refuses column-level GRANTs, STOP and report; never fall back to table-wide UPDATE.
--   trans_pinjaman: SELECT; UPDATE only doc_status, keterangan_riject, the decision stamps (posting_doc/_usr, approved_doc/_usr, rejected_doc/_usr), ud/ud_usr.
--     Never cd_usr (the maker, ANO-K27), amounts, disbursement or settlement columns. No INSERT, no DELETE.
--   trans_pinjaman_pengajuan: SELECT id/doc_no/status/reason; UPDATE doc_status, keterangan_riject (the mobile member sees the decision).
--   m_anggota: SELECT id, nik_kar, status_anggota. orders: SELECT id, order_code (PPOB pay-later loans are refused). ref_menu fence; ref_users name; ledger.
-- STEP 1:
GRANT SELECT ON `__KOSIPA_DB__`.`trans_pinjaman` TO `__WRITER_USER__`@'%';
GRANT UPDATE (`doc_status`, `keterangan_riject`, `posting_doc`, `posting_doc_usr`, `approved_doc`, `approved_doc_usr`, `rejected_doc`, `rejected_doc_usr`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`trans_pinjaman` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id`, `doc_no`, `doc_status`, `keterangan_riject`) ON `__KOSIPA_DB__`.`trans_pinjaman_pengajuan` TO `__WRITER_USER__`@'%';
GRANT UPDATE (`doc_status`, `keterangan_riject`) ON `__KOSIPA_DB__`.`trans_pinjaman_pengajuan` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id`, `nik_kar`, `status_anggota`) ON `__KOSIPA_DB__`.`m_anggota` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id`, `order_code`) ON `__KOSIPA_DB__`.`orders` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id`, `url`, `status`) ON `__KOSIPA_DB__`.`ref_menu` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id_ref_user`, `nama_lengkap`) ON `__KOSIPA_DB__`.`ref_users` TO `__WRITER_USER__`@'%';
GRANT SELECT, INSERT ON `__LEDGER_DB__`.* TO `__WRITER_USER__`@'%';
-- STEP 2 (read-only): must show these grants and NO DELETE, DROP, ALTER, CREATE or GRANT OPTION.
SHOW GRANTS FOR `__WRITER_USER__`@'%';
-- ROLLBACK: application first (KOSIPA_LOAN_WRITES_ENABLED unset), then the fence ROLLBACK block, then:
--   REVOKE ALL PRIVILEGES, GRANT OPTION FROM `__WRITER_USER__`@'%'; DROP USER `__WRITER_USER__`@'%';
