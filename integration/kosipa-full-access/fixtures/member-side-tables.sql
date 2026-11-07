CREATE TABLE IF NOT EXISTS `__KOSIPA_DB__`.`m_simpanan_aktif` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `doc_no` varchar(50) DEFAULT NULL,
  `jenis_simpanan` varchar(255) DEFAULT NULL,
  `nik_kar` varchar(10) DEFAULT NULL,
  `nama_kar` varchar(255) DEFAULT NULL,
  `kd_group` varchar(50) DEFAULT NULL,
  `potongan_old` double(18,2) NOT NULL,
  `potongan_payroll` double(18,2) DEFAULT NULL,
  `cash_tf` double(18,2) DEFAULT NULL,
  `rek_nama` varchar(255) DEFAULT NULL,
  `rek_bank` varchar(255) DEFAULT NULL,
  `rek_no` varchar(50) DEFAULT NULL,
  `status` int(255) DEFAULT NULL,
  `cd` datetime DEFAULT NULL,
  `usr_cd` varchar(255) DEFAULT NULL,
  `ud` datetime DEFAULT NULL,
  `usr_ud` varchar(255) DEFAULT NULL,
  `periode_start` date DEFAULT NULL,
  `periode_end` date DEFAULT NULL,
  `is_mobile` int(11) NOT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `__KOSIPA_DB__`.`oauth_access_tokens` (
  `id` varchar(100) NOT NULL,
  `user_id` bigint(20) DEFAULT NULL,
  `client_id` int(10) unsigned NOT NULL,
  `name` varchar(191) DEFAULT NULL,
  `scopes` text DEFAULT NULL,
  `revoked` tinyint(1) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  KEY `oauth_access_tokens_user_id_index` (`user_id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;
