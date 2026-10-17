# Traceable Verification Plan — `unified-console-kosipa-warehouse`

Status 16 Okt 2026: **spesifikasi saja**. Belum ada task implementasi yang dijalankan. Tidak ada klaim lulus untuk kode yang belum ada.

## 1. Requirement Traceability Matrix

| Req ID | Description | Design Element | Task ID | Verification Method |
|---|---|---|---|---|
| `REQ-001` | DEFERRED: risiko dokumen cetak legacy | `SEC-001`, `SEC-002` | `TASK-001` | Padanan Next.js: route cetak terautentikasi + parameter terikat (`TASK-024`, `TASK-028`) |
| `REQ-002` | DEFERRED: risiko ekspor & API legacy Gudang | `REQ-053`, `SEC-005` | `TASK-002` | Padanan Next.js: ekspor streaming + scope dari sesi (`TASK-061`, `TASK-064`) |
| `REQ-003` | Snapshot objek skema | `legacy-schema-objects-readonly.sql` | `TASK-003` | Jumlah objek = `information_schema`. ANO-K07/X01 diperbarui |
| `REQ-010` | `/console` authenticated-only | §7 `requireConsoleSession` | `TASK-011` | Route test: anonim, tanpa `sales_add`, store error |
| `REQ-011` | Registry + resolver | §3 | `TASK-010`, `TASK-011` | Unit pemetaan slug. Spy jumlah query ≤ 3 |
| `REQ-012` | Sidebar seksi + readiness | §3 `NavItem`, §8 | `TASK-010`, `TASK-012`, `TASK-030` | e2e persona: item `planned` bukan link, seksi kosong tersembunyi |
| `REQ-013` | Kartu modul jujur | §8 dashboard | `TASK-012`, `TASK-030` | e2e: tidak ada angka tanpa query terverifikasi |
| `REQ-014` | Landing pasca-login | §3 landing | `TASK-013` | Unit `redirect.ts` + e2e loop |
| `REQ-015` | Kontrak TOKO tetap | §1 compat | `TASK-014` | Snapshot API sebelum/sesudah. Regression POS staging |
| `REQ-016` | Responsif/a11y + POS focused | §8 | `TASK-012` | Playwright 5 viewport, axe-core, keyboard |
| `REQ-017` | Flag & rollback | §9 | `TASK-014`, `TASK-090` | Flag off → 404 + landing lama. Rehearsal rollback |
| `REQ-020` | Identity link | §2 `console_identity_link` | `TASK-020`, `TASK-022` | Unique aktif. User nonaktif ditolak. Audit |
| `REQ-021` | Capability KOSIPA per aksi | §3 tabel pemetaan | `TASK-022` | Property test capability ⊆ akses legacy |
| `REQ-022` | Anggota & 360 | §6 members API | `TASK-021`, `TASK-024` | e2e masking + capability per tab. p95 |
| `REQ-023` | Ledger & saldo simpanan | §4 saldo | `TASK-023`, `TASK-025` | Parity ≥ 50×3×2 sampel. **Status 17 Okt 2026 (sisi baca):** buku simpanan terverifikasi di fixture sintetis; tanpa saldo resmi (BLOCKED TASK-003); parity belum |
| `REQ-024` | Pinjaman read | §6 loans API | `TASK-026` | Detail/jadwal vs legacy staging. **Status 17 Okt 2026:** terverifikasi di fixture sintetis dan smoke baca-saja pada salinan lokal; saldo resmi tidak ditampilkan (BLOCKED TASK-003); belum parity vs view legacy |
| `REQ-025` | Payroll read + rekonsiliasi | §6 reconciliation | `TASK-027` | Periode `POT202609…`: selisih = NIK dengan retur. **Status 17 Okt 2026:** terverifikasi di fixture sintetis (selisih = NIK dengan retur yang tidak dipotong; cabang tak terpetakan dan anggota tanpa baris payroll dilaporkan); belum diterima di staging (butuh konfirmasi pemilik data atas peta kolom TOKO_*) |
| `REQ-026` | Laporan KOSIPA | §6 ekspor | `TASK-028` | Parity total per laporan. Ekspor tanpa file disk. **Status 17 Okt 2026:** laporan pinjaman, payroll dan kualitas data (baca saja) terverifikasi di fixture sintetis + UAT terintegrasi; ekspor dan parity belum |
| `REQ-027` | Parity harness | §4 parity | `TASK-004`, `TASK-025`, `TASK-029` | Laporan harness. Gate blocked bila mismatch |
| `REQ-030` | Originasi pinjaman | §4 Flat/Anuitas | `TASK-026`, `TASK-043` | Property Σpokok. `m_anggota.gaji` tak berubah |
| `REQ-031` | State machine | §5 | `TASK-040`, `TASK-043`, `TASK-044` | Tabel transisi, maker-checker, idempotency |
| `REQ-032` | Penarikan saldo server | §4 saldo | `TASK-044` | Uji paralel: hanya satu lolos |
| `REQ-033` | Settlement payroll terbatas | §4 settlement | `TASK-045` | Fixture dua group. Reverse persis |
| `REQ-034` | Kewajiban toko bersih retur | §4 store-credit | `TASK-023`, `TASK-027`, `TASK-045` | Fixture retur lintas bulan. Generator pengganti vs output procedure di staging |
| `REQ-035` | Penomoran dokumen | §2.1 | `TASK-041` | 50 alokasi paralel unik |
| `REQ-036` | Jurnal seimbang | §4 jurnal | `TASK-042`, `TASK-044` | Unit balance. Rollback atomik |
| `REQ-037` | SHU | §4 SHU | `TASK-046` | Property Σ = pool. Total nol ditolak |
| `REQ-038` | Limit kredit | §6 | `TASK-047` | Dry-run diff. POS membaca limit baru |
| `REQ-039` | Pengajuan mobile | §5 | `TASK-048` | Atomisitas dokumen + status pengajuan |
| `REQ-040` | Status anggota & token | §4, BR-012 | `TASK-047` | Token dicabut by `user_id`. Read path tidak menulis |
| `REQ-041` | Master KOSIPA & anggota | §1.1 ownership | `TASK-047`, `TASK-049` | Deaktivasi, bukan delete |
| `REQ-042` | IAM console | §7 | `TASK-022`, `TASK-049` | Audit tiap perubahan |
| `REQ-050` | Reader Gudang | §7 guard `gudang` | `TASK-060`, `TASK-061` | Guard DB. Stok cocok laporan Gudang |
| `REQ-051` | Pemetaan barang | §2 `warehouse_item_map` | `TASK-062` | Saran barcode/kode + konfirmasi |
| `REQ-052` | Penerimaan toko dari Gudang | §2 konsistensi lintas DB, §6 | `TASK-063` | 409 ganda. Kompensasi fault-injection |
| `REQ-053` | Ekspor invoice terautentikasi | §6 ekspor | `TASK-061` | Tidak ada file di disk |
| `REQ-054` | Model stok Warehouse terpisah | §1.1 | `TASK-060` | Review kode: tidak ada write ke `smart_kopkar` dari modul warehouse stok |
| `REQ-051`/`REQ-052` (domain+application part) | Pemetaan & penerimaan: aturan murni dan use case | §10b | `TASK-062`, `TASK-063` | **VERIFIED (unit + in-memory)**: `warehouse.test.mjs` 22, `warehouse-use-cases.test.mjs` 15, mutation checks. Adapter/penyimpanan/UI belum |
| `REQ-055` | Writer Gudang bertahap | §4 totals | `TASK-064` | Total domain vs dokumen. Scope dari sesi |
| `REQ-060` | Pembelian TOKO | §1.1 | `TASK-065` | Received tak dapat dihapus. Uji lock order |
| `REQ-061` | Supplier/customer + pembayaran | — | `TASK-066` | Ledger due, overpayment ditolak |
| `REQ-062` | Biaya | — | `TASK-066` | Scope cabang + kategori wajib |
| `REQ-063` | Laporan TOKO | — | `TASK-067` | Parity total per laporan |
| `REQ-064` | Dashboard supervisor | §8 | `TASK-067` | "tidak tersedia" saat gagal |
| `REQ-065` | Master & IAM TOKO | §1.1 | `TASK-068` | Single writer. Menu KOSIPA master TOKO nonaktif |
| `REQ-066` | Impor CSV | — | `TASK-068` | Dry-run, atomik |
| `REQ-067` | PPOB & pesanan mobile | — | `TASK-080` | Spesifikasi terpisah |
| `REQ-068` | Sisa fungsi TOKO | — | `TASK-068` | Void/retur, bukan edit/hapus |
| `REQ-069` | Daftar retirement | `endpoint-inventory.md` | `TASK-069` | Setiap RETIRE beralasan |
| `REQ-070` | KPI lintas modul | — | `TASK-081` | Sign-off finance |
| `REQ-071` | PWA anggota | — | `TASK-082` | Spesifikasi terpisah |
| `BR-001` | Single writer | §1.1 | `TASK-005`, `TASK-043`…`TASK-068` | Matriks ownership + menu PHP dinonaktifkan sebelum flag |
| `BR-003`/`BR-004` | Integer money, Σpokok | §4 | `TASK-023`, `TASK-026` | Property test |
| `BR-005` | Rasio gaji | §4 | `TASK-043` | Keputusan owner tercatat + test |
| `BR-007` | Saldo tersedia | §4 | `TASK-044` | Uji paralel |
| `BR-008`/`BR-009` | Maker-checker, immutability | §5 | `TASK-040` | Test transisi |
| `BR-011` | Retur Kredit | §4 | `TASK-045` | Fixture |
| `BR-012` | Kontrak kedaluwarsa | §4 | `TASK-047` | Keputusan owner + test |
| `BR-013` | Penerimaan sekali | §2 | `TASK-063` | 409 ganda |
| `SEC-001`…`SEC-007` | Auth, query terparameter, capability, md5, Gudang reader, PII, CSRF | §7 | `TASK-001`, `TASK-011`, `TASK-021`, `TASK-022`, `TASK-024`, `TASK-028`, `TASK-060` | Test otorisasi negatif per handler + lint aturan `no-raw-sql-concat` |
| `NFR-001`…`NFR-006` | Query budget, pool, p95, determinisme, a11y, POS | §3, §7 | `TASK-010`…`TASK-014`, `TASK-021`, `TASK-024` | Spy query, guard test, pengukuran staging, Playwright/axe |
| `OBS-001`…`OBS-003` | Log, audit, parity report | §2 audit | `TASK-011`, `TASK-020`, `TASK-029` | Event tercatat tanpa PII |
| `MIG-001`…`MIG-005` | Staging, gate writer, DDL auth-only, procedure tidak diubah, tanpa backfill | §2, §9 | `TASK-003`, `TASK-004`, `TASK-020`, `TASK-045`, `TASK-090` | Checklist gate + sign-off |
| `VAL-001`…`VAL-006` | Validasi input | §3, §6 | `TASK-013`, `TASK-026`, `TASK-028`, `TASK-040`, `TASK-047` | Unit test batas |

