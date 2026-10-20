# Impact analysis

Status: rancangan, bukan perubahan aplikasi yang sudah dilakukan.

| Area | Sentuhan terencana | Risiko dan pengaman |
|---|---|---|
| Frontend | 17 server page KOSIPA, komponen di components/console/kosipa; layout/loading/error/CSS lokal KOSIPA baru bila diperlukan | CSS di-scope `.kosipa-*`; token inherit Console; audit screenshot seluruh page/role |
| Server presentation | Server Actions untuk query sensitif dan pagination q privat; guard/session/services/use case existing dipanggil ulang per action | Entry point harus reauthorize dan validate per call; plain serializable view DTO; tidak mengubah existing GET API semantics |
| Backend application/domain | Tidak ada perubahan formula/usecase/query; gunakan parse/filter/bounds existing | Golden exact-money/status/scan tests; fail-closed; tidak mengubah audit policy directory yang belum diaudit |
| DB | Tidak ada DDL, view/procedure, seed/backfill/index/role/grant atau writer | Rollback tidak memerlukan SQL; legacy writer tetap authoritative |
| Auth/RBAC/scope | Tidak ada perubahan permission atau link/allow-list/flag; UI hanya menyembunyikan aksi tanpa grant | Guard halaman dan action/API tetap independent; KOSIPA scope koperasi existing, TOKO scope cabang tetap |
| Export | fetch/download UI ke endpoint existing dengan filter non-sensitif tervalidasi | Abort pending, revoke URL blob, sanitized filename, content-type check, bounded server file, tidak auto-retry 429; error tidak menampilkan detail internal |
| Audit/security | Disable prefetch pada link sensitif; audit-before-read existing tetap | Client response lama tidak menggantikan denial terbaru; local state clear pada permission/session error, branch/user navigation |
| Environment | Satu label sintetis module-level via indikator server dari DEV LOCAL marker/profile existing yang tervalidasi | Tidak menyimpulkan sintetis hanya dari NODE_ENV=development atau nama SYNTH; banner bukan security boundary |
| Queue/integration | Tidak ada queue/worker/provider baru | Tidak perlu recovery job atau rollout infra |
| TOKO/Warehouse/PWA | Tidak disentuh | Uji login/landing/navigation dan smoke POS existing; mutation suite gunakan fixture terisolasi |
| Operations/Git | Kerja lokal feat/unified-console; PRD asli untracked dan .DS_Store unrelated dipertahankan | Tidak reset data owner, tidak kill :3200/:3201, tidak push/merge/deploy |

## Ambiguitas dan keputusan rancangan

1. PRD menyebut UI-only dan melarang NIK di URL, sedangkan existing directory/loan/payroll forms memakai GET q. CSS saja tidak dapat memenuhi keduanya. Rekomendasi: **server presentation actions** yang memanggil use case existing dengan input dalam body. Tidak menambah financial API/persistence. Old GET API tetap kompatibel; UI baru tidak menghasilkan q sensitif. Server entry point ini tetap perlu security tests.
2. Identifier policy: phone/email/bank mengikuti masking domain existing. Rekomendasi NIK di daftar disamarkan dengan suffix terbatas (maksimal empat karakter, identifier pendek seluruhnya disamarkan), detail hanya menampilkan data yang dibolehkan baseline. Tidak mengubah field ID penghubung atau membership policy. Owner dapat menyesuaikan kebijakan presentasi saat review.
3. Pinjaman list tidak menyediakan headerCount/rowCount payroll. Jangan menambah query agregat demi badge/kolom. Badge duplikat list hanya jika duplikat terlihat pada page yang sama; detail tetap authoritative. Row count payroll hanya jika data existing mengirimkannya; lainnya tidak ditampilkan sebagai nol atau estimasi.
4. Parameter filter boleh persist bila non-sensitif: tahun, periode, status, grup, jenis dan cursor existing yang aman (cursor berisi identitas tidak dipasang ke URL). State pencarian sensitif hanya di memory, hilang saat refresh penuh; tampilkan arahan cari ulang. Jangan mengklaim refresh dapat mengembalikan q privat tanpa penyimpanan.
5. Tidak ada mock repository yang harus diubah; fixtures sintetis dan responses terkontrol menjaga bentuk DTO adapter nyata. Failure states dapat diuji dengan response interception/unit stubs, bukan mematikan DB owner.
6. Saved views bersifat opsional: tidak dibangun pada fase ini. No sort/page-size UI karena API belum mendukung. Tidak ada timestamp source baru tanpa metadata verified.

## Risiko tersisa

Aksesibilitas AA, performa/task-time, link revoked dan outage belum diukur di baseline screenshot; acceptance tetap pending. Owner visual review/produksi role O3 dan parity saldo O1/O5 tetap gate terpisah. Tidak memblokir pure presentation karena belum ada official balance.

Rollback: revert hanya commit UI terkait setelah meninjau diff; tidak menjalankan SQL, reset atau undo audit/session normal. Restart layanan hanya jika nanti secara khusus diperlukan/diotorisasi, dengan verifikasi ownership proses existing.
