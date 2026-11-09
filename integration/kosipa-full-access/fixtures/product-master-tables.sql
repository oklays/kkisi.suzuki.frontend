-- KOSIPA product masters + chart of accounts: STRUCTURE ONLY, captured read-only from production SHOW CREATE TABLE (private
-- .local/kosipa-full-access-completion-20261106/master-schema-contracts.json, observed 2026-11-06T09:43:56+00:00). Changes from the capture: CREATE IF NOT EXISTS,
-- __KOSIPA_DB__ qualification, trailing semicolons, instance AUTO_INCREMENT counters removed. No rows, no ALTER/DROP. SHA-256 of each captured CREATE:
--   m_acc_coa: 6fe70267bc2713580f625d8e25daf0c3e30df36feff82e72b8ce1073206ade3e
--   m_jenis_pembiayaan: 244170e645c0ecbea7a9fbbb7ca44b021d429e47d80118afe1df7010f7679271
--   m_jenis_pinjaman: e55bfee9a8e3a7b85ef618577be5a75d4cd8b386e53eb58c8faf2fff7eeac22f
--   m_jenis_simpanan: 6a5bdd58613b13f5a80675b0f977fdd822f82240217682f25b7d6d1100a90953
--   m_suku_bunga: 271ce1ea270d52aaf1ef32aadc062fcbc1b7da5d2b441e6ff9e4a36c3aaa3d02

CREATE TABLE IF NOT EXISTS `__KOSIPA_DB__`.`m_acc_coa` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `parent_id` int(11) DEFAULT 0,
  `sort_id` int(11) DEFAULT 0,
  `coa_no` varchar(50) DEFAULT NULL,
  `coa_sub_no` varchar(50) DEFAULT NULL,
  `coa_name` varchar(50) DEFAULT NULL,
  `coa_desc` varchar(150) DEFAULT NULL,
  `coa_debet_kredit` varchar(1) DEFAULT '0',
  `coa_group` int(11) DEFAULT 0,
  `coa_laba_rugi` int(11) DEFAULT 0,
  `coa_pasiva` int(11) DEFAULT 0,
  `coa_aktiva` int(11) DEFAULT 0,
  `coa_ppn` int(11) DEFAULT 0,
  `coa_cashflow` int(11) DEFAULT 0,
  `coa_saldo` decimal(18,4) DEFAULT 0.0000,
  `coa_debet` decimal(18,4) DEFAULT 0.0000,
  `coa_kredit` decimal(18,4) DEFAULT 0.0000,
  `cd` datetime DEFAULT NULL,
  `cd_usr` varchar(50) DEFAULT NULL,
  `ud` datetime DEFAULT NULL,
  `ud_usr` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci ROW_FORMAT=COMPACT;

CREATE TABLE IF NOT EXISTS `__KOSIPA_DB__`.`m_jenis_pembiayaan` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `doc_no` varchar(50) DEFAULT NULL,
  `doc_date` varchar(50) DEFAULT NULL,
  `pembiayaan_code` varchar(50) DEFAULT NULL,
  `pembiayaan_name` varchar(50) DEFAULT NULL,
  `pembiayaan_remarks` varchar(50) DEFAULT NULL,
  `jenis_bunga` varchar(20) DEFAULT NULL,
  `biaya_asuransi` decimal(18,2) DEFAULT NULL,
  `biaya_jasa` decimal(18,4) DEFAULT NULL,
  `biaya_admin` decimal(18,2) DEFAULT NULL,
  `biaya_bunga` decimal(18,2) DEFAULT NULL,
  `biaya_pinalty` decimal(18,2) DEFAULT NULL,
  `tgl_tempo` int(11) DEFAULT 0,
  `akun_code` varchar(50) DEFAULT '0',
  `akun_desc` varchar(50) DEFAULT '0',
  `lock_1angsuran` int(11) DEFAULT 0,
  `is_active` varchar(150) DEFAULT '0',
  `cd` datetime DEFAULT NULL,
  `cd_usr` varchar(50) DEFAULT NULL,
  `ud` datetime DEFAULT NULL,
  `ud_usr` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci ROW_FORMAT=COMPACT;

