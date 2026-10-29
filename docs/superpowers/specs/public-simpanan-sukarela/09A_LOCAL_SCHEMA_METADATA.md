# 09A — Local staging schema metadata evidence

Captured 21 October 2026, Asia/Jakarta task context. Scope: loopback staging, SELECT-only reader, one connection. **NOT production metadata; no business/member rows read.** SQL sources: information_schema.TABLES/COLUMNS/STATISTICS/KEY_COLUMN_USAGE/TRIGGERS; SHOW GRANTS (privilege text sanitised before output); bounded ref_menu URL configuration only. No DDL/DML/lock/write test.

Schema fingerprint SHA-256: 7bcd598052a7efadd7f96f4b3e76a499300b2564e4b36c4d040428d1f7fa361c (tables+columns+indexes+FK JSON in query order).

## Server and privileges

Server settings: [{"version":"11.4.13-MariaDB-ubu2404","sql_mode":"STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION","session_timezone":"SYSTEM","global_timezone":"SYSTEM","max_user_connections":"0","wait_timeout":"28800"}].

Privileges: GRANT USAGE ON <redacted-scope>; GRANT SELECT ON <redacted-scope>. No INSERT/UPDATE/TRIGGER grant observed for this reader. Trigger metadata rows visible: 0; absence cannot establish no triggers because metadata visibility is privilege-limited. FK metadata rows: 0.

Menu configuration (staging only): [{"url":"mobile/pengajuan_mobile_c","status":1}]. Not proof of active production use/obsolete variant.

## Tables

| Table | Engine | Collation |
|---|---|---|
| db_notifikasi | InnoDB | latin1_swedish_ci |
| m_anggota | InnoDB | latin1_swedish_ci |
| m_bagian | InnoDB | latin1_swedish_ci |
| m_jenis_simpanan | InnoDB | latin1_swedish_ci |
| m_simpanan_aktif | InnoDB | latin1_swedish_ci |
| m_simpanan_mobile | InnoDB | latin1_swedish_ci |
| ref_menu | InnoDB | latin1_swedish_ci |
| trans_simpanan_pengajuan | InnoDB | latin1_swedish_ci |
| users | InnoDB | utf8mb4_unicode_ci |

## db_notifikasi

| Column | Type | Nullable | Default | Extra | Charset / collation |
|---|---|---|---|---|---|
| id | int(11) | NO | NO DECLARED DEFAULT | auto_increment | - / - |
| user_admin | int(11) | YES | NULL | - | - / - |
| bagian | int(11) | NO | NO DECLARED DEFAULT | - | - / - |
| email | varchar(100) | NO | NO DECLARED DEFAULT | - | latin1 / latin1_swedish_ci |
| title | varchar(50) | NO | NO DECLARED DEFAULT | - | latin1 / latin1_swedish_ci |
| mess | text | NO | NO DECLARED DEFAULT | - | latin1 / latin1_swedish_ci |
| url | varchar(100) | NO | NO DECLARED DEFAULT | - | latin1 / latin1_swedish_ci |
| status_alert | int(11) | NO | NO DECLARED DEFAULT | - | - / - |
| status | int(11) | NO | NO DECLARED DEFAULT | - | - / - |
| cd | varchar(100) | NO | NO DECLARED DEFAULT | - | latin1 / latin1_swedish_ci |
| cd_date | datetime | NO | NO DECLARED DEFAULT | - | - / - |
| doc_no_sim | varchar(50) | NO | NO DECLARED DEFAULT | - | latin1 / latin1_swedish_ci |

Indexes: [{"TABLE_NAME":"db_notifikasi","INDEX_NAME":"PRIMARY","NON_UNIQUE":"0","SEQ_IN_INDEX":"1","COLUMN_NAME":"id"}].

## m_anggota

