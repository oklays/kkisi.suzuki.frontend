# FA-03B plan — native Membership Management (WI-07, REQ-108…REQ-111)

Date: 30 October 2026. Status: **plan only. No member mutation is implemented or activated.** It builds on the FA-01/01.5/02 write foundation, the FA-03A legacy-runtime harness, the numbering service and the ownership guard proposal. Every rule cites the spec; open points are decisions, not defaults.

## 1. Scope

| In | Out (later work items) |
|---|---|
| Register a member (REQ-108), with REG numbering after FD-23 approval | Imports (WI-08, REQ-112) |
| Update profile, employment and bank fields (REQ-109) | Credit-limit changes (`kosipa.member.limits`, WI-08) |
| Change status (REQ-110), including the side effects of the status change | Deduction configuration (WI-09) |
| Deactivate instead of delete (REQ-111); FD-07 removal policy remains open | Exit settlement (WI-20; maker ≠ checker) |
| Identity linking of a member with a smartkkisi account (read and verify only) | Savings and loan balances (never written by member commands) |

## 2. `m_anggota` field classes (from the actual table, 73 columns)

| Class | Columns | Native rule |
|---|---|---|
| **Identity** (keys other tables store) | `nik_kar` (stored in `trans_pinjaman`, `trans_pinjaman_dtl`, `trans_simpanan_dtl`, `trans_potongan_matrix`, `db_sales`, `orders`, `users.nik`), `no_anggota`, `id_card`, `doc_no`, `tgl_daftar` | Set at registration only. **Never changed** by update. A NIK correction is a separate, later decision, because historical documents keep the old value |
| **Profile** (REQ-109) | `nama_kar`, `ktp`, `email`, `jenis_kel`, `tgl_lahir`, `tempat_lahir`, the address set (`alamat` … `kode_pos_tinggal`), `no_telp`, `no_telp1`, `status_rumah`, `pendidikan`, `status_nikah`, `nama_istri`, `ibu_kandung`, `npwp` | `kosipa.member.update`; PII masked unless `kosipa.member.pii`; ledger records `changed: true` only, never values |
| **Employment** (REQ-109) | `divisi`, `dept`, `bagian`, `lokasi`, `jabatan`, `kd_group`, `tgl_karyawan`, `tgl_masuk`, `status_karyawan` | `bagian` and `lokasi` must be **active master names** (stored by name, FA-02 contract); `kd_group` ∈ VAL-102 groups |
| **Bank** (REQ-109) | `no_rek`, `bank_rek`, `nama_rek` | `kosipa.member.update`, plus a reason. Used for withdrawals and disbursement, so FD-17 decides whether maker-checker applies |
| **Financial-linked** (never in profile commands) | `sim_wajib`, `sim_pokok`, `sim_sukarela` (balance mirrors), `gaji`, `limit_toko`, `limit_toko_old`, `limit_ppob`, `gaji_minus`, `limit_persen`, `batas_pinjaman`, `status_pot_pokok`/`_wajib`/`_sukarela`, `surat_kuasa`, `persetujuan` | Refused with `FIELD_NOT_ALLOWED` in register and update. Server-controlled status zeroing is REQ-110. Limits, deductions and savings mirrors belong to later commands; salary (`gaji`) is deferred from FA-03B and must later use a member command (BR-113), never a loan command |
| **Status** | `status_anggota`, `tgl_keluar` | `kosipa.member.status` only (REQ-110/111) |
| **Credentials and files** | `password`, `foto_profile`, `foto_ktp`, `foto_ttd`, `foto_kk`, `foto_bukti_biaya_sekolah` | Never written natively in FA-03B (smartkkisi and legacy upload flows own them) |
| **Audit** | `cd`, `cd_usr`, `ud`, `ud_usr` | Written as legacy does (KOSIPA display name), like the masters |

## 3. Commands

| Command | Capability | Preconditions (domain + locked row) | Atomic effects (one transaction) | Approval |
|---|---|---|---|---|
| `member.register` | `kosipa.member.create` | canonical NIK unique (VAL-101, `canonicalNik`); master names active; enumerations (VAL-102) | INSERT `m_anggota` with a REG number allocated via `DocumentNumberingService`; initial payroll deduction rows (REQ-108; exact rows **from characterization of `anggota_c::ajax_add`**, TASK-104); ledger; audit | none (08 §4) |
| `member.updateProfile` | `kosipa.member.update` | member exists; version check (`STALE`); only profile, employment and bank columns | UPDATE the changed columns only; ledger records which fields changed | none; bank fields per FD-17 |
| `member.changeStatus` | `kosipa.member.status` | not already the target; transition allowed (§5); reason; typed NIK confirmation (08) | status; to a non-AKTIVE status, zero `limit_toko`/`limit_ppob`/`gaji_minus`; smartkkisi wallet mirror once using the approved FD-08 contract (option (a) remains a recommendation); delete mobile tokens by `user_id` (REQ-110) | reason; maker-checker per FD-17 |
| `member.deactivate` | `kosipa.member.status` | REQ-111: never a hard delete when any financial history exists (loans, savings, matrix, sales) | the deactivation status, same effects as above | as above |

## 4. Identity linking and cross-application sync

