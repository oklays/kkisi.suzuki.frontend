# 21 — Pengiriman OTP ke email anggota (Sukarela & Wajib)

**Tanggal:** 7 November 2026 · **Branch acuan:** `feat/public-savings-replica-uat-20261107` · **Policy:** KKISI-PSS-2026-V1 dan KKISI-PSW-2026-V1 (tidak diubah)
**Status dokumen:** PLAN / SPEC — belum ada implementasi. Keputusan bertanda **PERLU KEPUTUSAN OWNER** belum boleh dianggap disetujui.
**Menutup sebagian:** P0-04 (D-CONTACT, D-PROVIDER) dan item §9.6 "Providers" di [20](20_CP2_LEGACY_INTEGRATION_AND_RELEASE.md).

## 1. Tujuan

Saat anggota membuka secure link pengajuan dan menekan **Kirim kode verifikasi**, kode OTP 6 digit dikirim sungguhan ke **email yang tercatat pada data anggota** (`m_anggota.email`), menggantikan *local capture* yang dipakai sekarang. Berlaku untuk Simpanan Sukarela dan Simpanan Wajib.

Di luar cakupan dokumen ini: kanal WhatsApp/SMS, deployment ke domain publik (adapter non-loopback), perubahan aplikasi mobile/CI2.

## 2. Kondisi saat ini (VERIFIED, 7 Nov 2026)

### 2.1 Kode

| Komponen | Kondisi |
|---|---|
| Alur OTP — `service.ts::requestChallenge` | Challenge dibuat + di-commit, lalu `provider.deliver()` dipanggil **sinkron** ke `m_anggota.email` mentah. Jika gagal → `DELIVERY_UNAVAILABLE`, tetapi challenge tetap aktif dan tetap dihitung kuota resend. |
| Provider aktif | `createLocalCaptureProvider` saja (file terenkripsi lokal). |
| `smtp-provider.ts` | **Sudah ada, belum di-wire.** Nodemailer, TLS wajib (min TLS 1.2, verifikasi sertifikat), timeout 5 s, Message-ID stabil, tanpa retry, tanpa log. Teruji ke SMTP loopback. |
| Isi email OTP | Plain text; masa berlaku ditulis `toISOString()` (UTC) — membingungkan anggota. |
| Notifikasi setelah submit | Outbox `NOTIFY_MEMBER` / `NOTIFY_OPERATIONS` sudah ada dan memakai provider yang sama. |
| Binding kontak | `boundContact` = digest(id, NIK, contact_version, email, no_telp). Email berubah → link/proof otomatis tidak berlaku. |
| Aksi operator | `VERIFY_CONTACT`, `REBIND_CONTACT_MAKE`, `REBIND_CONTACT_CHECK` sudah ada di operator policy, **belum ada fiturnya**. |
| Sumber "kontak terverifikasi" | `pss_member_evidence` — masih fixture sintetis / label simulasi di replika. Belum ada sumber nyata. |

### 2.2 Data anggota (replika produksi `kkisi_staging`, anggota AKTIVE tanpa tgl_keluar)

| Ukuran | Jumlah |
|---|---|
| Anggota aktif | 5.055 |
| Email kosong | 4.247 (84 %) |
| Email sintaks tidak valid | 17 |
| **Email sintaks valid** | **791 (15,6 %)** — 747 di `gmail.com`, 19 `suzuki.co.id` |
| Email dipakai >1 anggota | 0 |
| Spasi di awal/akhir · huruf besar | 4 · 25 |
| Typo domain jelas (mis. `gmai.com`) | ≥ 2 |
| `users.email_verified_at` terisi (aplikasi mobile) | **0** dari 1.189; flag `is_email_verified=1`: 52 |

**Kesimpulan:** tidak ada satu pun email yang pernah diverifikasi kepemilikannya. Email bisa diubah oleh staf lewat CI2 (`anggota_c.php`) dan lewat writer KOSIPA Next (`kosipa-member-write.repository.ts`, yang juga mirror ke `users.email`). Jadi "email ada di master" **belum** memenuhi B-09 (kontak harus punya provenance yang bisa dipertanggungjawabkan, ≤ 180 hari).