| Column | Type | Nullable | Default | Extra | Charset / collation |
|---|---|---|---|---|---|
| id | int(11) | NO | NO DECLARED DEFAULT | auto_increment | - / - |
| doc_no | varchar(50) | YES | '0' | - | latin1 / latin1_swedish_ci |
| id_card | varchar(50) | YES | '0' | - | latin1 / latin1_swedish_ci |
| no_anggota | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| password | varchar(250) | YES | NULL | - | latin1 / latin1_swedish_ci |
| tgl_daftar | date | YES | NULL | - | - / - |
| nama_kar | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| nik_kar | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| ktp | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| email | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| jenis_kel | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| tgl_lahir | date | YES | NULL | - | - / - |
| tempat_lahir | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| alamat | varchar(250) | YES | NULL | - | latin1 / latin1_swedish_ci |
| rt | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| rw | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| provinsi | varchar(100) | YES | NULL | - | latin1 / latin1_swedish_ci |
| kabupaten | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| kecamatan | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| kelurahan | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| kode_pos | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| alamat_tinggal | varchar(250) | YES | NULL | - | latin1 / latin1_swedish_ci |
| kelurahan_tinggal | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| kecamatan_tinggal | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| kabupaten_tinggal | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| kode_pos_tinggal | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| no_telp | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| no_telp1 | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| status_rumah | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| pendidikan | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| status_nikah | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| nama_istri | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| ibu_kandung | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| npwp | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| divisi | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| dept | varchar(250) | YES | NULL | - | latin1 / latin1_swedish_ci |
| bagian | varchar(100) | YES | NULL | - | latin1 / latin1_swedish_ci |
| kd_group | varchar(100) | YES | NULL | - | latin1 / latin1_swedish_ci |
| jabatan | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| cd | datetime | YES | NULL | - | - / - |
| cd_usr | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| ud | datetime | YES | NULL | - | - / - |
| ud_usr | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| tgl_karyawan | date | YES | NULL | - | - / - |
| tgl_masuk | date | YES | NULL | - | - / - |
| tgl_keluar | date | YES | NULL | - | - / - |
| status_anggota | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| sim_wajib | double(18,2) | YES | NULL | - | - / - |
| sim_pokok | double(18,2) | YES | NULL | - | - / - |
| sim_sukarela | double(18,2) | YES | NULL | - | - / - |
| gaji | double(18,2) | NO | NO DECLARED DEFAULT | - | - / - |
| limit_toko_old | double(18,0) | YES | NULL | - | - / - |
| limit_toko | double(18,0) | YES | NULL | - | - / - |
| gaji_minus | double(18,0) | NO | NO DECLARED DEFAULT | - | - / - |
| limit_persen | double(18,2) | YES | 0.00 | - | - / - |
| no_rek | varchar(20) | YES | NULL | - | latin1 / latin1_swedish_ci |
| bank_rek | varchar(20) | YES | NULL | - | latin1 / latin1_swedish_ci |
| nama_rek | varchar(100) | YES | NULL | - | latin1 / latin1_swedish_ci |
| batas_pinjaman | decimal(18,4) | YES | NULL | - | - / - |
| lokasi | varchar(100) | YES | NULL | - | latin1 / latin1_swedish_ci |
| foto_profile | varchar(250) | YES | NULL | - | latin1 / latin1_swedish_ci |
| limit_ppob | decimal(18,0) | YES | 0 | - | - / - |
| status_pot_pokok | int(11) | YES | 0 | - | - / - |
| status_pot_wajib | int(11) | YES | 0 | - | - / - |
| status_pot_sukarela | int(11) | YES | 0 | - | - / - |
| foto_ktp | varchar(255) | YES | NULL | - | latin1 / latin1_swedish_ci |
| foto_ttd | varchar(255) | YES | NULL | - | latin1 / latin1_swedish_ci |
| surat_kuasa | int(11) | NO | NO DECLARED DEFAULT | - | - / - |
| persetujuan | int(11) | YES | NULL | - | - / - |
| status_karyawan | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| foto_kk | varchar(100) | YES | NULL | - | latin1 / latin1_swedish_ci |
| foto_bukti_biaya_sekolah | varchar(100) | YES | NULL | - | latin1 / latin1_swedish_ci |

