-- TOKO posting TEST account (local staging container only). Template: scripts/setup-toko-posting-test.sh substitutes
--   __AUTH_HOST__ the client IP MariaDB sees for the application's own connection path (detected, never '%')   __AUTH_PW__ a generated password
-- Idempotent: strips every privilege, then grants exactly the set below. No DELETE, no DDL, no access to any other schema (in particular none to the Warehouse store).
CREATE USER IF NOT EXISTS 'kkisi_toko_post_test'@'__AUTH_HOST__' IDENTIFIED BY '__AUTH_PW__' WITH MAX_USER_CONNECTIONS 6;
ALTER USER 'kkisi_toko_post_test'@'__AUTH_HOST__' IDENTIFIED BY '__AUTH_PW__' WITH MAX_USER_CONNECTIONS 6;
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'kkisi_toko_post_test'@'__AUTH_HOST__';

GRANT SELECT ON `kkisi_toko_posting_test`.`toko_test_marker` TO 'kkisi_toko_post_test'@'__AUTH_HOST__';
GRANT SELECT, INSERT ON `kkisi_toko_posting_test`.`toko_test_stock_posting` TO 'kkisi_toko_post_test'@'__AUTH_HOST__';
GRANT SELECT, INSERT ON `kkisi_toko_posting_test`.`toko_test_stock` TO 'kkisi_toko_post_test'@'__AUTH_HOST__';
GRANT UPDATE (`quantity`) ON `kkisi_toko_posting_test`.`toko_test_stock` TO 'kkisi_toko_post_test'@'__AUTH_HOST__';
FLUSH PRIVILEGES;
