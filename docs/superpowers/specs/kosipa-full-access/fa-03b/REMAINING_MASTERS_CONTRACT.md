# WI-06 / F52 — Audit of the 12 outstanding KOSIPA reference masters

Observed 6 Nov 2026. Read-only audit. I did not read any `.env*` or credential files.

## Evidence sources and caveats

- **Legacy source.** Paths are relative to `legacy/kosipa/application/` (main repo). The 12 masters live under `modules/master/{controllers,models,views}/`.
- **Schema.** The path you gave, `kkisi.suzuki.web/.local/kosipa-full-access-completion-20261106/schema-contracts.json`, does not exist.
  - The copy in the worktree (`<worktree>/.local/kosipa-full-access-completion-20261106/schema-contracts.json`) only covers member and savings tables: `m_anggota`, `m_simpanan_aktif`, `users`, `oauth_access_tokens`, `trans_simpanan*`, plus a list of routines.
  - The master DDL is in **`<worktree>/.local/kosipa-full-access-completion-20261106/master-schema-contracts.json`**. It was captured 2026-11-06T09:43:56Z, structure only (`SHOW CREATE`), from db `n1608204_smart_kopkar` on MariaDB 10.11.19. Its `unavailable` entry is `{db_cabang: errno 1146}`.
  - `view-contracts.json` is in the same folder. All DDL below is quoted from `master-schema-contracts.json`.
- **Earlier draft.** The same folder holds an earlier ignored draft, `remaining-master-contracts.md`. I re-checked its key claims against the source and DDL. It is accurate everywhere I checked; I add a few corrections and new findings, marked **NEW**.
- **Menu evidence** is the local 30 Sep copy of `ref_menu`, per `02A_LEGACY_METHOD_WRITE_INDEX.md:7` and `:53-74`. Production menu state is unverified (B10).
- **Unknown everywhere: production `sql_mode`.** I did not open the CI database config because it may hold credentials. Every "insert would fail under strict mode" statement below depends on that mode.

## 1. Reconciling the count of 17 (S15)

`modules/master/controllers/` has **22** `*_c.php` controllers. Five of them fall outside F52:

- **Retired TOKO catalog masters (F53):** `brand_c`, `kategori_barang_c`, `satuan_c`. They write `db_brands`, `db_category` and `db_units`, which TOKO owns.
  - Evidence: `02_LEGACY_FUNCTION_INVENTORY.md:138` (F53 = RETIRE) and `04_DATABASE_WRITE_MAPPING.md:43` ("TOKO; KOSIPA path retired").
  - None of the three is in the menu (02A:56,66,73).
  - Excluding them is justified.
- **`anggota_c`** belongs to membership (F02).
- **`barang_c`** only browses the catalog and writes nothing (02A:55: 0 writes, not in menu).

That leaves **17 F52 masters: 9 in the menu and 8 dormant.**

- F52's wording "10 of 17 not in menu" (02:137) is wrong. It counts 8 dormant F52 masters plus brand, kategori_barang and satuan, which actually makes 11.
- 02A and 02:152 agree with 8/17 dormant.
- `09_IMPLEMENTATION_BACKLOG.md:103` ("9 KOSIPA-only master tables") and `07_TARGET_ARCHITECTURE.md:38` ("17 KOSIPA-only") mix up the in-menu count with ownership. The ownership split is 12 KOSIPA-owned tables + 5 shared `db_*` tables that TOKO owns (04:42).

All menu URLs have the form `master/<name>_c`. The native fence matches `UPPER(ref_menu.url)` against `legacyController` (`kosipa-master-write.repository.ts`, `fenceState`).

| # | Master | Legacy controller | Table | In menu (30 Sep) | Native status |
|---|---|---|---|---|---|
| 1 | Lokasi | master/lokasi_c | m_lokasi | yes (02A:68) | **DONE** (FA-01) |
| 2 | Bagian | master/bagian_c | m_bagian | yes (:54) | **DONE** |
| 3 | Jenis Dokumen | master/jenis_dokumen_c | m_jenis_dokumen | yes (:61) | **DONE** |
| 4 | Rekening Bank | master/rekening_bank_c | m_rekening | yes (:72) | **DONE** |
| 5 | Periode Angsuran | master/periode_angsuran_c | m_jangka_waktu | yes (:71) | **DONE** |
| 6 | Jenis Simpanan | master/jenis_simpanan_c | m_jenis_simpanan | yes (:65) | outstanding |
| 7 | Jenis Pinjaman | master/jenis_pinjaman_c | m_jenis_pinjaman | yes (:64) | outstanding |
| 8 | Jenis Pembiayaan | master/jenis_pembiayaan_c | m_jenis_pembiayaan | yes (:63) | outstanding |
| 9 | Suku Bunga | master/suku_bunga_c | m_suku_bunga | yes (:74) | outstanding |
| 10 | Divisi | master/divisi_c | app_jobsection | **no** (:60) | outstanding |
| 11 | Jabatan | master/jabatan_c | app_joblevel | **no** (:59) | outstanding |
| 12 | Master Surat | master/master_surat_c | m_surat | **no** (:69) | outstanding |
| 13 | Cabang | master/cabang_c | db_cabang | **no** (:57) | outstanding |
| 14 | Daftar Pajak | master/daftar_pajak_c | db_tax | **no** (:58) | outstanding (TOKO-owned) |
| 15 | Mata Uang | master/mata_uang_c | db_currency | **no** (:70) | outstanding (TOKO-owned) |
| 16 | Kategori Beban | master/kategori_beban_c | db_expense_category | **no** (:67) | outstanding (TOKO-owned) |
| 17 | Jenis Pembayaran | master/jenis_pembayaran_c | db_paymenttypes | **no** (:62) | outstanding (TOKO-owned) |

