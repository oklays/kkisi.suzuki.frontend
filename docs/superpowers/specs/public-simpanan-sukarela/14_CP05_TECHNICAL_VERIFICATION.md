# 14 — CP0.5 technical verification and database/security readiness

22 Oktober 2026, Asia/Jakarta. Deliverables B/E. Scope terbatas P0-01–P0-06; baseline01–13 dipakai kembali. **Tidak ada production DB query, perubahan aplikasi, DDL/DML/grants, service start/restart, atau pengiriman provider.** Hasil negatif/unavailable dipertahankan sebagai hasil, bukan diganti asumsi.

## 1. Evidence baru dan batas pembuktian

| Evidence | Pemeriksaan aktual | Hasil | Batas / blocker |
|---|---|---|---|
| C05-GIT1 | git status, branch, HEAD, index entries dan application diff dibandingkan awal/akhir | awal `master`, HEAD `6a5d57b373e833b36b19a7af53a724d06cfb5f13`;22 dokumen CP0 dan satu PRD lain sudah staged sebelum pekerjaan | staging milik user dipertahankan; baseline audit20 Oktober berasal dari branch/HEAD berbeda |
| C05-DB1 | Prisma direct reader dari profile lokal; guard loopback+staging/test+reader, connection_limit1/connect_timeout5; tanpa output DSN | koneksi gagal `PrismaClientInitializationError / P1001`; diagnostic connection-only mengonfirmasi errorCode; metadata query tidak berhasil dieksekusi | **UNAVAILABLE**, bukan skema kosong; tidak menyalakan DB, memakai writer, atau mencoba akun remote; P0-01 tetap BLOCKED |
| C0-DB1 /09A | metadata restricted LOCAL_STAGING yang sudah dikumpulkan21 Oktober, dibaca kembali sebagai baseline |9 tabel /219 kolom /17 index entries; InnoDB, SELECT-only; trigger visibility terbatas | bukti historis lokal, **tidak di-refresh** dan bukan kesetaraan produksi |
| C05-SRC1 | SSH source-only SHA-256 enam file yang telah terdaftar | B2/B1/L1/L4/C0-OTP1/C0-OTP2 sama dengan CP0; lihat hash di bawah | source tersimpan pada host produksi; bukan bukti menu aktif, runtime atau effective DB privileges |
| C05-MUT1 | baca ulang B2 `1208–1229,1276–1325` | cancel `WHERE doc_no`; edit `WHERE doc_no LIMIT1`; tidak ada predicate own-NIK/origin/current-status pada handler | auth:api di route bukan row authorization; adanya encrypted doc_no tidak membuktikan pemegangnya berwenang mengubah PUBLIC; controls lain belum terbukti |
| C05-ORDER1 | L1 `ajax_proses:193–290`, L2 `save/update_data:180–209` | baca request → U/I active-master → U member config → U header; helper masing-masing satu query, tanpa enclosing transaction di handler/helper yang dibaca | **inferensi bersyarat:** bila berjalan autocommit biasa tanpa kontrol luar, guard pada header terakhir tidak membatalkan perubahan config sebelumnya; runtime session/global wrapper belum diverifikasi |
| C05-PDF1 | L5 `simpanan_c::print_pengajuan_pdf:1245–1280`, template `108–110,164–168` | JOIN current member.foto_ttd/bagian/jabatan/contact/bank; template ambil gambar dari public smartkkisi storage | private per-submission signature tidak otomatis compatible dengan unchanged CI2 PDF; P0-05 belum tertutup |
| C05-NUM1 | B6 `Helpers::autocode:23–42` | MAX(RIGHT(doc_no,5)) per bulan tanpa prefix filter; padding6 | suffix00000 public adalah kandidat aman, bukan hasil uji numbering; collision/range/sort/both approval lookups perlu staging |
| C05-CFG1 | N7 deployment-guard/capacity-plan/startup-check dan kosipa-directory | registry capacity menghitung ceiling pool, tidak mengukur penggunaan PHP; belum ada public writer pool; legacy menu adalah upper bound akses | tidak ada bukti hosting headroom, actual active provider config atau role-action mapping; tidak membaca file akun/password |
| C05-MODEL1 | exhaustive abstract interleaving experiment, Python standard library, synthetic memory saja |88 schedule perilaku tanpa guard menghasilkan87 pelanggaran invariant;12 schedule reference dengan asumsi atomic coordination menghasilkan0 | **MODEL ONLY**, bukan implementasi kontrol atau pengujian DB/PHP; [reproduksi dan asumsi](14A_CP05_CONCURRENCY_MODEL.md); tidak menutup P0-05 |

