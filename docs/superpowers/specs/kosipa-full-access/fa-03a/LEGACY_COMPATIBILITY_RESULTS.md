# FA-03A — Legacy PHP runtime compatibility results (Objective A)

Date: 30 October 2026. Scope: the five native masters (`m_lokasi`, `m_bagian`, `m_jenis_dokumen`, `m_rekening`, `m_jangka_waktu`) and the legacy screens that read them. This closes the FA-02 limitation "no PHP proof that legacy pages read native rows" (TASK-104/131 for masters only).

## 1. What runs

The **real, unchanged** legacy KOSIPA application (CodeIgniter 2.1.4, `system/core/CodeIgniter.php` `CI_VERSION = '2.1.4'`) is executed by PHP and driven over HTTP against rows that the Next.js commands wrote.

| Part | Path | Notes |
|---|---|---|
| Runtime image | `integration/kosipa-full-access/legacy-runtime/Dockerfile` | `php:5.6.40-cli` pinned by digest, plus `mysqli` and `mysql`; built with `--platform linux/amd64` as `kkisi-kfa-php56-ci2` |
| Router | `legacy-runtime/router.php` | PHP built-in server; unknown paths go to `/app/index.php` (CI front controller) |
| HTTP client | `legacy-runtime/client.php` | runs **inside** the container; cookie jar, CSRF (`csrf_cookie` → form field `csrf`), no redirects followed |
| Orchestration | `legacy-runtime/runtime.mjs` | creates the container, network, DB account and config; tears all of them down |
| Screen catalogue | `legacy-runtime/screens.mjs` | every master screen (`index`, `ajax_list`, `ajax_edit`), the member list, `get_bagian` (member and mobile), the mobile member detail |
| Structure discovery | `legacy-runtime/discover-structure.mjs` | maintenance tool: adds the structure (never rows) of tables the legacy screens need, from the local staging copy with the read-only account |
| Structure fixture | `integration/kosipa-full-access/fixtures/legacy-runtime-structure.sql` | 8 tables, structure only: `ref_hist_akses_users`, `db_currency`, `ref_site`, `m_group_anggota`, `m_status_anggota`, `template_id_card`, `business_settings`, `orders` |
| Tests | `apps/web/tests/kosipa-legacy-runtime.test.mjs` | opt-in `KOSIPA_FA01=1`, 6 tests |

### Isolation (how it cannot touch anything real)