The five done masters are listed in `packages/domain/src/kosipa/master.ts` (`MASTER_TYPES`). S01 is a documentation problem only: `03_CRUD_GAP_ANALYSIS` is stale.

## 2. Behaviour shared by all 12 legacy masters (verified)

- **Access gate.** Each constructor calls `user_m::cekstatushakakses` (controller line 29). A missing `ref_menu` row denies the maintenance page but does not stop other code from reading the table.
- **Model writes.** Each model sets `public $table` at line 9 and uses CodeIgniter's query builder:
  - `save()` runs `db->insert` at line 86, or line 88 in jenis_simpanan_m and daftar_pajak_m.
  - `update_data()` runs `db->update(..., ['id'=>post('id')])` at line 99, or 101.
  - `delete_by_id()` runs `db->delete` at line 113, or 115.
  - jenis_pinjaman_m uses lines 151/164/178 instead.
- **Delete is a hard delete** with no reference check.
- **No server validation, no uniqueness check, no transaction.** Raw posted values are written as they are, so empty strings reach numeric columns.
- **Physical table** (all 11 present tables): InnoDB, latin1/latin1_swedish_ci, `id int(11) NOT NULL AUTO_INCREMENT`, **PRIMARY(id) only**. There is no unique key, secondary index or FK, so the id comes from AUTO_INCREMENT. Triggers were not captured.

## 3. Per-master contracts

### 6. Jenis Simpanan → `m_jenis_simpanan` (AUTO_INCREMENT=23)

**DDL**

| Column | Type | Null | Default |
|---|---|---|---|
| jenis_simpanan_code | varchar(50) | NULL | NULL |
| jenis_simpanan_name | varchar(50) | NULL | NULL |
| jenis_simpanan_remarks | varchar(150) | NULL | NULL |
| akun_code | varchar(50) | NULL | '0' |
| akun_desc | varchar(50) | NULL | '0' |
| is_active | int(11) | NULL | 0 |
| is_active_tarik_deposito | int(11) | NULL | 0 |
| bunga_simpanan | decimal(10,2) | NULL | 0.00 |
| cd | datetime | NULL | — |
| cd_usr | varchar(50) | NULL | — |
| ud | datetime | NULL | — |
| ud_usr | varchar(50) | NULL | — |
| status_perorangan | int(11) | NULL | NULL |

**Legacy writes**

- `controllers/jenis_simpanan_c.php` `ajax_add`:114 builds the row at :119-128 and saves at :132. `ajax_update`:146 writes :150-159 and calls update at :162. `ajax_delete`:167 deletes at :170.
- Fields written: code, name, remarks, bunga_simpanan, akun_code, akun_desc, is_active_tarik_deposito, is_active.
  - Add also writes `cd = date('Y-m-d H:i:s')` and `cd_usr = session nama_lengkap`; update writes `ud`/`ud_usr`.
  - `status_perorangan` is never written.
- Form (`views/jenis_simpanan_v.php`): `is_active_tarik_deposito` first option 0 "No" (:150-153); `is_active` first option 1 AKTIF (:160-163).
- **COA.** The account picker lists all of `m_acc_coa` (`models/jenis_simpanan_m.php:129`). `get_detail_akun` looks up `coa_no` and returns `coa_desc` (:146). The client posts both akun_code and akun_desc. There is no server check that they match, no leaf/group check, and `coa_desc` (varchar 150) is wider than `akun_desc` (varchar 50).

**Readers (33 non-copy PHP files)**

- Product selectors store **`jenis_simpanan_code`**, filtered by `is_active='1'` (e.g. `simpanan/views/master_payroll_v.php:64-67`).
- Savings, payroll, withdrawal and SHU models; laporan; `print_simpanan.php`; `prnt_kartu_simpanan.php`. Files include `simpanan/models/{simpanan_m,sim_setor_m,sim_payroll_m,penarikan_simpanan_m,hak_kewajiban_m,simpanan_new_m}.php`, `shu/models/shu_m.php`, `laporan/controllers/{lap_kas_simpanan_c,outstanding_simpanan_c}.php` and `mobile/views/{pengajuan,penarikan}_mobile_v.php`.
- **DB views** (view-contracts.json):
  - `v_m_simpanan_berjangka`, `v_trans_berjangka_debit/kredit` and `v_trans_deposito_debit/kredit` join on `jenis_simpanan = jenis_simpanan_code`.
  - They pull the **current** `akun_code`/`akun_desc`, with no active filter.
  - In `v_trans_deposito_debit`, the master's account sits next to the transaction's own `akun_code_kas`.
