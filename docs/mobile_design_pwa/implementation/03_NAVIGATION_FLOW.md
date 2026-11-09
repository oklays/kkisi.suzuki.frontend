# 03 — Navigation flow

Every mockup screen has one real URL. Tabs, filters, selected savings type, catalog search and SHU year are URL parameters, so refresh, deep links and the Android back button behave as expected.

## Routes

| Route | Mockup screen | Parent (Back) | Bottom nav | Notes |
|---|---|---|---|---|
| `/masuk` | Masuk | — | no | `?next=` deep link (same-site paths only), `?reason=` notices; signed-in visitors are redirected |
| `/pin` | PIN | `/masuk` (ends the half login) | no | only with a valid PIN-stage session (5 min) |
| `/` | — | — | — | redirects to `/beranda` |
| `/beranda` | Beranda | — | Beranda | `start_url` of the installed app |
| `/simpanan` | Simpanan | `/beranda` | Beranda | `?tab=kartu|setoran|potongan|penarikan`, `?jenis=`, `?sebelum=` (keyset paging) |
| `/pinjaman` | Pinjaman | `/beranda` | Beranda | `?tab=aktif|pengajuan`, `#rincian-angsuran` |
| `/pinjaman/ajukan` | Ajukan Pinjaman | `/pinjaman` | no (form footer) | |
| `/saldo` | Saldo Kredit Toko | `/beranda` | Saldo | |
| `/favorit` | Favorit | `/beranda` | Favorit | |
| `/transaksi` | Transaksi | `/beranda` | Transaksi | `?jenis=&status=&toko=&periode=` |
| `/lainnya` | Lainnya | `/beranda` | Lainnya | `?buka=profil|qr|alamat|keamanan|tiket|whatsapp|faq|tentang|pengaturan` opens a sheet |
| `/potongan` | Potongan | `/beranda` | Beranda | |
| `/potongan/ajukan` | Pengajuan Potongan | `/potongan` | no (form footer) | |
| `/shu` | SHU | `/beranda` | Beranda | `?tahun=` |
| `/belanja` | Belanja S-MART | `/beranda` | no (cart footer) | `?q=&kategori=&urut=&n=` |
| `/belanja/checkout` | Checkout Toko | `/belanja` | no (pay footer) | |
| `/layanan/{pulsa,token,paket-data,pascabayar,pdam,internet}` | service screens | `/beranda` | no | unknown id → 404 |
| `/layanan/checkout` | Checkout Layanan | `/beranda` | no | |

## Flow

```
/ ─▶ /beranda ──(no cookie)──▶ /masuk ──password ok──▶ /pin ──PIN ok──▶ next (default /beranda)
                                  ▲          │ wrong ×5 / expired          
                                  └──────────┘ (?reason=pin-locked|expired)

Beranda ─ Lihat rincian / Simpanan ─▶ /simpanan ─ Ajukan perubahan ─▶ /potongan/ajukan
        ─ Pinjaman / reminder ──────▶ /pinjaman ─ Ajukan pinjaman ──▶ /pinjaman/ajukan
        ─ Potongan ─────────────────▶ /potongan ─ Ajukan ───────────▶ /potongan/ajukan
        ─ SHU ──────────────────────▶ /shu
        ─ grid Token…Internet ──────▶ /layanan/{id}
        ─ Belanja / store card ─────▶ /belanja ─ Checkout ─▶ /belanja/checkout
        ─ QR ───────────────────────▶ /lainnya?buka=qr
        ─ bell / Lainnya tile ──────▶ sheets
Lainnya ─ Keluar ─▶ confirm ─▶ POST /api/auth/logout ─▶ /masuk?reason=logged-out
```

## Back behaviour

`BackButton` uses browser history when the member arrived through in-app navigation (a counter maintained by `RouteTracker`), otherwise it replaces the URL with the screen's logical parent — so a deep link or a cold start of the installed app never "backs" out of the app. Without JavaScript it is a plain link to the parent. Tab and filter switches use `router.replace`, so they do not pile up in history (same as the mockup's in-page tabs). On every screen change focus moves to the page title for screen readers.

## Protected-route handling

* No cookie → proxy redirect (pages) or 401 JSON (API).
* Cookie but invalid/expired/revoked session → `requireMember()` redirect to `/masuk?next=<path>`.
* PIN-stage session → only `/pin` is reachable.
* Deactivated or deleted account → session revoked on the next request.