## 2. Automated Test Commands

```bash
# dari root repo
pnpm install --frozen-lockfile
pnpm db:generate
pnpm lint
pnpm typecheck
pnpm test                 # unit domain/application/web (tanpa DB)
pnpm build

# opt-in (staging lokal kkisi-staging, tidak pernah produksi)
pnpm --filter @koperasi/web test:browser
pnpm --filter @koperasi/web exec node --experimental-strip-types scripts/kosipa-parity.ts --sample 50   # setelah TASK-029

# validasi traceability spesifikasi
.agents/skills/brownfield-spec-engineer/scripts/validate-spec-coverage.sh docs/superpowers/specs/unified-console-kosipa-warehouse
```

## 3. Manual Verification & Smoke Test Protocol

1. **Staging (`kkisi-staging`)**: restore dump + objek skema S0 (`TASK-004`). Pastikan view KOSIPA bukan stub.
2. **Persona matrix (P0):** kasir (`sales_add`), supervisor (`sales_view`, `items_*`, `inventory_*`), viewer tanpa checkout, admin cabang (role ≤ 2, ganti cabang), user tanpa izin, user/role/cabang nonaktif. Setiap persona: menu, deep-link langsung, API langsung.
3. **POS regression:** Cash, QRIS, Kredit (limit cukup/kurang, kontrak kedaluwarsa), idempotent retry, buka/tutup register, struk, riwayat, retur, produk tambah/edit, SO draft/count/approve/cancel. Bandingkan dengan baseline sebelum console.
4. **KOSIPA parity (P1-R):** sampel anggota lintas group/status, 2 tahun simpanan, semua jenis pinjaman, 2 periode payroll, 14 laporan.
5. **Writer gate (P1-W/P2-W, per konteks):** ownership + grant review-only diterapkan operator, menu PHP setara dinonaktifkan, UAT operator, rekonsiliasi finance, rehearsal rollback. Tanpa salah satu → flag tetap off.
6. **Rollback:** flag off → perilaku lama. Untuk writer: dokumen Next.js terbaca di PHP.

