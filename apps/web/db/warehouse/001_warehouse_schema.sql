-- Warehouse persistence REHEARSAL schema v1 (checkpoint 10). LOCAL ONLY: database kkisi_warehouse_rehearsal on the local staging container.
-- It rehearses the proposal in docs/superpowers/specs/unified-console-kosipa-warehouse/warehouse-persistence-architecture.md: it is NOT a production
-- migration, creates nothing outside kkisi_warehouse_rehearsal, and holds NO Console identity/audit data and NO TOKO or Gudang table. The `warehouse_sim_*` tables SIMULATE the
-- idempotent stock-posting side so the outbox's exactly-once assumptions can be tested against real constraints; the real TOKO inventory tables are never touched.
-- Every object is fully qualified; there is NO `USE`. Idempotent (IF NOT EXISTS). Times are ISO-8601 text supplied by the application (they round-trip exactly).

CREATE DATABASE IF NOT EXISTS `kkisi_warehouse_rehearsal` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `kkisi_warehouse_rehearsal`.`warehouse_item_map` (
  `ref`              VARCHAR(64)  NOT NULL,
  `gudang_item_id`   INT UNSIGNED NOT NULL COMMENT 'Gudang item id BY VALUE (no FK: different database)',
  `store_company_id` INT UNSIGNED NOT NULL,
  `store_item_id`    INT UNSIGNED NOT NULL COMMENT 'TOKO item id BY VALUE (no FK: different database)',
  `gudang_unit`      VARCHAR(20)  NOT NULL,
  `store_unit`       VARCHAR(20)  NOT NULL,
  `conv_kind`        ENUM('IDENTICAL','RATIO') NOT NULL,
  `conv_numerator`   INT UNSIGNED NULL, `conv_denominator` INT UNSIGNED NULL,
  `conv_approved_by` INT UNSIGNED NULL, `conv_approved_at` VARCHAR(40) NULL, `conv_evidence` VARCHAR(500) NULL,
  `basis`            ENUM('barcode','item_code','manual') NOT NULL,
  `status`           ENUM('PROPOSED','CONFIRMED','RETIRED') NOT NULL,
  `proposed_by`      INT UNSIGNED NOT NULL, `proposed_at` VARCHAR(40) NOT NULL,
  `confirmed_by`     INT UNSIGNED NULL, `confirmed_at` VARCHAR(40) NULL,
  `retired_by`       INT UNSIGNED NULL, `retired_at` VARCHAR(40) NULL, `retire_reason` VARCHAR(300) NULL,
  `active_gudang_key` VARCHAR(40) AS (IF(`status` <> 'RETIRED', CONCAT(`store_company_id`, ':', `gudang_item_id`), NULL)) STORED,
  `active_store_key`  VARCHAR(40) AS (IF(`status` <> 'RETIRED', CONCAT(`store_company_id`, ':', `store_item_id`), NULL)) STORED,
  PRIMARY KEY (`ref`),
  UNIQUE KEY `ux_map_active_gudang` (`active_gudang_key`),
  UNIQUE KEY `ux_map_active_store`  (`active_store_key`),
  KEY `ix_map_branch` (`store_company_id`, `gudang_item_id`),
  CONSTRAINT `ck_map_conv` CHECK ((`conv_kind` = 'IDENTICAL' AND `conv_numerator` IS NULL AND `conv_denominator` IS NULL)
    OR (`conv_kind` = 'RATIO' AND `conv_numerator` > 0 AND `conv_denominator` > 0 AND `conv_approved_by` IS NOT NULL AND `conv_evidence` IS NOT NULL)),
  CONSTRAINT `ck_map_status` CHECK ((`status` = 'PROPOSED' AND `confirmed_at` IS NULL AND `retired_at` IS NULL)
    OR (`status` = 'CONFIRMED' AND `confirmed_by` IS NOT NULL AND `retired_at` IS NULL)
    OR (`status` = 'RETIRED' AND `retired_by` IS NOT NULL AND `retire_reason` IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `kkisi_warehouse_rehearsal`.`warehouse_shipment` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `source_ref`          VARCHAR(80)  NOT NULL COMMENT 'stable external identity of the Gudang document',
  `destination_store_company_id` INT UNSIGNED NOT NULL,
  `source_warehouse_id` INT UNSIGNED NOT NULL,
  `status`              ENUM('DRAFT','SUBMITTED','APPROVED','DISPATCHED','CLOSED','CANCELLED') NOT NULL,
  `maker_user_id`       INT UNSIGNED NOT NULL,
  `fingerprint`         MEDIUMTEXT   NOT NULL,
  `idempotency_key`     VARCHAR(80)  NOT NULL,
  `allow_multiple_receipts` TINYINT(1) NOT NULL,
  `version`             INT UNSIGNED NOT NULL,
  `created_at`          VARCHAR(40)  NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_shipment_source_dest` (`source_ref`, `destination_store_company_id`),
  KEY `ix_shipment_warehouse` (`source_warehouse_id`, `created_at`),
  KEY `ix_shipment_dest_status` (`destination_store_company_id`, `status`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `kkisi_warehouse_rehearsal`.`warehouse_shipment_line` (
  `shipment_id` BIGINT UNSIGNED NOT NULL, `line_no` INT UNSIGNED NOT NULL,
  `gudang_item_id` INT UNSIGNED NOT NULL, `store_item_id` INT UNSIGNED NOT NULL, `mapping_ref` VARCHAR(64) NOT NULL,
  `gudang_quantity` BIGINT UNSIGNED NOT NULL, `gudang_unit` VARCHAR(20) NOT NULL, `expected_quantity` BIGINT UNSIGNED NOT NULL, `store_unit` VARCHAR(20) NOT NULL,
  PRIMARY KEY (`shipment_id`, `line_no`),
  KEY `ix_line_mapping` (`mapping_ref`),
  CONSTRAINT `fk_line_shipment` FOREIGN KEY (`shipment_id`) REFERENCES `warehouse_shipment` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `ck_line_qty` CHECK (`gudang_quantity` > 0 AND `expected_quantity` > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `kkisi_warehouse_rehearsal`.`warehouse_receipt` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `shipment_id` BIGINT UNSIGNED NOT NULL, `event_key` VARCHAR(80) NOT NULL,
  `actor_user_id` INT UNSIGNED NOT NULL, `request_id` VARCHAR(80) NOT NULL, `at` VARCHAR(40) NOT NULL, `payload` MEDIUMTEXT NOT NULL,
  PRIMARY KEY (`id`), UNIQUE KEY `ux_receipt_event` (`shipment_id`, `event_key`),
  CONSTRAINT `fk_receipt_shipment` FOREIGN KEY (`shipment_id`) REFERENCES `warehouse_shipment` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `kkisi_warehouse_rehearsal`.`warehouse_receipt_line` (
  `receipt_id` BIGINT UNSIGNED NOT NULL, `line_no` INT UNSIGNED NOT NULL,
  `accepted_quantity` BIGINT UNSIGNED NOT NULL, `rejected_quantity` BIGINT UNSIGNED NOT NULL, `rejected_reason` ENUM('DAMAGED','REJECTED') NULL,
  PRIMARY KEY (`receipt_id`, `line_no`),
  CONSTRAINT `fk_rline_receipt` FOREIGN KEY (`receipt_id`) REFERENCES `warehouse_receipt` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `ck_rline_reason` CHECK ((`rejected_quantity` = 0 AND `rejected_reason` IS NULL) OR (`rejected_quantity` > 0 AND `rejected_reason` IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `kkisi_warehouse_rehearsal`.`warehouse_resolution` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `shipment_id` BIGINT UNSIGNED NOT NULL, `resolution_key` VARCHAR(80) NOT NULL, `line_no` INT UNSIGNED NOT NULL,
  `target` ENUM('OUTSTANDING','REJECTED') NOT NULL, `kind` ENUM('SHORT_CLOSED','RETURNED_TO_SOURCE','WRITTEN_OFF') NOT NULL, `quantity` BIGINT UNSIGNED NOT NULL,
  `reason` VARCHAR(300) NOT NULL, `actor_user_id` INT UNSIGNED NOT NULL, `request_id` VARCHAR(80) NOT NULL, `at` VARCHAR(40) NOT NULL, `payload` MEDIUMTEXT NOT NULL,
  PRIMARY KEY (`id`), UNIQUE KEY `ux_resolution_key` (`shipment_id`, `resolution_key`),
  CONSTRAINT `fk_resolution_shipment` FOREIGN KEY (`shipment_id`) REFERENCES `warehouse_shipment` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `ck_resolution_qty` CHECK (`quantity` > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `kkisi_warehouse_rehearsal`.`warehouse_history` (
  `shipment_id` BIGINT UNSIGNED NOT NULL, `seq` INT UNSIGNED NOT NULL, `type` VARCHAR(40) NOT NULL, `actor_user_id` INT UNSIGNED NOT NULL,
  `request_id` VARCHAR(80) NOT NULL, `at` VARCHAR(40) NOT NULL, `ref` VARCHAR(80) NULL,
  PRIMARY KEY (`shipment_id`, `seq`),
  CONSTRAINT `fk_history_shipment` FOREIGN KEY (`shipment_id`) REFERENCES `warehouse_shipment` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Outbox: one record per accepted receipt line; `intent_key` (sourceRef|eventKey|lineNo) is the idempotency key. Content is immutable (trigger).
CREATE TABLE IF NOT EXISTS `kkisi_warehouse_rehearsal`.`warehouse_stock_outbox` (
  `intent_key` VARCHAR(190) NOT NULL, `source_ref` VARCHAR(80) NOT NULL, `event_key` VARCHAR(80) NOT NULL,
  `store_company_id` INT UNSIGNED NOT NULL, `store_item_id` INT UNSIGNED NOT NULL, `mapping_ref` VARCHAR(64) NOT NULL, `quantity` BIGINT UNSIGNED NOT NULL,
  `treatment` ENUM('INTERNAL_TRANSFER','COMMERCIAL_PURCHASE') NOT NULL COMMENT 'UNSPECIFIED is not representable: the application refuses first',
  `status` ENUM('PENDING','APPLIED','DEAD') NOT NULL DEFAULT 'PENDING', `attempts` INT UNSIGNED NOT NULL DEFAULT 0, `last_error` VARCHAR(200) NULL,
  `enqueued_at` VARCHAR(40) NOT NULL, `applied_at` VARCHAR(40) NULL,
  PRIMARY KEY (`intent_key`), KEY `ix_outbox_pending` (`status`, `enqueued_at`, `intent_key`), KEY `ix_outbox_source` (`source_ref`),
  CONSTRAINT `ck_outbox_qty` CHECK (`quantity` > 0),
  CONSTRAINT `ck_outbox_applied` CHECK ((`status` = 'APPLIED' AND `applied_at` IS NOT NULL) OR (`status` <> 'APPLIED' AND `applied_at` IS NULL))
) ENGINE=InnoDB;

-- SIMULATED posting side (NOT TOKO): the ledger's primary key makes a second application of one intent impossible; balance and ledger change in ONE transaction.
CREATE TABLE IF NOT EXISTS `kkisi_warehouse_rehearsal`.`warehouse_sim_stock_ledger` (
  `intent_key` VARCHAR(190) NOT NULL, `store_company_id` INT UNSIGNED NOT NULL, `store_item_id` INT UNSIGNED NOT NULL, `quantity` BIGINT UNSIGNED NOT NULL, `applied_at` VARCHAR(40) NOT NULL,
  PRIMARY KEY (`intent_key`), KEY `ix_ledger_item` (`store_company_id`, `store_item_id`)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS `kkisi_warehouse_rehearsal`.`warehouse_sim_stock_balance` (
  `store_company_id` INT UNSIGNED NOT NULL, `store_item_id` INT UNSIGNED NOT NULL, `quantity` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`store_company_id`, `store_item_id`)
) ENGINE=InnoDB;

-- Operational audit (mapping lifecycle, dead-letter requeue): append-only. NOT the Console access audit and NOT a financial ledger.
CREATE TABLE IF NOT EXISTS `kkisi_warehouse_rehearsal`.`warehouse_audit_event` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `occurred_at` DATETIME(3) NOT NULL, `actor_user_id` INT UNSIGNED NOT NULL, `action` VARCHAR(64) NOT NULL,
  `subject` VARCHAR(190) NOT NULL, `request_id` VARCHAR(80) NOT NULL, `detail` JSON NULL,
  PRIMARY KEY (`id`), KEY `ix_audit_subject` (`subject`, `occurred_at`),
  CONSTRAINT `ck_audit_action` CHECK (`action` REGEXP '^[a-z][a-z0-9_.]{2,63}$')
) ENGINE=InnoDB;

DELIMITER //
CREATE TRIGGER IF NOT EXISTS `kkisi_warehouse_rehearsal`.`trg_warehouse_shipment_line_no_update` BEFORE UPDATE ON `kkisi_warehouse_rehearsal`.`warehouse_shipment_line`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'warehouse_shipment_line is append-only'; END//
CREATE TRIGGER IF NOT EXISTS `kkisi_warehouse_rehearsal`.`trg_warehouse_receipt_no_update` BEFORE UPDATE ON `kkisi_warehouse_rehearsal`.`warehouse_receipt`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'warehouse_receipt is append-only'; END//
CREATE TRIGGER IF NOT EXISTS `kkisi_warehouse_rehearsal`.`trg_warehouse_receipt_line_no_update` BEFORE UPDATE ON `kkisi_warehouse_rehearsal`.`warehouse_receipt_line`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'warehouse_receipt_line is append-only'; END//
CREATE TRIGGER IF NOT EXISTS `kkisi_warehouse_rehearsal`.`trg_warehouse_resolution_no_update` BEFORE UPDATE ON `kkisi_warehouse_rehearsal`.`warehouse_resolution`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'warehouse_resolution is append-only'; END//
CREATE TRIGGER IF NOT EXISTS `kkisi_warehouse_rehearsal`.`trg_warehouse_history_no_update` BEFORE UPDATE ON `kkisi_warehouse_rehearsal`.`warehouse_history`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'warehouse_history is append-only'; END//
CREATE TRIGGER IF NOT EXISTS `kkisi_warehouse_rehearsal`.`trg_warehouse_audit_event_no_update` BEFORE UPDATE ON `kkisi_warehouse_rehearsal`.`warehouse_audit_event`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'warehouse_audit_event is append-only'; END//
CREATE TRIGGER IF NOT EXISTS `kkisi_warehouse_rehearsal`.`trg_warehouse_shipment_no_delete` BEFORE DELETE ON `kkisi_warehouse_rehearsal`.`warehouse_shipment`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'warehouse_shipment rows are never deleted'; END//
CREATE TRIGGER IF NOT EXISTS `kkisi_warehouse_rehearsal`.`trg_warehouse_shipment_line_no_delete` BEFORE DELETE ON `kkisi_warehouse_rehearsal`.`warehouse_shipment_line`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'warehouse_shipment_line rows are never deleted'; END//
CREATE TRIGGER IF NOT EXISTS `kkisi_warehouse_rehearsal`.`trg_warehouse_receipt_no_delete` BEFORE DELETE ON `kkisi_warehouse_rehearsal`.`warehouse_receipt`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'warehouse_receipt rows are never deleted'; END//
CREATE TRIGGER IF NOT EXISTS `kkisi_warehouse_rehearsal`.`trg_warehouse_receipt_line_no_delete` BEFORE DELETE ON `kkisi_warehouse_rehearsal`.`warehouse_receipt_line`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'warehouse_receipt_line rows are never deleted'; END//
CREATE TRIGGER IF NOT EXISTS `kkisi_warehouse_rehearsal`.`trg_warehouse_resolution_no_delete` BEFORE DELETE ON `kkisi_warehouse_rehearsal`.`warehouse_resolution`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'warehouse_resolution rows are never deleted'; END//
CREATE TRIGGER IF NOT EXISTS `kkisi_warehouse_rehearsal`.`trg_warehouse_history_no_delete` BEFORE DELETE ON `kkisi_warehouse_rehearsal`.`warehouse_history`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'warehouse_history rows are never deleted'; END//
CREATE TRIGGER IF NOT EXISTS `kkisi_warehouse_rehearsal`.`trg_warehouse_audit_event_no_delete` BEFORE DELETE ON `kkisi_warehouse_rehearsal`.`warehouse_audit_event`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'warehouse_audit_event rows are never deleted'; END//
CREATE TRIGGER IF NOT EXISTS `kkisi_warehouse_rehearsal`.`trg_warehouse_stock_outbox_no_delete` BEFORE DELETE ON `kkisi_warehouse_rehearsal`.`warehouse_stock_outbox`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'warehouse_stock_outbox rows are never deleted'; END//
CREATE TRIGGER IF NOT EXISTS `kkisi_warehouse_rehearsal`.`trg_warehouse_item_map_no_delete` BEFORE DELETE ON `kkisi_warehouse_rehearsal`.`warehouse_item_map`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'warehouse_item_map rows are never deleted'; END//
CREATE TRIGGER IF NOT EXISTS `kkisi_warehouse_rehearsal`.`trg_warehouse_sim_stock_ledger_no_delete` BEFORE DELETE ON `kkisi_warehouse_rehearsal`.`warehouse_sim_stock_ledger`
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'warehouse_sim_stock_ledger rows are never deleted'; END//
CREATE TRIGGER IF NOT EXISTS `kkisi_warehouse_rehearsal`.`trg_warehouse_shipment_state_only` BEFORE UPDATE ON `kkisi_warehouse_rehearsal`.`warehouse_shipment`
FOR EACH ROW BEGIN
  IF NEW.`source_ref` <> OLD.`source_ref` OR NEW.`destination_store_company_id` <> OLD.`destination_store_company_id` OR NEW.`source_warehouse_id` <> OLD.`source_warehouse_id`
     OR NEW.`maker_user_id` <> OLD.`maker_user_id` OR NEW.`fingerprint` <> OLD.`fingerprint` OR NEW.`idempotency_key` <> OLD.`idempotency_key`
     OR NEW.`allow_multiple_receipts` <> OLD.`allow_multiple_receipts` OR NEW.`created_at` <> OLD.`created_at` OR NEW.`version` <> OLD.`version` + 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'a shipment may only change status and advance its version by exactly one';
  END IF;
END//
CREATE TRIGGER IF NOT EXISTS `kkisi_warehouse_rehearsal`.`trg_warehouse_outbox_content_immutable` BEFORE UPDATE ON `kkisi_warehouse_rehearsal`.`warehouse_stock_outbox`
FOR EACH ROW BEGIN
  IF NEW.`intent_key` <> OLD.`intent_key` OR NEW.`source_ref` <> OLD.`source_ref` OR NEW.`event_key` <> OLD.`event_key` OR NEW.`store_company_id` <> OLD.`store_company_id`
     OR NEW.`store_item_id` <> OLD.`store_item_id` OR NEW.`mapping_ref` <> OLD.`mapping_ref` OR NEW.`quantity` <> OLD.`quantity` OR NEW.`treatment` <> OLD.`treatment` OR NEW.`enqueued_at` <> OLD.`enqueued_at` THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'outbox content is immutable';
  END IF;
  IF OLD.`status` = 'APPLIED' AND NEW.`status` <> 'APPLIED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'an applied outbox record never changes state'; END IF;
END//
CREATE TRIGGER IF NOT EXISTS `kkisi_warehouse_rehearsal`.`trg_warehouse_map_identity_immutable` BEFORE UPDATE ON `kkisi_warehouse_rehearsal`.`warehouse_item_map`
FOR EACH ROW BEGIN
  IF NEW.`ref` <> OLD.`ref` OR NEW.`gudang_item_id` <> OLD.`gudang_item_id` OR NEW.`store_company_id` <> OLD.`store_company_id` OR NEW.`store_item_id` <> OLD.`store_item_id`
     OR NEW.`conv_kind` <> OLD.`conv_kind` OR NEW.`gudang_unit` <> OLD.`gudang_unit` OR NEW.`store_unit` <> OLD.`store_unit` OR NOT (NEW.`conv_numerator` <=> OLD.`conv_numerator`) OR NOT (NEW.`conv_denominator` <=> OLD.`conv_denominator`) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'a mapping''s identity and conversion are immutable: retire it and propose a new one';
  END IF;
  IF OLD.`status` = 'RETIRED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'a retired mapping never changes'; END IF;
END//
DELIMITER ;
