-- STRUCTURE ONLY (no rows) of the legacy tables the reference-master slices need beyond db/e2e/*.sql, copied verbatim from
-- SHOW CREATE TABLE on the local 30 Sep 2026 staging copy (read-only account, 30 Oct 2026; FA-02 tables added the same day).
-- AUTO_INCREMENT counters removed.
-- __KOSIPA_DB__ is replaced by the FA-01 stack script; nothing here ever runs against a real-data database.

CREATE TABLE IF NOT EXISTS `__KOSIPA_DB__`.`m_lokasi` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code_lokasi` varchar(50) DEFAULT NULL,
  `name_lokasi` varchar(255) DEFAULT NULL,
  `status` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

CREATE TABLE IF NOT EXISTS `__KOSIPA_DB__`.`m_bagian` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name_bagian` varchar(255) DEFAULT NULL,
  `id_lokasi` int(11) DEFAULT NULL,
  `status` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

CREATE TABLE IF NOT EXISTS `__KOSIPA_DB__`.`m_jenis_dokumen` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `jenis_dokumen_code` varchar(20) DEFAULT NULL,
  `jenis_dokumen_name` varchar(50) DEFAULT NULL,
  `jenis_dokumen_remarks` varchar(150) DEFAULT NULL,
  `is_active` varchar(150) DEFAULT '0',
  `cd` datetime DEFAULT NULL,
  `cd_usr` varchar(50) DEFAULT NULL,
  `ud` datetime DEFAULT NULL,
  `ud_usr` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci ROW_FORMAT=COMPACT;

CREATE TABLE IF NOT EXISTS `__KOSIPA_DB__`.`m_rekening` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `rekening_code` varchar(20) DEFAULT NULL,
  `rekening_name` varchar(50) DEFAULT NULL,
  `rekening_remarks` varchar(150) DEFAULT NULL,
  `is_active` varchar(150) DEFAULT '0',
  `cd` datetime DEFAULT NULL,
  `cd_usr` varchar(50) DEFAULT NULL,
  `ud` datetime DEFAULT NULL,
  `ud_usr` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci ROW_FORMAT=COMPACT;

CREATE TABLE IF NOT EXISTS `__KOSIPA_DB__`.`m_jangka_waktu` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `jangka_waktu_code` varchar(20) DEFAULT NULL,
  `jangka_waktu_name` varchar(50) DEFAULT NULL,
  `jangka_waktu_remarks` varchar(150) DEFAULT NULL,
  `is_active` varchar(150) DEFAULT '0',
  `cd` datetime DEFAULT NULL,
  `cd_usr` varchar(50) DEFAULT NULL,
  `ud` datetime DEFAULT NULL,
  `ud_usr` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci ROW_FORMAT=COMPACT;

-- smartkkisi member accounts (Laravel); only `lokasi` and `bagian` are read (reference count before a rename).
CREATE TABLE IF NOT EXISTS `__KOSIPA_DB__`.`users` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `nik` varchar(50) NOT NULL,
  `ktp` varchar(50) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `f_name` varchar(50) DEFAULT NULL,
  `l_name` varchar(50) DEFAULT NULL,
  `phone` varchar(25) NOT NULL,
  `image` varchar(30) NOT NULL,
  `email` varchar(80) NOT NULL,
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `admin_verifikasi` int(1) DEFAULT 0,
  `password` varchar(255) NOT NULL,
  `password_hit` varchar(255) DEFAULT NULL,
  `remember_token` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `street_address` varchar(250) DEFAULT NULL,
  `rt` varchar(20) DEFAULT NULL,
  `rw` varchar(50) DEFAULT NULL,
  `country` varchar(50) DEFAULT NULL COMMENT 'Negara',
  `provinces` varchar(50) DEFAULT NULL,
  `city` varchar(50) DEFAULT NULL COMMENT 'Kota/Kabupaten',
  `kecamatan` varchar(255) DEFAULT NULL COMMENT 'kecamatan',
  `kelurahan` varchar(255) DEFAULT NULL COMMENT 'kelurahan',
  `zip` varchar(20) DEFAULT NULL,
  `house_no` varchar(50) DEFAULT NULL,
  `apartment_no` varchar(50) DEFAULT NULL,
  `cm_firebase_token` varchar(191) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `payment_card_last_four` varchar(191) DEFAULT NULL,
  `payment_card_brand` varchar(191) DEFAULT NULL,
  `payment_card_fawry_token` text DEFAULT NULL,
  `login_medium` varchar(191) DEFAULT NULL,
  `social_id` varchar(191) DEFAULT NULL,
  `is_phone_verified` tinyint(1) NOT NULL DEFAULT 0,
  `temporary_token` varchar(191) DEFAULT '1',
  `is_email_verified` tinyint(1) NOT NULL DEFAULT 0,
  `wallet_balance` double(18,2) DEFAULT NULL,
  `wallet_balance_ppob` double(18,2) DEFAULT NULL,
  `loyalty_point` double(18,2) DEFAULT NULL,
  `pin` varchar(255) DEFAULT NULL,
  `default_toko` bigint(11) DEFAULT 1,
  `foto_ktp` varchar(255) DEFAULT NULL,
  `foto_npwp` varchar(255) DEFAULT NULL,
  `foto_ttd` varchar(255) DEFAULT NULL,
  `no_rek` varchar(50) DEFAULT NULL,
  `bank_rek` varchar(100) DEFAULT NULL,
  `bagian` varchar(255) DEFAULT NULL,
  `lokasi` varchar(255) DEFAULT NULL,
  `persetujuan` int(11) NOT NULL,
  `kd_group` varchar(100) DEFAULT NULL,
  `is_delete` int(11) DEFAULT NULL,
  `foto_kk` varchar(100) DEFAULT NULL,
  `foto_bukti_biaya_sekolah` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `users_email_unique` (`email`) USING BTREE,
  UNIQUE KEY `nik` (`nik`) USING BTREE,
  UNIQUE KEY `ktp` (`ktp`,`phone`) USING BTREE,
  KEY `wallet_balance` (`wallet_balance`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;
