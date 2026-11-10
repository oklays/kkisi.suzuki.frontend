# 14 — Production Migration Plan (WS-02 & WS-06)

## 1. Safety & Governance Principles

- **Manual-Only Execution**: Per project policy, no automated migration runner touches the production Niagahoster cPanel database (`n1608204_smart_kopkar`). All production DDL and user provisioning are reviewed and executed manually by the database owner.
- **Zero Breaking Changes to Legacy Schema**: The PWA auth and idempotency store resides in its own isolated database (`n1608204_kkisi_member_auth`). The business database (`n1608204_smart_kopkar`) is accessed via a `SELECT`-only account (`n1608204_nxmread`).
- **Staged Execution**: Every step in [`mobile-member-pwa-production.sql`](file:///Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/docs/migration/sql/mobile-member-pwa-production.sql) is classified by operational stage and reversibility.

---

## 2. Five-Stage Database Provisioning Plan

| Stage | Scope | Downtime / Lock Impact | Reversibility |
|---|---|---|---|
| **Stage 1: Read-Only Preflight** | Inspect MariaDB version, `max_user_connections`, `users.pin` distribution, and `m_anggota` duplicate NIK groups on `n1608204_smart_kopkar`. | None (`SELECT` only) | N/A |
| **Stage 2: Isolated Auth Schema** | Create database `n1608204_kkisi_member_auth` and apply [`001_member_auth.sql`](file:///Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/mobile_kkisi/db/auth/001_member_auth.sql) (`member_sessions`, `member_auth_throttle`, `member_pin_credentials`, `member_command_ledger`). | None (isolated empty DB) | `DROP DATABASE n1608204_kkisi_member_auth;` |
| **Stage 3: Least-Privilege Accounts** | Create `n1608204_nxmauth` (`SELECT, INSERT, UPDATE, DELETE` on `n1608204_kkisi_member_auth.*`) and `n1608204_nxmread` (`SELECT` on `n1608204_smart_kopkar.*`). | None | `DROP USER 'n1608204_nxmauth'@'localhost'; DROP USER 'n1608204_nxmread'@'localhost';` |
| **Stage 4: Post-Provisioning Verification** | Run `SHOW GRANTS` and `SHOW TABLES` to confirm zero write/DDL privileges on `n1608204_smart_kopkar`. | None | N/A |
| **Stage 5: Optional Online Index Rollout** | Add secondary B-tree indexes on high-scan history tables during an off-peak maintenance window (`ALGORITHM=INPLACE, LOCK=NONE`). | Online (`LOCK=NONE` in InnoDB) | `DROP INDEX <name> ON <table>;` |

---

## 3. Recommended Stage 5 Performance Indexes (`n1608204_smart_kopkar`)

Each index below is purely additive (non-unique B-tree index) and uses `ALGORITHM=INPLACE, LOCK=NONE` so concurrent POS and S-MART writes are not blocked:

```sql
-- Priority 1 (Critical): Reduces loan schedule lookups (1.2M rows) from ~2,102 ms to < 1 ms
ALTER TABLE n1608204_smart_kopkar.trans_pinjaman_dtl
  ADD INDEX idx_pinjaman_dtl_doc_cicilan (doc_no, ke_cicilan, id),
  ALGORITHM=INPLACE, LOCK=NONE;

-- Priority 2 (High): Reduces payroll matrix history lookup (70k rows) from ~543 ms to < 1 ms
ALTER TABLE n1608204_smart_kopkar.trans_potongan_matrix
  ADD INDEX idx_potongan_matrix_nik_id (nik_kar, id),
  ALGORITHM=INPLACE, LOCK=NONE;

-- Priority 3 (High): Reduces POS store-credit and sales history lookup (237k rows) from ~150 ms to < 1 ms
ALTER TABLE n1608204_smart_kopkar.db_sales
  ADD INDEX idx_sales_nik_date (nik_kar, sales_date, id),
  ALGORITHM=INPLACE, LOCK=NONE;

-- Priority 4 (Medium): Reduces savings summary & movement lookups (115k detail rows / 6k header rows) from ~49 ms to < 1 ms
ALTER TABLE n1608204_smart_kopkar.trans_simpanan_dtl
  ADD INDEX idx_simpanan_dtl_nik_id (nik_kar, id),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE n1608204_smart_kopkar.trans_simpanan
  ADD INDEX idx_simpanan_doc_no (doc_no),
  ALGORITHM=INPLACE, LOCK=NONE;

-- Priority 5 (Medium): Reduces online order history and member lookup from ~44 ms / ~27 ms to < 2 ms
ALTER TABLE n1608204_smart_kopkar.orders
  ADD INDEX idx_orders_nik_id (nik_kar, id),
  ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE n1608204_smart_kopkar.m_anggota
  ADD INDEX idx_anggota_nik_id (nik_kar, id),
  ALGORITHM=INPLACE, LOCK=NONE;
```

### Index Rollback Statements
```sql
ALTER TABLE n1608204_smart_kopkar.trans_pinjaman_dtl DROP INDEX idx_pinjaman_dtl_doc_cicilan;
ALTER TABLE n1608204_smart_kopkar.trans_potongan_matrix DROP INDEX idx_potongan_matrix_nik_id;
ALTER TABLE n1608204_smart_kopkar.db_sales DROP INDEX idx_sales_nik_date;
ALTER TABLE n1608204_smart_kopkar.trans_simpanan_dtl DROP INDEX idx_simpanan_dtl_nik_id;
ALTER TABLE n1608204_smart_kopkar.trans_simpanan DROP INDEX idx_simpanan_doc_no;
ALTER TABLE n1608204_smart_kopkar.orders DROP INDEX idx_orders_nik_id;
ALTER TABLE n1608204_smart_kopkar.m_anggota DROP INDEX idx_anggota_nik_id;
```

