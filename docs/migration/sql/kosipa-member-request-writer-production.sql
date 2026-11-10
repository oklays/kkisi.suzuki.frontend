-- kosipa-member-request-writer-production.sql — REVIEW-ONLY. NOT executed by engineering (P1 member requests). Nothing here has run on production.
-- What it enables: the PWA Anggota submits loan applications and deduction changes through apps/web (signed internal endpoint), and officers reject
-- mobile loan requests / approve or reject deduction changes in the console (Pengajuan anggota). Converting a loan request into a loan stays legacy
-- (mobile/pinjaman_mobile_c, F47), so this account has NO write on trans_pinjaman.
-- Order:
--   1 owner decision for deduction requests: strict (fence mobile/pengajuan_mobile_c + simpanan/pengajuan_mobile_c with apps/web/scripts/kosipa-legacy-fence.mjs
--     request.deduction) or coexistence (KOSIPA_DEDUCTION_REQUEST_LEGACY_SHARED=true; legacy keeps deciding too, the console refuses a request that changed);
--   2 STEP 1-2 below;
--   3 apps/web: DATABASE_URL_KOSIPA_REQUEST_WRITE, KOSIPA_REQUEST_WRITES_ENABLED=true, KOSIPA_MEMBER_INTAKE_ENABLED=true, MEMBER_INTAKE_KEYS (same ring as the
--     PWA), KOSIPA_WRITE_OWNERSHIP += member.intake,request.loan,request.deduction; grant kosipa.request.decide to named officers (two administrators);
--   4 PWA: MEMBER_INTAKE_API_URL + MEMBER_INTAKE_KEYS, then ENABLE_LOAN_APPLICATION / ENABLE_DEDUCTION_CHANGE (deploy/mobile_kkisi/env.production.example).
-- The application refuses any production KOSIPA writer until its guard (prisma-kosipa-master-write.ts) is extended in a separately reviewed change.
-- Replace: __KOSIPA_DB__ production business database; __LEDGER_DB__ ledger database; __WRITER_USER__ a NEW dedicated account (cPanel, own password,
--   MAX_USER_CONNECTIONS 2). If the host refuses column-level GRANTs, STOP and report; never fall back to table-wide UPDATE.
--   trans_pinjaman_pengajuan: SELECT, INSERT (OPEN intake); UPDATE only doc_status, keterangan_riject, ud, ud_usr (rejection). No DELETE.
--   trans_simpanan_pengajuan: SELECT, INSERT (OPEN intake); UPDATE only doc_status, posting_date, updated_at, ud_usr (decision). No DELETE.
--   m_simpanan_aktif: SELECT, INSERT; UPDATE only doc_no, potongan_payroll, status, ud, usr_ud (F45 approval).
--   m_anggota: SELECT identity + deduction columns; UPDATE only sim_wajib, sim_sukarela (F45 approval). Never names, NIK, status or limits.
--   trans_pinjaman: SELECT id, doc_no (a converted request is never rejected). Master Pinjaman Mobile + loan types: SELECT the product rule columns.
--   ref_menu fence; ref_users decision name; ledger SELECT, INSERT.
-- STEP 1:
GRANT SELECT, INSERT ON `__KOSIPA_DB__`.`trans_pinjaman_pengajuan` TO `__WRITER_USER__`@'%';
GRANT UPDATE (`doc_status`, `keterangan_riject`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`trans_pinjaman_pengajuan` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id`, `doc_no`) ON `__KOSIPA_DB__`.`trans_pinjaman` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id`, `jenis_pinjaman`, `min_nominal`, `max_nominal`, `min_jw`, `max_jw`, `jasa`, `status`) ON `__KOSIPA_DB__`.`m_pinjaman_mobile` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id`, `jenis_pinjaman_name`, `jenis_bunga`, `is_active`) ON `__KOSIPA_DB__`.`m_jenis_pinjaman` TO `__WRITER_USER__`@'%';
GRANT SELECT, INSERT ON `__KOSIPA_DB__`.`trans_simpanan_pengajuan` TO `__WRITER_USER__`@'%';
GRANT UPDATE (`doc_status`, `posting_date`, `updated_at`, `ud_usr`) ON `__KOSIPA_DB__`.`trans_simpanan_pengajuan` TO `__WRITER_USER__`@'%';
GRANT SELECT, INSERT ON `__KOSIPA_DB__`.`m_simpanan_aktif` TO `__WRITER_USER__`@'%';
GRANT UPDATE (`doc_no`, `potongan_payroll`, `status`, `ud`, `usr_ud`) ON `__KOSIPA_DB__`.`m_simpanan_aktif` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id`, `nik_kar`, `nama_kar`, `status_anggota`, `bagian`, `lokasi`, `no_telp`, `kd_group`, `sim_wajib`, `sim_sukarela`) ON `__KOSIPA_DB__`.`m_anggota` TO `__WRITER_USER__`@'%';
GRANT UPDATE (`sim_wajib`, `sim_sukarela`) ON `__KOSIPA_DB__`.`m_anggota` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id`, `url`, `status`) ON `__KOSIPA_DB__`.`ref_menu` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id_ref_user`, `nama_lengkap`) ON `__KOSIPA_DB__`.`ref_users` TO `__WRITER_USER__`@'%';
GRANT SELECT, INSERT ON `__LEDGER_DB__`.* TO `__WRITER_USER__`@'%';
-- STEP 2 (read-only): must show these grants and NO DELETE, DROP, ALTER, CREATE or GRANT OPTION.
SHOW GRANTS FOR `__WRITER_USER__`@'%';
-- Open item before enabling deduction intake for SUKARELA/WAJIB members enrolled in the public savings link: the public-savings CP2 design adds
-- triggers on trans_simpanan_pengajuan (integration/public-savings/schema.sql, B-05 reservation). If those triggers are deployed, verify on a copy
-- that a PPS-MBL insert for an enrolled member behaves as the owner expects before step 4.
-- ROLLBACK: PWA flags off, then apps/web KOSIPA_MEMBER_INTAKE_ENABLED / KOSIPA_REQUEST_WRITES_ENABLED unset, then the fence ROLLBACK block if applied, then:
--   REVOKE ALL PRIVILEGES, GRANT OPTION FROM `__WRITER_USER__`@'%'; DROP USER `__WRITER_USER__`@'%';
