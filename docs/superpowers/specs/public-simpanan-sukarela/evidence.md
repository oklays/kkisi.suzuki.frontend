# Evidence register dan batas verifikasi

Audit 20 Oktober 2026. Next.js branch `feat/unified-console`, HEAD `0cd1218f5c051c5543335ae9fa3d400258514566`. Source mobile merupakan folder tanpa metadata Git; gunakan SHA-256. Pada audit20 Oktober tidak membaca `.env`, akun lokal, konfigurasi database/password, data anggota, atau dump INSERT. CP0 tanggal21Oktober memuat connection profile lokal secara internal untuk SELECT-only metadata, tanpa mencetak credentials; scope/logical evidence baru dijelaskan di bagian akhir.

## Root source

| Alias | Exact root |
|---|---|
| M | `/Users/macbookprom2/Documents/Working_Space/OctopushStudio/MobileApp/kopkarkkisitb2-master` |
| N | `/Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web` |
| L | `/home/n1608204/public_html/kosipa` pada `srv149.niagahoster.com`, source dibaca SSH read-only |
| B | `/home/n1608204/public_html/smartkkisi.kkisitb2.id` pada host sama, source dibaca SSH read-only |

Referensi `M/...`, `B/...`, `L/...`, `N/...` di paket ini berarti exact root di atas, bukan nama file yang diasumsikan. Referensi remote tidak tersedia sebagai checkout lokal. Bukti statis membuktikan kode yang tersimpan, bukan keberhasilan runtime/DB atau penggunaan menu oleh operator aktual.

## Dokumentasi baseline (dibaca sebelum audit source fitur)

| ID | Source dan kegunaan |
|---|---|
| D1 | `N/README.md` Repository ownership; `N/docs/refactor/CHECKPOINT_4_DOMAIN_APPLICATION.md`: domain/application sudah di packages, adapter app-owned |
| D2 | `N/docs/migration/DATA_OWNERSHIP.md`: satu writer; mobile eksternal harus diperiksa; **tidak otomatis mengizinkan writer public** |
| D3 | `N/docs/migration/module-boundaries.md`: route/page tipis; path `src/domain` lama perlu dibaca bersama D1 |
| D4 | `N/docs/superpowers/specs/unified-console-kosipa-warehouse/current-state.md:13-18,44-114`: KOSIPA CI2 terpisah, smartkkisi Laravel, data koperasi tanpa filter company TOKO |
| D5 | `N/docs/superpowers/specs/unified-console-kosipa-warehouse/endpoint-inventory.md`: dua `pengajuan_mobile_c` pada modul mobile dan simpanan |
| D6 | `N/docs/superpowers/specs/unified-console-kosipa-warehouse/{legacy-anomalies,decision-register}.md`: view stub, procedure tidak tersedia, writer dan kapasitas belum selesai |
| D7 | `N/docs/superpowers/specs/kosipa-ui-ux-enhancement/{README,current-state,design}.md`: UI baca, data sintetis, pola presentasi KOSIPA |
| D8 | `N/CLAUDE.md`; `N/apps/web/{AGENTS,CLAUDE}.md`; `N/docs/legacy-reference/{04-database,05-data-flow,06-business-rules}.md`: konteks TOKO bukan kontrak approval KOSIPA |

## Source mobile

| ID | Exact file di M / simbol / baris relevan |
|---|---|
| M1 | `lib/view/screen/dashboard/dash_simpanan_screen.dart:32-43` tabs; `lib/view/screen/simapanan/pengajuan/pengajuan_simpanan_screen.dart:29-100` `_loadData`, `initState`, `CustomBottomAdd` |
| M2 | `lib/view/screen/simapanan/pengajuan/widget/btnAdd.dart:30-65`: pending count gate dan navigasi |
| M3 | `lib/view/screen/simapanan/pengajuan/form_pengajuan.dart:28-360` `FormPengajuanSimpananScreen`, `_load`, `_potonganOld`, `cekNominal`, `sendData`; UI `470-1405` |
| M4 | `lib/provider/simpanan_provider.dart:47-120,335-350,495-560`: state/draft, `getMasterSimpanan`, `getPotonganOld`, `pengajuanSimpanan` |
| M5 | `lib/data/repository/simpanan_repo.dart:121-143,176-234`: `getPengajuanBerlangsung`, `getMasterSimpanan`, `getPotonganOld`, `pengajuanSimpanan` |
| M6 | `lib/data/model/body/form_simpanan_pengajuan_model.dart`: `FormSimpananPengajuanModel`, `toJson`; **create multipart tidak memakai seluruh toJson** |
| M7 | `lib/utill/app_constants.dart:7,61,142,204-230`: BASE_URL, route master/pending/submit/PIN |
| M8 | `lib/view/screen/simapanan/pengajuan/widget/pin_verification_pengajuan_screen.dart:48-270`: permission lokasi, `checkOutUser`, `route`, `_callback` |
| M9 | `lib/view/screen/simapanan/pengajuan/widget/{signature_page.dart:133-145,signature_preview_page.dart:56-75,pernyataan_sukarela_screen.dart:59-75,416-500}`: PNG, file lokal, surat kuasa payroll |
| M10 | `lib/view/base/textfeild/custom_text_feild.dart:95-148`: disabled `idDate`, formatter nominal, validator opt-in |
| M11 | `lib/data/datasource/remote/dio/encryption.dart:7-22`: AES CBC/Base64; secret material sengaja tidak dicatat |

