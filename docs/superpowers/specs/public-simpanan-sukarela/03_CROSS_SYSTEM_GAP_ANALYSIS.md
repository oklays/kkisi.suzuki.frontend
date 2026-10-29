# 03 — Cross-system gap, keputusan, dan blocker

**Historical audit20 Oktober 2026, refined by Checkpoint0 documents08–13:** native approval is deferred CP3; old G1–G9 are mapped to current D-* register13. Source facts below remain baseline; source/local metadata findings appended to evidence.md.

Bukti [evidence](evidence.md), detail [01](01_AUDIT_EXISTING_MOBILE_FLOW.md) dan [02](02_AUDIT_LEGACY_KOSIPA_FLOW.md).

## 1. Gap matrix

| Area | Mobile/Laravel existing | Legacy KOSIPA | Next.js actual | Gap / arah |
|---|---|---|---|---|
| Identity | bearer user → nik/name/phone [B2] | staff session+menu [L1] | console session+active identity link+read caps [N2] | public identity context baru; tanpa login mobile |
| Form | old/new, period, section/type, PNG, consent, separate PIN [M3] | detail/print | belum ada public form | reproduce fields, strict server validation |
| Masters | m_bagian active, m_simpanan_mobile pengajuan enabled [B3–B4] | master management | reader belum menyediakan contract ini | dedicated master reader; tidak memanggil mobile API |
| Application creation | header OPEN + profile + signature + notification + conditional mail [B2] | menerima row shared | hanya ledger/members read | UoW create baru; explicit parity deviations |
| Approval | pending status dibaca | L1 konfigurasi payroll; L4 divergen | belum ada capability/handler/write adapter | one scoped approval migration, bukan workflow kedua |
| Rejection | pending hilang sesudah REJECTED | soft status utama; hard delete varian [L4] | belum tersedia | REJECTED status, alasan/audit baru; no hard delete |
| One-time link | tidak ada | tidak ada | identity-link bukan member submission-link [N6] | aux lifecycle record; jangan reuse identity_link |
| Transactions | sequential non-atomic | sequential non-atomic | guarded UoW patterns domain lain | satu business DB connection; transactional token/receipt/audit |
| Notification | hardcoded bagian/user, synchronous mail | dashboard reads db_notifikasi | audit console terpisah | configure routing; transactional DB notif+outbox |
| Signature | public disk deletes previous | PDF memakai current profile foto_ttd [L5] | belum ada signature storage adapter | private immutable proof + keputusan compatibility PDF |
| Duplicate | UI pending count, create tanpa enforcement | duplicate doc/master allowed | belum ada pengajuan port | exactly one per link; cross-channel limitation jelas |
| Ownership | Laravel create/profile writes | CI2 approve/master writes | KOSIPA read-only | owner-approved command/column matrix mandatory |
| Tenant | cooperative-wide | no company scope | KOSIPA bound by legacy menus | jangan tambah company_id palsu; deployment cooperative bound |
| Evidence | source inspected | source inspected | source inspected | DDL 30 Sep ≠ schema/runtime produksi |

## 2. Temuan prioritas

| ID | Classification | Finding dan dampak | Recommendation / gate |
|---|---|---|---|
| F1 | VERIFIED FACT / RISK | L1 vs L4 approval berbeda, rollback tidak atomik, status tidak divalidasi | G2 pilih L1; native approval single writer dan transaction |
| F2 | VERIFIED FACT / RISK | Mobile `MAX(RIGHT(doc_no,5))` semua prefix per bulan; naive UUID/prefix public dapat mengubah max/nomor mobile | G3 test namespace `SP<32hex link id>00000` (39 chars), suffix numeric netral; jangan SIMMOB reuse |
| F3 | VERIFIED FACT / RISK | mandatory status_notif/email/status_alert/potongan_old/is_mobile tidak selalu diisi existing | G1 DDL/triggers/sql_mode current + explicit inserts |
| F4 | VERIFIED FACT / RISK | Signature profile overwrite/delete; PDF memakai current profile dan public URL | G4 private immutable snapshot; public PDF via Next.js; legacy public-origin print memerlukan owner decision sebelum release |
| F5 | VERIFIED FACT / RISK | New sessionless request mengubah recurring payroll; bearer forwarding memberi akses | G5 OTP ke kontak existing terverifikasi, bukan user-supplied; signature saja bukan bukti identity |
| F6 | VERIFIED FACT / RISK | Pending rule UI saja; public+mobile tidak berbagi lock/idempotency | G6 scope guarantee exactly-one **per link**; business pending check public; global guarantee butuh koordinasi writer terpisah |
| F7 | VERIFIED FACT / RISK | NIK nonunique, normalisasi leading zeros read-side, master NIK varchar10 | G1/G6 exact member id+NIK, reject ambiguous/changed/oversize keys |
| F8 | VERIFIED FACT / RISK | Next.js lima KOSIPA read caps; menu mobile belum dipetakan | G2 explicit action grant, active identity link, original mobile menu upper bound |
| F9 | VERIFIED FACT / RISK | Token store di console DB terpisah + business writer berbeda tidak atomik | G1 co-locate token/audit/outbox dengan business InnoDB satu koneksi |
| F10 | ASSUMPTION / RISK | Member tanpa `users` harus dapat submit; existing profile fields tidak mempunyai verification provenance kuat | G5 phone verification source owner, no auto-create mobile account |
| F11 | VERIFIED FACT / RISK | Shared connection budget baseline 12, writer baru menambah pool | G7 capacity/grants/startup guard; tidak menaikkan ceiling diam-diam |
| F12 | VERIFIED FACT / RISK | Payroll routine/saldo views belum tersedia baseline | G8 jangan klaim payroll final/saldo bertambah; test konfigurasi + owner parity sebelum full release |