Indexes: [{"TABLE_NAME":"m_anggota","INDEX_NAME":"idx_anggota_idcard","NON_UNIQUE":"1","SEQ_IN_INDEX":"1","COLUMN_NAME":"id_card"},{"TABLE_NAME":"m_anggota","INDEX_NAME":"idx_anggota_nik","NON_UNIQUE":"1","SEQ_IN_INDEX":"1","COLUMN_NAME":"nik_kar"},{"TABLE_NAME":"m_anggota","INDEX_NAME":"idx_anggota_status","NON_UNIQUE":"1","SEQ_IN_INDEX":"1","COLUMN_NAME":"status_anggota"},{"TABLE_NAME":"m_anggota","INDEX_NAME":"PRIMARY","NON_UNIQUE":"0","SEQ_IN_INDEX":"1","COLUMN_NAME":"id"}].

## m_bagian

| Column | Type | Nullable | Default | Extra | Charset / collation |
|---|---|---|---|---|---|
| id | int(11) | NO | NO DECLARED DEFAULT | auto_increment | - / - |
| name_bagian | varchar(255) | YES | NULL | - | latin1 / latin1_swedish_ci |
| id_lokasi | int(11) | YES | NULL | - | - / - |
| status | int(11) | YES | NULL | - | - / - |

Indexes: [{"TABLE_NAME":"m_bagian","INDEX_NAME":"PRIMARY","NON_UNIQUE":"0","SEQ_IN_INDEX":"1","COLUMN_NAME":"id"}].

## m_jenis_simpanan

| Column | Type | Nullable | Default | Extra | Charset / collation |
|---|---|---|---|---|---|
| id | int(11) | NO | NO DECLARED DEFAULT | auto_increment | - / - |
| jenis_simpanan_code | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| jenis_simpanan_name | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| jenis_simpanan_remarks | varchar(150) | YES | NULL | - | latin1 / latin1_swedish_ci |
| akun_code | varchar(50) | YES | '0' | - | latin1 / latin1_swedish_ci |
| akun_desc | varchar(50) | YES | '0' | - | latin1 / latin1_swedish_ci |
| is_active | int(11) | YES | 0 | - | - / - |
| is_active_tarik_deposito | int(11) | YES | 0 | - | - / - |
| bunga_simpanan | decimal(10,2) | YES | 0.00 | - | - / - |
| cd | datetime | YES | NULL | - | - / - |
| cd_usr | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| ud | datetime | YES | NULL | - | - / - |
| ud_usr | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| status_perorangan | int(11) | YES | NULL | - | - / - |

Indexes: [{"TABLE_NAME":"m_jenis_simpanan","INDEX_NAME":"PRIMARY","NON_UNIQUE":"0","SEQ_IN_INDEX":"1","COLUMN_NAME":"id"}].

## m_simpanan_aktif

| Column | Type | Nullable | Default | Extra | Charset / collation |
|---|---|---|---|---|---|
| id | int(11) | NO | NO DECLARED DEFAULT | auto_increment | - / - |
| doc_no | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| jenis_simpanan | varchar(255) | YES | NULL | - | latin1 / latin1_swedish_ci |
| nik_kar | varchar(10) | YES | NULL | - | latin1 / latin1_swedish_ci |
| nama_kar | varchar(255) | YES | NULL | - | latin1 / latin1_swedish_ci |
| kd_group | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| potongan_old | double(18,2) | NO | NO DECLARED DEFAULT | - | - / - |
| potongan_payroll | double(18,2) | YES | NULL | - | - / - |
| cash_tf | double(18,2) | YES | NULL | - | - / - |
| rek_nama | varchar(255) | YES | NULL | - | latin1 / latin1_swedish_ci |
| rek_bank | varchar(255) | YES | NULL | - | latin1 / latin1_swedish_ci |
| rek_no | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| status | int(255) | YES | NULL | - | - / - |
| cd | datetime | YES | NULL | - | - / - |
| usr_cd | varchar(255) | YES | NULL | - | latin1 / latin1_swedish_ci |
| ud | datetime | YES | NULL | - | - / - |
| usr_ud | varchar(255) | YES | NULL | - | latin1 / latin1_swedish_ci |
| periode_start | date | YES | NULL | - | - / - |
| periode_end | date | YES | NULL | - | - / - |
| is_mobile | int(11) | NO | NO DECLARED DEFAULT | - | - / - |

