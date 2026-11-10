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

-- Shadow PIN credential store (WS-01 §3.2): stores peppered scrypt hashes for verified legacy PINs in the PWA's own auth database
-- without modifying smartkkisi.users.pin during coexistence with the legacy S-MART mobile app. `source_digest` is HMAC(users.pin),
-- so if an administrator resets `users.pin` in smartkkisi, the PWA detects the change and re-syncs on next PIN verification.
CREATE TABLE IF NOT EXISTS member_pin_credentials (
  user_id       BIGINT       NOT NULL,
  source_digest CHAR(64)     NOT NULL,
  pin_hash      VARCHAR(255) NOT NULL,
  hash_scheme   VARCHAR(32)  NOT NULL,
  updated_at    DATETIME(3)  NOT NULL,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Idempotency and audit ledger for member self-service mutations when writer flags are enabled (WS-03 §5.2).
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
