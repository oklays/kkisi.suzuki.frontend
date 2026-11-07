-- Synthetic rows for the KOSIPA product masters (FA-03B T06). Every value is invented; the three savings codes are the literals legacy
-- code hard-wires ('SIMPANAN POKOK' / 'SIMPANAN WAJIB' / 'SIMPANAN SUKARELA'), and the loan-type roots keep the ids legacy pages filter on
-- (parent_id 1 reguler, 2 bank, 3 kasbon, 4 pembiayaan, 28 KPR). INSERT IGNORE by explicit id: re-running changes nothing.
INSERT IGNORE INTO `__KOSIPA_DB__`.`m_acc_coa` (id, parent_id, coa_no, coa_name, coa_desc, coa_group) VALUES
  (9001, 0, '1-0000', 'SYNTH AKTIVA', 'SYNTH Aktiva (kelompok)', 1),
  (9002, 9001, '1-1100', 'SYNTH KAS', 'SYNTH Kas Koperasi', 0),
  (9003, 9001, '1-1300', 'SYNTH PIUTANG', 'SYNTH Piutang Pinjaman Anggota', 0),
  (9004, 0, '2-1100', 'SYNTH SIM POKOK', 'SYNTH Simpanan Pokok Anggota', 0),
  (9005, 0, '2-1200', 'SYNTH SIM WAJIB', 'SYNTH Simpanan Wajib Anggota', 0),
  (9006, 0, '4-1100', 'SYNTH PENDAPATAN', 'SYNTH Pendapatan Jasa Pinjaman', 0),
  (9007, 0, '9-9999', 'SYNTH PANJANG', 'SYNTH Akun dengan deskripsi yang sengaja melebihi lima puluh karakter', 0);
INSERT IGNORE INTO `__KOSIPA_DB__`.`m_jenis_simpanan` (id, jenis_simpanan_code, jenis_simpanan_name, jenis_simpanan_remarks, akun_code, akun_desc, is_active, is_active_tarik_deposito, bunga_simpanan) VALUES
  (1, 'SIMPANAN POKOK', 'SYNTH Simpanan Pokok', '', '2-1100', 'SYNTH Simpanan Pokok Anggota', 1, 0, 0.00),
  (2, 'SIMPANAN WAJIB', 'SYNTH Simpanan Wajib', '', '2-1200', 'SYNTH Simpanan Wajib Anggota', 1, 0, 0.00),
  (3, 'SIMPANAN SUKARELA', 'SYNTH Simpanan Sukarela', '', '2-1200', 'SYNTH Simpanan Wajib Anggota', 1, 1, 2.50);
INSERT IGNORE INTO `__KOSIPA_DB__`.`m_jenis_pembiayaan` (id, pembiayaan_code, pembiayaan_name, pembiayaan_remarks, jenis_bunga, biaya_asuransi, biaya_jasa, biaya_admin, biaya_bunga, biaya_pinalty, tgl_tempo, akun_code, akun_desc, lock_1angsuran, is_active) VALUES
  (1, 'SYN-PB-REG', 'SYNTH Pembiayaan Reguler', '', 'Flat', 0.50, 1.2500, 10000.00, 1.00, 0.00, 25, '1-1300', 'SYNTH Piutang Pinjaman Anggota', 0, '1'),
  (2, 'SYN-PB-OFF', 'SYNTH Pembiayaan Lama', '', 'Anuitas', 0.00, 0.0000, 0.00, 0.00, 0.00, 0, '1-1300', 'SYNTH Piutang Pinjaman Anggota', 1, '0');
