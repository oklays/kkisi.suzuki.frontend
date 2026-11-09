-- PWA Anggota session/throttle store (apps/mobile_kkisi). Owned by this app only; it never touches the legacy business database.
-- Production: applied MANUALLY by the operator after review (see docs/mobile_design_pwa/implementation/08_DEPLOYMENT_GUIDE.md).
-- Only hashes are stored: HMAC(session id) and HMAC(identity/IP). No password, PIN, NIK lookup value or IP address in clear.

CREATE TABLE IF NOT EXISTS member_sessions (
  id_hash         CHAR(64)     NOT NULL,
  kid             VARCHAR(16)  NOT NULL,
  user_id         BIGINT       NOT NULL,              -- smartkkisi users.id
  member_id       INT          NOT NULL,              -- KOSIPA m_anggota.id
  nik             VARCHAR(50)  NOT NULL,              -- member key the session reads with (from the account, never from a client)
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
