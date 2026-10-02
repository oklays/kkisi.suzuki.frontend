-- E1 (Gate A): STRUCTURE-ONLY copy of 8 legacy tables into the SYNTHETIC schema kkisi_e2e_legacy on the local staging container.
-- No rows. Every object is fully qualified and there is no USE / default database: fed to a connection without a default database
-- this file can only create objects in kkisi_e2e_legacy (it fails with "No database selected" otherwise). It never mentions kkisi_staging.
CREATE DATABASE IF NOT EXISTS `kkisi_e2e_legacy` CHARACTER SET latin1;

CREATE TABLE IF NOT EXISTS `kkisi_e2e_legacy`.`db_users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(100) NOT NULL,
  `nik_account` varchar(50) NOT NULL,
  `email` varchar(100) NOT NULL,
  `role_id` int(11) NOT NULL,
  `company_id` int(11) NOT NULL,
  `akses_lokasi` int(11) DEFAULT NULL,
  `fullname` varchar(100) NOT NULL,
  `password` text NOT NULL,
  `mobile` varchar(50) NOT NULL,
  `status` int(11) NOT NULL,
  `cd_usr` int(11) NOT NULL,
  `created_date` date NOT NULL,
  `created_time` timestamp NULL DEFAULT NULL,
  `created_by` varchar(100) NOT NULL,
  `updated_date` date NOT NULL,
  `updated_time` timestamp NULL DEFAULT NULL,
  `profile_picture` varchar(100) NOT NULL,
  `system_ip` varchar(100) DEFAULT NULL,
  `system_name` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci ROW_FORMAT=COMPACT
;
CREATE TABLE IF NOT EXISTS `kkisi_e2e_legacy`.`db_roles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `role_name` varchar(100) NOT NULL,
  `description` text NOT NULL,
  `status` int(11) NOT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci ROW_FORMAT=COMPACT
;
CREATE TABLE IF NOT EXISTS `kkisi_e2e_legacy`.`db_permissions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `role_id` int(11) NOT NULL,
  `permissions` varchar(100) NOT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci ROW_FORMAT=COMPACT
;
CREATE TABLE IF NOT EXISTS `kkisi_e2e_legacy`.`db_company` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category` varchar(50) NOT NULL,
  `company_name` varchar(100) NOT NULL,
  `company_person` varchar(100) NOT NULL,
  `company_website` varchar(100) NOT NULL,
  `mobile` varchar(100) NOT NULL,
  `phone` varchar(50) NOT NULL,
  `email` varchar(100) NOT NULL,
  `address` varchar(100) NOT NULL,
  `country` varchar(100) NOT NULL,
  `state` varchar(100) NOT NULL,
  `postcode` varchar(100) NOT NULL,
  `gst_no` varchar(100) NOT NULL,
  `vat_no` varchar(100) NOT NULL,
  `website` varchar(100) NOT NULL,
  `pan_no` varchar(100) NOT NULL,
  `bank_details` varchar(100) NOT NULL,
  `upi_id` varchar(100) NOT NULL,
  `company_logo` varchar(100) NOT NULL,
  `upi_code` varchar(50) NOT NULL,
  `city` varchar(100) NOT NULL,
  `status` int(11) NOT NULL,
  `category_init` varchar(100) NOT NULL,
  `item_init` varchar(100) NOT NULL,
  `supplier_init` varchar(100) NOT NULL,
  `purchase_init` varchar(100) NOT NULL,
  `purchase_return_init` varchar(100) NOT NULL,
  `customer_init` varchar(100) NOT NULL,
  `sales_init` varchar(100) NOT NULL,
  `sales_return_init` varchar(100) NOT NULL,
  `expense_init` varchar(100) NOT NULL,
  `sales_terms_and_conditions` varchar(100) NOT NULL,
  `sms_status` int(11) NOT NULL,
  `printer` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci ROW_FORMAT=COMPACT
