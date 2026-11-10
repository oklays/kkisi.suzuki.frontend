-- PWA Anggota read surface (apps/mobile_kkisi): a separate schema holding one VIEW per legacy table the app reads, so the reader
-- account gets SELECT on THIS schema only, never on the whole business database (staff accounts, payroll setup and every other
-- legacy table stay unreachable from an internet-facing app). Views keep the table names, so the app's SQL is unchanged: only the
-- database in DATABASE_URL_MEMBER_READ changes.
--
-- {{LEGACY_DB}} is replaced by the business schema: kkisi_mobile_legacy in the synthetic stack (integration/stack.mjs),
-- n1608204_smart_kopkar in production (docs/migration/sql/mobile-member-pwa-production.sql STAGE 3B carries the same list; a
-- unit test keeps both lists equal). Simple single-table views are MERGE views: the business table's indexes are used as is.
-- SQL SECURITY DEFINER (default): the definer must hold SELECT on {{LEGACY_DB}}; the reader needs SELECT on this schema only.
--
-- `users` exposes only the login columns. It still contains the legacy plain `pin` column, which the PIN step needs until the old
-- S-MART app is retired and users.pin can be cleared (see 10_SECURITY_HARDENING.md).

CREATE OR REPLACE VIEW users AS SELECT id, nik, email, phone, password, pin, is_active, is_delete FROM {{LEGACY_DB}}.users;
CREATE OR REPLACE VIEW m_anggota AS SELECT * FROM {{LEGACY_DB}}.m_anggota;
CREATE OR REPLACE VIEW trans_simpanan AS SELECT * FROM {{LEGACY_DB}}.trans_simpanan;
CREATE OR REPLACE VIEW trans_simpanan_dtl AS SELECT * FROM {{LEGACY_DB}}.trans_simpanan_dtl;
CREATE OR REPLACE VIEW m_simpanan_aktif AS SELECT * FROM {{LEGACY_DB}}.m_simpanan_aktif;
CREATE OR REPLACE VIEW trans_simpanan_pengajuan AS SELECT * FROM {{LEGACY_DB}}.trans_simpanan_pengajuan;
CREATE OR REPLACE VIEW trans_simpanan_penarikan AS SELECT * FROM {{LEGACY_DB}}.trans_simpanan_penarikan;
CREATE OR REPLACE VIEW trans_pinjaman AS SELECT * FROM {{LEGACY_DB}}.trans_pinjaman;
CREATE OR REPLACE VIEW trans_pinjaman_dtl AS SELECT * FROM {{LEGACY_DB}}.trans_pinjaman_dtl;
CREATE OR REPLACE VIEW trans_pinjaman_pengajuan AS SELECT * FROM {{LEGACY_DB}}.trans_pinjaman_pengajuan;
CREATE OR REPLACE VIEW m_pinjaman_mobile AS SELECT * FROM {{LEGACY_DB}}.m_pinjaman_mobile;
CREATE OR REPLACE VIEW m_jenis_pinjaman AS SELECT * FROM {{LEGACY_DB}}.m_jenis_pinjaman;
CREATE OR REPLACE VIEW trans_potongan_matrix AS SELECT * FROM {{LEGACY_DB}}.trans_potongan_matrix;
CREATE OR REPLACE VIEW trans_potongan_bulanan AS SELECT * FROM {{LEGACY_DB}}.trans_potongan_bulanan;
CREATE OR REPLACE VIEW trans_shu AS SELECT * FROM {{LEGACY_DB}}.trans_shu;
CREATE OR REPLACE VIEW trans_shu_dtl AS SELECT * FROM {{LEGACY_DB}}.trans_shu_dtl;
CREATE OR REPLACE VIEW db_sales AS SELECT * FROM {{LEGACY_DB}}.db_sales;
CREATE OR REPLACE VIEW db_salesreturn AS SELECT * FROM {{LEGACY_DB}}.db_salesreturn;
CREATE OR REPLACE VIEW db_company AS SELECT * FROM {{LEGACY_DB}}.db_company;
CREATE OR REPLACE VIEW db_items AS SELECT * FROM {{LEGACY_DB}}.db_items;
CREATE OR REPLACE VIEW db_category AS SELECT * FROM {{LEGACY_DB}}.db_category;
CREATE OR REPLACE VIEW db_units AS SELECT * FROM {{LEGACY_DB}}.db_units;
CREATE OR REPLACE VIEW orders AS SELECT * FROM {{LEGACY_DB}}.orders;
CREATE OR REPLACE VIEW wishlists AS SELECT * FROM {{LEGACY_DB}}.wishlists;
CREATE OR REPLACE VIEW products AS SELECT * FROM {{LEGACY_DB}}.products;
CREATE OR REPLACE VIEW faqs AS SELECT * FROM {{LEGACY_DB}}.faqs;
CREATE OR REPLACE VIEW notifications AS SELECT * FROM {{LEGACY_DB}}.notifications;