- **Hard-coded code literals** across 13 files: `'SIMPANAN SUKARELA'` (33 hits), `'SIMPANAN WAJIB'` (19), `'SIMPANAN POKOK'`, `'PBS'`, `'POTONGAN TOUR'`, `'POTONGAN SBC'`, `'POTONGAN DKM'`, `'POTONGAN SPV UP'`.
- Current `bunga_simpanan` is re-read by code for savings cards and reports (per the earlier draft §4: `print_simpanan.php:15`, `kas_anggota_c.php:134,198,262,382`, `lap_kas_simpanan_c.php:180,898`). I did not re-open each of those lines.
- **No native (apps/packages) reader.**

**Implication:** renaming a code orphans transactions and breaks literals and views. Editing account fields re-labels the accounts shown by historical views and reports.

**Disposition: IMPLEMENT WITH SPECIAL HANDLING.**

- Code required, unique, `change: never` (or `unreferenced`, but the literals make `never` safer).
- Name and remarks are labels.
- Typed fields: decimal(10,2) rate; 0/1 flag; COA code validated against `m_acc_coa.coa_no` with the description derived on the server (reject if longer than 50, never truncate).
- **NEEDS OWNER DECISION:** may rate or COA be edited on rows that are referenced, given they rewrite historical displays?
- Keep `status_perorangan` untouched.

### 7. Jenis Pinjaman → `m_jenis_pinjaman` (AUTO_INCREMENT=35)

**DDL**

| Column | Type | Null | Default |
|---|---|---|---|
| jenis_pinjaman_code | varchar(50) | NULL | NULL |
| jenis_pinjaman_name | varchar(50) | NULL | NULL |
| jenis_pinjaman_remarks | varchar(150) | NULL | NULL |
| jenis_pembiayaan | varchar(150) | NULL | NULL |
| akun_code | varchar(50) | NULL | '0' |
| akun_desc | varchar(50) | NULL | '0' |
| jenis_bunga | varchar(20) | NULL | NULL |
| biaya_asuransi | decimal(18,2) | NULL | NULL |
| biaya_jasa | decimal(18,2) | NULL | NULL |
| biaya_admin | decimal(18,2) | NULL | NULL |
| biaya_bunga | **varchar(50)** | NULL | NULL |
| biaya_pinalty | decimal(18,2) | NULL | NULL |
| tgl_tempo | int(11) | NULL | 0 |
| lock_1angsuran | int(11) | NULL | 0 |
| is_active | **varchar(150)** | NULL | '0' |
| cd | datetime | NULL | — |
| cd_usr | varchar(50) | NULL | — |
| ud | datetime | NULL | — |
| ud_usr | varchar(50) | NULL | — |
| dd | datetime | NULL | — |
| dd_usr | varchar(50) | NULL | — |
| akun_code_pembiayaan | varchar(50) | NULL | NULL |
| akun_desc_pembiayaan | varchar(200) | NULL | NULL |
| akun_code_pendapatan | varchar(50) | NULL | NULL |
| akun_desc_pendapatan | varchar(200) | NULL | NULL |
| parent_id | int(11) | NULL | NULL |
| is_payroll | int(11) | NULL | NULL |
| **max_angsuran** | int(11) | **NOT NULL** | none |
| **max_pinjaman** | decimal(18,2) | **NOT NULL** | none |

**Legacy writes**

- `controllers/jenis_pinjaman_c.php` `ajax_add`:152 builds :157-180 and saves at :184. `ajax_update`:198 writes :202-225 and calls update at :228. `ajax_delete`:233 deletes at :236.
- Fields written: code, name, remarks, jenis_pembiayaan, akun_code/desc, jenis_bunga, the four `biaya_*` fees, biaya_bunga, tgl_tempo, lock_1angsuran, akun_code/desc_pembiayaan, akun_code/desc_pendapatan, is_active, parent_id, `max_pinjaman` (commas stripped, :177/:222), max_angsuran, plus cd/cd_usr on add and ud/ud_usr on update.
- Never written: `dd`, `dd_usr`, `is_payroll`.
- Form (`views/jenis_pinjaman_v.php`):
  - `parent_id` first option is `value="-"` labelled "Jadikan Induk Jenis" (:157-158). The parent list shows `is_active='1' AND parent_id=0` rows (:160).
  - **Anomaly:** `'-'` posted into an int column becomes 0 with a warning under non-strict mode, or errors under strict mode (mode unknown).
  - `jenis_bunga` options are Flat and Anuitas (:190-192); `lock_1angsuran` is 0 No, selected (:251-252); `is_active` first option 1 (:291).