Indexes: [{"TABLE_NAME":"m_simpanan_aktif","INDEX_NAME":"PRIMARY","NON_UNIQUE":"0","SEQ_IN_INDEX":"1","COLUMN_NAME":"id"}].

## m_simpanan_mobile

| Column | Type | Nullable | Default | Extra | Charset / collation |
|---|---|---|---|---|---|
| id | int(11) | NO | NO DECLARED DEFAULT | auto_increment | - / - |
| jenis_simpanan | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| jasa | double(18,2) | YES | NULL | - | - / - |
| status_pengajuan | int(11) | NO | NO DECLARED DEFAULT | - | - / - |
| status_penarikan | int(11) | NO | NO DECLARED DEFAULT | - | - / - |

Indexes: [{"TABLE_NAME":"m_simpanan_mobile","INDEX_NAME":"PRIMARY","NON_UNIQUE":"0","SEQ_IN_INDEX":"1","COLUMN_NAME":"id"}].

## ref_menu

| Column | Type | Nullable | Default | Extra | Charset / collation |
|---|---|---|---|---|---|
| id | int(11) | NO | NO DECLARED DEFAULT | auto_increment | - / - |
| nama_menu | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| class_active | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| class_not_active | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| parent_id | int(11) | YES | NULL | - | - / - |
| sorting_no | int(11) | YES | NULL | - | - / - |
| url | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| status | int(11) | YES | NULL | - | - / - |
| child_menu | int(11) | YES | NULL | - | - / - |
| keterangan | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| akses_menu | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| jenis_menu | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| newtab | int(11) | YES | NULL | - | - / - |

Indexes: [{"TABLE_NAME":"ref_menu","INDEX_NAME":"PRIMARY","NON_UNIQUE":"0","SEQ_IN_INDEX":"1","COLUMN_NAME":"id"}].

## trans_simpanan_pengajuan

| Column | Type | Nullable | Default | Extra | Charset / collation |
|---|---|---|---|---|---|
| id | int(11) | NO | NO DECLARED DEFAULT | auto_increment | - / - |
| doc_no | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| doc_date | date | YES | NULL | - | - / - |
| doc_status | varchar(50) | YES | 'OPEN' | - | latin1 / latin1_swedish_ci |
| jenis_simpanan | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| nik_kar | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| nama | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| phone | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| bank | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| norek | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| bagian | varchar(100) | YES | NULL | - | latin1 / latin1_swedish_ci |
| lokasi | varchar(100) | YES | NULL | - | latin1 / latin1_swedish_ci |
| potongan_old | double(18,2) | YES | NULL | - | - / - |
| potongan | double(18,2) | YES | NULL | - | - / - |
| awal_potong_bulan | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| awal_potong_tahun | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| remarks | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| posting_date | datetime | YES | NULL | - | - / - |
| created_at | datetime | YES | NULL | - | - / - |
| cd_usr | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| updated_at | datetime | YES | NULL | - | - / - |
| ud_usr | varchar(50) | YES | NULL | - | latin1 / latin1_swedish_ci |
| status_notif | int(11) | NO | NO DECLARED DEFAULT | - | - / - |
| ttd | varchar(100) | YES | NULL | - | latin1 / latin1_swedish_ci |
| is_mobile | int(11) | YES | NULL | - | - / - |

Indexes: [{"TABLE_NAME":"trans_simpanan_pengajuan","INDEX_NAME":"PRIMARY","NON_UNIQUE":"0","SEQ_IN_INDEX":"1","COLUMN_NAME":"id"}].

## users

