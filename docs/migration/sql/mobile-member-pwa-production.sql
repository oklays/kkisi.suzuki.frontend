-- PWA Anggota (apps/mobile_kkisi) — STAGED PRODUCTION SQL PLAN (REVIEW ONLY: run manually by the database owner, never by tooling).
-- Policy (project memory "production DB changes are manual-only"): dedicated least-privilege accounts per feature; no GRANT ALL,
-- no DDL rights, no GRANT OPTION; the legacy schema is never altered without explicit owner approval.
--
-- On Niagahoster cPanel, database and user creation are performed in the cPanel UI ("MySQL Databases"), and table DDL is run in
-- phpMyAdmin on the newly created `n1608204_kkisi_member_auth` database.
-- Passwords: >= 24 random characters, stored only in /opt/apps/kkisi-mobile/.env.production (mode 600).

-- =====================================================================================================================
-- STAGE 1: READ-ONLY PREFLIGHT VERIFICATION (SAFE — NO DATA OR SCHEMA CHANGES)
-- Run against `n1608204_smart_kopkar` to confirm server version, connection limits, and duplicate-NIK hygiene.
-- =====================================================================================================================
SELECT VERSION() AS mariadb_version, @@max_connections AS max_connections, @@max_user_connections AS max_user_connections;

-- Verify active `users` count and `users.pin` format distribution (no PII returned):
SELECT
  COUNT(*) AS total_users,
  SUM(is_active = 1 AND (is_delete IS NULL OR is_delete = 0)) AS active_users,
  SUM(pin REGEXP '^[0-9]{4}$') AS pin_4digit_plain,
  SUM(pin LIKE '$2y$%' OR pin LIKE '$2b$%' OR pin LIKE '$scrypt%') AS pin_hashed
FROM n1608204_smart_kopkar.users;

-- Verify duplicate `m_anggota.nik_kar` groups (note: PWA `resolveMemberIdentity` fails closed on multi-AKTIVE duplicates):
SELECT
  TRIM(LEADING '0' FROM TRIM(nik_kar)) AS canonical_nik,
  COUNT(*) AS row_count,
  SUM(status_anggota = 'AKTIVE') AS active_rows
FROM n1608204_smart_kopkar.m_anggota
WHERE nik_kar IS NOT NULL AND TRIM(nik_kar) NOT IN ('', '0')
GROUP BY 1
HAVING COUNT(*) > 1;

-- =====================================================================================================================
-- STAGE 2: ISOLATED AUTH DATABASE & TABLES (`n1608204_kkisi_member_auth`)
-- Safe to run anytime: creates a separate database owned exclusively by the Member PWA. Zero impact on `smart_kopkar`.
-- =====================================================================================================================
CREATE DATABASE IF NOT EXISTS n1608204_kkisi_member_auth CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Execute inside `n1608204_kkisi_member_auth` (identical to apps/mobile_kkisi/db/auth/001_member_auth.sql):
USE n1608204_kkisi_member_auth;

