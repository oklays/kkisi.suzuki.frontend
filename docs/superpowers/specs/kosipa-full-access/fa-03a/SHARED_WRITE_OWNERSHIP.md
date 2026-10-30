# FA-03A — Shared writers, ownership and the single-writer boundary (Objective B)

Date: 30 October 2026. This extends [FA-01.5 SHARED_WRITER_OWNERSHIP](../fa-01.5/SHARED_WRITER_OWNERSHIP.md), which covers the five masters, to `m_anggota` and its dependants. It replaces "the `ref_menu` fence is the single-writer mechanism" with what the integration tests actually prove.

**Sources:**

- the local KOSIPA source and [02A](../02A_LEGACY_METHOD_WRITE_INDEX.md);
- the TOKO CI3 source;
- the partial smartkkisi copy (as in FA-01.5);
- the Next.js code;
- the executed tests in `apps/web/tests/kosipa-legacy-runtime.test.mjs` (real PHP, synthetic data).

## 1. Writers of `m_anggota` and its dependants

### 1.1 KOSIPA legacy: 42 write methods in 21 controllers (02A)

| Module | Controllers (write methods) | What they write on `m_anggota` |
|---|---|---|
| Member admin | `master/anggota_c` (5), `anggota/anggota_c` (5) | insert, update of all fields, **hard delete**, status, limits |
| Mobile admin | `mobile/users_c` (1), `mobile/pinjaman_mobile_c` (1), `mobile/pengajuan_mobile_c` (1), `mobile/penarikan_mobile_c` (1) | profile (`nama_kar`, contact, `bagian`, `lokasi`), `limit_toko`, `limit_ppob`; request side effects |
| Payroll | `payroll/matrix_c` (2) | deduction-related fields during matrix and batch work |
| Loans | `pinjaman_c` (2), `pinjaman_reguler_c` (2), `pinjaman_bank_c` (2), `kpr_btn_c` (2), `gaji_minus_c` (1) | `gaji_minus`, loan-related member fields |
| Savings | `simpanan_c` (2), `simpanan_new_c` (2), `sim_payroll_c` (2), `penarikan_simpanan_c` (2), `penarikan_mobile_c` (1), `pengajuan_mobile_c` (1), `hak_kewajiban_c` (1), `master_payroll_c` (3) | savings-mirror and deduction fields |
| SHU | `shu_c` (3), including Excel uploads | SHU-related member fields |

### 1.2 Other applications and code

| Writer | Path | Notes |
|---|---|---|
| TOKO (CI3) | `Member_model` insert/update/delete | String-built SQL: the TOKO legacy member menu writes the same table |
| TOKO (CI3) | `Pos.php:448` | On pension: `status_anggota = PENSIUN` and zeroes `limit_ppob`, `limit_toko`, `gaji_minus`, **during a sale** |
| smartkkisi (Laravel) | registration and profile | Stores member names in `users`. `m_anggota` writes from the web admin panel are **unconfirmed** (panel not in the copy) |
| Next.js public savings | proposed migration (procedure) | Updates `sim_sukarela` via a procedure, using `@pss_*` session variables as its writer marker |
| Payroll generator | `x_proc_create_matrix` (procedure, body unknown until B1) | Called synchronously by `payroll/matrix_c` |

### 1.3 Batch and background work

- **No scheduler in the application code.** TOKO has no cron ([08-background-jobs](../../../../legacy-reference/08-background-jobs.md)). The local KOSIPA source has no CLI entry point, cron or `CREATE EVENT` (grep for `is_cli_request|cron|CREATE EVENT` over `kosipa/application`: 0 files). Every KOSIPA batch runs synchronously inside a request: Excel imports, SHU upload and payroll generation. Host crontabs on the server are not visible to engineering (operator to confirm with B3).
- **MySQL EVENTs:** not visible in the staging copy. The B1 export reports invisible events, so production EVENTs remain an evidence gap (B1/B3).

### 1.4 Direct database modification