- COA lookups: `models/jenis_pinjaman_m.php:191,200,217`.
- The financing pick-list shows **all** `m_jenis_pembiayaan` rows, ignoring active (:228); defaults are fetched by code (:245).

**Readers (67 non-copy files)**

- **Hierarchy by parent id literal.** Readers filter on `parent_id=0/1/2/3/4/28`, sometimes without `is_active`. Examples:
  - `pinjaman/views/pinjaman_reguler_v.php:60` (1), `pinjaman_bank_v.php:60` (2), `kasbon_v.php:61` (3), `pembiayaan_v.php:60` (4), `kpr_btn_v.php:60` (28), `add_pengajuan_pinjaman_v.php:135` (`'0'`), `kartu_aktif_v.php:59` (0 + active).
  - Reports: `laporan/views/lap_bank_v.php:68`, `lap_pembiayaan_v.php:58`, `outstanding/lap_reguler_v.php:58`, `kas/kas_pinjaman_reguler_v.php:57`.
- **Codes stored in `trans_pinjaman`.** `jenis_pinjaman`, `jenis_potongan` and, in some flows, `bank_pembiaya` hold `jenis_pinjaman_code`. Example: `pinjaman_add_barang_v.php:111-116` stores the code into `jenis_potongan`.
- **`pinjaman_m.php:687` looks up `m_jenis_pinjaman WHERE jenis_pinjaman_code = $bank_pembiaya` and reads `lock_1angsuran` at runtime.** NEW: this is a live financial read of a master field.
- **Overlap with the done Rekening Bank master:** `trans_pinjaman.bank_pembiaya` also stores loan-type codes. Rekening Bank's reference count, which counts `bank_pembiaya` values equal to a bank code, also sees loan-type codes when values collide.

**Disposition: IMPLEMENT WITH SPECIAL HANDLING, plus OWNER DECISION on financial parameters.**

- Code is immutable once referenced; the reference count must cover `trans_pinjaman.jenis_pinjaman`, `.jenis_potongan` and `.bank_pembiaya`. Other loan request families are unverified.
- `parent_id` must be numeric: 0 means root; the parent must exist and be a root; no cycles. The ids 1/2/3/4/28 are fixed and need protection; a parent change on a referenced row should be blocked.
- `max_angsuran` and `max_pinjaman` are required (NOT NULL, no default).
- Three COA pairs, with descriptions derived on the server; widths are 50 for akun_desc and 200 for the other two.
- `jenis_bunga` is an enum of Flat/Anuitas.
- `jenis_pembiayaan` must exist in `m_jenis_pembiayaan.pembiayaan_code`.
- `is_active` is written as text `'1'`/`'0'`.
- The rest of the gate is an owner decision: whether fee, rate and lock edits on a referenced row are allowed, since some readers re-read the current product.

### 8. Jenis Pembiayaan → `m_jenis_pembiayaan` (AUTO_INCREMENT=20)

**DDL**

| Column | Type | Null | Default |
|---|---|---|---|
| doc_no | varchar(50) | NULL | NULL |
| doc_date | varchar(50) | NULL | NULL |
| pembiayaan_code | varchar(50) | NULL | NULL |
| pembiayaan_name | varchar(50) | NULL | NULL |
| pembiayaan_remarks | **varchar(50)** | NULL | NULL |
| jenis_bunga | varchar(20) | NULL | NULL |
| biaya_asuransi | decimal(18,2) | NULL | NULL |
| biaya_jasa | **decimal(18,4)** | NULL | NULL |
| biaya_admin | decimal(18,2) | NULL | NULL |
| biaya_bunga | decimal(18,2) | NULL | NULL |
| biaya_pinalty | decimal(18,2) | NULL | NULL |
| tgl_tempo | int(11) | NULL | 0 |
| akun_code | varchar(50) | NULL | '0' |
| akun_desc | varchar(50) | NULL | '0' |
| lock_1angsuran | int(11) | NULL | 0 |
| is_active | **varchar(150)** | NULL | '0' |
| cd | datetime | NULL | — |
| cd_usr | varchar(50) | NULL | — |
| ud | datetime | NULL | — |
| ud_usr | varchar(50) | NULL | — |

**Legacy writes**

- `controllers/jenis_pembiayaan_c.php` `ajax_add`:112 builds :117-132 and saves at :136. `ajax_update`:149 writes :153-168 and calls update at :171. `ajax_delete`:176 deletes at :179.
- Fields written: code, name, remarks, jenis_bunga, the five `biaya_*`, tgl_tempo, akun_code/desc, lock_1angsuran, is_active, plus cd/ud stamps.
- Never written: `doc_no`, `doc_date`.
- Form: Flat/Anuitas (`views/jenis_pembiayaan_v.php:136-138`), lock 0 selected (:182-183), active 1 first (:203).
- COA lookups: `models/jenis_pembiayaan_m.php:126,135,152`.