## 3. Keputusan yang dibutuhkan

| ID | Pertanyaan | Opsi | Rekomendasi |
|---|---|---|---|
| **E-01** Kepercayaan email | Kapan email master boleh dipakai untuk OTP? | (a) langsung pakai email master apa adanya · (b) verifikasi kepemilikan sekali oleh staf (*assisted*) · (c) anggota konfirmasi sendiri lewat link email | **(b)** — staf memicu email kode verifikasi, anggota menyebutkan kode ke staf (tatap muka / telepon ke nomor terdaftar), staf memasukkan kode. Hasilnya tercatat siapa, kapan, metode apa. Berlaku 180 hari (B-09). (a) melanggar B-09; (c) membuktikan kepemilikan tetapi tidak membuktikan email itu milik anggota yang benar. |
| **E-02** Provider SMTP | Akun pengirim apa? | (a) akun SMTP lama di `db_sitesettings` · (b) Google Workspace / mailbox domain · (c) layanan transactional (Amazon SES, Brevo, Mailgun, dsb.) via SMTP | **(c)** dengan domain `kkisitb2.id`: SPF + DKIM + DMARC, bounce report, kuota jelas. 94 % penerima di Gmail; Gmail menolak / spam-kan pengirim tanpa SPF+DKIM+DMARC. (b) cukup untuk volume kecil bila DKIM aktif. (a) hanya bila terbukti mendukung TLS+DKIM; kredensialnya tidak boleh disalin dari tabel. |
| **E-03** Identitas pengirim | Alamat & nama pengirim | — | `KKISI TB2 <no-reply@kkisitb2.id>`, Reply-To ke email CS koperasi yang dipantau. |
| **E-04** Anggota tanpa email (84 %) | Apa yang terjadi saat issue link? | (a) tombol terbitkan diblokir + alasan jelas, staf input & verifikasi email dulu · (b) fallback otomatis ke kanal lain | **(a)** untuk fase ini. Tidak ada fallback diam-diam. Kanal WA/SMS = spec terpisah (D-PROVIDER). |
| **E-05** Tampilkan email tujuan ke anggota? | Sebelum/sesudah kirim | (a) tidak sama sekali · (b) versi tersamar setelah anggota menekan kirim | **(b)** `s*****o@gmail.com` — membantu anggota tahu inbox mana yang dicek, tanpa membuka alamat utuh. |
| **E-06** Email konfirmasi setelah submit | Kirim ke anggota? | ya / tidak; lampiran PDF? | Ya, **tanpa lampiran PDF** (PDF berisi tanda tangan & data finansial). Isi: nomor referensi, jenis simpanan, status "menunggu proses". |
| **E-07** Ganti email yang sudah terverifikasi | Perlu maker–checker? | single staff · maker–checker (`REBIND_CONTACT_MAKE/CHECK`) | Maker–checker — mengganti email = mengganti kanal otorisasi potongan gaji. |
| **E-08** Persetujuan pemrosesan data (UU PDP) | Perlu dicatat? | — | Catat persetujuan anggota bahwa email dipakai untuk verifikasi pengajuan, sebagai bagian dari langkah verifikasi E-01. |

## 4. Desain

### 4.1 Alur end-to-end

```
[Satu kali per anggota — konsol, staf]
 cari anggota → status email → "Verifikasi email" → sistem kirim KODE VERIFIKASI KONTAK
 → anggota sebutkan kode ke staf → staf input kode + metode atestasi → status TERVERIFIKASI (180 hari)

[Setiap pengajuan — publik, anggota]
 staf terbitkan link (hanya jika email TERVERIFIKASI & belum berubah)
 → link dibagikan ke anggota (mis. via WhatsApp)          ← kanal 1
 → anggota buka link → "Kirim kode verifikasi"
 → OTP dikirim ke email terverifikasi                      ← kanal 2
 → layar: "Kode dikirim ke s*****o@gmail.com, berlaku sampai 15.04 WIB"
 → input OTP → form → tanda tangan → submit
 → email konfirmasi (referensi, tanpa PDF) via outbox
```

