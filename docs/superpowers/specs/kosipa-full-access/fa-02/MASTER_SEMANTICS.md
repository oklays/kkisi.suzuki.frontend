# FA-02: Master semantics (legacy behaviour, then native rules)

Date: 30 October 2026.

**Evidence sources:**

- Legacy controllers, models, views and JS under `kosipa/application/modules/master`.
- DDL from `SHOW CREATE TABLE` on the 30 Sep staging copy (read-only account).
- Read-only aggregates on that copy.

**Where the rules live:**

- Native rules: `packages/domain/src/kosipa/master.ts` (`MASTER_DEFINITIONS`).
- Physical mapping: `apps/web/src/infrastructure/repositories/kosipa-master-write.repository.ts`.

**What every master shares, legacy and native:**

- **Legacy:** `ajax_add` and `ajax_update` write the posted fields as they are. There is no server validation and no uniqueness check. `ajax_delete` hard-deletes with no reference check.
- **Native:** create, update, deactivate and reactivate only. Every command goes through the FA-01 pipeline: authorization, idempotency key, optimistic version, one transaction, ledger row in the ledger database, and a console audit event.

## Bagian (`master/bagian_c` → `m_bagian`)

| Aspect | Legacy | Native |
|---|---|---|
| Columns written | `name_bagian`, `status` (`id_lokasi` is never written by the form; all 172 staging rows have NULL) | The same two. `id_lokasi` is untouched |
| Status | INT 1/0; readers list `status='1'` | Written as 1/0 |
| Readers | Member forms (`get_bagian`, option value = name), mobile `users_c`, smartkkisi `master-bagian`, Next.js public savings (joins by id **or** BINARY name) | Unchanged |
| Data | 172 rows, all active. 2 case-insensitive duplicate name groups already exist. 2,745 of 3,462 non-empty `m_anggota.bagian` values and 981 of 1,034 `users.bagian` values match a master name | Existing duplicates are never "fixed"; edits to other rows are not blocked by them |
| Rules | none | Name required, at most 100 characters (`m_anggota.bagian` is VARCHAR(100)), printable ASCII, unique for new or changed names. **A name stored by any member or member account can't be changed (`MASTER_REFERENCED`), including a case-only change** |

## Jenis Dokumen (`master/jenis_dokumen_c` → `m_jenis_dokumen`)

| Aspect | Legacy | Native |
|---|---|---|
| Columns written | `jenis_dokumen_code`, `_name`, `_remarks`, `is_active`, plus `cd`/`cd_usr` on add and `ud`/`ud_usr` on update. The user columns hold the session `nama_lengkap` | The same, including the legacy audit columns: `cd_usr`/`ud_usr` = the KOSIPA user's `nama_lengkap`, time = Asia/Jakarta local, as `date('Y-m-d H:i:s')` produced |
| Status | `is_active` VARCHAR, `'1'`/`'0'` | Written as text `'1'`/`'0'` |
| Readers | **None.** Loan document forms use a fixed option list; `trans_dokumen` (0 staging rows) stores its own names | — |
| Rules | none | Code required, at most 20 characters, unique; description required, at most 50; remarks optional, at most 150 |

## Rekening Bank (`master/rekening_bank_c` → `m_rekening`). Special protection

| Aspect | Legacy | Native |
|---|---|---|
| Columns, status, audit columns | Like Jenis Dokumen | Like Jenis Dokumen |
| Readers | Bank-loan form `pinjaman_add_bank_v` (reached from `pinjaman_c`): `is_active='1'`, option value = **`rekening_code`**, stored in `trans_pinjaman.bank_pembiaya` | Unchanged |
| Data | 6 banks. 371 staging loans store one of their codes (e.g. 183 for one bank). No report joins `m_rekening` (the only reference in source is that form) | — |
| Rules | none | Code required, at most 20, unique. **The code can't change while any loan stores it (`MASTER_REFERENCED`)**; an unused code may be corrected. Description and remarks are labels and editable. Deactivation only hides the bank from new bank loans |
| Financial safety | A rename in legacy would orphan the bank of existing loans | Loans are never written: the writer has only `SELECT(bank_pembiaya)` on `trans_pinjaman`, and a checksum over all loan rows is unchanged before and after the test |

## Periode Angsuran (`master/periode_angsuran_c` → `m_jangka_waktu`). Special protection

| Aspect | Legacy | Native |
|---|---|---|
| Columns, status, audit columns | Like Jenis Dokumen | Like Jenis Dokumen |
| Readers | **None live** in KOSIPA: all six loan forms have the `m_jangka_waktu` query commented out and take `plan_jangka_waktu` as typed text. Possibly smartkkisi `pinjaman/master-jw` (source not available) | — |
| Data | 16 rows: codes `1`–`12`, `24`, `36`, `48`, `60` (months), names `n X`, remarks `n BULAN` / `n TAHUN`. 32,262 staging loans have a `plan_jangka_waktu` equal to some code (by value, not a reference) | — |
| Rules | none | **Code = whole number of months, 1–360 (VAL-104), unique, fixed at creation (`MASTER_FIELD_IMMUTABLE`).** The writer also has **no UPDATE privilege** on `jangka_waktu_code`, so the database refuses a change too. Description and remarks are labels. A different term is a new row, and the old one is deactivated |
| Financial safety | Changing a code in legacy could change what a term means to the mobile app | No existing meaning can change; loans are never written (checksum test) |

## Lokasi (FA-01, unchanged rules, now on the generic definition)

Code at most 50 characters, unique. Name at most 100, unique, and never changed while `m_anggota.lokasi` or `users.lokasi` stores it. Status INT 1/0.

## Safe alternative to the legacy delete (all five masters)

The legacy hard delete is not offered: there is no reference check, and the other applications store values, not ids. Deactivation with a reason (VAL-108) hides the row from new-entry lists, keeps every stored value meaningful, and is recorded in the ledger with before and after state.