SHA-256 M3 `d47362acc761021dc1a64fd007d64ee18ffdbbf03bec9045140ba7950b75e2fa`.
SHA-256 M5 `f9d0dc71a3e8900f62324118f743b057b83cc6c2dbe0681c161e82a063eed922`.

## Backend mobile / KOSIPA (dibaca langsung saat audit)

| ID | Exact file / simbol / baris |
|---|---|
| B1 | `B/routes/api/v1/api.php:16,150-161,282-309`: group v1, `auth:api`, mapping endpoint simpanan |
| B2 | `B/app/Http/Controllers/api/v1/SimpananController.php:1014-1023,1029-1204`: pending count dan `pengajuan_simpanan_mobile` |
| B3 | file B2 `1234-1272,1443-1446`: `get_potongan_old`, `master_simpanan_pengajuan` |
| B4 | `B/app/Http/Controllers/api/v1/CustomerController.php:253-268`: `master_bagian` dari `m_bagian.status=1` |
| B5 | `B/app/Model/TransSimpananPengajuan.php:8-19`: table/cast; tidak ada custom save/boot atau timestamps override dalam model |
| B6 | `B/app/CPU/helpers.php:23-42`: `autocode` MAX RIGHT 5 per bulan **tanpa filter prefix**, padding 6; `45-70` encrypt/decrypt (secret tidak dicatat) |
| B7 | `B/app/CPU/image-manager.php:23-38,86-96`: public disk, delete file lama lalu upload |
| B8 | `B/app/Http/Controllers/api/v1/auth/PassportAuthController.php:528-596` `verify_pin_trans`: decrypt user_id/PIN, insert device_info dan create OAuth token; dipanggil terpisah, submission B2 tidak menerima proof PIN |
| B9 | `B/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Concerns/HasTimestamps.php:7-14`: default timestamps true; `B/app/Providers/AppServiceProvider.php:36-40`: timezone Asia/Jakarta; provider event scan tidak membuktikan ketiadaan DB trigger |
| L1 | `L/application/modules/mobile/controllers/pengajuan_mobile_c.php:18-34,74-138,166-290`: gate, list, soft reject, detail, `ajax_proses` |
| L2 | `L/application/modules/mobile/models/pengajuan_mobile_m.php:11-16,25-76,109-177,180-209`: list filters, generic save/update mengembalikan array |
| L3 | `L/application/modules/mobile/views/js/pengajuan_mobile_detail_js.php:31-80,198-220`; `views/pengajuan_mobile_detail_v.php:240-245`: tombol approve/reject ke L1 |
| L4 | `L/application/modules/simpanan/controllers/pengajuan_mobile_c.php:117-121,174-269`: varian POSTING/approve, hard delete |
| L5 | `L/application/modules/simpanan/controllers/simpanan_c.php:1245-1280` `print_pengajuan_pdf`; `views/print_pengajuan_simpanan_pdf.php:108-110,164-168`: PDF memakai **m_anggota.foto_ttd** dan URL storage smartkkisi |
| L6 | `L/application/modules/dashboard/controllers/dashboard_private_c.php:156-189,239-268`: `db_notifikasi` filter user/bagian/status, update berdasar title |

SHA-256 B2 `49e8b9019320aa7979fb374455e0b703d4c202dfe23defbebfc52be9695bc73c`.
SHA-256 B1 `cd75bee17e7c0d1200b020bbbafaba250c1bb42b7ba9a14f72ef76ac5855d3ba`.
SHA-256 L1 `162ba711bf78aed1228e89ff60318a916f9b5fda4eeb8a2a6fc1cae488564398`.
SHA-256 L4 `330a5ceeb984510e89eeb8dccec06722df840d980c7155bf4bddc592f08b502e`.