## 3. Decision register (semua rekomendasi belum approved)

| Gate | Keputusan yang diperlukan | Default rekomendasi | Evidence / penanggung jawab | Akibat belum ditutup |
|---|---|---|---|---|
| G1 | Current schema, engines, indexes, defaults, FK/triggers/routines, SQL mode/timezone, cross-table transaction grants | operator menyediakan metadata-only source-schema bundle, no member records | DB operator; S1/L1/B2 drift compare | adapter/migration production belum dapat disahkan |
| G2 | Approval variant dan writer ownership | L1 contract; native single processor; disable kedua legacy process/delete entry untuk konteks cutover melalui kontrol operasional yang disetujui | owner KOSIPA + engineering/security | native approve tetap OFF; mobile create tetap hidup |
| G3 | Public doc_no/is_mobile/source compatibility | SP + link id 32 hex + 00000, is_mobile=0, origin di aux; no foreign mobile impersonation | owners mobile+KOSIPA, staging all consumers | create feature belum enabled |
| G4 | Signature/PDF/profile side-effect policy | private immutable signature; public submission tidak overwrite bagian/foto_ttd master; print public-origin melalui Next.js snapshot | owner menandatangani deviasi, staging PDF | tidak mengklaim legacy PDF parity; full release blocked |
| G5 | Identity assurance, provider, OTP contact source dan consent | required OTP 6 digit ke kontak yang telah diverifikasi, 5 menit, 5 attempts; tanpa kontak hentikan dan arahkan ke petugas | owner/security; provider sandbox+template approval | public submit OFF |
| G6 | Eligibility, amount (zero/decrease/max), period cutoff, master ambiguity dan cross-channel duplicates | aktif; positive integer rupiah, belum menetapkan max bisnis; next payroll month Jakarta; no duplicates pending pada public check; tidak mengadopsi credit policy otomatis | owner payroll+mobile; written matrix | rule validation belum bisa final/prod enable |
| G7 | Grants, capacity, private storage, proxy log redaction, origin/domain HTTPS dan alert ownership | dedicated writer pool 1 only after measured budget; host canonical configured; secrets isolated | infra/operator | production rollout blocked |
| G8 | Payroll downstream semantics, approved-master duplicate handling | jangan silently deduplicate; block ambiguous master di native approve sampai owner corrective policy; verify payroll period semantics on representative staging | payroll owner + missing routine evidence | tak boleh klaim end-to-end payroll/saldo production-ready |
| G9 | Expiry/retention/audit/notification recipient | link48h max48h (proposal11); keep used receipt tombstone 90d; proof/financial retention owner-specified before cleanup enabled; configured operator recipients | owner/security/operations | retention jobs dan delivery belum diaktifkan |

Rekomendasi amount positive bukan fakta existing. Jika nol/penurunan SUKARELA merupakan layanan yang sah, owner dapat menerima nol dan penurunan; jangan memaksakan kenaikan WAJIB. Limit teknis safe integer dan DOUBLE precision bukan limit bisnis yang terbukti. Semua batas final harus tercatat sebelum mengaktifkan writer.

## 4. Ownership reconciliation

D2 melarang dua writer per tabel, tetapi audit membuktikan existing Laravel membuat OPEN dan CI2 memproses status/mutasi master pada tabel sama. Task baru memerlukan Next.js create sekaligus mobile tetap hidup. **Ini konflik baseline yang harus di-review eksplisit**, bukan dianggap izin otomatis.

Proposal refinement: satu pemilik per **command/origin/column** yang disetujui: Laravel tetap create mobile dan update profil mobile; Next.js hanya create origin PUBLIC, namespace terpisah, tidak UPDATE record mobile saat submit. Processing seluruh origin hanya satu pihak: CI2 sampai cutover, kemudian satu use case Next.js setelah legacy processing dinonaktifkan. KOSIPA master/profile ownership lain tetap di legacy. Jika owner mempertahankan one-writer-per-table tanpa refinement, **fitur tidak dapat diaktifkan dengan semua constraint saat ini**; jangan menyiasati melalui API mobile atau duplicate business table.

Native approval perlu write konfigurasi `m_simpanan_aktif` dan `m_anggota.sim_sukarela`, dengan scope transisi pengajuan saja; inventory/POS/loan/payroll generation tidak disentuh. Approval atomic dengan auxiliary audit pada koneksi yang sama. Konflik dengan perubahan master manual oleh legacy juga harus termasuk cakupan kontrol operasional, bukan hanya tombol mobile.

## 5. Pilihan arsitektur

| Pilihan | Manfaat | Biaya/risiko | Kesimpulan |
|---|---|---|---|
| Opaque token + server lifecycle + one business DB transaction | privacy URL, revoke/replay/idempotency, paling sesuai existing table | aux storage+writer approval diperlukan | **Direkomendasikan** |
| AEAD encrypted NIK URL + server nonce/used store | identity ciphertext authenticated | tetap butuh state, key rotation/AAD/nonce complexity tanpa manfaat untuk requirement ini | hanya jika identity ciphertext URL benar-benar diwajibkan |
| Signed-readable JWT atau stateless bearer | distribusi token mudah | NIK readable jika payload; revoke/one-use tetap butuh store | ditolak sebagai enkripsi/solusi stateless |

Tidak menggunakan mobile API, proxy mobile API, atau tabel pengajuan bisnis bayangan. Gate bukan sisa audit yang disembunyikan: merupakan bukti/policy runtime yang tidak dapat dibuktikan dari source yang tersedia.