Link (WhatsApp) dan OTP (email) lewat dua kanal berbeda: lebih kuat daripada link + OTP di kanal yang sama, tetapi tetap bukan MFA independen penuh bila HP yang sama membuka WA dan Gmail (§11 residual risk).

### 4.2 Status kontak email (ditampilkan di konsol)

| Status | Kondisi | Bisa terbitkan link? |
|---|---|---|
| `TIDAK_ADA` | email kosong | Tidak — "Lengkapi email anggota di data anggota" |
| `TIDAK_VALID` | sintaks salah / domain typo terdeteksi | Tidak — "Perbaiki email" |
| `BELUM_TERVERIFIKASI` | email valid, belum ada verifikasi | Tidak — tombol "Verifikasi email" |
| `TERVERIFIKASI` | verifikasi aktif, digest email sama, umur ≤ 180 hari | **Ya** |
| `KEDALUWARSA` | > 180 hari | Tidak — verifikasi ulang |
| `BERUBAH` | email master berubah sejak verifikasi | Tidak — verifikasi ulang (link aktif otomatis tidak berlaku, sudah ada lewat `boundContact`) |
| `BOUNCE` (fase 2) | provider melaporkan hard bounce | Tidak — perbaiki email |

### 4.3 Data (migration aditif `003_email_contact.sql`)

Tabel baru `pss_contact_verification`:

| Kolom | Isi |
|---|---|
| `id` CHAR(32) PK | |
| `member_id` BIGINT | FK logis ke `m_anggota.id` |
| `channel` | `'EMAIL'` |
| `destination_digest` CHAR(64) | HMAC email kanonik (alamat mentah tidak disalin) |
| `method` | `ASSISTED_IN_PERSON` / `ASSISTED_PHONE_CALLBACK` (daftar disetujui owner) |
| `attested_by` | console user id staf |
| `code_hash`, `code_expires_ms`, `attempts` | kode verifikasi kontak (6 digit, 10 menit, maks 5 percobaan) |
| `verified_ms`, `expires_ms` | `expires_ms = verified_ms + 180 hari` |
| `revoked_ms`, `revoked_reason` | dicabut karena rebind / bounce / manual |
| `consent_version` | versi teks persetujuan E-08 |

Perubahan lain:
- `pss_challenge` + `delivery_status` (`SENT` / `FAILED` / `UNCERTAIN`) dan `delivered_ms`.
- `pss_member_evidence.contact_version` / `contact_verified_ms` diturunkan dari verifikasi aktif terbaru (bukan fixture lagi). Untuk replika, label simulasi tetap dipisah.
- Indeks unik logis: satu `destination_digest` hanya boleh TERVERIFIKASI untuk satu anggota (saat ini 0 email dipakai bersama; aturan ini mencegah email keluarga dipakai dua anggota).

Production: migration hanya dijalankan manual lewat SQL yang direview (aturan proyek), tidak otomatis dari aplikasi.

### 4.4 Normalisasi alamat

- Kirim ke alamat kanonik: `trim()` lalu domain di-lowercase; bagian lokal dibiarkan.
- Validasi pakai regex `mailbox` yang sama dengan `smtp-provider.ts`; panjang ≤ 254.
- Daftar domain typo (`gmai.com`, `gmial.com`, `gamil.com`, `yaho.com`, …) → status `TIDAK_VALID` dengan saran ke staf; **tidak pernah dikoreksi otomatis**.
- Digest binding tetap dihitung dari nilai mentah di master, supaya setiap perubahan karakter terdeteksi sebagai `BERUBAH`.

