-- Sales return writer for the Next.js app on the Niagahoster production MariaDB.
-- REVIEW-ONLY. Nothing in this repository executes this file. Run it manually, by an operator, after review,
-- in a maintenance window, with a verified backup. It creates no table, column, index, view or trigger.
--
-- Replace before running:
--   <RETURN_USER>      dedicated cPanel account, e.g. n1608204_nxret (the startup guard refuses kkisi_*, root, admin
--                      and the legacy PHP account n1608204_kkisi; it must differ from nxread/nxauth/nxpos/nxreg)
--   <STRONG_PASSWORD>  generated, stored only in /opt/kkisi-web/.env.production (mode 600)
-- Database: n1608204_smart_kopkar. Host: 'localhost' (the app reaches MariaDB through the SSH tunnel).
--
-- Exact read/write set of PrismaSalesReturnRepository (apps/web/src/infrastructure/repositories/prisma-sales-return.repository.ts):
--   SELECT (some FOR UPDATE)  db_company, db_users, db_roles, db_permissions, db_kasir, db_buka_kasir, db_salesitems, db_sales, db_items
--   UPDATE                    db_sales.return_bit, db_items.stock            (column-level)
--   INSERT                    db_salesreturn, db_salesitemsreturn, db_salespaymentsreturn
--   never                     DELETE, any other UPDATE column, DDL, GRANT OPTION, other databases
-- Reads used for credit limits and register recaps go through the existing read-only account, not this one.

CREATE USER '<RETURN_USER>'@'localhost' IDENTIFIED BY '<STRONG_PASSWORD>';
GRANT SELECT ON `n1608204_smart_kopkar`.`db_company`     TO '<RETURN_USER>'@'localhost';
GRANT SELECT ON `n1608204_smart_kopkar`.`db_users`       TO '<RETURN_USER>'@'localhost';
GRANT SELECT ON `n1608204_smart_kopkar`.`db_roles`       TO '<RETURN_USER>'@'localhost';
GRANT SELECT ON `n1608204_smart_kopkar`.`db_permissions` TO '<RETURN_USER>'@'localhost';
GRANT SELECT ON `n1608204_smart_kopkar`.`db_kasir`       TO '<RETURN_USER>'@'localhost';
GRANT SELECT ON `n1608204_smart_kopkar`.`db_buka_kasir`  TO '<RETURN_USER>'@'localhost';
GRANT SELECT ON `n1608204_smart_kopkar`.`db_salesitems`  TO '<RETURN_USER>'@'localhost';
GRANT SELECT, UPDATE (`return_bit`) ON `n1608204_smart_kopkar`.`db_sales` TO '<RETURN_USER>'@'localhost';
GRANT SELECT, UPDATE (`stock`)      ON `n1608204_smart_kopkar`.`db_items` TO '<RETURN_USER>'@'localhost';
GRANT SELECT, INSERT ON `n1608204_smart_kopkar`.`db_salesreturn`         TO '<RETURN_USER>'@'localhost';
GRANT SELECT, INSERT ON `n1608204_smart_kopkar`.`db_salesitemsreturn`    TO '<RETURN_USER>'@'localhost';
GRANT SELECT, INSERT ON `n1608204_smart_kopkar`.`db_salespaymentsreturn` TO '<RETURN_USER>'@'localhost';

-- Verification (read-only), as <RETURN_USER>:
--   SHOW GRANTS;                                              -- exactly the lines above, plus USAGE
--   SELECT DATABASE();                                        -- n1608204_smart_kopkar
--   UPDATE db_items SET sales_price = sales_price WHERE id = -1;   -- must fail with 1143
--   DELETE FROM db_salesreturn WHERE id = -1;                 -- must fail with 1142
--
-- cPanel note: the "MySQL Databases" screen grants privileges per database only, and cPanel accounts usually lack
-- GRANT OPTION for table/column grants. If the statements above cannot be executed, ask Niagahoster support to apply
-- them. Do NOT fall back to ALL PRIVILEGES. The weakest acceptable cPanel fallback is database-level SELECT, INSERT,
-- UPDATE (no DELETE, no CREATE/ALTER/DROP/INDEX/TRIGGER/REFERENCES); the startup check refuses any DDL privilege,
-- but such an account could update any column, so record that risk and owner approval before using it.
--
-- Rollback (removes access only; return rows already written are business records and stay):
--   DROP USER '<RETURN_USER>'@'localhost';