**Readers**

- **Runtime instalment lock.** `trans_pinjaman.pembiayaan_code` is joined to the **current** `lock_1angsuran`, with no active filter, at:
  - `pinjaman/models/pinjaman_m.php:780,812,893`
  - `pinjaman/controllers/pinjaman_c.php:624,664`
  - `helpers/view_helper.php:411,448`
  - `mobile/controllers/pinjaman_mobile_c.php:580,668`
  - views `pinjaman_add_v.php:432`, `pinjaman_add_bank_v.php:470`, `pinjaman_add_kasbon_v.php:450`, `pinjaman_add_potongan_v.php:442`, `pinjaman_add_barang_v.php:310`, `pinjaman_detail_v.php:347`, `pinjaman_detail_kasbon_v.php:293`
- `m_jenis_pinjaman.jenis_pembiayaan` stores `pembiayaan_code`, so the loan-type master is itself a reader.

**Disposition: IMPLEMENT WITH SPECIAL HANDLING.**

- Code is immutable once referenced by `trans_pinjaman.pembiayaan_code` or `m_jenis_pinjaman.jenis_pembiayaan`.
- Changing `lock_1angsuran` on a referenced row changes how existing loans behave, so it needs an **OWNER DECISION** (block or allow).
- Exact decimal scales are needed (biaya_jasa has 4 places).
- Keep `doc_no`/`doc_date` untouched.

### 9. Suku Bunga → `m_suku_bunga` (**no AUTO_INCREMENT clause in the DDL**)

**DDL**

| Column | Type | Null | Default |
|---|---|---|---|
| code_suku_bunga | varchar(50) | NULL | NULL |
| desc_suku_bunga | varchar(50) | NULL | NULL |
| field | varchar(50) | NULL | NULL |
| nilai_persen | **varchar(10)** | NULL | NULL |
| remarks_suku_bunga | varchar(50) | NULL | NULL |
| is_active | int(11) | NULL | 0 |
| cd | datetime | NULL | — |
| cd_usr | varchar(50) | NULL | — |
| ud | datetime | NULL | — |
| ud_usr | varchar(50) | NULL | — |

**Legacy writes**

- `controllers/suku_bunga_c.php` `ajax_add`:99 builds :104-111 and saves at :115. `ajax_update`:128 writes :132-139 and calls update at :142. `ajax_delete`:147 deletes at :150.
- Fields written: code, desc, field, nilai_persen, remarks, is_active, plus stamps.

**Readers**

- The only reader is `pinjaman/models/pinjaman_m.php:963-972` (`get_nilai_field`): `SELECT nilai_persen FROM m_suku_bunga WHERE field='$field'`.
  - It does not filter on `is_active` and has no ORDER BY; it takes `row()` (the first row). It returns `''` if there is no row.
  - `$field` is string-interpolated into the SQL, but every caller passes a literal.
- Live callers, all with the literal `"tgl_tempo"`: `pinjaman_m.php:900`, `pinjaman_c.php:671`, `mobile/controllers/pinjaman_mobile_c.php:675`. The `biaya_admin` calls are commented out (:909, :680, :684, `view_helper.php:473`).
- The JS functions named `suku_bunga()` in `pinjaman/views/js/add_pinjaman_{reguler,bank,kpr}_js.php` are client-side and unrelated to this table.

**NEW — table probably empty in production.** MariaDB leaves out the `AUTO_INCREMENT=` clause only when the next value is 1, which means no row has been inserted since the table was created or truncated. So the `tgl_tempo` lookup probably returns `''` today. This is an inference; it needs a read-only `COUNT(*)` to confirm.

**Disposition: NEEDS OWNER DECISION.**

- If the table is kept, implement it with special handling:
  - `field` unique and immutable once consumed. It is the actual lookup key, separate from `code`.
  - `nilai_persen` validated per field: for `tgl_tempo` it is a day number, not a percentage.
  - The UI must not say deactivation has any effect, because the reader ignores `is_active`.
- If the table really is empty and only `tgl_tempo` is ever consumed, the owner could instead retire it in favour of an explicit setting.

### 10. Divisi → `app_jobsection` (AUTO_INCREMENT=54; not in menu)

**DDL**

| Column | Type | Null | Default |
|---|---|---|---|
| code_jobsection | varchar(50) | NULL | NULL |
| desc_jobsection | varchar(50) | NULL | NULL |
| isactive | int(11) | NULL | 0 |

**Legacy writes**

- `controllers/divisi_c.php` `ajax_add`:105 writes :110-112 and saves at :115. `ajax_update`:128 writes :132-134 and calls update at :137. `ajax_delete`:142 deletes at :145.
- The posted names `code_org` and `desc_org` map to `code_jobsection` and `desc_jobsection`, plus `isactive`. No stamps.