### 4.5 Semantik pengiriman OTP (sesuai [11 §3](11_SECURITY_POLICY.md))

1. Cek kuota resend (sudah ada) + **plafon global** per jam per instalasi (baru, mis. 300/jam) untuk mencegah flood/biaya.
2. Buat challenge di transaksi pendek → commit → kirim dari memori di luar lock, timeout 5 s.
3. Hasil:
   - **Diterima SMTP** → `delivery_status=SENT`, respons 202 berisi `challengeRef`, `maskedDestination`, `expiresAt`, `retryAfterSeconds`.
   - **Gagal pasti** (koneksi ditolak, 5xx, recipient rejected) → challenge di-*supersede* (`used=2`), `FAILED`, respons 503 `DELIVERY_UNAVAILABLE`; link tetap ACTIVE; percobaan gagal ini **tidak** dihitung kuota resend anggota (tetap dihitung plafon global).
   - **Timeout / tidak pasti** → challenge dibiarkan sampai TTL, `UNCERTAIN`, respons 202 `deliveryPending:true`; anggota bisa minta ulang setelah cooldown 60 s.
4. Plaintext OTP **tidak pernah** masuk outbox, DB, log, atau audit. Tidak ada retry otomatis untuk OTP.
5. Audit: `OTP_DELIVERY_SENT|FAILED|UNCERTAIN` dengan kode provider aman saja.

### 4.6 Template email

OTP — subjek `Kode verifikasi pengajuan simpanan KKISI`:

```
Halo {Nama depan},

Kode verifikasi pengajuan {SIMPANAN WAJIB|SIMPANAN SUKARELA} Anda:

    123456

Berlaku sampai {07 Nov 2026 15.04 WIB} (5 menit).
Jangan berikan kode ini kepada siapa pun, termasuk petugas koperasi.
Jika Anda tidak sedang mengajukan perubahan potongan, abaikan email ini
dan hubungi koperasi di {kontak CS}.

KKISI TB2 — email otomatis, jangan dibalas.
```

Aturan: **tanpa link/tombol** di email OTP (anti-phishing; link aksi hanya datang dari staf); plain text + HTML sederhana tanpa gambar/tracking pixel; waktu dalam WIB; nama hanya nama depan; tanpa NIK atau nominal. Kode verifikasi kontak (E-01) memakai template serupa dengan kalimat "Sebutkan kode ini hanya kepada petugas koperasi yang sedang melayani Anda".

### 4.7 Konfigurasi & pengaman lingkungan

| Variabel | Fungsi |
|---|---|
| `PSS_DELIVERY_MODE` | `LOCAL_CAPTURE` (default) atau `SMTP`. Tidak ada fallback otomatis antar-mode. |
| `PSS_EMAIL_DELIVERY_AUTHORIZED=1` | Otorisasi terpisah dari konfigurasi teknis (sudah dipersyaratkan adapter). |
| `PSS_SMTP_HOST/PORT/TLS_MODE/USER/FROM/REPLY_TO` | Dari file secret 0600 / secret manager; password tidak di `.env` yang ter-commit. |
| `PSS_EMAIL_RECIPIENT_ALLOWLIST` | **Wajib** di `LOCAL_REPLICA_UAT`: hanya alamat penguji yang boleh menerima. Alamat di luar daftar → tolak kirim, tidak di-capture diam-diam. |

Pengaman:
- `LOCAL_SYNTHETIC` tetap hanya `@example.invalid` + capture.
- **Replika berisi email asli 791 anggota.** SMTP di replika hanya boleh dengan allowlist tidak kosong, supaya UAT tidak pernah mengirim ke anggota sungguhan.
- Mode produksi butuh adapter konfigurasi non-loopback yang terpisah (gate yang sudah tercatat di 20 §9), bukan pelonggaran `validateStagingConfig`.
- Kill switch: `PSS_DELIVERY_MODE=LOCAL_CAPTURE` atau `PSS_INTAKE_ENABLED=0`. Bila SMTP mati, OTP gagal tertutup dengan pesan jelas; tidak pindah ke capture.

