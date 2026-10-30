-- KOSIPA document-number registry v1 (TASK-109; REQ-107, BR-116). Template: __LEDGER_DB__ = the ledger database of FD-01b (same server as
-- the business database). Applied ONLY to the isolated synthetic stack; production by the operator from reviewed SQL after the first document
-- command is approved. One row per COMMITTED document number issued natively; append-only by privilege (writers: SELECT, INSERT on the
-- ledger database). The unique keys are the database-enforced guarantee that no number is issued twice, across concurrent transactions.

CREATE TABLE IF NOT EXISTS `__LEDGER_DB__`.`kosipa_document_number` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `scheme`        VARCHAR(40)     NOT NULL COMMENT 'packages/domain/src/kosipa/document-number.ts key',
  `period`        CHAR(6)         NOT NULL COMMENT 'YYYYMM of the number',
  `seq`           BIGINT UNSIGNED NOT NULL COMMENT 'n: period sequence, or the business row id for row-id schemes',
  `doc_no`        VARCHAR(30)     NOT NULL,
  `subject_table` VARCHAR(64)     NOT NULL,
  `request_id`    VARCHAR(40)     NOT NULL COMMENT 'correlation with kosipa_command_ledger and console_audit_event',
  `created_at`    DATETIME(3)     NOT NULL COMMENT 'UTC',
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_docno_seq` (`scheme`, `period`, `seq`),
  UNIQUE KEY `ux_docno` (`doc_no`),
  CONSTRAINT `ck_docno_period` CHECK (`period` REGEXP '^[0-9]{4}(0[1-9]|1[0-2])$'),
  CONSTRAINT `ck_docno_shape`  CHECK (`doc_no` REGEXP '^[A-Z]+[0-9]{6}[0-9]+$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
