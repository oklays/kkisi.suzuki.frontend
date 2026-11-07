-- FA-03C T07: the legacy Setor Simpanan controller, granted to the synthetic group and FENCED (status 0) as at cutover. INSERT IGNORE by explicit id.
INSERT IGNORE INTO `__KOSIPA_DB__`.`ref_menu` (id, nama_menu, url, status, parent_id, jenis_menu, akses_menu) VALUES (9114, 'SYNTH Setor Simpanan', 'simpanan/sim_setor_c', 0, 0, 'WEB', 'PRIVATE');
INSERT IGNORE INTO `__KOSIPA_DB__`.`ref_menu_akses` (id, id_menu, id_group, status, tambah, edit, hapus, posting, approved) VALUES (9114, 9114, 9101, 1, 1, 1, 1, 0, 0);
-- The legacy member savings tab (read): grants kosipa.savings.view to the synthetic linked users, as the production group menus do. Not a writer, not fenced.
INSERT IGNORE INTO `__KOSIPA_DB__`.`ref_menu` (id, nama_menu, url, status, parent_id, jenis_menu, akses_menu) VALUES (9115, 'SYNTH Simpanan Anggota', 'anggota/trans_simpanan_c', 1, 0, 'WEB', 'PRIVATE');
INSERT IGNORE INTO `__KOSIPA_DB__`.`ref_menu_akses` (id, id_menu, id_group, status, tambah, edit, hapus, posting, approved) VALUES (9115, 9115, 9101, 1, 1, 1, 1, 0, 0);
