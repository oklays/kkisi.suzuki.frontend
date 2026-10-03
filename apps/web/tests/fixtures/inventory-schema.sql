-- Selected local legacy DDL only; no rows or credentials. Synthetic test use only.
CREATE TABLE `db_warehouse` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `warehouse_name` varchar(100) NOT NULL,
  `mobile` varchar(20) NOT NULL,
  `email` varchar(100) NOT NULL,
  `status` int(11) NOT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci ROW_FORMAT=COMPACT;

CREATE TABLE `db_inventory_so` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `doc_no` varchar(50) NOT NULL,
  `periode` varchar(50) NOT NULL,
  `periode_bl` varchar(50) DEFAULT NULL,
  `periode_th` int(11) NOT NULL,
  `doc_date_start` date DEFAULT NULL,
  `doc_date_end` date DEFAULT NULL,
  `doc_status` int(11) NOT NULL,
  `doc_remarks` text NOT NULL,
  `company_id` int(11) NOT NULL,
  `created_by` varchar(100) NOT NULL,
  `created_date` date NOT NULL,
  `created_time` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci ROW_FORMAT=COMPACT;

CREATE TABLE `db_inventory_so_dtl` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `so_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `barcode` varchar(50) NOT NULL,
  `nama_barang` varchar(100) NOT NULL,
  `qty_system` int(11) NOT NULL,
  `qty_actual` int(11) NOT NULL,
  `qty_adjust` int(11) NOT NULL,
  `purchase_price` double(18,2) NOT NULL,
  `sub_total` double(18,2) NOT NULL,
  `note` text NOT NULL,
  `created_by` varchar(100) NOT NULL,
  `created_date` date NOT NULL,
  `created_time` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `status` int(11) NOT NULL,
  `konsinyasi` int(11) NOT NULL,
  `expire` date NOT NULL,
  `item_type` varchar(50) NOT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  KEY `idx_so_dtl_so` (`so_id`),
  KEY `idx_so_dtl_item` (`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci ROW_FORMAT=COMPACT;

CREATE TABLE `db_stockentry` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `entry_date` datetime NOT NULL,
  `item_id` int(11) NOT NULL,
  `qty` int(11) NOT NULL,
  `expire_date` date DEFAULT NULL,
  `company_id` int(11) NOT NULL,
  `status` int(11) NOT NULL,
  `note` enum('Stok Awal','Rusak','Expired','Hilang','Penyesuaian') NOT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  KEY `idx_stockentry_item_company` (`item_id`,`company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci ROW_FORMAT=COMPACT;
