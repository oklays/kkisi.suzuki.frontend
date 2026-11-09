-- PWA Anggota (apps/mobile_kkisi) — PRODUCTION PREPARATION. REVIEW ONLY: run manually by the database owner, never by tooling.
-- Policy (project memory "production DB changes are manual-only"): dedicated least-privilege accounts per feature; no GRANT ALL,
-- no DDL rights, no GRANT OPTION; the legacy schema is never altered.
--
-- On Niagahoster cPanel the steps are done in the cPanel UI ("MySQL Databases"), because cPanel grants database-level privileges
-- only. The SQL below states the exact intent and is what to run on a server where statement-level control is available.
-- Replace n1608204_ prefixes / passwords as cPanel generates them. Passwords: >= 24 random characters, stored only in
-- /opt/apps/kkisi-mobile/.env.production (mode 600).

-- 1) Session/throttle store: a new, empty database owned by the PWA (cPanel: create database "kkisi_member_auth").
CREATE DATABASE IF NOT EXISTS n1608204_kkisi_member_auth CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--    Then apply apps/mobile_kkisi/db/auth/001_member_auth.sql inside it (2 tables, hashes only, no member data).

-- 2) Session-store account: data access to its own database only (cPanel privileges: SELECT, INSERT, UPDATE, DELETE).
CREATE USER 'n1608204_nxmauth'@'localhost' IDENTIFIED BY 'REPLACE_WITH_GENERATED_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON n1608204_kkisi_member_auth.* TO 'n1608204_nxmauth'@'localhost';

-- 3) Member reader: SELECT only on the business database (cPanel privilege: SELECT).
CREATE USER 'n1608204_nxmread'@'localhost' IDENTIFIED BY 'REPLACE_WITH_GENERATED_PASSWORD';
--    cPanel can only grant this at database level:
GRANT SELECT ON n1608204_smart_kopkar.* TO 'n1608204_nxmread'@'localhost';
--    Where table/column grants are possible, prefer exactly what the PWA reads (05_API_INTEGRATION.md, "Tables read"):
--    GRANT SELECT (id, nik, email, phone, password, pin, is_active, is_delete) ON n1608204_smart_kopkar.users TO 'n1608204_nxmread'@'localhost';
--    GRANT SELECT ON n1608204_smart_kopkar.m_anggota, n1608204_smart_kopkar.trans_simpanan, n1608204_smart_kopkar.trans_simpanan_dtl,
--      n1608204_smart_kopkar.m_simpanan_aktif, n1608204_smart_kopkar.trans_simpanan_pengajuan, n1608204_smart_kopkar.trans_simpanan_penarikan,
--      n1608204_smart_kopkar.trans_pinjaman, n1608204_smart_kopkar.trans_pinjaman_dtl, n1608204_smart_kopkar.trans_pinjaman_pengajuan,
--      n1608204_smart_kopkar.m_pinjaman_mobile, n1608204_smart_kopkar.m_jenis_pinjaman, n1608204_smart_kopkar.trans_potongan_matrix,
--      n1608204_smart_kopkar.trans_potongan_bulanan, n1608204_smart_kopkar.trans_shu, n1608204_smart_kopkar.trans_shu_dtl,
--      n1608204_smart_kopkar.db_sales, n1608204_smart_kopkar.db_salesreturn, n1608204_smart_kopkar.db_company, n1608204_smart_kopkar.db_items,
--      n1608204_smart_kopkar.db_category, n1608204_smart_kopkar.db_units, n1608204_smart_kopkar.orders, n1608204_smart_kopkar.wishlists,
--      n1608204_smart_kopkar.products, n1608204_smart_kopkar.faqs, n1608204_smart_kopkar.notifications TO 'n1608204_nxmread'@'localhost';
--    (MySQL/MariaDB need one GRANT per table; listed together here for review.)

-- 4) Verification (read-only), run as the database owner after the steps above:
SHOW GRANTS FOR 'n1608204_nxmauth'@'localhost';
SHOW GRANTS FOR 'n1608204_nxmread'@'localhost';
--    Expected: no ALL PRIVILEGES, no CREATE/ALTER/DROP/INDEX, no GRANT OPTION, no write privilege on n1608204_smart_kopkar.

-- 5) Connection budget: each account is subject to cPanel max_user_connections. The PWA process opens at most
--    MEMBER_DB_POOL_LIMIT (default 2) reader + 2 session-store connections.

-- ROLLBACK (removes only what this file created; no legacy data is touched):
-- DROP USER 'n1608204_nxmread'@'localhost';
-- DROP USER 'n1608204_nxmauth'@'localhost';
-- DROP DATABASE n1608204_kkisi_member_auth;