- phpMyAdmin and the cPanel owner account can write every table.
- No application control can stop the owner account (FD-01c).

## 2. Readers and denormalized dependencies

| Value | Stored copies | Consequence for native writes |
|---|---|---|
| bagian / lokasi **names** | `m_anggota.bagian` / `.lokasi`, smartkkisi `users`, public-savings join (id or BINARY name) | Referenced names are never renamed (`MASTER_REFERENCED`, proven by real PHP in A7) |
| member name, NIK | `trans_*` headers (`nik`, `nama`), TOKO sales, smartkkisi `users` | Historical documents retain their copied values; future native profile synchronization with smartkkisi remains FD-24 (PROPOSED) |
| limits (`limit_toko`, `limit_ppob`, `gaji_minus`) | read live by TOKO POS (Kredit) and mobile | A status or limit change takes effect on the next POS check; TOKO also **writes** them (`Pos.php:448`) |
| `doc_no` | parsed by prefix/period (A-05; G-10 open) | Numbering keeps the legacy shape ([DOCUMENT_NUMBERING_IMPLEMENTATION](DOCUMENT_NUMBERING_IMPLEMENTATION.md)) |

## 3. Fence boundary proven by integration tests

`ref_menu.status = 0` disables **one controller URL** in the KOSIPA legacy gate. It does not lock a table. The test runs real legacy PHP:

> **B: the ref_menu fence closes exactly one controller.**

1. **Fenced controller.** With `master/lokasi_c` fenced, legacy `ajax_add` redirects to `error/adm_error_c` and no row is added. The fence works for the controller it names.
2. **Unfenced route.** With **both** member menus fenced (9101 `master/anggota_c`, 9108 `anggota/anggota_c`), the mobile controller still writes. `mobile/users_c/ajax_update` (menu 9109, enabled) rewrites `m_anggota.nama_kar`, `limit_toko` and `limit_ppob`. The fence does **not** make Next.js the only writer of `m_anggota`.

**Conclusion:** `ref_menu` is sufficient only for tables with exactly one legacy writer controller and no other writers. That holds for the five masters (FA-01.5 audit; smartkkisi panel still to be confirmed). It is **not** sufficient for `m_anggota`, which has 21 KOSIPA controllers plus TOKO, smartkkisi, procedures and direct SQL.

## 4. Enforceable single-writer mechanism (FD-22, PROPOSED)

`apps/web/scripts/kosipa-ownership-guard.mjs` prints SQL only; it never connects anywhere. The SQL creates:

- an ownership registry `<ledger db>.kosipa_write_owner` with columns `object` (PK), `owner` (`LEGACY`|`NATIVE`), `native_account`, `changed_by`, `changed_at` and `reason`;
- `BEFORE INSERT/UPDATE/DELETE` triggers on each of the five masters;
- a `BEFORE UPDATE` column-group trigger on `m_anggota` for `nama_kar`, `email`, `no_telp`, `bagian` and `lokasi`. It fires only when one of those values actually changes.

When the object is `NATIVE` and the session's **authenticated login** (`SUBSTRING_INDEX(USER(), '@', 1)`) is not the native account, the trigger raises `SIGNAL '45000' 'KOSIPA_NATIVE_OWNED:<object>'`. It uses `USER()` because inside a trigger `CURRENT_USER()` is the trigger definer. Session variables (the public-savings `@pss_*` style) were rejected because any client can set them.

**Proven on the synthetic stack** (test "B: the proposed ownership guard (FD-22) closes every route"):

| Writer | `m_lokasi` NATIVE | `m_anggota.profile` NATIVE |
|---|---|---|
| Legacy `master/lokasi_c` `ajax_update` | refused (`KOSIPA_NATIVE_OWNED:m_lokasi`), row unchanged | — |
| Native command (`kosipa_master_w`) | works | — |
| Root, direct SQL | refused | — |
| Legacy `mobile/users_c` `ajax_update` | — | refused (`m_anggota.profile`) |
| Update of a non-group column (`limit_toko`) | — | works (TOKO and payroll keep writing their columns) |
| Owner switched back to `LEGACY` | legacy works again | legacy works again |