**Readers**

- The member "bagian" query that used this table is **commented out** (`anggota/models/anggota_m.php:556`); it now reads `m_bagian`.
- `get_divisi` reads **`app_orgunit`** (:569-583), not this table.
- The member `divisi` write is commented out (`anggota/controllers/anggota_c.php:280,519`; `master/controllers/anggota_c.php:242,481`).
- The only other reader is `ppob/models/ppob_pembelian_m.php:9-13`. Its `$table` is `app_jobsection`, which looks copy-pasted; `ppob_pembelian_c.php:63,96` lists it in a DataTable.
- No stored reference was found.

**Disposition: RETIRE, pending owner confirmation.**

- It is dormant, has no consumer that stores its value, and its only reader is a mis-wired PPOB list.
- If the owner wants it kept, it fits the generic pattern exactly: code (50) unique, `free`; name (50); status int; no stamps; no references.

### 11. Jabatan → `app_joblevel` (AUTO_INCREMENT=1013; not in menu)

**DDL**

| Column | Type | Null | Default |
|---|---|---|---|
| code_joblevel | varchar(50) | NULL | NULL |
| desc_joblevel | varchar(50) | NULL | NULL |
| isactive | int(11) | NULL | 0 |

**Legacy writes**

- `controllers/jabatan_c.php`: add :105 → :110-112 → :115; update :128 → :132-134 → :137; delete :142 → :145.
- Same mapping as Divisi: posted `code_org`/`desc_org` go to `code_joblevel`/`desc_joblevel`, plus `isactive`. No stamps.

**Readers**

- `anggota/models/anggota_m.php:539-552` and `master/models/anggota_m.php:570-` run `SELECT * WHERE isactive='1'`. They feed the member-form `<select name="jabatan">` (`anggota/views/anggota_v.php:451`, `master/views/anggota_v.php:445`, JS `anggota_js.php:653-657`).
- **NEW: no active controller persists `jabatan`.** No `'jabatan' =>` key appears in any member add/update array; the JS lines that restore the value are commented (`anggota_js.php:247,381`). So the dropdown is displayed but its value is thrown away.
- `m_anggota.jabatan` is still read by `simpanan/controllers/simpanan_c.php:1250`, so it holds historical or imported values.
- Unknown: the source of the 1,012+ ids, and the current row count.

**Disposition: IMPLEMENT GENERICALLY if the owner wants dormant masters; otherwise RETIRE.**

- Generic fit: code (50) unique, `free`; name (50) `referenced` with `unreferenced` against `m_anggota.jabatan`; status int; no stamps.
- Check `MAX_ROWS = 2000` against the actual row count before relying on `lockAll`.

### 12. Master Surat → `m_surat` (AUTO_INCREMENT=2, so at most one row has ever been inserted; not in menu)

**DDL**

| Column | Type | Null | Default |
|---|---|---|---|
| type | varchar(50) | NULL | NULL |
| isi | **longtext** | NULL | NULL |
| status | int(11) | **NOT NULL** | none |

**Legacy writes**

- `controllers/master_surat_c.php`: page `add_surat`:58; add :135 → :140-142 → :145; update :150 → :154-156 → :159; delete :164 → :167. Fields: type, isi (HTML from an editor), status.
- `ajax_detail` (:126-129) builds `SELECT * FROM m_surat where id='$id'` by interpolation, which is SQL-injectable.

**Readers:** none outside its own controller. Financial letters use their own views.

**Disposition: RETIRE, or NEEDS OWNER DECISION.** It has no consumer and one row at most. The generic pattern cannot express it (HTML longtext; see §4).

### 13. Cabang → `db_cabang` — **table ABSENT in production** (errno 1146)

**Legacy writes**

- `controllers/cabang_c.php`: add :108 → :112-131 → :133; update :146 → :149-167 → :169; delete :174 → :177.
- Fields: kode_cabang, nama_cabang, mobile, alternate_number, email, alamat, and nine `*_init` numbering prefixes.
- Add **forces `status=1`** (:119); update takes the posted status (:156).
- **JS bug:** `views/js/cabang_js.php:55,97` fill the hidden id from `data.id_ref_bagian`.

**Readers:** `helpers/view_helper.php:146` (`SELECT item_init from db_cabang`, used by dormant `barang_v`). Any call would fail because the table does not exist.

**Disposition: RETIRE.** The table does not exist; the controller is dormant and could not run.

### 14. Daftar Pajak → `db_tax` (AUTO_INCREMENT=9; TOKO-owned per 04:42)

**DDL**

| Column | Type | Null | Default |
|---|---|---|---|
| tax_name | varchar(100) | NOT NULL | — |
| tax | double(11,2) | NOT NULL | — |
| group_bit | varchar(100) | NULL | NULL |
| subtax_ids | int(11) | NOT NULL | — |
| status | int(11) | NOT NULL | — |