CREATE TABLE IF NOT EXISTS member_sessions (
  id_hash         CHAR(64)     NOT NULL,
  kid             VARCHAR(16)  NOT NULL,
  user_id         BIGINT       NOT NULL,
  member_id       INT          NOT NULL,
  nik             VARCHAR(50)  NOT NULL,
  stage           ENUM('pin','active') NOT NULL,
  pin_failures    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at      DATETIME(3)  NOT NULL,
  last_seen_at    DATETIME(3)  NOT NULL,
  idle_expires_at DATETIME(3)  NOT NULL,
  abs_expires_at  DATETIME(3)  NOT NULL,
  revoked_at      DATETIME(3)  NULL,
  revoke_reason   VARCHAR(20)  NULL,
  PRIMARY KEY (id_hash),
  KEY member_sessions_user (user_id, revoked_at),
  KEY member_sessions_purge (abs_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS member_auth_throttle (
  key_hash     CHAR(64)    NOT NULL,
  failures     INT UNSIGNED NOT NULL,
  window_start DATETIME(3) NOT NULL,
  locked_until DATETIME(3) NULL,
  PRIMARY KEY (key_hash),
  KEY member_auth_throttle_purge (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS member_pin_credentials (
  user_id       BIGINT       NOT NULL,
  source_digest CHAR(64)     NOT NULL,
  pin_hash      VARCHAR(255) NOT NULL,
  hash_scheme   VARCHAR(32)  NOT NULL,
  updated_at    DATETIME(3)  NOT NULL,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS member_command_ledger (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  member_id       INT             NOT NULL,
  nik             VARCHAR(50)     NOT NULL,
  command_kind    VARCHAR(64)     NOT NULL,
  idempotency_key VARCHAR(64)     NOT NULL,
  payload_hash    CHAR(64)        NOT NULL,
  status          ENUM('PENDING','RECORDED','REJECTED') NOT NULL,   -- PENDING: reserved before the business write
  result_doc_no   VARCHAR(64)     NULL,
  created_at      DATETIME(3)     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY ux_member_command_idem (member_id, command_kind, idempotency_key),
  KEY ix_member_command_member (member_id, command_kind, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-member write lease: one mutation of a member runs at a time across processes (ledger check, open-application count and the
-- business insert cannot interleave). Expiring, so a crashed process never blocks the member for longer than the TTL (30 s).
CREATE TABLE IF NOT EXISTS member_write_lease (
  member_id  INT         NOT NULL,
  token      CHAR(32)    NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  PRIMARY KEY (member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2B) ONLY if STAGE 2 was already applied BEFORE the P0 writer hardening (10 Nov 2026): add the PENDING reservation status.
--     (member_write_lease above is CREATE TABLE IF NOT EXISTS and is created by simply re-running STAGE 2.)
-- ALTER TABLE n1608204_kkisi_member_auth.member_command_ledger MODIFY status ENUM('PENDING','RECORDED','REJECTED') NOT NULL;

-- =====================================================================================================================
-- STAGE 3: LEAST-PRIVILEGE ACCOUNTS & GRANTS
-- =====================================================================================================================
-- 3A) Session-store account: DML access to `n1608204_kkisi_member_auth` only (cPanel: SELECT, INSERT, UPDATE, DELETE).
CREATE USER 'n1608204_nxmauth'@'localhost' IDENTIFIED BY 'REPLACE_WITH_GENERATED_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON n1608204_kkisi_member_auth.* TO 'n1608204_nxmauth'@'localhost';

-- 3B) Member reader: SELECT on a dedicated VIEW schema only — NEVER on n1608204_smart_kopkar.* (an internet-facing app must not be
--     able to read staff accounts, payroll setup or any table it does not use). Same list as apps/mobile_kkisi/db/reader/
--     001_member_read_views.sql (a unit test keeps them equal). The synthetic stack runs the app against exactly this layout.
--     cPanel: create database `n1608204_kkisi_member_view` ("MySQL Databases"), then run the views below in phpMyAdmin as the
--     cPanel owner (the view DEFINER, who already has SELECT on smart_kopkar). Then add the reader user to `kkisi_member_view`
--     with the SELECT privilege ONLY, and do NOT add it to `smart_kopkar`. If an earlier plan already granted it there, remove that
--     database from the user in cPanel. Then point DATABASE_URL_MEMBER_READ at n1608204_kkisi_member_view.
CREATE DATABASE IF NOT EXISTS n1608204_kkisi_member_view CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE n1608204_kkisi_member_view;
CREATE OR REPLACE VIEW users AS SELECT id, nik, email, phone, password, pin, is_active, is_delete FROM n1608204_smart_kopkar.users;
CREATE OR REPLACE VIEW m_anggota AS SELECT * FROM n1608204_smart_kopkar.m_anggota;
CREATE OR REPLACE VIEW trans_simpanan AS SELECT * FROM n1608204_smart_kopkar.trans_simpanan;
CREATE OR REPLACE VIEW trans_simpanan_dtl AS SELECT * FROM n1608204_smart_kopkar.trans_simpanan_dtl;
CREATE OR REPLACE VIEW m_simpanan_aktif AS SELECT * FROM n1608204_smart_kopkar.m_simpanan_aktif;
CREATE OR REPLACE VIEW trans_simpanan_pengajuan AS SELECT * FROM n1608204_smart_kopkar.trans_simpanan_pengajuan;
CREATE OR REPLACE VIEW trans_simpanan_penarikan AS SELECT * FROM n1608204_smart_kopkar.trans_simpanan_penarikan;
CREATE OR REPLACE VIEW trans_pinjaman AS SELECT * FROM n1608204_smart_kopkar.trans_pinjaman;
CREATE OR REPLACE VIEW trans_pinjaman_dtl AS SELECT * FROM n1608204_smart_kopkar.trans_pinjaman_dtl;
CREATE OR REPLACE VIEW trans_pinjaman_pengajuan AS SELECT * FROM n1608204_smart_kopkar.trans_pinjaman_pengajuan;
CREATE OR REPLACE VIEW m_pinjaman_mobile AS SELECT * FROM n1608204_smart_kopkar.m_pinjaman_mobile;
CREATE OR REPLACE VIEW m_jenis_pinjaman AS SELECT * FROM n1608204_smart_kopkar.m_jenis_pinjaman;
CREATE OR REPLACE VIEW trans_potongan_matrix AS SELECT * FROM n1608204_smart_kopkar.trans_potongan_matrix;
CREATE OR REPLACE VIEW trans_potongan_bulanan AS SELECT * FROM n1608204_smart_kopkar.trans_potongan_bulanan;
CREATE OR REPLACE VIEW trans_shu AS SELECT * FROM n1608204_smart_kopkar.trans_shu;
CREATE OR REPLACE VIEW trans_shu_dtl AS SELECT * FROM n1608204_smart_kopkar.trans_shu_dtl;
CREATE OR REPLACE VIEW db_sales AS SELECT * FROM n1608204_smart_kopkar.db_sales;
CREATE OR REPLACE VIEW db_salesreturn AS SELECT * FROM n1608204_smart_kopkar.db_salesreturn;
CREATE OR REPLACE VIEW db_company AS SELECT * FROM n1608204_smart_kopkar.db_company;
CREATE OR REPLACE VIEW db_items AS SELECT * FROM n1608204_smart_kopkar.db_items;
CREATE OR REPLACE VIEW db_category AS SELECT * FROM n1608204_smart_kopkar.db_category;
CREATE OR REPLACE VIEW db_units AS SELECT * FROM n1608204_smart_kopkar.db_units;
CREATE OR REPLACE VIEW orders AS SELECT * FROM n1608204_smart_kopkar.orders;
CREATE OR REPLACE VIEW wishlists AS SELECT * FROM n1608204_smart_kopkar.wishlists;
CREATE OR REPLACE VIEW products AS SELECT * FROM n1608204_smart_kopkar.products;
CREATE OR REPLACE VIEW faqs AS SELECT * FROM n1608204_smart_kopkar.faqs;
CREATE OR REPLACE VIEW notifications AS SELECT * FROM n1608204_smart_kopkar.notifications;

CREATE USER 'n1608204_nxmread'@'localhost' IDENTIFIED BY 'REPLACE_WITH_GENERATED_PASSWORD';
GRANT SELECT ON n1608204_kkisi_member_view.* TO 'n1608204_nxmread'@'localhost';
-- If the reader was created with the earlier plan: REVOKE SELECT ON n1608204_smart_kopkar.* FROM 'n1608204_nxmread'@'localhost';

-- 3C) Optional Future Stage (ONLY if/when owner enables ENABLE_MEMBER_FAVOURITES_WRITE):
--    Loan applications and deduction changes are NOT written by the PWA any more (P1, 10 Nov 2026): apps/web records them through its
--    KOSIPA command pipeline (docs/migration/sql/kosipa-member-request-writer-production.sql); the PWA only needs MEMBER_INTAKE_API_URL and
--    MEMBER_INTAKE_KEYS. The PWA writer account remains for smartkkisi wishlists only:
-- CREATE USER 'n1608204_nxmwrite'@'localhost' IDENTIFIED BY 'REPLACE_WITH_GENERATED_PASSWORD';
-- GRANT SELECT, INSERT, DELETE ON n1608204_smart_kopkar.wishlists TO 'n1608204_nxmwrite'@'localhost';
-- If an earlier plan granted it the intake tables: REVOKE ALL PRIVILEGES ON n1608204_smart_kopkar.trans_pinjaman_pengajuan FROM 'n1608204_nxmwrite'@'localhost';
--                                                  REVOKE ALL PRIVILEGES ON n1608204_smart_kopkar.trans_simpanan_pengajuan FROM 'n1608204_nxmwrite'@'localhost';

-- 3D) READ INDEXES — legacy schema change: ONLY with separate, explicit owner approval, as the cPanel owner, off-peak.
--     Use docs/migration/sql/kosipa-read-indexes-proposed.sql (pre-check first; TIER 1 only). The PWA loan screen reads
--     trans_pinjaman_dtl by doc_no (readScheduleAggregate / readScheduleRows): without `idx_nx_pdtl_doc_ke (doc_no, ke_cicilan)`
--     every open of /pinjaman scans ~1.2M rows (190–360 ms measured on an idle local copy; far more under shared-host contention).
--     The other member reads (simpanan, potongan, header pinjaman) scan 10–110k rows (9–65 ms measured) and need no index now.

-- =====================================================================================================================
-- STAGE 4: READ-ONLY POST-PROVISIONING VERIFICATION
-- =====================================================================================================================
SHOW GRANTS FOR 'n1608204_nxmauth'@'localhost';
SHOW GRANTS FOR 'n1608204_nxmread'@'localhost';
SHOW TABLES FROM n1608204_kkisi_member_auth;
SHOW FULL TABLES FROM n1608204_kkisi_member_view;
-- Expected:
-- 1. `n1608204_nxmauth` has ONLY `SELECT, INSERT, UPDATE, DELETE` on `n1608204_kkisi_member_auth.*`.
-- 2. `n1608204_nxmread` has ONLY `SELECT` on `n1608204_kkisi_member_view.*` — and NO grant on `n1608204_smart_kopkar`.
-- 3. `n1608204_kkisi_member_auth` contains 5 tables: `member_sessions`, `member_auth_throttle`, `member_pin_credentials`,
--    `member_command_ledger`, `member_write_lease`.
-- 4. `n1608204_kkisi_member_view` contains 27 rows of Table_type VIEW.

-- =====================================================================================================================
-- STAGE 5: ROLLBACK (REMOVES ONLY WHAT STAGES 2-3 CREATED; ZERO LEGACY DATA TOUCHED)
-- =====================================================================================================================
-- DROP USER IF EXISTS 'n1608204_nxmread'@'localhost';
-- DROP DATABASE IF EXISTS n1608204_kkisi_member_view;   -- views only; no data
-- DROP USER IF EXISTS 'n1608204_nxmauth'@'localhost';
-- DROP DATABASE IF EXISTS n1608204_kkisi_member_auth;