INSERT IGNORE INTO `__KOSIPA_DB__`.`m_jenis_pinjaman` (id, jenis_pinjaman_code, jenis_pinjaman_name, jenis_pinjaman_remarks, jenis_pembiayaan, akun_code, akun_desc, jenis_bunga, biaya_asuransi, biaya_jasa, biaya_admin, biaya_bunga, biaya_pinalty, tgl_tempo, lock_1angsuran, is_active, akun_code_pembiayaan, akun_desc_pembiayaan, akun_code_pendapatan, akun_desc_pendapatan, parent_id, max_angsuran, max_pinjaman) VALUES
  (1, 'SYN-ROOT-REG', 'SYNTH Pinjaman Reguler', '', 'SYN-PB-REG', '1-1300', 'SYNTH Piutang Pinjaman Anggota', 'Flat', 0, 0, 0, '0', 0, 25, 0, '1', '1-1300', 'SYNTH Piutang Pinjaman Anggota', '4-1100', 'SYNTH Pendapatan Jasa Pinjaman', 0, 60, 100000000.00),
  (2, 'SYN-ROOT-BANK', 'SYNTH Pinjaman Bank', '', 'SYN-PB-REG', '1-1300', 'SYNTH Piutang Pinjaman Anggota', 'Anuitas', 0, 0, 0, '0', 0, 25, 0, '1', NULL, NULL, NULL, NULL, 0, 120, 500000000.00),
  (3, 'SYN-ROOT-KASBON', 'SYNTH Kasbon', '', 'SYN-PB-REG', '1-1300', 'SYNTH Piutang Pinjaman Anggota', 'Flat', 0, 0, 0, '0', 0, 25, 1, '1', NULL, NULL, NULL, NULL, 0, 3, 5000000.00),
  (4, 'SYN-ROOT-PB', 'SYNTH Pembiayaan', '', 'SYN-PB-REG', '1-1300', 'SYNTH Piutang Pinjaman Anggota', 'Flat', 0, 0, 0, '0', 0, 25, 0, '1', NULL, NULL, NULL, NULL, 0, 36, 50000000.00),
  (28, 'SYN-ROOT-KPR', 'SYNTH KPR', '', 'SYN-PB-REG', '1-1300', 'SYNTH Piutang Pinjaman Anggota', 'Anuitas', 0, 0, 0, '0', 0, 25, 0, '1', NULL, NULL, NULL, NULL, 0, 240, 750000000.00),
  (29, 'SYN-PJ-REG', 'SYNTH Reguler 3 Tahun', '', 'SYN-PB-REG', '1-1300', 'SYNTH Piutang Pinjaman Anggota', 'Flat', 0.50, 1.00, 10000.00, '1.5', 0.00, 25, 0, '1', '1-1300', 'SYNTH Piutang Pinjaman Anggota', '4-1100', 'SYNTH Pendapatan Jasa Pinjaman', 1, 36, 50000000.00);
-- Legacy maintenance controllers: granted to the synthetic group and FENCED (status 0), as at cutover.
INSERT IGNORE INTO `__KOSIPA_DB__`.`ref_menu` (id, nama_menu, url, status, parent_id, jenis_menu, akses_menu) VALUES
  (9110, 'SYNTH Jenis Simpanan', 'master/jenis_simpanan_c', 0, 0, 'WEB', 'PRIVATE'), (9111, 'SYNTH Jenis Pinjaman', 'master/jenis_pinjaman_c', 0, 0, 'WEB', 'PRIVATE'),
  (9112, 'SYNTH Jenis Pembiayaan', 'master/jenis_pembiayaan_c', 0, 0, 'WEB', 'PRIVATE'), (9113, 'SYNTH Suku Bunga', 'master/suku_bunga_c', 0, 0, 'WEB', 'PRIVATE');
INSERT IGNORE INTO `__KOSIPA_DB__`.`ref_menu_akses` (id, id_menu, id_group, status, tambah, edit, hapus, posting, approved) VALUES
  (9110, 9110, 9101, 1, 1, 1, 1, 0, 0), (9111, 9111, 9101, 1, 1, 1, 1, 0, 0), (9112, 9112, 9101, 1, 1, 1, 1, 0, 0), (9113, 9113, 9101, 1, 1, 1, 1, 0, 0);