## Next.js dan DDL snapshot

| ID | Source / simbol |
|---|---|
| N1 | `apps/web/src/infrastructure/console/{services,config,kosipa-http}.ts`: `kosipaServices`, `kosipaReadEnabled`, `kosipaActor`; route `apps/web/src/app/api/kosipa/**/route.ts` saat audit hanya GET |
| N2 | `packages/domain/src/console/{capabilities,kosipa-access}.ts`; `packages/application/src/console/{resolve-capabilities.usecase,identity-links}.ts`: lima KOSIPA read capabilities, link aktif, menu upper bound; tidak ada mobile/process/approve grant |
| N3 | `packages/application/src/kosipa/{member-360,savings,payroll}.ts`; `apps/web/src/infrastructure/repositories/kosipa-{member,savings,payroll}.repository.ts`: read port, audit sebelum baca, query capped/parameterized |
| N4 | `apps/web/src/infrastructure/auth/{http,origin,page-guard}.ts`: session/CSRF/origin, `json` no-store, bounded JSON |
| N5 | `apps/web/src/{proxy.ts,app/layout.tsx,app/console/layout.tsx}`: console butuh sesi; public route harus sibling `/console`, root tanpa analytics |
| N6 | `apps/web/db/console/001_console_schema.sql`; `apps/web/src/infrastructure/console/console-store.ts`: console audit actor non-null, separate database/client; bukan transaksi business writer |
| N7 | `apps/web/src/infrastructure/db/{deployment-guard,capacity-plan,startup-check,prisma-pos-write}.ts`: guarded writers, bounded pool, existing capacity baseline 12 |
| N9 | `apps/web/src/infrastructure/auth/prisma-throttle-store.ts`: existing `auth_throttle` dedicated auth connection, failure/lock policy; bukan generic public quota adapter |
| N8 | `packages/domain/src/kosipa/{nik,member-eligibility,document-state}.ts`: NIK normalization **read-side**, eligibility **member-credit**, generic document lifecycle **bukan** pengajuan payroll |
| S1 | `apps/web/staging/kkisi_full_dump.sql.gz`, snapshot 30 Sep 2026 menurut D4. Hanya ekstraksi blok **CREATE TABLE**, tidak INSERT. Tabel relevan di dokumen 02. Semua relevan ENGINE InnoDB snapshot; bukan introspeksi produksi terkini |
| S2 | `apps/web/db/e2e/003_e2e_kosipa_structure.sql`: synthetic KOSIPA fixtures belum mencakup kontrak public pengajuan/master aktif lengkap |

## Evidence gaps

- Tidak ada database connection/query produksi di audit ini. Engine/index/default/trigger/routine/grants, `sql_mode`, timezone, row ambigu/duplicate, kontak terverifikasi, kapasitas dan object-storage connectivity produksi **belum diverifikasi**.
- Tidak memanggil API mobile/legacy, termasuk GET yang mungkin mempunyai efek samping. Tidak membuktikan runtime email/PIN/print/approval. Model minimal dan provider scan bukan bukti tidak ada trigger database.
- TOKO lokal tidak memiliki hit `trans_simpanan_pengajuan`, `m_simpanan_aktif`, atau `pengajuan_simpanan_mobile` pada `application/**/*.php`; baseline mengarahkan audit ke remote yang benar. Tidak melakukan full legacy re-audit.
- `x_proc_create_matrix` dan view saldo tetap gap baseline. Hubungan konfigurasi payroll terbukti; jalur akhir payroll/saldo tidak diklaim terverifikasi.

## Referensi security/database primer (diakses saat audit)

