-- Least-privilege TOKO stock-writer CONTRACT account (local container only). The grants are the ones a production writer would need, no more:
-- the stock cache column only, INSERT on the ledger table, INSERT on the idempotency table. No DELETE, no DDL, nothing on any other schema.
CREATE USER IF NOT EXISTS 'kkisi_toko_writer_ct'@'__AUTH_HOST__' IDENTIFIED BY '__AUTH_PW__' WITH MAX_USER_CONNECTIONS 8;
ALTER USER 'kkisi_toko_writer_ct'@'__AUTH_HOST__' IDENTIFIED BY '__AUTH_PW__' WITH MAX_USER_CONNECTIONS 8;
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'kkisi_toko_writer_ct'@'__AUTH_HOST__';
GRANT SELECT ON `kkisi_toko_writer_contract`.`db_items` TO 'kkisi_toko_writer_ct'@'__AUTH_HOST__';
GRANT UPDATE (`stock`) ON `kkisi_toko_writer_contract`.`db_items` TO 'kkisi_toko_writer_ct'@'__AUTH_HOST__';
GRANT SELECT, INSERT ON `kkisi_toko_writer_contract`.`db_stockentry` TO 'kkisi_toko_writer_ct'@'__AUTH_HOST__';
GRANT SELECT, INSERT ON `kkisi_toko_writer_contract`.`nx_stock_posting` TO 'kkisi_toko_writer_ct'@'__AUTH_HOST__';
FLUSH PRIVILEGES;
