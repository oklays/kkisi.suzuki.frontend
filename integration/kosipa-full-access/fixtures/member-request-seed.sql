-- P1 member requests. Ids 9160-9179 are reserved. Both legacy deduction-request screens are granted to the synthetic group and FENCED (status 0)
-- as at cutover; Master Pinjaman Mobile gets two active products (Flat with a rate, and one without a rate: refused by intake).
INSERT IGNORE INTO `__KOSIPA_DB__`.`ref_menu` (id, nama_menu, url, status, parent_id, jenis_menu, akses_menu) VALUES (9160, 'SYNTH Pengajuan Mobile', 'mobile/pengajuan_mobile_c', 0, 0, 'WEB', 'PRIVATE');
INSERT IGNORE INTO `__KOSIPA_DB__`.`ref_menu` (id, nama_menu, url, status, parent_id, jenis_menu, akses_menu) VALUES (9161, 'SYNTH Pengajuan Mobile (simpanan)', 'simpanan/pengajuan_mobile_c', 0, 0, 'WEB', 'PRIVATE');
INSERT IGNORE INTO `__KOSIPA_DB__`.`ref_menu_akses` (id, id_menu, id_group, status, tambah, edit, hapus, posting, approved) VALUES (9160, 9160, 9101, 1, 1, 1, 1, 1, 1);
INSERT IGNORE INTO `__KOSIPA_DB__`.`ref_menu_akses` (id, id_menu, id_group, status, tambah, edit, hapus, posting, approved) VALUES (9161, 9161, 9101, 1, 1, 1, 1, 1, 1);
INSERT IGNORE INTO `__KOSIPA_DB__`.`m_pinjaman_mobile` (id, jenis_pinjaman, min_nominal, max_nominal, min_jw, max_jw, jasa, status) VALUES (9160, 'SYNTH Pinjaman Reguler', 1000000, 50000000, 3, 36, '1', 1);
INSERT IGNORE INTO `__KOSIPA_DB__`.`m_pinjaman_mobile` (id, jenis_pinjaman, min_nominal, max_nominal, min_jw, max_jw, jasa, status) VALUES (9161, 'SYNTH Kasbon', 500000, 2000000, 1, 3, '', 1);