**Cleanup:** owners are set back to `LEGACY` and the triggers are dropped (`--drop`).

### Limits and why it is only PROPOSED

1. **Business-database triggers.** The PRD forbids triggers on the business database without approval. FD-22 asks for that exception, for these objects only.
2. **cPanel may refuse.** It can refuse `CREATE TRIGGER` (TRIGGER privilege, binary logging / `log_bin_trust_function_creators`). If it does, the minimal control is section 5.
3. **The owner account can bypass it.** It can drop the triggers or edit `kosipa_write_owner` (FD-01c). Tamper evidence is required ([PRODUCTION_READINESS_GATES](PRODUCTION_READINESS_GATES.md) §B6/FD-01c).
4. **Shared accounts.** If several legacy applications share one DB account, the guard cannot tell them apart. It does not need to: only "native account vs everyone else" matters.
5. **Column groups guard UPDATE only.** Member INSERT (registration) and DELETE need whole-table ownership or verified exclusion of every writer, including TOKO and external paths; the two member menu fences alone are insufficient. That decision belongs to membership (see [NEXT_IMPLEMENTATION_PLAN](NEXT_IMPLEMENTATION_PLAN.md)).

## 5. Minimal required control if FD-22 is not approved

For **masters**, the per-controller `ref_menu` fence is enough. That holds once the smartkkisi admin panel is confirmed not to write them (gate 5), and given the FA-01.5 fail-closed `LEGACY_ACTIVE` check.

For **`m_anggota`**, no native mutation may be activated without one of these:

- **(a) Approved FD-22, extended to every column/operation the member command owns.** The current prototype covers five profile columns on UPDATE only; it does not guard member registration, deletion, status or bank changes.
- **(b)** fencing **every** controller in §1.1 that writes the columns the native command owns, with `mobile/users_c` and `master_payroll_c` at minimum for profile fields; plus the TOKO owner disabling the TOKO member menu (`ANO-T03`); plus disabling or routing TOKO `Pos.php:448` for status ownership; plus verification of procedures, host jobs, direct accounts and smartkkisi writes against the exact owned operations. INSERT/DELETE need every insert/delete writer excluded.

Option (b) disables large parts of legacy KOSIPA, so (a) is recommended.

## 6. Race conditions

| Race | Handling |
|---|---|
| Legacy re-enable (`adm_menu_c`) during a native command | Share locks on the `ref_menu` rows: the re-enable waits, then native refuses (`LEGACY_ACTIVE`). Proven, FD-03 tests |
| A legacy request in flight while the fence is switched | Legacy does not use transactions (VF-02). The operator drains: wait until the access log shows no request to the controller for an operator-defined interval covering the maximum request duration, and verify no relevant in-flight DB transaction before switching the owner (cutover gate) |
| Owner switch `LEGACY → NATIVE` during a legacy statement | The prototype has no proven atomic handover protocol for a racing ownership change; do not infer statement-wide ownership consistency. Fence and drain every relevant writer before switching; verify no in-flight transaction remains |
| Two native commands on one row | Version check + row lock (`STALE`), proven FA-01/FA-02 |
| TOKO `Pos.php:448` pension update vs a native member status change | Both are single-row UPDATEs; last writer wins on overlapping columns. Membership must own status **and** the TOKO path must be disabled or routed (plan, WI-07) |

## 7. Cutover and rollback (per object)

1. **Cutover:** fence the legacy controller(s); drain; if FD-22 is approved, set `owner = NATIVE` (operator, reviewed SQL); otherwise verify the complete exclusion controls in §5; enable the feature flag; then smoke test.
2. **Rollback:** disable the feature flag; set `owner = LEGACY`; un-fence. Native rows remain legacy-compatible. The real-PHP rollback test shows legacy editing a native row and native refusing a stale version afterwards.