- [OWASP URL token guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html): acuan inferensi untuk bearer invitation; bukan aturan bisnis KOSIPA.
- [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
- [OWASP File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).
- [MariaDB FOR UPDATE](https://mariadb.com/docs/server/reference/sql-statements/data-manipulation/selecting-data/for-update): row lock harus di transaksi.

## Checkpoint0 targeted verification —21 Oktober 2026

| ID | Actual evidence / exact path and symbol | Boundary |
|---|---|---|
| C0-DB1 | Guarded direct Prisma SELECT from local reader: information_schema TABLES/COLUMNS/STATISTICS/KEY_COLUMN_USAGE/TRIGGERS for9 named tables; safe server settings; sanitised SHOW GRANTS; bounded `SELECT url,status FROM ref_menu` for only2candidate URLs | LOCAL_STAGING only, no member rows;09A full219columns/fingerprint; no DDL/DML or runtime write atomicity proof |
| C0-ENV1 | Local `.env/.env.local/.env.dev-local` target classification without values: all loopback staging reader-named DSNs | no production credential borrowed or privileged fallback; metadata target remains local |
| C0-SRC1 | Remote L1/L4 and B2 SHA-256 same as20 Oktober; source SSH read-only | no active-production DB menu/role/usage proof; L1 preferred due routing and local menu |
| C0-MUT1 / B10 | `B/app/Http/Controllers/api/v1/SimpananController.php:1208-1229` `delete_pengajuan_simpanan_mobile_detail`: decrypt doc_no, status REJECTED by doc_no; `1276-1325` `update_pengajuan_simpanan_mobile`: required body fields, update type/old/new/month/year by doc_no limit1 | no ownership/origin/current-status predicate in these audited handlers; new origin compatibility must account for these writers |
| C0-OTP1 | `B/app/Http/Controllers/api/v1/auth/PhoneVerificationController.php:18-51,54-103,106-146` `check_phone`,`verify_phone`,`verify_phone_new`; routes B1:38-40 | source4digit rand, phone/temporary-token lookup, sets users.phone/is_phone_verified; audited verify lookup lacks explicit TTL/attempt bound; no live OTP/PII/provider request |
| C0-OTP2 | `B/app/CPU/sms_module.php:11-43` `send`, `110-141` `two_factor`: configurable provider branches,2factor label points at Fonnte; cURL timeout0; configuration access dynamic | active provider/config credentials/status/contract unverified; no configuration values read or provider messages sent |
| C0-OTP3 | `B/app/Http/Controllers/api/v1/auth/ForgotPassword.php:94-117,233-256` password/PIN reset OTP lookup uses reset tables; not public-payroll proof | no reuse of mobile recovery/verification endpoints |
| C0-AUTH1 | `L/application/models/user_m.php::create_menu/geturlmenu/cekstatushakakses`, menu query lines187-194,379-390; L4 constructor18-33 confirms different module gate | active menu+staff grant production configuration still operator evidence requirement |

Remote SHA-256 new targeted sources: PhoneVerificationController `94d9c6d560bfe56803ed89f651c665bdafe7c5d54b3b9996ed0b501234f42c1c`; sms_module `5049830c73a304715a95a467996088d0f2ea005c618181ac44fdab1bbb05f78b`. No raw source/config/member data copied to repo.09A contains sanitized metadata, not business data.

Local metadata additions vs dump-only audit: m_anggota has3additional nonunique read indexes in local environment; scoped request and active-master retain PK-only metadata. Empty trigger metadata is privilege-limited and not proof triggers absent. Local SQL mode strict means explicit NOT NULL values remain important; no failing INSERT was executed to test this.

New official references reviewed21Oktober: [OWASP MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html), plus prior OWASP URL token/MariaDB lock guidance refreshed; support general security principles only, not KKISI business approval or provider activation.

## CP0.5 targeted continuation —22 Oktober2026

Current workspace differs from original audit: `master`, HEAD `6a5d57b373e833b36b19a7af53a724d06cfb5f13`;22 existing spec files+separate PRD pre-staged. Initial Git index SHA-256 of `git ls-files --stage -z`: `b2b48af2e60b9bbc6fe1b159e128191849ce724bdf8ea8c271d59b26e20a2818`. Index preserved; no staging/unstaging/Git publication authorised.

[14 technical verification](14_CP05_TECHNICAL_VERIFICATION.md) registers C05-GIT1/DB1/SRC1/MUT1/ORDER1/PDF1/NUM1/CFG1/MODEL1 and refreshed six source hashes. Actual LOCAL reader connect attempt unavailable/P1001; no metadata refreshed, no production target used. Source-only SSH re-read narrowly scoped handler/helper/template ranges; no credentials/provider values/member rows. Observed multi-statement CI2 write ordering yields a conditional late-header-guard counterexample, not proof of actual production session autocommit/hidden-control state.14A retains reproducible synthetic model with all limitations; actual cross-channel DB/PHP tests remain NOT RUN.

U-01 user explicitly chose mandatory tested prevention and hold operational activation.15 records exact scope;16 replaces operational exceptions/manual-only gates;17 separates offline contract authorization and future runtime/release evidence. No other business rules approved by this user reply.

Primary technical sources reviewed22 October: [MariaDB trigger transaction scope](https://mariadb.com/docs/server/server-usage/triggers-events/triggers/trigger-overview), [MariaDB FOR UPDATE](https://mariadb.com/docs/server/reference/sql-statements/data-manipulation/selecting-data/for-update), [OWASP Transaction Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html). General control principles only; no KKISI policy/grant/runtime inference from these sources.