**Legacy writes**

- `controllers/daftar_pajak_c.php`: add :105 writes :108-111 (`tax_name`←name, `tax`←persen, status) → :115; update :128; delete :142.
- **`subtax_ids` (NOT NULL, no default) is never written**, so an insert fails under strict mode.
- The list and count only show `group_bit IS NULL` rows (`models/daftar_pajak_m.php:24,74`).

**Readers**

- No other KOSIPA PHP reader.
- **Native TOKO code reads it:**
  - `apps/web/src/infrastructure/repositories/prisma-product-add.repository.ts:12` (`WHERE status=1`).
  - `prisma-master-product.repository.ts:8`, which joins `a.tax_id`.
- **NEW anomaly:** Prisma `model Tax` (`apps/web/prisma/schema.prisma:79-87`) declares `groupBit Int` and has no `subtax_ids`; physically `group_bit` is varchar(100). It is **unknown** whether the TOKO database is the same physical database as the KOSIPA capture.

**Disposition: RETIRE the KOSIPA route; TOKO owns the table.**

### 15. Mata Uang → `db_currency` (AUTO_INCREMENT=3, so at most two rows)

**DDL**

| Column | Type | Null | Default |
|---|---|---|---|
| currency_name | varchar(100) | NOT NULL | — |
| currency | varchar(100) | NOT NULL | — |
| currency_code | varchar(50) | NOT NULL | — |
| symbol | varchar(50) | NOT NULL | — |
| cd_usr | **int(11)** | NOT NULL | — |
| cd | datetime | NOT NULL | — |
| ud_usr | int(11) | NOT NULL | — |
| ud | datetime | NOT NULL | — |
| status | int(11) | NOT NULL | — |

**Legacy writes**

- `controllers/mata_uang_c.php`: add :99 writes :103-106 (`currency_name`←name, `currency_code`←code, `currency`←simbol, status) → :110; update :123 writes :127-130; delete :138.
- **`symbol`, `cd_usr`, `cd`, `ud_usr` and `ud` (all NOT NULL, no default) are never written**, so an insert fails under strict mode.

**Readers**

- `libraries/autentifikasi.php:78` joins `ref_site.currency_id` to the currency **id**, ignoring status.
- `libraries/autentifikasi.php:90` reads by that id.
- `pengaturan/views/bisnis_v.php:134` shows the `status=1` list as the business-settings selector.
- Deleting a row would break the site-wide currency display.

**Disposition: RETIRE the KOSIPA route; TOKO owns the table.** The current currency id must stay protected.

### 16. Kategori Beban → `db_expense_category` (no AUTO_INCREMENT clause, so probably empty)

**DDL**

| Column | Type | Null | Default |
|---|---|---|---|
| category_code | varchar(100) | NOT NULL | — |
| category_name | varchar(100) | NOT NULL | — |
| description | text | NOT NULL | — |
| status | int(11) | NOT NULL | — |
| created_by | varchar(100) | NOT NULL | — |
| company_id | int(11) | NOT NULL | — |

**Legacy writes**

- `controllers/kategori_beban_c.php` `ajax_add`:100 calls **`getCode('db_expense_category','expense_init')`** at :103.
- **NEW: `getCode` is not defined anywhere in KOSIPA.** Searching the whole application tree finds only an unrelated TCPDF method. So add, and the page JS at `views/js/kategori_beban_js.php:36` (copied into `satuan_js.php:36`), fail with a fatal "undefined function".
- Add writes code, `category_name`←name, `description`←remarks, status, `created_by`=nama_lengkap (:105-111). `company_id` (NOT NULL) is never written.
- Update (:126-135) writes name, description, status, and **overwrites `created_by`**.
- Delete :142.

**Readers:** none in KOSIPA.

**Disposition: RETIRE.** The legacy path cannot run, TOKO owns the table, and it is probably empty.

### 17. Jenis Pembayaran → `db_paymenttypes` (AUTO_INCREMENT=6)

**DDL**

| Column | Type | Null | Default |
|---|---|---|---|
| payment_type | varchar(100) | NOT NULL | — |
| status | int(11) | NOT NULL | — |

**Legacy writes:** `controllers/jenis_pembayaran_c.php`: add :103 writes :106-108 (`payment_type`←name, status) → :112; update :125; delete :138.

**Readers:** none in KOSIPA. The earlier draft cites `docs/migration/audit_payment_method.md:110` (TOKO payment types are not linked by FK); I did not re-check that.

**Disposition: RETIRE the KOSIPA route; TOKO owns the table.** Technically this is the only TOKO table the generic pattern could express (one name field + status int).

## 4. Disposition summary