;
CREATE TABLE IF NOT EXISTS `kkisi_e2e_legacy`.`db_kasir` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_id` int(11) NOT NULL,
  `no_kasir` varchar(50) NOT NULL,
  `status` int(11) NOT NULL,
  `cd` int(11) NOT NULL,
  `cd_usr` varchar(100) NOT NULL,
  `description` text NOT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci ROW_FORMAT=COMPACT
;
CREATE TABLE IF NOT EXISTS `kkisi_e2e_legacy`.`db_buka_kasir` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `noref` varchar(50) NOT NULL,
  `id_kasir` int(11) NOT NULL,
  `saldo_awal` decimal(18,2) NOT NULL,
  `saldo_akhir` decimal(18,2) DEFAULT NULL,
  `tgl_buka` datetime NOT NULL,
  `tgl_tutup` datetime DEFAULT NULL,
  `user_id` int(11) NOT NULL,
  `status` int(11) NOT NULL,
  `saldo_kredit` decimal(18,2) NOT NULL,
  `company_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  KEY `idx_bukakasir_user_company` (`user_id`,`company_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci ROW_FORMAT=COMPACT
;
CREATE TABLE IF NOT EXISTS `kkisi_e2e_legacy`.`db_category` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category_code` varchar(50) NOT NULL,
  `category_name` varchar(100) NOT NULL,
  `description` text NOT NULL,
  `status` int(11) NOT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci ROW_FORMAT=COMPACT
;
CREATE TABLE IF NOT EXISTS `kkisi_e2e_legacy`.`db_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `item_code` varchar(100) NOT NULL,
  `custom_barcode_pack` varchar(100) NOT NULL,
  `custom_barcode` varchar(100) NOT NULL,
  `item_name` varchar(100) NOT NULL,
  `category_id` int(11) DEFAULT NULL,
  `expire` int(11) NOT NULL,
  `item_image` varchar(100) NOT NULL,
  `unit_id` int(11) DEFAULT NULL,
  `brand_id` int(11) DEFAULT NULL,
  `description` text NOT NULL,
  `sku` varchar(100) NOT NULL,
  `hsn` varchar(100) NOT NULL,
  `system_ip` varchar(50) NOT NULL,
  `system_name` varchar(100) NOT NULL,
  `created_date` date NOT NULL,
  `created_time` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `created_by` varchar(100) NOT NULL,
  `type` varchar(50) NOT NULL,
  `unit_perpack` int(11) NOT NULL,
  `price` double(18,2) NOT NULL,
  `price_pack` double(18,2) NOT NULL,
  `purchase_price` double(18,2) NOT NULL,
  `purchase_price_pack` double(18,2) NOT NULL,
  `sales_price` double(18,2) NOT NULL,
  `sales_price_pack` double(18,2) NOT NULL,
  `profit_margin` double(18,2) NOT NULL,
  `profit_margin_pack` double(18,2) NOT NULL,
  `alert_qty` int(11) NOT NULL,
  `stock` int(11) NOT NULL,
  `stock_in` int(11) NOT NULL,
  `stock_out` int(11) NOT NULL,
  `expire_date` date DEFAULT NULL,
  `tax_type` enum('Inclusive','Exclusive') NOT NULL,
  `tax_id` int(11) NOT NULL DEFAULT 1,
  `added_by` varchar(50) DEFAULT NULL,
  `company_id` int(11) NOT NULL,
  `konsinyasi` int(11) NOT NULL,
  `discount` double(18,2) NOT NULL,
  `discount_persen` double(18,2) NOT NULL,
  `status` int(11) NOT NULL,
  `lot_number` varchar(50) NOT NULL,
  `tax_amt` double(18,2) NOT NULL,
  `tax_persen` double(18,2) NOT NULL,
  `type_order` int(11) NOT NULL,
  `status_so` int(11) NOT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  KEY `idx_items_company_status` (`company_id`,`status`),
  KEY `idx_items_barcode` (`custom_barcode`),
  KEY `idx_items_barcode_pack` (`custom_barcode_pack`),
  KEY `idx_items_name` (`item_name`),
  KEY `idx_items_category` (`category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci ROW_FORMAT=COMPACT
;

-- Marker: every E2/E3a operation checks that this row exists in the target before it writes or deletes anything.
CREATE TABLE IF NOT EXISTS `kkisi_e2e_legacy`.`_e2e_marker` (purpose VARCHAR(40) NOT NULL PRIMARY KEY) ENGINE=InnoDB;
INSERT IGNORE INTO `kkisi_e2e_legacy`.`_e2e_marker` VALUES ('synthetic-only');
