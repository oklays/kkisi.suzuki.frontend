-- kosipa-member-writer-production.sql — REVIEW-ONLY. NOT executed by engineering (FA-03B T04; cutover gate B6). Nothing in this file has been run on
-- production, staging or DEV LOCAL. Run by the operator only after the member cutover group (C-n) is approved, in this order:
--   1. legacy fence of master/anggota_c, anggota/anggota_c and mobile/users_c (apps/web/scripts/kosipa-legacy-fence.mjs member)
--   2. this script (STEP 1), verification (STEP 2)
--   3. application: DATABASE_URL_KOSIPA_MEMBER_WRITE, KOSIPA_MEMBER_WRITES_ENABLED=true, KOSIPA_WRITE_OWNERSHIP += member, KOSIPA_MEMBER_VERSION_SECRET
-- The application REFUSES to start a member writer against anything but the synthetic stack until its guard (prisma-kosipa-member-write.ts) is
-- extended in a separately reviewed change: this script alone does not enable production writes.
--
-- Replace before running (operator only):
--   __KOSIPA_DB__  production KOSIPA business database      __LEDGER_DB__  the command-ledger database of kosipa-command-ledger-production.sql
--   __WRITER_USER__ a NEW dedicated account (own login, never shared with the reader, console store, master writer or any TOKO writer)
--
-- STEP 0 (cPanel UI): create __WRITER_USER__ with its own password; MAX_USER_CONNECTIONS 2 (NFR-102). Then run the GRANTs below as the owner
--   account (phpMyAdmin). Column-level grants are statements MySQL accepts even though the cPanel "privileges" screen cannot express them. If the
--   host refuses column grants, STOP and report: do not fall back to a table-wide UPDATE on m_anggota.
-- STEP 1: GRANTs (this is exactly apps/web/db/kosipa/006_member_writer_grants.sql.tpl, which the DB tests exercise on the synthetic stack):
GRANT SELECT (`id`, `doc_no`, `no_anggota`, `nik_kar`, `id_card`, `tgl_daftar`, `nama_kar`, `ktp`, `email`, `jenis_kel`, `tgl_lahir`, `tempat_lahir`, `alamat`, `rt`, `rw`, `provinsi`, `kabupaten`, `kecamatan`, `kelurahan`, `kode_pos`, `alamat_tinggal`, `kelurahan_tinggal`, `kecamatan_tinggal`, `kabupaten_tinggal`, `kode_pos_tinggal`, `no_telp`, `no_telp1`, `status_rumah`, `pendidikan`, `status_nikah`, `nama_istri`, `ibu_kandung`, `npwp`, `divisi`, `dept`, `bagian`, `kd_group`, `jabatan`, `tgl_karyawan`, `tgl_masuk`, `tgl_keluar`, `lokasi`, `status_karyawan`, `no_rek`, `bank_rek`, `nama_rek`, `gaji`, `sim_wajib`, `sim_pokok`, `sim_sukarela`, `status_pot_pokok`, `status_pot_wajib`, `status_pot_sukarela`, `limit_toko_old`, `limit_toko`, `gaji_minus`, `limit_persen`, `batas_pinjaman`, `limit_ppob`, `status_anggota`, `foto_profile`, `foto_ktp`, `foto_ttd`, `surat_kuasa`, `persetujuan`, `foto_kk`, `foto_bukti_biaya_sekolah`, `cd`, `cd_usr`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`m_anggota` TO `__WRITER_USER__`@'%';
GRANT INSERT (`nama_kar`, `ktp`, `email`, `jenis_kel`, `tgl_lahir`, `tempat_lahir`, `alamat`, `rt`, `rw`, `provinsi`, `kabupaten`, `kecamatan`, `kelurahan`, `kode_pos`, `alamat_tinggal`, `kelurahan_tinggal`, `kecamatan_tinggal`, `kabupaten_tinggal`, `kode_pos_tinggal`, `no_telp`, `no_telp1`, `status_rumah`, `pendidikan`, `status_nikah`, `nama_istri`, `ibu_kandung`, `npwp`, `divisi`, `dept`, `bagian`, `kd_group`, `jabatan`, `tgl_karyawan`, `tgl_masuk`, `tgl_keluar`, `lokasi`, `status_karyawan`, `no_rek`, `bank_rek`, `nama_rek`, `gaji`, `nik_kar`, `id_card`, `tgl_daftar`, `status_anggota`, `doc_no`, `no_anggota`, `sim_pokok`, `sim_wajib`, `sim_sukarela`, `gaji_minus`, `limit_toko_old`, `limit_toko`, `limit_persen`, `surat_kuasa`, `cd`, `cd_usr`) ON `__KOSIPA_DB__`.`m_anggota` TO `__WRITER_USER__`@'%';
GRANT UPDATE (`nama_kar`, `ktp`, `email`, `jenis_kel`, `tgl_lahir`, `tempat_lahir`, `alamat`, `rt`, `rw`, `provinsi`, `kabupaten`, `kecamatan`, `kelurahan`, `kode_pos`, `alamat_tinggal`, `kelurahan_tinggal`, `kecamatan_tinggal`, `kabupaten_tinggal`, `kode_pos_tinggal`, `no_telp`, `no_telp1`, `status_rumah`, `pendidikan`, `status_nikah`, `nama_istri`, `ibu_kandung`, `npwp`, `divisi`, `dept`, `bagian`, `kd_group`, `jabatan`, `tgl_karyawan`, `tgl_masuk`, `tgl_keluar`, `lokasi`, `status_karyawan`, `no_rek`, `bank_rek`, `nama_rek`, `gaji`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`m_anggota` TO `__WRITER_USER__`@'%';
GRANT UPDATE (`status_anggota`, `limit_toko`, `limit_ppob`, `gaji_minus`) ON `__KOSIPA_DB__`.`m_anggota` TO `__WRITER_USER__`@'%';
GRANT INSERT (`jenis_simpanan`, `nik_kar`, `nama_kar`, `kd_group`, `potongan_old`, `potongan_payroll`, `status`, `is_mobile`) ON `__KOSIPA_DB__`.`m_simpanan_aktif` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id`, `nik`, `ktp`, `name`, `phone`, `email`, `street_address`) ON `__KOSIPA_DB__`.`users` TO `__WRITER_USER__`@'%';
GRANT UPDATE (`ktp`, `name`, `phone`, `email`, `street_address`) ON `__KOSIPA_DB__`.`users` TO `__WRITER_USER__`@'%';
GRANT SELECT (`is_active`, `is_delete`, `admin_verifikasi`, `temporary_token`, `wallet_balance`, `wallet_balance_ppob`) ON `__KOSIPA_DB__`.`users` TO `__WRITER_USER__`@'%';
GRANT UPDATE (`is_active`, `is_delete`, `admin_verifikasi`, `temporary_token`, `wallet_balance`, `wallet_balance_ppob`) ON `__KOSIPA_DB__`.`users` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id`, `user_id`), DELETE ON `__KOSIPA_DB__`.`oauth_access_tokens` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id`, `name_bagian`, `status`) ON `__KOSIPA_DB__`.`m_bagian` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id`, `name_lokasi`, `status`) ON `__KOSIPA_DB__`.`m_lokasi` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id`, `url`, `status`) ON `__KOSIPA_DB__`.`ref_menu` TO `__WRITER_USER__`@'%';
GRANT SELECT (`id_ref_user`, `nama_lengkap`) ON `__KOSIPA_DB__`.`ref_users` TO `__WRITER_USER__`@'%';
GRANT SELECT, INSERT ON `__LEDGER_DB__`.* TO `__WRITER_USER__`@'%';
-- STEP 2 (verification, read-only): the output must list ONLY the grants above and NO DELETE, DROP, ALTER, CREATE, GRANT OPTION or table-wide UPDATE/INSERT.
SHOW GRANTS FOR `__WRITER_USER__`@'%';
--
-- ROLLBACK: application first (KOSIPA_MEMBER_WRITES_ENABLED unset, restart), then re-open the legacy controllers only after the native writer is off.
--   REVOKE ALL PRIVILEGES, GRANT OPTION FROM `__WRITER_USER__`@'%';
--   DROP USER `__WRITER_USER__`@'%';
