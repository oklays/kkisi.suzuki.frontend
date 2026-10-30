# Shared writer ownership: `m_lokasi` and the four FA-02 masters

Date: 30 October 2026 (FA-01.5). This is a targeted audit, not a full-system one.

**Sources:**

- The local KOSIPA source copy and its 02A index.
- The TOKO CI3 source (`tokonew.kkisitb2.id/`).
- The Next.js code (`apps/web`, `packages`, `integration`).
- The **partial** smartkkisi copy: 3 Laravel files including the full `routes/api/v1/api.php`, privately held in the public-savings worktree under `.local/public-savings/legacy-source/` (12 files in total, the rest CI2).
- Read-only aggregates on the 30 Sep staging copy.

## Writers

| Table | KOSIPA legacy | TOKO legacy (CI3) | smartkkisi (Laravel) | Next.js | Verdict |
|---|---|---|---|---|---|
| `m_lokasi` | `master/lokasi_c` only (02A 62–64) | none (0 files) | API: `GET master-lokasi` only (read) | FA-01 native commands | One legacy writer; fenced per controller |
| `m_bagian` | `master/bagian_c` only (02A 23–25) | none | API: `GET master-bagian` only (read) | FA-02 native commands; public savings **reads** it | One legacy writer |
| `m_jenis_dokumen` | `master/jenis_dokumen_c` only (02A 41–43) | none | no route | FA-02 native commands | One legacy writer |
| `m_rekening` | `master/rekening_bank_c` only (02A 74–76) | none | no route | FA-02 native commands | One legacy writer |
| `m_jangka_waktu` | `master/periode_angsuran_c` only (02A 71–73) | none | `POST pinjaman/master-jw` (`PinjamanController@m_waktu`); body **not available**, named and used like a read (`master-*` list endpoints) | FA-02 native commands | One legacy writer. smartkkisi write **unconfirmed** |

**Open item:** the smartkkisi **web admin panel** (`routes/web.php` and its controllers) is not in the copy. The API admin group shows only `auth` and `employee` routes. The operator must confirm that no smartkkisi admin screen writes these five tables, for example from the Laravel route list or a query-log sample, before the corresponding feature's production cutover (11, gate 5).

## Readers and data contracts (what native writes must keep true)

| Table | Reader | Key the reader uses | Contract kept by FA-02 |
|---|---|---|---|
| `m_lokasi` | Member forms (`anggota_v`, `master/anggota_v`), mobile `users_c`, smartkkisi `master-lokasi`, member registration | **Name** (`status=1` list). Stored in `m_anggota.lokasi`, VARCHAR(100), and `users.lokasi`. On staging 2,161 members and 998 accounts match | A name stored anywhere is never changed (`MASTER_REFERENCED`); the name is limited to 100 characters; `status` is written as 1/0 |
| `m_bagian` | Member forms via `get_bagian` (option value = **name**), mobile `users_c`, smartkkisi `master-bagian`, **Next.js public savings** (`infrastructure/public-savings/service.ts:76` and its procedure joins `m_anggota.bagian` to `m_bagian` by **id or exact (BINARY) name**) | Name; numeric id possible in that join (staging has 0 members and 0 accounts storing an id) | A referenced name is never changed, not even its letter case. The reference count uses the case-insensitive table collation, so a case-only change of a referenced name is refused, which the BINARY join needs. The row id never changes. Deactivation keeps the row, so the public-savings join still resolves. `id_lokasi` is never touched |
| `m_jenis_dokumen` | **None** in KOSIPA. Loan document forms use a fixed list, and `trans_dokumen` stores its own names (0 rows on staging) | — | Free edits; `is_active` is written as text `'1'`/`'0'`; `cd/cd_usr` and `ud/ud_usr` are written as legacy does |
| `m_rekening` | Bank-loan form `pinjaman_add_bank_v` (`is_active='1'`, option value = **code**). Stored in `trans_pinjaman.bank_pembiaya` (371 staging loans) | Code | The code is never changed while any loan stores it; labels may change (no report joins the name). Deactivation only hides the bank from the new-loan form. Loans are never touched (checksum test) |
| `m_jangka_waktu` | **None live** in KOSIPA (all six form references are commented out; `plan_jangka_waktu` is typed by hand). Possibly smartkkisi `master-jw` | Code = number of months (it textually matches `plan_jangka_waktu` on 32,262 staging loans) | The code is fixed at creation, enforced by the domain **and** by the missing UPDATE privilege on `jangka_waktu_code`. Labels and status change only |

## Cross-application effects of the native commands

| Native action | Effect elsewhere |
|---|---|
| **Create** | Appears in legacy and mobile lists on their next read (same table, same status values) |
| **Deactivate** | Disappears from new-entry lists. Existing members, accounts and loans keep the value they stored |
| **Rename** | Allowed only for values nothing stores, so no member, account or loan changes meaning |
| **No hard delete** | The legacy delete stays reachable only while legacy owns the feature. After the fence, it is gone with the controller |
