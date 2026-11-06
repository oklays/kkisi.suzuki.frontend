-- KOSIPA member writer (FA-03B T04: member registration + profile; TASK-115, SEC-107). Template:
--   __KOSIPA_DB__  business database   __LEDGER_DB__  ledger database (same server)   __HOST__  client host   __PW__  generated password
-- Idempotent: strips EVERY privilege of the account, then grants exactly this set. No DELETE anywhere, no DDL, no GRANT OPTION.
-- Local least privilege is column-level; production (cPanel) can only grant per database: see docs/migration/sql/kosipa-member-writer-production.sql.
--   m_anggota          SELECT every column except `password` (credential never read), INSERT the registration columns, UPDATE the profile columns + ud/ud_usr
--                      (NOT UPDATE on: id, doc_no, no_anggota, nik_kar, id_card, tgl_daftar, status_anggota, sim_*, status_pot_*, limits, gaji_minus,
--                       password, photos, cd/cd_usr: identity, deductions, limits, status and credentials are other commands' business)
--   m_simpanan_aktif   INSERT only (the positive-deduction config rows of a new member); no read, update or delete
--   users              SELECT/UPDATE exactly the five mirrored columns (+ id, nik to find the account); no INSERT: registration never creates an account
--   m_bagian, m_lokasi SELECT (id, name, status): active-master check under a share lock
--   ref_menu (id,url,status) SELECT  legacy fence, share-locked inside every command (FD-03)
--   ref_users (id,nama)      SELECT  cd_usr / ud_usr display name
--   ledger database          SELECT, INSERT at DATABASE level: append-only by privilege (also carries the document-number registry)

CREATE USER IF NOT EXISTS 'kosipa_member_w'@'__HOST__' IDENTIFIED BY '__PW__' WITH MAX_USER_CONNECTIONS 2;
ALTER USER 'kosipa_member_w'@'__HOST__' IDENTIFIED BY '__PW__' WITH MAX_USER_CONNECTIONS 2;
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'kosipa_member_w'@'__HOST__';

GRANT SELECT (`id`, `doc_no`, `no_anggota`, `nik_kar`, `id_card`, `tgl_daftar`, `nama_kar`, `ktp`, `email`, `jenis_kel`, `tgl_lahir`, `tempat_lahir`, `alamat`, `rt`, `rw`, `provinsi`, `kabupaten`, `kecamatan`, `kelurahan`, `kode_pos`, `alamat_tinggal`, `kelurahan_tinggal`, `kecamatan_tinggal`, `kabupaten_tinggal`, `kode_pos_tinggal`, `no_telp`, `no_telp1`, `status_rumah`, `pendidikan`, `status_nikah`, `nama_istri`, `ibu_kandung`, `npwp`, `divisi`, `dept`, `bagian`, `kd_group`, `jabatan`, `tgl_karyawan`, `tgl_masuk`, `tgl_keluar`, `lokasi`, `status_karyawan`, `no_rek`, `bank_rek`, `nama_rek`, `gaji`, `sim_wajib`, `sim_pokok`, `sim_sukarela`, `status_pot_pokok`, `status_pot_wajib`, `status_pot_sukarela`, `limit_toko_old`, `limit_toko`, `gaji_minus`, `limit_persen`, `batas_pinjaman`, `limit_ppob`, `status_anggota`, `foto_profile`, `foto_ktp`, `foto_ttd`, `surat_kuasa`, `persetujuan`, `foto_kk`, `foto_bukti_biaya_sekolah`, `cd`, `cd_usr`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`m_anggota` TO 'kosipa_member_w'@'__HOST__';
GRANT INSERT (`nama_kar`, `ktp`, `email`, `jenis_kel`, `tgl_lahir`, `tempat_lahir`, `alamat`, `rt`, `rw`, `provinsi`, `kabupaten`, `kecamatan`, `kelurahan`, `kode_pos`, `alamat_tinggal`, `kelurahan_tinggal`, `kecamatan_tinggal`, `kabupaten_tinggal`, `kode_pos_tinggal`, `no_telp`, `no_telp1`, `status_rumah`, `pendidikan`, `status_nikah`, `nama_istri`, `ibu_kandung`, `npwp`, `divisi`, `dept`, `bagian`, `kd_group`, `jabatan`, `tgl_karyawan`, `tgl_masuk`, `tgl_keluar`, `lokasi`, `status_karyawan`, `no_rek`, `bank_rek`, `nama_rek`, `gaji`, `nik_kar`, `id_card`, `tgl_daftar`, `status_anggota`, `doc_no`, `no_anggota`, `sim_pokok`, `sim_wajib`, `sim_sukarela`, `gaji_minus`, `limit_toko_old`, `limit_toko`, `limit_persen`, `surat_kuasa`, `cd`, `cd_usr`) ON `__KOSIPA_DB__`.`m_anggota` TO 'kosipa_member_w'@'__HOST__';
GRANT UPDATE (`nama_kar`, `ktp`, `email`, `jenis_kel`, `tgl_lahir`, `tempat_lahir`, `alamat`, `rt`, `rw`, `provinsi`, `kabupaten`, `kecamatan`, `kelurahan`, `kode_pos`, `alamat_tinggal`, `kelurahan_tinggal`, `kecamatan_tinggal`, `kabupaten_tinggal`, `kode_pos_tinggal`, `no_telp`, `no_telp1`, `status_rumah`, `pendidikan`, `status_nikah`, `nama_istri`, `ibu_kandung`, `npwp`, `divisi`, `dept`, `bagian`, `kd_group`, `jabatan`, `tgl_karyawan`, `tgl_masuk`, `tgl_keluar`, `lokasi`, `status_karyawan`, `no_rek`, `bank_rek`, `nama_rek`, `gaji`, `ud`, `ud_usr`) ON `__KOSIPA_DB__`.`m_anggota` TO 'kosipa_member_w'@'__HOST__';
GRANT INSERT (`jenis_simpanan`, `nik_kar`, `nama_kar`, `kd_group`, `potongan_old`, `potongan_payroll`, `status`, `is_mobile`) ON `__KOSIPA_DB__`.`m_simpanan_aktif` TO 'kosipa_member_w'@'__HOST__';
GRANT SELECT (`id`, `nik`, `ktp`, `name`, `phone`, `email`, `street_address`) ON `__KOSIPA_DB__`.`users` TO 'kosipa_member_w'@'__HOST__';
GRANT UPDATE (`ktp`, `name`, `phone`, `email`, `street_address`) ON `__KOSIPA_DB__`.`users` TO 'kosipa_member_w'@'__HOST__';
GRANT SELECT (`id`, `name_bagian`, `status`) ON `__KOSIPA_DB__`.`m_bagian` TO 'kosipa_member_w'@'__HOST__';
GRANT SELECT (`id`, `name_lokasi`, `status`) ON `__KOSIPA_DB__`.`m_lokasi` TO 'kosipa_member_w'@'__HOST__';
GRANT SELECT (`id`, `url`, `status`) ON `__KOSIPA_DB__`.`ref_menu` TO 'kosipa_member_w'@'__HOST__';
GRANT SELECT (`id_ref_user`, `nama_lengkap`) ON `__KOSIPA_DB__`.`ref_users` TO 'kosipa_member_w'@'__HOST__';
GRANT SELECT, INSERT ON `__LEDGER_DB__`.* TO 'kosipa_member_w'@'__HOST__';