- **Network:** the container joins a Docker network created with `--internal`, together with the FA DB container (alias `kfa-db`). It publishes no port and has no route to the internet, the host, real-data staging or production. Mail the legacy code tries to send (`kirim_email` in `mobile/users_c`) cannot leave.
- **Source:** the legacy source is mounted read-only and copied into a tmpfs `/app`. The container root filesystem is `--read-only`. No legacy file is changed, on disk or in memory.
- **Database:** the configuration is generated into `application/config/development/database.php` (CI's environment override) inside tmpfs. The legacy `application/config/database.php` and `.env` are never read. The DB account `kfa_legacy_<run>` has `SELECT, INSERT, UPDATE, DELETE` on `kkisi_kfa_synthetic.*` only (the sentinel-checked synthetic database) and is dropped at the end.
- **Login:** the real `admin/login/validate` with a synthetic KOSIPA user (`ref_users` 9102 `synth_kfa_k_operator`, password set per run).
- **Cleanup:** `close()` removes the container, the network, the DB user and the private config directory, even after a failure.

## 2. Results

Command: `cd apps/web && KOSIPA_FA01=1 node --experimental-strip-types --test --test-concurrency=1 tests/kosipa-legacy-runtime.test.mjs` (FA app server stopped). Fresh continuation result: **6/6 pass, 0 skipped**, including the extended all-five-master deactivation assertions; the complete final sequential DB run is **40/40**. The recovered suite also passed in the initial continuation run (**39/39**). See [CHECKPOINT_REPORT](CHECKPOINT_REPORT.md) for the continuation recovery and complete test record.

| # | Check | Result |
|---|---|---|
| A1–A4 | One row per master is created natively; Jenis Dokumen is also updated natively. Each legacy master screen renders (HTTP 200) with no `A PHP Error` or `Database Error` block. The native row appears in `ajax_list` unfiltered (`length` 5000) and with a search where legacy search works. These screens have no separate server-side status-filter input. `ajax_edit/<id>` returns it with the legacy column formats | **Pass** |
| A3 formats | `m_lokasi.status` / `m_bagian.status` = `'1'`; `is_active` = `'1'` for the other three; `cd`/`cd_usr` = KOSIPA display name `SYNTH KFA KOSIPA OPERATOR`; `ud_usr` set after the native update; `id_lokasi` stays NULL (legacy never sets it) | **Pass** |
| A4 search | Search is a **pre-existing legacy defect** on 3 screens (LEG-01 below). The test asserts the same fatal error for the native term **and** for a term of a seed row, so the defect is not caused by native rows | **Pass** (defect recorded) |
| A5/A6 | A natively **deactivated** bagian and lokasi vanish from both `get_bagian` endpoints (member and mobile), from the member form options and from the mobile detail page, while the master screen still lists them as `Tidak Aktif`. Native reactivation restores them everywhere | **Pass** |
| A5 all five masters | Each native-created row is deactivated through its native command, retained in the real legacy list as `Tidak Aktif`, returned by the real legacy edit endpoint with status `'0'`, then reactivated natively. No delete is performed | **Pass** |
| A7 dependent | The legacy member list (`anggota/anggota_c`, menu 9108) still shows the stored bagian and lokasi names. The public-savings BINARY join still resolves. A case-only rename of a referenced name is refused natively (`MASTER_REFERENCED`) | **Pass** |
| Rollback | Legacy `ajax_update` edits a natively created Jenis Dokumen row (status `'00'` = legacy success). Native reads the legacy change; a native edit with the old version is refused `STALE`; `ud_usr` is the legacy session name | **Pass** |
| No financial change | Row count + CRC over every column of `trans_pinjaman`, `trans_pinjaman_dtl`, `trans_simpanan`, `trans_simpanan_dtl`, `trans_potongan_bulanan`, `trans_potongan_matrix`, before and after the tests | **Unchanged** |
| Fence boundary | See [SHARED_WRITE_OWNERSHIP §3](SHARED_WRITE_OWNERSHIP.md#3-fence-boundary-proven-by-integration-tests) | **Pass** |

## 3. Legacy defects found (pre-existing; not fixed: no legacy code changes)

| ID | Defect | Evidence | Effect on native writes |
|---|---|---|---|
| LEG-01 | `jenis_dokumen_m`, `rekening_bank_m`, `periode_angsuran_m` call `$this->db->group_start()`, which does not exist in CI 2.1.4. Any non-empty search on these three screens is a PHP fatal error (`bagian_m` has the same call commented out) | runtime test A4 (fatal for a seed row too) | None. Listing without search, filter by status and edit work |
| LEG-02 | `mobile/users_c::ajax_update` builds its UPDATE by string concatenation (SQL injection) and calls `kirim_email` | source + runtime (mail blocked by the internal network) | None. It is also the route that defeats the `ref_menu` fence for `m_anggota` (SHARED_WRITE_OWNERSHIP §3) |
| LEG-03 | `users_detail_v.php:415` reads an undefined `$data` (PHP notice on the mobile member detail page) | source; the page still renders, and the harness checks only its content (bagian and lokasi options) for this page, not the absence of notices | None |

## 4. Correction to FA-02 documents

`m_rekening` has **no live legacy reader**. `pinjaman_add_bank_v` is loaded only by commented-out code (`pinjaman/controllers/pinjaman_c.php:1993`). The 371 staging loans' `bank_pembiaya` values are `m_jenis_pinjaman` codes (`parent_id = 2`) whose text happens to equal the rekening codes. The FA-02 protection ("a code stored by a loan is never changed") is **kept** as a conservative rule. [MASTER_SEMANTICS](../fa-02/MASTER_SEMANTICS.md) and [SHARED_WRITER_OWNERSHIP](../fa-01.5/SHARED_WRITER_OWNERSHIP.md) are corrected.

## 5. Limits of this evidence

- Synthetic data only: no real-data staging rows are loaded into the writable runtime (by rule). Characterization on real rows remains read-only SQL (TASK-104).
- The structure fixture comes from the 30 Sep staging copy. If production differs (B1/B3), the harness must be re-run against the B1 export.
- PHP 5.6 CLI built-in server, not the production Apache/PHP build. CI behaviour is the same code path. `php.ini` differences (for example `short_open_tag`) are not covered.
- Only the master screens and their dependent member and mobile readers are exercised. Document screens (loans, savings, payroll) come with their own checkpoints.

## 6. How to run and extend

```bash
node integration/kosipa-full-access/local-stack.mjs setup          # once; `reset` between runs
docker build --platform linux/amd64 -t kkisi-kfa-php56-ci2 integration/kosipa-full-access/legacy-runtime
cd apps/web && KOSIPA_FA01=1 node --experimental-strip-types --test --test-concurrency=1 tests/kosipa-legacy-runtime.test.mjs
# a new screen needs a missing table -> structure only, from the local staging copy (read-only account):
KOSIPA_FA01=1 node integration/kosipa-full-access/legacy-runtime/discover-structure.mjs [extra_table ...]
```