## 4. Gate & status saat ini

| Gate | Status | Bukti |
|---|---|---|
| Source KOSIPA tersedia | ✅ Terbaca read-only di server | `current-state.md` §2, `endpoint-inventory.md` |
| Source Gudang tersedia | ✅ Terbaca read-only di server | `current-state.md` §3 |
| Skema `smart_kopkar` tabel | ✅ DDL 283 tabel (dump 30 Sep) | dump lokal |
| Definisi view/procedure | ❌ Tidak ada di dump | `TASK-003` |
| Skema `smart_kopkar_gudang` | ❌ Belum didapat | `TASK-003` |
| Hotfix S0 | ⏸ DEFERRED (owner: legacy tidak diubah) | `TASK-001`, `TASK-002` |
| Kode P0 | ❌ Belum dimulai | `TASK-010`… |
| Keputusan owner: BR-005, BR-007, BR-012 | ❌ Terbuka | `requirements.md` |

## 5. Bukti audit yang dijalankan (16 Okt 2026)

Semua read-only: `uapi DomainInfo domains_data`, `uapi Mysql list_databases` (nama/ukuran), `ls`/`grep`/`awk`/`sed -n` pada `public_html/{kosipa,gudang}`, `md5sum` file PHP Gudang vs salinan TOKO lokal, ekstraksi DDL (tanpa baris data, kecuali nama `db_company`/`db_suppliers` untuk topologi) dari `apps/web/staging/kkisi_full_dump.sql.gz`. Tidak membuka `config/database.php`, `.env`, atau file kredensial. Tidak mengirim request ke endpoint aplikasi. Tidak mengunduh file invoice.