Exact root aliases M/N/B/L dan lokasi semua simbol mengikuti [evidence register](evidence.md). Tidak menjalankan API legacy bahkan GET print; hanya membaca source. Profile `.env.local` dimuat internal untuk reader lokal, tidak dicetak/disalin. `.env.dev-local-accounts.json` tidak dibaca.

| Source C05-SRC1 | SHA-256, cocok CP0 |
|---|---|
| B2 SimpananController | `49e8b9019320aa7979fb374455e0b703d4c202dfe23defbebfc52be9695bc73c` |
| B1 routes/api/v1/api.php | `cd75bee17e7c0d1200b020bbbafaba250c1bb42b7ba9a14f72ef76ac5855d3ba` |
| L1 mobile pengajuan_mobile_c | `162ba711bf78aed1228e89ff60318a916f9b5fda4eeb8a2a6fc1cae488564398` |
| L4 simpanan pengajuan_mobile_c | `330a5ceeb984510e89eeb8dccec06722df840d980c7155bf4bddc592f08b502e` |
| PhoneVerificationController | `94d9c6d560bfe56803ed89f651c665bdafe7c5d54b3b9996ed0b501234f42c1c` |
| sms_module | `5049830c73a304715a95a467996088d0f2ea005c618181ac44fdab1bbb05f78b` |

## 2. Readiness assessment

| Area | Evidence / current readiness | Missing acceptance evidence | Owner |
|---|---|---|---|
| Existing business entity/mapping | VERIFIED source: request table tetap authoritative, explicit required notif columns; local09A historical | production normalized columns/default/index/charset diff, exact NIK10 active-master representability; jangan melakukan auto truncation | DB + engineering |
| Transactions | RECOMMENDED one InnoDB connection untuk request/notif/link/audit/outbox | full-visible transitive trigger/routine effects dan engines; actual target-version locking privileges, two-client fault/rollback/unknown-commit tests | DB + engineering |
| Public-only uniqueness | design satu link→satu request, satu ACTIVE public link/member/purpose | future unique constraints + UoW tested; ini tidak membatasi MOBILE writers | engineering |
| Cross-channel integrity | **BLOCKED**, source/model memberi counterexamples; user mewajibkan prevention | all-writer preventive boundary dengan actor/origin/state/version checks, pengujian before-first-side-effect dan rollback seluruh config;16 | security + Laravel/CI2 + DB |
| Writer ownership/grants | baseline one-table-writer vs command/origin refinement belum disahkan | approved ownership amendment dan reviewed least-privilege grant specification; actual provisioning/testing hanya pada fase terotorisasi | data owner + DB |
| Capacity/transport | source guard/budget tersedia; bukan free capacity | hosting limit scope, semua process/instance/worker, PHP peak+reserve, authenticated transport/target, locks/timeouts dan p95 evidence staging | infra + DB |
| Contact/OTP | unsafe legacy lifecycle tidak di-reuse; OTP per-link recommendation tersedia | current approved contact provenance, actual provider/account/sender/template contract, secret owner, quota/timeout, approved sandbox/UAT | membership + security + provider operator |
| Token/keys/logging | token256bit/digest/fragment, no consume until commit RECOMMENDED | sign-off TTL/rate policy, secret/key custody+rotation, HTTPS/CSP/redaction/backup/restore acceptance; no same-channel MFA claim | security + infra + business |
| Signature/PDF | mandatory immutable private snapshot RECOMMENDED; legacy profile dependency VERIFIED | approved template fields/consent, storage permissions/key owner, render/hash test, enforced correct print/handoff route | KOSIPA + security + infra |
| RBAC/notification | existing identity/menu upper bound VERIFIED source | explicit per-action role policy, synthetic positive/negative personas, server recipient mapping and mandatory required values | KOSIPA + security + operator |
| Payroll/cutoff | immediate config update/retained existing period observed source | signed payroll calendar/effective-period semantics and authorized source/staging demonstration; no change to payroll now | savings/payroll owner |