CREATE TABLE IF NOT EXISTS `__KOSIPA_DB__`.`m_jenis_pinjaman` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `jenis_pinjaman_code` varchar(50) DEFAULT NULL,
  `jenis_pinjaman_name` varchar(50) DEFAULT NULL,
  `jenis_pinjaman_remarks` varchar(150) DEFAULT NULL,
  `jenis_pembiayaan` varchar(150) DEFAULT NULL,
  `akun_code` varchar(50) DEFAULT '0',
  `akun_desc` varchar(50) DEFAULT '0',
  `jenis_bunga` varchar(20) DEFAULT NULL,
  `biaya_asuransi` decimal(18,2) DEFAULT NULL,
  `biaya_jasa` decimal(18,2) DEFAULT NULL,
  `biaya_admin` decimal(18,2) DEFAULT NULL,
  `biaya_bunga` varchar(50) DEFAULT NULL,
  `biaya_pinalty` decimal(18,2) DEFAULT NULL,
  `tgl_tempo` int(11) DEFAULT 0,
  `lock_1angsuran` int(11) DEFAULT 0,
  `is_active` varchar(150) DEFAULT '0',
  `cd` datetime DEFAULT NULL,
  `cd_usr` varchar(50) DEFAULT NULL,
  `ud` datetime DEFAULT NULL,
  `ud_usr` varchar(50) DEFAULT NULL,
  `dd` datetime DEFAULT NULL,
  `dd_usr` varchar(50) DEFAULT NULL,
  `akun_code_pembiayaan` varchar(50) DEFAULT NULL,
  `akun_desc_pembiayaan` varchar(200) DEFAULT NULL,
  `akun_code_pendapatan` varchar(50) DEFAULT NULL,
  `akun_desc_pendapatan` varchar(200) DEFAULT NULL,
  `parent_id` int(11) DEFAULT NULL,
  `is_payroll` int(11) DEFAULT NULL,
  `max_angsuran` int(11) NOT NULL,
  `max_pinjaman` decimal(18,2) NOT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci ROW_FORMAT=COMPACT;

CREATE TABLE IF NOT EXISTS `__KOSIPA_DB__`.`m_jenis_simpanan` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `jenis_simpanan_code` varchar(50) DEFAULT NULL,
  `jenis_simpanan_name` varchar(50) DEFAULT NULL,
  `jenis_simpanan_remarks` varchar(150) DEFAULT NULL,
  `akun_code` varchar(50) DEFAULT '0',
  `akun_desc` varchar(50) DEFAULT '0',
  `is_active` int(11) DEFAULT 0,
  `is_active_tarik_deposito` int(11) DEFAULT 0,
  `bunga_simpanan` decimal(10,2) DEFAULT 0.00,
  `cd` datetime DEFAULT NULL,
  `cd_usr` varchar(50) DEFAULT NULL,
  `ud` datetime DEFAULT NULL,
  `ud_usr` varchar(50) DEFAULT NULL,
  `status_perorangan` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `__KOSIPA_DB__`.`m_suku_bunga` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code_suku_bunga` varchar(50) DEFAULT NULL,
  `desc_suku_bunga` varchar(50) DEFAULT NULL,
  `field` varchar(50) DEFAULT NULL,
  `nilai_persen` varchar(10) DEFAULT NULL,
  `remarks_suku_bunga` varchar(50) DEFAULT NULL,
  `is_active` int(11) DEFAULT 0,
  `cd` datetime DEFAULT NULL,
  `cd_usr` varchar(50) DEFAULT NULL,
  `ud` datetime DEFAULT NULL,
  `ud_usr` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci ROW_FORMAT=COMPACT;
CREATE TABLE IF NOT EXISTS `__KOSIPA_DB__`.`m_pinjaman_mobile` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `jenis_pinjaman` varchar(50) DEFAULT NULL,
  `min_nominal` int(20) DEFAULT NULL,
  `max_nominal` int(20) DEFAULT NULL,
  `min_jw` int(11) DEFAULT NULL,
  `max_jw` int(11) DEFAULT NULL,
  `jasa` varchar(50) DEFAULT NULL,
  `status` int(1) DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci ROW_FORMAT=DYNAMIC;
