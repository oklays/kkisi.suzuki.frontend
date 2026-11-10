# 11 — Database Performance & Query Audit (WS-02)

## 1. Compatibility & Runtime Safeguards

- **Engine & Charset**: Verified against MariaDB 10.6 / 11.4 (`latin1_swedish_ci` on legacy KOSIPA/POS tables `m_anggota`, `trans_*`, `db_*`; `utf8mb4_unicode_ci` on `smartkkisi` tables `users`, `orders`, `products`, `wishlists`, `faqs`, `notifications`, and on `kkisi_member_auth.*`).
- **Connection & Query Safeguards**:
  - Pool size is capped at `MEMBER_DB_POOL_LIMIT` (default `2`, max `5`) for `readerDb` and `2` for `authDb`, staying well within Niagahoster cPanel `max_user_connections`.
  - Every `readerDb` statement in [`sql.ts`](file:///Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/mobile_kkisi/src/server/kosipa/sql.ts) is wrapped in `SET STATEMENT max_statement_time=5 FOR ...` and carries an explicit `LIMIT`.
  - [`mysql.ts`](file:///Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/mobile_kkisi/src/server/db/mysql.ts) logs a redacted structured warning (`event: "db.query.slow"`, `ms`) whenever a query exceeds `SLOW_QUERY_THRESHOLD_MS = 500` ms without logging SQL text, parameters, or PII.

---

## 2. Production Snapshot Cardinality & Unindexed Baseline (`kkisi_refresh_20261030`)

Measured using `ANALYZE FORMAT=JSON` on the 30 Sep / Oct 2026 production snapshot (`kkisi_refresh_20261030`) vs the indexed staging schema (`kkisi_staging`):

| Table | Total Rows | Primary PWA Query (`member.reader.ts` / `store.reader.ts`) | Unindexed Access Type & Rows Examined (`r_rows`) | Unindexed Latency (`r_total_time_ms`) | Indexed Access Type & Rows Examined (`r_rows`) | Indexed Latency (`r_total_time_ms`) |
|---|---:|---|---|---:|---|---:|
| `trans_pinjaman_dtl` | 1,202,150 | `readScheduleAggregate` & `readScheduleRows` (`WHERE doc_no = ?`) | `ALL` (full scan: **1,202,150 rows**, 12,498 pages) | **2,102.6 ms** | `ref` on `idx_pinjaman_dtl_doc_cicilan (doc_no, ke_cicilan, id)` (**12–36 rows**) | **0.4 ms** |
| `trans_potongan_matrix` | 70,169 | `readPayrollRows` (`WHERE nik_kar IN (?) ORDER BY id DESC LIMIT 12`) | `index` scan on `PRIMARY` (**70,169 rows**, 3,055 pages) | **542.7 ms** | `range` on `idx_potongan_matrix_nik_id (nik_kar, id)` (**≤ 12 rows**) | **0.3 ms** |
| `db_sales` | 237,438 | `readCreditUsage` & `readSales` (`WHERE nik_kar = ? ...`) | `ALL` (**237,438 rows**, 4,049 pages) | **150.0 ms** | `ref` on `idx_sales_nik (nik_kar)` (**1–15 rows**, 4 pages) | **0.03 ms** |
| `trans_simpanan_dtl` | 114,916 | `MysqlSavingsReader.typeSummary` & `movements` (`WHERE nik_kar IN (?)`) | `ALL` (**114,916 rows**, 1,198 pages) | **37.4 ms** | `range` on `idx_simpanan_dtl_nik_id (nik_kar, id)` (**~85 rows**) | **0.5 ms** |
| `trans_simpanan` | 5,992 | `MysqlSavingsReader.typeSummary` & `headersByDocNo` (`WHERE doc_no IN (?)`) | `ALL` + filesort (**5,992 rows**) | **11.4 ms** | `range` on `idx_simpanan_doc_no (doc_no)` (**~85 rows**) | **0.3 ms** |
| `orders` | 19,372 | `readOrders` (`WHERE nik_kar IN (?) ORDER BY id DESC LIMIT 40`) | `index` scan on `PRIMARY` (**19,372 rows**, 964 pages) | **43.6 ms** | `range` on `idx_orders_nik_id (nik_kar, id)` (**≤ 40 rows**) | **0.2 ms** |
| `m_anggota` | 9,351 | `memberByNik` (`WHERE nik_kar IN (?) ORDER BY id DESC LIMIT 5`) | `index` scan on `PRIMARY` (**9,351 rows**, 382 pages) | **27.1 ms** | `range` on `idx_anggota_nik (nik_kar)` (**1–2 rows**, 8 pages) | **1.68 ms** |
| `trans_shu_dtl` | 12,188 | `readShu` (`WHERE nik_kar IN (?) ORDER BY periode_th DESC, id DESC LIMIT 20`) | `ALL` + filesort (**12,188 rows**) | **13.5 ms** | `range` on `idx_shu_dtl_nik (nik_kar, periode_th, id)` (**1–5 rows**) | **0.2 ms** |
| `m_simpanan_aktif` | 5,709 | `readActiveDeductions` (`WHERE nik_kar IN (?) ORDER BY id DESC LIMIT 30`) | `index` scan on `PRIMARY` (**5,709 rows**) | **9.6 ms** | `range` on `idx_simpanan_aktif_nik_id (nik_kar, id)` (**2–4 rows**) | **0.2 ms** |
| `trans_pinjaman` | 4,769 | `readLoans` (`WHERE nik IN (?) ORDER BY doc_date DESC, id DESC LIMIT 20`) | `ALL` + filesort (**4,769 rows**) | **7.7 ms** | `range` on `idx_pinjaman_nik_date (nik, doc_date, id)` (**1–5 rows**) | **0.2 ms** |
| `db_items` | 1,685 | `readCatalog` (`WHERE company_id = ? AND status = 1 ... LIMIT 48`) | `ALL` (**1,685 rows**) | **2.2 ms** | `ref` on `idx_items_catalog (company_id, status, status_so, type)` | **0.4 ms** |

---

## 3. Code-Level SQL Optimizations Implemented in Phase 2

Even before production indexes are applied, we optimized three queries in [`member.reader.ts`](file:///Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/mobile_kkisi/src/server/kosipa/member.reader.ts) and [`store.reader.ts`](file:///Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/mobile_kkisi/src/server/kosipa/store.reader.ts):

1. **Scoped `trans_simpanan` header aggregation in `MysqlSavingsReader.typeSummary`**:
   - *Before*: Joined an unfiltered derived table `(SELECT doc_no, ... FROM trans_simpanan GROUP BY doc_no) h`, forcing MariaDB to scan and filesort all 5,992 rows of `trans_simpanan` on every `/beranda` and `/simpanan` load even when `trans_simpanan(doc_no)` is indexed.
   - *After*: Scoped the derived header subquery with `WHERE doc_no IN (SELECT d2.doc_no FROM trans_simpanan_dtl d2 WHERE d2.nik_kar IN (?))`, allowing indexed `trans_simpanan(doc_no)` to look up only the member's own ~85 document numbers.
2. **Sargable `ORDER BY` in `readScheduleRows`**:
   - *Before*: `ORDER BY COALESCE(ke_cicilan, 0), id LIMIT ?` wrapped `ke_cicilan` in a function expression, preventing MariaDB from using a composite index `(doc_no, ke_cicilan, id)` to avoid `Using filesort`.
   - *After*: Changed to `ORDER BY ke_cicilan, id LIMIT ?`, which preserves identical ordering (in MariaDB ascending order, `NULL` sorts before `1..N`) while eliminating `Using filesort` once `idx_pinjaman_dtl_doc_cicilan` is present.
3. **Eliminated redundant `LEFT JOIN db_category` in `readCatalog` count query**:
   - *Before*: `SELECT COUNT(*) FROM db_items i LEFT JOIN db_category c ON c.id = i.category_id WHERE ...` joined `db_category` even when no category filter was active.
   - *After*: Joins `db_category` in the `COUNT(*)` query only when `q.category` is non-null.

---

## 4. Recommended Production Index Rollout (`ONLINE`, Non-Blocking)

The highest-impact index is on `trans_pinjaman_dtl(doc_no, ke_cicilan, id)`, which reduces `/beranda` and `/pinjaman` schedule queries from **4.2 seconds** (two 1.2M-row scans per active loan) to **< 1 ms**. Full staged DDL and rollback statements are provided in [`14_PRODUCTION_MIGRATION_PLAN.md`](file:///Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/docs/mobile_design_pwa/implementation/14_PRODUCTION_MIGRATION_PLAN.md).

