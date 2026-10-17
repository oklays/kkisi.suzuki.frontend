-- Warehouse REHEARSAL account + minimum privileges (local staging container only). Template: scripts/setup-warehouse-rehearsal.sh substitutes
--   __AUTH_HOST__ the client IP MariaDB sees for the application's own connection path (detected, never '%')   __AUTH_PW__ a generated password (never printed, never committed)
-- Idempotent: strips EVERY privilege of this account, then grants exactly the set below. No DELETE, no DDL, no access to any other schema.
-- MAX_USER_CONNECTIONS is 4 ONLY so the rehearsal can test concurrent consumers; the production PROPOSAL is 1 (see the architecture document, section 4).

CREATE USER IF NOT EXISTS 'kkisi_wh_rehearsal'@'__AUTH_HOST__' IDENTIFIED BY '__AUTH_PW__' WITH MAX_USER_CONNECTIONS 4;
ALTER USER 'kkisi_wh_rehearsal'@'__AUTH_HOST__' IDENTIFIED BY '__AUTH_PW__' WITH MAX_USER_CONNECTIONS 4;
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'kkisi_wh_rehearsal'@'__AUTH_HOST__';

GRANT SELECT, INSERT ON `kkisi_warehouse_rehearsal`.`warehouse_shipment_line` TO 'kkisi_wh_rehearsal'@'__AUTH_HOST__';
GRANT SELECT, INSERT ON `kkisi_warehouse_rehearsal`.`warehouse_receipt` TO 'kkisi_wh_rehearsal'@'__AUTH_HOST__';
GRANT SELECT, INSERT ON `kkisi_warehouse_rehearsal`.`warehouse_receipt_line` TO 'kkisi_wh_rehearsal'@'__AUTH_HOST__';
GRANT SELECT, INSERT ON `kkisi_warehouse_rehearsal`.`warehouse_resolution` TO 'kkisi_wh_rehearsal'@'__AUTH_HOST__';
GRANT SELECT, INSERT ON `kkisi_warehouse_rehearsal`.`warehouse_history` TO 'kkisi_wh_rehearsal'@'__AUTH_HOST__';
GRANT SELECT, INSERT ON `kkisi_warehouse_rehearsal`.`warehouse_audit_event` TO 'kkisi_wh_rehearsal'@'__AUTH_HOST__';
GRANT SELECT, INSERT ON `kkisi_warehouse_rehearsal`.`warehouse_sim_stock_ledger` TO 'kkisi_wh_rehearsal'@'__AUTH_HOST__';
GRANT SELECT, INSERT ON `kkisi_warehouse_rehearsal`.`warehouse_shipment` TO 'kkisi_wh_rehearsal'@'__AUTH_HOST__';
GRANT UPDATE (`status`, `version`) ON `kkisi_warehouse_rehearsal`.`warehouse_shipment` TO 'kkisi_wh_rehearsal'@'__AUTH_HOST__';
GRANT SELECT, INSERT ON `kkisi_warehouse_rehearsal`.`warehouse_item_map` TO 'kkisi_wh_rehearsal'@'__AUTH_HOST__';
GRANT UPDATE (`status`, `confirmed_by`, `confirmed_at`, `retired_by`, `retired_at`, `retire_reason`) ON `kkisi_warehouse_rehearsal`.`warehouse_item_map` TO 'kkisi_wh_rehearsal'@'__AUTH_HOST__';
GRANT SELECT, INSERT ON `kkisi_warehouse_rehearsal`.`warehouse_stock_outbox` TO 'kkisi_wh_rehearsal'@'__AUTH_HOST__';
GRANT UPDATE (`status`, `attempts`, `last_error`, `applied_at`) ON `kkisi_warehouse_rehearsal`.`warehouse_stock_outbox` TO 'kkisi_wh_rehearsal'@'__AUTH_HOST__';
GRANT SELECT, INSERT, UPDATE ON `kkisi_warehouse_rehearsal`.`warehouse_sim_stock_balance` TO 'kkisi_wh_rehearsal'@'__AUTH_HOST__';