| Column | Type | Nullable | Default | Extra | Charset / collation |
|---|---|---|---|---|---|
| id | bigint(20) | NO | NO DECLARED DEFAULT | auto_increment | - / - |
| nik | varchar(50) | NO | NO DECLARED DEFAULT | - | utf8mb4 / utf8mb4_unicode_ci |
| ktp | varchar(50) | NO | NO DECLARED DEFAULT | - | utf8mb4 / utf8mb4_unicode_ci |
| name | varchar(255) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| f_name | varchar(50) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| l_name | varchar(50) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| phone | varchar(25) | NO | NO DECLARED DEFAULT | - | utf8mb4 / utf8mb4_unicode_ci |
| image | varchar(30) | NO | NO DECLARED DEFAULT | - | utf8mb4 / utf8mb4_unicode_ci |
| email | varchar(80) | NO | NO DECLARED DEFAULT | - | utf8mb4 / utf8mb4_unicode_ci |
| email_verified_at | timestamp | YES | NULL | - | - / - |
| admin_verifikasi | int(1) | YES | 0 | - | - / - |
| password | varchar(255) | NO | NO DECLARED DEFAULT | - | utf8mb4 / utf8mb4_unicode_ci |
| password_hit | varchar(255) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| remember_token | varchar(100) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| created_at | timestamp | YES | NULL | - | - / - |
| updated_at | timestamp | YES | NULL | - | - / - |
| street_address | varchar(250) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| rt | varchar(20) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| rw | varchar(50) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| country | varchar(50) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| provinces | varchar(50) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| city | varchar(50) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| kecamatan | varchar(255) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| kelurahan | varchar(255) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| zip | varchar(20) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| house_no | varchar(50) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| apartment_no | varchar(50) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| cm_firebase_token | varchar(191) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| is_active | tinyint(1) | YES | 1 | - | - / - |
| payment_card_last_four | varchar(191) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| payment_card_brand | varchar(191) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| payment_card_fawry_token | text | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| login_medium | varchar(191) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| social_id | varchar(191) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| is_phone_verified | tinyint(1) | NO | 0 | - | - / - |
| temporary_token | varchar(191) | YES | '1' | - | utf8mb4 / utf8mb4_unicode_ci |
| is_email_verified | tinyint(1) | NO | 0 | - | - / - |
| wallet_balance | double(18,2) | YES | NULL | - | - / - |
| wallet_balance_ppob | double(18,2) | YES | NULL | - | - / - |
| loyalty_point | double(18,2) | YES | NULL | - | - / - |
| pin | varchar(255) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| default_toko | bigint(11) | YES | 1 | - | - / - |
| foto_ktp | varchar(255) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| foto_npwp | varchar(255) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| foto_ttd | varchar(255) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| no_rek | varchar(50) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| bank_rek | varchar(100) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| bagian | varchar(255) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| lokasi | varchar(255) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| persetujuan | int(11) | NO | NO DECLARED DEFAULT | - | - / - |
| kd_group | varchar(100) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| is_delete | int(11) | YES | NULL | - | - / - |
| foto_kk | varchar(100) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |
| foto_bukti_biaya_sekolah | varchar(100) | YES | NULL | - | utf8mb4 / utf8mb4_unicode_ci |

Indexes: [{"TABLE_NAME":"users","INDEX_NAME":"ktp","NON_UNIQUE":"0","SEQ_IN_INDEX":"1","COLUMN_NAME":"ktp"},{"TABLE_NAME":"users","INDEX_NAME":"ktp","NON_UNIQUE":"0","SEQ_IN_INDEX":"2","COLUMN_NAME":"phone"},{"TABLE_NAME":"users","INDEX_NAME":"nik","NON_UNIQUE":"0","SEQ_IN_INDEX":"1","COLUMN_NAME":"nik"},{"TABLE_NAME":"users","INDEX_NAME":"PRIMARY","NON_UNIQUE":"0","SEQ_IN_INDEX":"1","COLUMN_NAME":"id"},{"TABLE_NAME":"users","INDEX_NAME":"users_email_unique","NON_UNIQUE":"0","SEQ_IN_INDEX":"1","COLUMN_NAME":"email"},{"TABLE_NAME":"users","INDEX_NAME":"wallet_balance","NON_UNIQUE":"1","SEQ_IN_INDEX":"1","COLUMN_NAME":"wallet_balance"}].

This evidence excludes SHOW CREATE TRIGGER/routine bodies, current production grants/indexes/version/engines, runtime transaction writes, KYC/contact verification records and provider configuration values. Local indexes may come from setup scripts and do not prove source production indexes.