**Database: NOT READY for implementation of a production-compatible writer. Security: NOT READY for operational public intake.** No parent P0 is closed by source verification alone. Pure offline contract work can be considered under the separate start gate17; readiness is not inferred from a successful model assertion.

## 3. Scoped evidence intake for operators (read-only)

Tidak perlu full re-audit/dump/member export. Request ini disiapkan untuk owner, **belum dikirim** dan bukan izin menjalankan DDL/grants.

| Evidence package | Exact bounded request / acceptance |
|---|---|
| DB-01 schema | operator-owned metadata access; sembilan nama tabel pada09A; ordered TABLES/COLUMNS/STATISTICS/KEY_COLUMN_USAGE, version, session SQL mode/timezone+actual offset, isolation/autocommit; environment/time/source clearly attested |
| DB-02 transitive effects | complete trigger inventory+definitions untuk tabel yang akan ditulis dan dependency routines/tables; attest metadata visibility, engine dan implicit/external effects. Empty result dengan reader tak berhak tidak cukup. Redact DEFINER identities/secrets sebelum berbagi |
| DB-03 account boundary | sanitized effective grants/roles untuk actual Laravel, CI2, planned public/worker accounts; laporkan SAME/DISTINCT trust boundary tanpa username/password. Column grants tidak membatasi row origin. No grants created/changed sekarang |
| DB-04 topology | same physical business DB/UoW target, hosting-wide vs per-account limits, active pools×processes×instances+PHP peak+worker+reserve; transport/TLS identity/allowlist. Nilai global lokal0 tidak membuktikan kapasitas |
| OP-01 workflow | production menu URL+enabled state dan dated operator confirmation bagi L1/L4/list/detail/approve/reject/delete/manual config; safe walkthrough existing screen saja, **tanpa klik mutation**; screenshot harus redacted |
| OP-02 authority/routing | role/action mapping, scope/revocation/proof-access approver; recipient role/bagian/config reference, escalation and backup role. Real IDs/contact values berada di controlled operator config, bukan shared docs |
| SEC-01 contact/provider | method/ref/verifier/currentness policy; provider active branch+actual API service identity, sender/template/channel capability+quotas+timeout+secret custody; redact credentials; tidak ada dispatch |
| SEC-02 artifacts/edge | private storage/access policy, immutable object reference/backups/keys, approved PDF template+print owner; HTTPS origin/proxy/log-redaction responsibility and restoration runbook |

Engineering membandingkan metadata semantik dengan09A, mencatat setiap delta/unsupported constraint, lalu owner mengesahkan keputusan15 dan test protocol16. Jangan meminta root credential/production member samples untuk mengisi gap ini. Keterbatasan akses dilaporkan, bukan diatasi dengan privilege escalation.

**CP0.6 evidence timing23 October:** this checklist remains the scoped operator request; no new authorised production metadata target/effective-grant package supplied, so no access bypass/new DB query attempted. Historical local schema21 Oct and failed local connection22 Oct remain dated evidence. For **T01**, owners review logical source/precision/contact/authority/atomicity contracts with synthetic facts; actual schema/trigger visibility/locking privileges/capacity and existing Laravel/CI2 account permissions are **INT/ACT prerequisites**, not a requirement to connect pure contract tests to a DB. Matrix13 and gate17 preserve that distinction. TypeScript TSC-01 closed19 does not close any DB evidence item here.

## 4. Basis teknis primer

Row locks harus berada dalam transaksi; lock yang tidak dipakai semua writer tidak membentuk global business gate. [MariaDB FOR UPDATE](https://mariadb.com/docs/server/reference/sql-statements/data-manipulation/selecting-data/for-update).

Trigger transactional mengikuti transaksi statement pemicunya; fakta ini tidak membungkus statement PHP sebelumnya menjadi satu transaksi. Ini mendasari inferensi C05-ORDER1, bukan bukti runtime konfigurasi produksi. [MariaDB trigger overview](https://mariadb.com/docs/server/server-usage/triggers-events/triggers/trigger-overview).

Final authorization harus diperiksa server-side pada saat eksekusi dan significant data dilindungi dari perubahan.11/16 menerapkan prinsip ini; angka TTL/nominal tetap keputusan owner, bukan angka yang diwajibkan sumber. [OWASP Transaction Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html).