### 4.8 UI

**Publik (`/simpanan-sukarela`):** setelah kirim, tampilkan email tersamar + jam berlaku WIB + tombol "Kirim ulang" dengan hitung mundur; status `deliveryPending` → "Pengiriman sedang diproses, cek folder Spam/Promosi"; 503 → "Email belum bisa dikirim, coba lagi beberapa saat atau hubungi koperasi". Banner simulasi replika tetap tampil di mode replika.

**Konsol (`/console/kosipa/simpanan-sukarela`):** kolom/label status email di hasil cari anggota; tombol "Verifikasi email" (dialog: pilih metode atestasi, kirim kode, input kode, centang persetujuan E-08); tombol "Terbitkan" non-aktif + alasan bila status bukan `TERVERIFIKASI`; riwayat verifikasi di audit. Mengikuti standar UI konsol yang ada (PageBreadcrumbs / ContextNotice / mform).

## 5. Rencana kerja

| Fase | Pemilik | Pekerjaan | Selesai bila |
|---|---|---|---|
| **P0 — Keputusan & infrastruktur** | Owner + infra | Putuskan E-01..E-08; siapkan akun SMTP; DNS SPF/DKIM/DMARC `kkisitb2.id`; daftar email penguji untuk allowlist; teks persetujuan E-08 | Keputusan tercatat di [13](13_DECISION_AND_BLOCKER_REGISTER.md); `dig` SPF/DKIM/DMARC lolos; kirim manual ke Gmail penguji: header `spf=pass dkim=pass dmarc=pass`, masuk Inbox |
| **P1 — Wiring SMTP** | Engineering | Factory provider berdasarkan `PSS_DELIVERY_MODE`; allowlist replika; normalisasi & masking; template WIB; `delivery_status` + migration 003 (bagian challenge); semantik SENT/FAILED/UNCERTAIN; plafon global; audit | Unit + integration hijau; OTP sungguhan diterima inbox penguji di replika; email non-allowlist ditolak |
| **P2 — Verifikasi kontak** | Engineering | `pss_contact_verification`; API + dialog konsol `VERIFY_CONTACT`; rebind maker–checker; turunkan `pss_member_evidence` dari verifikasi; blokir issue bila belum terverifikasi; status di konsol | Skenario §6 V-01..V-08 lulus di integration + browser |
| **P3 — Notifikasi pasca-submit** | Engineering | `NOTIFY_MEMBER` lewat SMTP dengan template E-06; `pss_notification_recipient` diisi alamat operasi nyata (D-NOTIFY) | Email konfirmasi diterima; outbox retry/dead-letter teruji |
| **P4 — UAT replika** | Owner + engineering | Jalankan U-01..U-10 dengan email penguji; ukur waktu kirim; cek Spam/Promosi; uji kegagalan SMTP | Laporan UAT tertanggal di [verification.md](verification.md) |
| **P5 — Siap produksi** (gate terpisah) | Owner + infra | Adapter deployment HTTPS; migration produksi manual & direview; monitoring; bounce webhook (status `BOUNCE`); pilot 20–50 anggota | Kriteria exit pilot terpenuhi; bukan bagian otorisasi dokumen ini |

Estimasi volume: < 5.055 anggota × (1 verifikasi kontak + ~2 email per pengajuan). Jauh di bawah kuota layanan transactional mana pun; plafon global tetap dipasang untuk insiden abuse.

## 6. Kriteria penerimaan & tes