| Application | What it holds | Native rule |
|---|---|---|
| smartkkisi `users` | `nik`, `name`, `ktp`, `email`, `phone`, `bagian`, `lokasi`, `no_rek`, `bank_rek`, `kd_group`, `wallet_balance`, `wallet_balance_ppob`, `is_active`, `is_delete` | Link by NIK (read-only verification). **Profile sync direction is decision FD-24 (new):** (a) native updates `m_anggota` only, and smartkkisi keeps its own copy (legacy KOSIPA behaviour); (b) native mirrors the overlapping fields into `users`. Status: FD-08 is open; option (a) recommends wallet mirror + token revocation by `user_id`, required by REQ-110 once the contract is resolved |
| TOKO | live reads of limits and status by NIK at POS; **writes** on pension (`Pos.php:448`); `Member_model` CRUD | The TOKO member menu must be disabled by the TOKO owner at cutover (`ANO-T03`). The `Pos.php:448` pension path must be disabled or routed to the native status command before native owns status |
| Console identity link | console user ↔ KOSIPA `ref_users` | Unchanged; members are not console users |

## 5. Status transitions (VAL-102 statuses)

`AKTIVE`, `LUAR BIASA`, `KONTRAK`, `RESIGN`, `PENSIUN`.

| From → To | Rule |
|---|---|
| any → a non-AKTIVE status | REQ-110 side effects, atomic |
| non-AKTIVE → AKTIVE (reactivation) | **Decision FD-25 (new):** allowed? Limits are not restored automatically (set by WI-08) |
| RESIGN/PENSIUN → exit closure | WI-20 (exit settlement, maker ≠ checker), not FA-03B |
| contract expiry (`tgl_keluar`) | D3 remains open. No automatic expiry job is in FA-03B scope; display-only is a proposed interim treatment, not an approved policy |

## 6. Single-writer requirement (from FA-03A §B)

Native `m_anggota` mutations may **not** be activated with the `ref_menu` fence alone. It was proven that `mobile/users_c` keeps writing with both member menus fenced. Before activation, all of these are required:

- FD-22 approved, with the `m_anggota.profile` column group extended to the employment and bank columns; whole-table ownership for INSERT/DELETE; a `m_anggota.status` group;
- or the §5 minimal control of [SHARED_WRITE_OWNERSHIP](SHARED_WRITE_OWNERSHIP.md).

## 7. Dependency-ordered tasks

| ID | Task | Depends on | Verification |
|---|---|---|---|
| M-01 | Characterize legacy member writes with the real-PHP harness: `anggota_c::ajax_add/ajax_update/ajax_delete`, `master/anggota_c`, `mobile/users_c`, TOKO `Pos.php:448`. Record exact columns, defaults and side rows (deduction rows, `users`) | FA-03A harness | runtime tests on synthetic data; written contract |
| M-02 | Decisions FD-07 (removal), FD-08 (wallet/token contract), FD-17 (bank/status control), FD-22, FD-23, FD-24, FD-25 and D3 (expiry scope) | — | decision register |
| M-03 | Domain `packages/domain/src/kosipa/member-command.ts`: field classes, VAL-101/102/103/105, transition table, `FIELD_NOT_ALLOWED` for financial-linked fields | M-01, M-02 | domain unit tests (every column class) |
| M-04 | Writer grants `db/kosipa/006_member_writer_grants.sql.tpl`: exact column-level INSERT/UPDATE including identity/audit/default fields required by M-01; side-table grants for M-08 only after FD-08 approval; no DELETE on `m_anggota`; `SELECT(doc_no)` + registry for REG | M-01, M-02, M-03 | grant tests (1142/1143 for every other column) |
| M-05 | Ownership guard extension (if FD-22 is approved): groups `m_anggota.profile`/`employment`/`bank`/`status` + INSERT/DELETE | M-01, M-02, M-03 | legacy-runtime test: every §1.1 writer refused per group, TOKO limit path allowed |
| M-06 | Application use cases `packages/application/src/kosipa/commands/member.ts` through the existing pipeline (idempotency, ledger, audit without PII values) | M-01, M-02, M-03 | application tests |
| M-07 | Repository `kosipa-member-write.repository.ts` + `prisma-kosipa-member-write.ts` (same writer-guard rules as the masters); REG numbering inside the register transaction | M-04, M-05 (or verified §6 alternative), M-06, TASK-109 | DB tests: 20 concurrent registrations of one NIK → 1 row; REG unique (consecutive only in isolated no-failure fixtures; gaps are allowed); injected failure → 0 rows, 0 numbers |
| M-08 | Status side effects: zeroing, `users` mirror per the approved FD-08 decision (option (a) proposed), token delete by `user_id` | M-02, M-04, M-05 (or verified §6 alternative), M-07 | DB test: RESIGN → limits 0, mirror once, tokens gone, one transaction |
| M-09 | HTTP + console pages (`console/kosipa/anggota/**`): register, edit with diff view, status with typed-NIK confirmation | M-07, M-08 | HTTP tests; browser E2E on the kfa01 profile |
| M-10 | Legacy compatibility: legacy member list, edit form, mobile detail and TOKO POS Kredit read native-written members | M-07, M-08 | legacy-runtime tests (as A1–A7); TOKO POS limit check on synthetic data |
| M-11 | Rollback rehearsal: legacy edits a native member; native refuses a stale version; owner switched back | M-10 | runtime test |
| M-12 | Production SQL (review-only): writer account, guard groups; budget update (B5/B8) | M-04, M-05 | static validation test (as `kosipa-production-sql-static-db`) |

**Activation (not part of FA-03B)** needs all of:

- B1, B3, B5/B8, B6 and FD-01b;
- FD-01c in place;
- TOKO member menu off and `Pos.php:448` handled;
- smartkkisi confirmation;
- cutover gates 1–8.

M-02 is a contract gate, not authorization to execute migrations or activate member writes. M-08 cannot be omitted while shipping status/deactivation commands: REQ-110 requires all status side effects atomically, including any approved cross-application tables on the same server. Verify their storage engines, exact account privileges and transaction scope in M-01/M-04. If that contract cannot be satisfied, keep status/deactivation unavailable. No member capabilities become grantable before their implemented commands and tests exist.