| Master | Disposition |
|---|---|
| jenis_simpanan | IMPLEMENT, special handling (typed decimal/flag, COA, code immutable) + owner decision on rate/COA edits |
| jenis_pinjaman | IMPLEMENT, special handling (largest: hierarchy, 3 COA pairs, NOT NULL limits, multi-column refs) + owner decision on financial parameters |
| jenis_pembiayaan | IMPLEMENT, special handling (lock_1angsuran read at runtime) + owner decision |
| suku_bunga | NEEDS OWNER DECISION (probably empty; only `tgl_tempo` consumed; reader ignores active) |
| divisi | RETIRE (generic fit if the owner wants it kept) |
| jabatan | IMPLEMENT generically if dormant masters are wanted, otherwise RETIRE |
| master_surat | RETIRE / owner decision |
| cabang | RETIRE (table absent) |
| daftar_pajak, mata_uang, kategori_beban, jenis_pembayaran | RETIRE from KOSIPA; TOKO owns them (04:42); legacy inserts are broken against production DDL |

**Net work:** 3 to 4 special-handling implementations, 0 to 2 generic ones, and 6 to 8 documented retirements.

## 5. Where the generic `MASTER_TYPES` pattern falls short

1. **Field keys.** `FieldKey = 'code'|'name'|'remarks'`, and rules are text only (`max`, `required`, `unique`, `change`, `format?: 'months'`). There are no decimal (with scale), integer, enum (Flat/Anuitas), boolean 0/1, FK-to-master, COA-lookup, server-derived, generated-code or long-text/HTML field types.
2. **Text normalisation.** `text()` collapses whitespace and only accepts printable ASCII, max length per rule. Applied to `m_surat.isi` (HTML longtext) it would corrupt the content.
3. **One referenced field.** `referenced?: FieldKey` allows one field, counted by `COUNT(*) WHERE col = value` over a list of columns.
   - Jenis Pinjaman needs the code counted across three `trans_pinjaman` columns and `parent_id` protection by id.
   - Jenis Pembiayaan needs counts in `trans_pinjaman.pembiayaan_code` and `m_jenis_pinjaman.jenis_pembiayaan`.
   - The references are unindexed scans of large tables (indexes not captured).
4. **No per-field rules on financial values.** Rules like "frozen while referenced" or owner-gated edits do not exist for anything except the referenced key.
5. **Ledger, version and verify only see the defined fields.**
   - `MASTER_LEDGER_FIELDS` is fixed to id, code, name, remarks and status, so financial fields would be missing from ledger before/after snapshots.
   - `masterVersion` and `verify()` hash or compare only `def.fields`, so concurrent changes to other columns go undetected.
6. **Stamps.** The `stamps` model writes `cd`/`cd_usr` and `ud`/`ud_usr` as a datetime plus a name (varchar).
   - `db_currency.cd_usr`/`ud_usr` are **int** and NOT NULL on insert.
   - `db_expense_category.created_by` is a different column, and `company_id` would need trusted scope.
   - `m_jenis_pinjaman.dd`/`dd_usr` are never written; fine as long as projections never write them.
7. **Inserts and NOT NULL columns.** The create path inserts only the defined columns, the status and the stamps. Tables with NOT NULL, no-default columns (`max_angsuran`, `max_pinjaman`, `m_surat.status`, and the TOKO tables) need every such column modelled.
8. **No cross-row rules.** There is no parent existence or cycle check, and no protection for the fixed ids 0/1/2/3/4/28.
9. **No server-derived fields.** A COA code must produce a canonical `coa_desc` (varchar 150) that fits `akun_desc` (varchar 50) or the 200-wide variants; reject rather than truncate.
10. **One fixed effect message.** `deactivateEffect` is a single string. Suku Bunga and several Jenis Pinjaman readers ignore `is_active`, so a "hidden from new forms" message would be false.
11. **Lock size.** `MAX_ROWS = 2000` with `lockAll` probably covers `app_joblevel` (AUTO_INCREMENT 1013), but needs a row count to confirm.
12. **Fence behaviour for dormant masters.** `fenceState` returns `fenced` when no `ref_menu` row exists. Dormant masters would therefore be writable natively right away, with no legacy switch to flip. Acceptable, but it should be stated in the spec.
13. **Grants.** The setup grants are per table (`setup-kosipa-master-write.mjs` in WI-06). Each new table needs column-level grants, e.g. no UPDATE on immutable codes, as already done for `jangka_waktu_code`.

## 6. Unknowns to resolve, all read-only

- Production `sql_mode`, which decides whether the broken legacy inserts fail or silently coerce.
- Row counts for `m_suku_bunga`, `db_expense_category`, `app_joblevel` and `m_surat` (AUTO_INCREMENT only gives an inference).
- Indexes on `trans_pinjaman` columns used for reference counts.
- Whether the TOKO database is the same physical database as `n1608204_smart_kopkar`, and the Prisma `Tax` model drift.
- Triggers on these tables (not captured).
- Production `ref_menu` (B10).
- Readers in smartkkisi or mobile apps (source not available), e.g. of `m_jenis_simpanan` or `app_joblevel`.