| ID | Skenario | Jenis tes |
|---|---|---|
| E-T01 | OTP terkirim ke email terverifikasi; layar menampilkan email tersamar dan jam WIB | integration (SMTP loopback) + browser |
| E-T02 | Isi email: tanpa link, tanpa NIK/nominal, waktu WIB, subjek benar per jenis simpanan | unit template |
| E-T03 | SMTP menolak (5xx/connection refused) → 503, challenge di-supersede, link ACTIVE, kuota anggota tidak berkurang | integration dengan SMTP stub |
| E-T04 | SMTP timeout → 202 `deliveryPending`, challenge tetap valid sampai TTL, resend setelah cooldown | integration |
| E-T05 | OTP tidak muncul di DB, log server, audit, outbox, respons HTTP | scan + integration |
| E-T06 | Mode replika: alamat di luar allowlist ditolak; allowlist kosong → SMTP tidak bisa aktif | unit + integration |
| E-T07 | Plafon global per jam ditegakkan lintas link/anggota | integration |
| V-01 | Issue link diblokir untuk `TIDAK_ADA`/`TIDAK_VALID`/`BELUM_TERVERIFIKASI`/`KEDALUWARSA`/`BERUBAH` dengan alasan yang benar | integration + browser konsol |
| V-02 | Verifikasi kontak sukses mencatat staf, metode, waktu, consent; masa berlaku 180 hari | integration |
| V-03 | Kode verifikasi kontak: salah 5× → terkunci; kedaluwarsa 10 menit | integration |
| V-04 | Email diubah via CI2 / writer KOSIPA → status `BERUBAH`, link & proof aktif tidak berlaku | integration |
| V-05 | Email yang sama tidak bisa TERVERIFIKASI untuk dua anggota | integration |
| V-06 | Rebind email terverifikasi butuh maker ≠ checker | integration |
| V-07 | Kasir / role tanpa `VERIFY_CONTACT` tidak bisa verifikasi | HTTP + browser |
| V-08 | Domain typo terdeteksi, tidak dikoreksi otomatis | unit |
| R-01 | Regresi: Sukarela & Wajib end-to-end tetap lulus di mode capture (sintetis + replika) | suite yang ada |

## 7. Risiko & mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Email anggota dikuasai orang lain (keluarga, akun bersama, akun diretas) | Persetujuan potongan atas nama orang yang salah | E-01 atestasi staf + 180 hari + link di kanal terpisah; residual tercatat |
| Email masuk Spam/Promosi Gmail | Anggota tidak menerima OTP | SPF/DKIM/DMARC, pengirim transactional, tanpa link/gambar, instruksi cek Spam di layar |
| 84 % anggota belum punya email | Fitur hanya menjangkau sebagian kecil | Kampanye pengumpulan + verifikasi email lewat staf; kanal WA/SMS sebagai spec berikutnya |
| Kebocoran ke anggota sungguhan saat UAT | Insiden privasi | Allowlist wajib di replika, tes E-T06 |
| SMTP down | Pengajuan tertunda | Gagal tertutup + pesan jelas + monitoring rasio gagal; tidak ada fallback diam-diam |
| Kredensial SMTP bocor | Spoofing atas nama koperasi | Secret 0600 / secret manager, akun khusus fitur ini, rotasi, DMARC `p=quarantine` lalu `reject` |
| Biaya / flood | Tagihan, blacklist | Kuota per link/anggota (sudah ada) + plafon global + alert |

## 8. Pertanyaan terbuka untuk owner

1. Setuju E-01 (b) — verifikasi email dibantu staf sekali per 180 hari? Metode atestasi apa saja yang sah (tatap muka + KTP, telepon balik ke nomor terdaftar, lainnya)?
2. Provider mana (E-02)? Apakah koperasi sudah punya akses DNS `kkisitb2.id` dan akun email domain?
3. Alamat pengirim / Reply-To dan kontak CS yang dicantumkan di email (E-03)?
4. Untuk 84 % anggota tanpa email: kampanye pengumpulan email dulu, atau prioritaskan kanal WhatsApp sebagai spec berikutnya?
5. Email konfirmasi tanpa lampiran PDF (E-06) — setuju?
6. Siapa yang menjadi checker untuk penggantian email terverifikasi (E-07)?
7. Daftar email penguji untuk UAT replika (allowlist).
