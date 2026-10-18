# PRD — KKISI TB2 Unified Management Console

| Atribut | Nilai |
|---|---|
| Document ID | PRD-KKISI-UC-001 |
| Status | Draft v1.0 — siap untuk review & breakdown engineering; **bukan izin langsung mengubah produksi** |
| Disusun | 16 Oktober 2026 (Asia/Jakarta) |
| Product | KKISI TB2 — Koperasi Karyawan PT Indomobil Suzuki International |
| Existing application | [oklays/kkisi.suzuki.frontend](https://github.com/oklays/kkisi.suzuki.frontend) |
| Snapshot referensi | `master` — `502b237cc3c3955ade6cf924e1ecae6591090042` (commit terakhir teramati 13 Oktober 2026) |
| Konteks pengguna | TOKO telah direvamp menggunakan Next.js dan menjadi modul operasional awal; KOSIPA dan Warehouse Management masih akan diintegrasikan |
| Related baseline | `BASELINE_KKISI_Current_State_and_Migration_Readiness.md` |

> **Konvensi fakta:** *Existing (code)* = terlihat pada source di commit snapshot; *Reported operational* = status dari user/dokumentasi deployment, belum diuji live oleh penulis; *Proposed* = requirement target. Dokumen historis yang belum diperbarui tidak dijadikan bukti bahwa fitur yang sudah ada kini belum diimplementasikan.

## 1. Executive summary

Satukan tiga pengalaman administrasi web Koperasi Suzuki—**KOSIPA**, **TOKO/TOKONEW**, dan **Warehouse Management**—menjadi satu **management console** dengan satu entry point, satu sesi autentikasi bagi console, satu navigasi berbasis izin, dan satu pola desain. Integrasi dilakukan **bertahap**, bukan dengan rewrite TOKO atau migrasi database secara serentak.

Rekomendasi UX: **Unified Dashboard + Section-Based Sidebar**. Dashboard menyediakan tiga shortcut modul untuk discovery; sidebar menyediakan akses langsung ke halaman lintas domain. Jika jumlah menu nanti besar, module switcher kontekstual dapat ditambahkan tanpa mengubah URL dan model izin. Tombol modul **bukan** gerbang wajib sebelum mengakses fitur.

**Prinsip produk:** preserve-first untuk TOKO; permission-first untuk navigation; branch-scoped data; honest feature availability; backward-compatible routing; single-writer per business context; release dengan feature flag dan rollback yang dapat diuji.

## 2. Problem statement

- Existing operasional secara historis tersebar di aplikasi/subdomain KOSIPA, TOKONEW, dan Warehouse Management; perpindahan memerlukan konteks navigasi berbeda dan cenderung membingungkan.
- Revamp Next.js sudah memberikan pondasi TOKO yang berfungsi (POS, sales, return, products, master warehouse, stock opname), tetapi landing dan `/login` belum diikuti dashboard console terintegrasi. Sidebar saat ini adalah `PosShell`, berorientasi TOKO dan menampilkan item dashboard/laporan yang masih disabled.
- Integrasi lintas aplikasi menghadapi perbedaan kewenangan, ownership data, ketergantungan kredit anggota/payroll, serta bahaya dual-write antara PHP legacy dan Next.js.
- KOSIPA dan aplikasi Warehouse Management **sebagai aplikasi penuh** belum memiliki modul Next.js yang dapat diverifikasi di repo yang diperiksa. Inventarisasi keduanya harus dimulai dari bukti/dokumen sumber terkait, **bukan** asumsi bahwa fitur Toko inventory setara Warehouse Management penuh.

## 3. Goals, outcomes, metrics

| ID | Product goal | Indikator penerimaan yang diusulkan |
|---|---|---|
| G1 | Satu pengalaman console untuk tiga domain | Satu akses Console dari landing menuju login dan workspace terproteksi; identitas, cabang, navigasi konsisten |
| G2 | Menjaga seluruh alur TOKO aktif | Regression POS, register, produk, penjualan, retur, stock opname lulus pada staging/UAT; tidak ada penurunan correctness akibat shell baru |
| G3 | Navigasi jelas sesuai peran | User hanya melihat menu dengan izin; deep-link tanpa izin tetap ditolak server-side |
| G4 | Perpindahan lintas modul efisien | Dari workspace, halaman domain yang diizinkan dapat dicapai langsung; tidak harus kembali ke hub modul |
| G5 | Menyediakan fondasi integrasi KOSIPA/Warehouse | Contract, boundary, ownership map dan migration gate disetujui sebelum membuka fitur write baru |
| G6 | Transparansi status pengembangan | Menu belum siap tidak terlihat sebagai fitur operasional; dashboard tidak menampilkan angka placeholder sebagai data nyata |

**Metric pasca-release (target awal untuk disepakati, belum baseline terukur):** task success rate >=95% untuk menemukan 5 navigasi utama; 0 cross-branch data leaks pada acceptance suite; 0 regression kritis untuk operasi TOKO; 100% menu menggunakan capability resolver terpusat; 0 aktivasi writer baru sebelum single-writer gate. Ukur task completion/p95 navigasi dengan data nyata saat pilot, jangan mengklaim metrik kinerja tanpa pengukuran.

## 4. Personas dan access model

| Persona | Kebutuhan | Landing destination setelah login (proposed) |
|---|---|---|
| Super Admin / Manajemen | Overview, lintas toko/cabang, akses domain sesuai izin, konfigurasi | `/console` |
| Supervisor TOKO | Operasional toko, audit transaksi, produk, retur, inventori | `/console` atau last permitted module |
| Kasir | Checkout cepat dan status register | `/pos` (focused mode) |
| Staff Gudang | Dokumen inventory dan nanti proses warehouse lengkap | `/console/warehouse` setelah tersedia, atau `/inventory` saat izin sesuai |
| Petugas KOSIPA | Aktivitas simpanan/pinjaman/anggota sesuai izin | `/console/kosipa` **hanya setelah modul aman tersedia** |
| Anggota koperasi | PWA anggota, **bukan** console staff | `/anggota` saat ini coming soon; flow autentikasi anggota nanti terpisah |

Role names di atas adalah persona, **bukan** pemetaan otomatis ke `role_id`. Otorisasi existing berasal dari permission slug dan company scope. Jangan menyimpulkan akses dari label peran di UI.

## 5. Scope dan release slicing

### P0 — Unified Console Foundation (target implementasi terdekat)

**In scope:**

1. Protected `/console` sebagai dashboard shell dengan genuine user/branch context, loading/empty/error states.
2. Sidebar section-based: Dashboard; **KOSIPA**; **TOKO & POS**; **WAREHOUSE**; Reports (hanya jika ada capability valid); System (hanya jika valid). Munculkan item berdasarkan capability dan readiness, bukan hanya teks kategori.
3. Tiga module shortcut cards; TOKO membuka current routes; KOSIPA/Warehouse full-module menampilkan status rencana secara jujur atau tidak tersedia untuk non-admin. **Jangan** jadikan cards wajib dilewati.
4. Central navigation registry (typed route, section, permission, module status, ordering, icon, landing/preserved URL) dan satu backend-side capability resolver.
5. Responsive accessible application shell, breadcrumbs/title, active state, branch context, user menu, logout, keyboard navigation.
6. Login landing ke `/console` untuk permitted general staff, dengan exception kasir/focused workflows dan deep-link aman; preserve existing `/pos`, `/sales`, `/products`, `/inventory` tanpa redirect-breaking.
7. Role + branch UAT matrix, smoke/regression suite untuk TOKO, rollback plan dan instrumentasi minimal navigasi/errors.

**Out of scope P0:** Business logic KOSIPA, transfer antargudang, purchasing penuh, kredit/payroll changes, schema migrations, database merge, cross-system financial KPI produksi, PWA Anggota, rebranding source secara massal, autentikasi baru, permission schema rewrite.

### P1 — KOSIPA integration discovery & read-first onboarding

- Inventarisasi aplikasi KOSIPA legacy secara terbatas dan bukti sumbernya (repo, API, skema, menu, pemilik data, dependencies, integrasi payroll/anggota).
- Definisikan bounded context seperti Keanggotaan, Simpanan, Pinjaman, Angsuran, Administrasi KOSIPA **sebagai hipotesis** sampai terkonfirmasi.
- Read-only module dashboard dan navigasi berdasar permission yang **terbukti**; kelola ownership serta konsistensi identitas dan company scope.
- Implementasi write hanya setelah independent parity, UAT, finance reconciliation, per-context cutover, rollback gate.

### P2 — Warehouse Management integration

- Audit terbatas ke aplikasi Warehouse Management yang berdiri sendiri; bedakan dari existing `db_warehouse` (master global) dan `/inventory` (stock opname) di TOKO.
- Susun domain transfer stok, penerimaan barang, purchase/supplier, adjustment, lokasi/balance, audit ledger **hanya setelah bukti skema/workflow tersedia**.
- Onboard read flow lebih dulu; enable write per bounded context dengan single-writer kontrol.

### P3 — Cross-module insight & PWA

- KPI lintas domain setelah definisi data dan kontrak numerik disetujui (as-of time, branch/period, rounding, returns, payroll); nilai unavailable/partial harus ditandai, tidak disamakan dengan nol.
- Member PWA tetap proyek experience tersendiri dengan authentication/authorization sendiri; reuse domain/API yang aman, bukan reuse cookie staff secara otomatis.

## 6. Information architecture (proposed)

```text
/                           Landing publik: Console | Aplikasi Anggota
/login                      Existing console login (preserve)
/console                    New unified dashboard (protected)
/console/kosipa             Future KOSIPA domain entry (gated)
/console/warehouse          Future full Warehouse domain entry (gated)
/console/reports            Future integrated reports (gated)
/console/settings           Future management configuration (gated)

# Operational routes to preserve in P0 — NOT moved in P0
/pos                        Existing POS/Kasir
/products                   Existing product management
/sales                      Existing sales history
/sales/returns              Existing returns
/inventory                  Existing global warehouse master + stock opname
/anggota                    Existing member coming-soon page

# Existing /api/auth/*, /api/pos/*, /api/products/*,
# /api/sales/*, /api/inventory/* paths and contracts remain unchanged.
```

**Route strategy:** Introduce `/console` and shell without immediately nesting/moving TOKO URLs. A compatibility/alias strategy (`/console/toko/...`) may be evaluated later, only with route contract tests, link migration and safe redirects. Treat `console` as presentation/orchestration layer; do not relocate POS business code simply to match URL hierarchy.

## 7. UX specification

### 7.1 Shell and dashboard

- Console sidebar fixed/collapsible desktop; scrollable groups; role-filtered nav; current selection/active ancestor visible; branch selector only for authorized switchers.
- Header provides page title, breadcrumbs where useful, active cabang, user profile/logout. Never imply that branch selection changes every external system until adapter behavior is verified.
- Dashboard shows greeting, module shortcut cards (KOSIPA, TOKO, Warehouse), operations summary **only with genuine read permission and verified aggregations**, recent activity where available, system notices.
- Card labels distinguish `Available`, `Read-only`, `Coming soon`, `Restricted` as needed; never use fake data. Unauthorized content should normally be hidden, not disabled.
- For cashiers, `POS focused mode` preserves the current efficient POS UI and register control. A global console sidebar should not reduce checkout usable area.
- At viewport <= 767 px, use drawer navigation with overlay, close on navigation/Escape, retained focus and skip link. Use touch targets >=44 px where practical; responsive sections with no horizontal overflow.

### 7.2 Section ordering (adjust by permission)

```text
Dashboard

KOSIPA                            [only ready + authorized items]
  Anggota / Simpanan / Pinjaman    [future; names to validate]

TOKO & POS
  POS / Kasir                    -> /pos              (sales_add)
  Riwayat Transaksi             -> /sales            (sales_view)
  Retur Penjualan               -> /sales/returns    (sales_view + return permission)
  Produk & Inventory            -> /products         (items_view)

WAREHOUSE
  Warehouse & Stock Opname       -> /inventory        (existing scoped permissions)
  Transfer Stok, etc.           [future, not clickable before shipped]

LAPORAN TERINTEGRASI             [future; source and permissions TBD]
PENGATURAN                      [future; source and permissions TBD]
```

**Naming caveat:** Existing `/inventory` is part of completed TOKO revamp but may live visually under Warehouse. Do not misrepresent that UI as completion of the separate legacy Warehouse Management system. Navigation section is product IA, not a claim of bounded-context ownership.

## 8. Functional requirements

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-01 | Must | Unified authenticated dashboard at `/console` | Anonymous redirected to login with safe `next`; authenticated users with no `sales_add` but other permitted functions are not excluded from console |
| FR-02 | Must | Centralized menu registry and capability resolver | One server-authoritative capability response per request context; UI hides inaccessible nav; server endpoints still check permission independently |
| FR-03 | Must | Branch-aware user context | Branch displayed from validated session; no user-controlled `company_id` as trust source; switch restricted per current policy |
| FR-04 | Must | Preserve TOKO routes and API contracts | All existing URLs, checkout idempotency, payment handling, register lifecycle, returns, product and stock flows pass regression |
| FR-05 | Must | Dashboard three module shortcuts | TOKO works; KOSIPA/full Warehouse do not navigate to broken/unauthorized screens; readiness clearly communicated |
| FR-06 | Must | Safe login routing | Same-site `next` only; safe fallback for console/role; cashiers still have minimal-step `/pos` access; no redirect loop |
| FR-07 | Must | Accessible/responsive navigation | Keyboard accessible; meaningful ARIA current-state; focus states; tested at 375/390/768/1024/1440 widths |
| FR-08 | Must | Explicit loading/error/empty states | No fake zero; backend unavailable shown distinctly; protected business figures not rendered prior to authorization |
| FR-09 | Must | Security and operational non-regression | No new broad DB grants, secrets, write APIs, schema changes; failed permission/branch tests return fail-closed |
| FR-10 | Must | Rollout and rollback | Feature flag/safe release; previous TOKO path remains accessible; rollback tested without data migration |
| FR-11 | Should | Last-permitted-destination or favorites | Remember only UI-level preference after permission revalidation; safe default `/console` or `/pos` |
| FR-12 | Should | Navigation analytics and support logs | Non-PII events for nav/menu loading/error, latency; avoid logging credentials/member financial data |
| FR-13 | Future | KOSIPA capability adapters | Approved permission and data-ownership contract; independent behavior parity/UAT gate |
| FR-14 | Future | Full Warehouse capability adapters | Existing `db_warehouse`/SO not assumed to implement location-level warehouse stock; no extra writes before ownership approval |
| FR-15 | Future | Integrated KPI and reporting | Data source/aggregation/cadence/freshness, branch scope and numeric reconciliation all verified |

## 9. Authorization and security design

**Existing in repo (do not rewrite in P0):** session/CSRF/password flows under `apps/web/src/infrastructure/auth`, use cases in `packages/application/src/auth`, pure policy under `packages/domain/src/auth`, and `requirePagePermission` gate. Auth validates session against existing user/role/branch/permissions; actual POS page currently requires `sales_add`.

**New requirement:** a reusable **authenticated console guard without mandatory TOKO sales permission**, plus `resolveConsoleCapabilities(ctx)` checking existing permission slugs, branch scope and module readiness. Avoid duplicating auth lookups per sidebar item when unnecessary. Query scope always from validated `ctx.companyId`. An allowed nav entry **never** substitutes for API/page authorization.

Existing slugs observed: `sales_add`, `sales_view`, `sales_payment_view`, `sales_return_view`, `sales_return_add`, `items_view`, `items_add`, `items_edit`, `inventory_so`, `inventory_view`, `inventory_stock`. Verify coverage, including pages requiring compound conditions, against actual server handlers before freezing capability mappings. **Do not invent or provision KOSIPA/Warehouse slugs** until those applications and identity relationships are audited.

Guardrails: no new login database/session rewrite; fail-closed permission checks; SameSite/HttpOnly secure cookie policy retained; CSRF for state changes; open-redirect protection; secrets never committed; privilege minimization; audit trails for financial/state changes; safe errors; separation of staff console and future member authentication.

## 10. Architectural baseline and target boundaries

```text
apps/web
  Next.js 16 App Router: routes, layouts, UI, infrastructure, API handlers
  proposed: console layout + nav registry + capability resolver
     │
     ├── packages/application  (use cases/ports; no Next/React/Prisma)
     └── packages/domain       (pure financial/domain policies)

Persistence in apps/web/infrastructure -> existing MariaDB business DB
                                      -> separate auth schema for sessions
Legacy PHP remains live during controlled migration.
```

Preserve `pnpm` workspace and existing code ownership. Prefer a thin new UI shell that composes existing TOKO screens rather than genericizing `PosShell` and changing every feature in one PR. Existing screen styling can migrate gradually; first stage may wrap only `/console` and share navigation primitives by composition.

For KOSIPA and full Warehouse, choose adapter interfaces only after business workflows, tables, external writers, permissions and API capabilities are verified. Modular monolith at the user-facing app layer is recommended, but data backends may remain separate during migration. **One UI does not require one database.**

## 11. Database ownership, operational safety, cutover

- TOKO currently accesses production MariaDB on Niagahoster from DEV host via encrypted tunnel, per deployment handover. Existing app uses distinct readers/auth and gated writers. Leave connection topology untouched for P0.
- `docs/migration/DATA_OWNERSHIP.md`: multiple readers acceptable; **dual-writer for the same transactional context is forbidden**. The original matrix predates later deployment changes; current live ownership must be reconciled with the newest handover and an owner-confirmed audit before future cutovers.
- The 13 Oct deployment handover states PHP POS remains capable of writing while Next.js writers are enabled; an operating rule restricts each branch/cashier to one app. This is a **residual concurrency risk**, not proof of technical single-writer enforcement. Record it as a release risk, especially for invoice numbering, stock and cash reconciliation.
- No schema changes or writer enablement in P0. New KOSIPA/Warehouse flows require explicit ownership matrix (table/field/context/branch), lock order, rollback, backup restore, parity test, and operator UAT.
- Credit returns/payroll require reconciliation with the separate payroll deduction generator; the repository documents this integration as external.

## 12. Non-functional requirements

| Dimension | P0 acceptance |
|---|---|
| Reliability | Console degrades gracefully if KPI readers fail; no impact on checkout path |
| Correctness | Exact stored financial amounts, branch scope, payments Cash/QRIS/Kredit, return and stock behaviors unchanged |
| Performance | Avoid expensive cross-domain queries during login or first render; profile p95 on production-like data before setting SLA |
| Accessibility | Semantic nav, keyboard/focus, contrast, responsive no overflow, screen-reader names |
| Security | Server authorization, safe redirect, CSRF, no credentials in repo, production config unchanged |
| Observability | Structured non-PII logs for auth/permission/nav resolution failures; health check retains existing behavior |
| Maintainability | Typed nav registry, permission tests, no duplicate hardcoded menu across pages |
| Deployment | Existing `genesis.web` pipeline and rollback rules preserved; no unapproved prod write or infra changes |

## 13. Rollout plan and milestones

| Milestone | Target deliverable | Gate to proceed |
|---|---|---|
| M0 — Baseline freeze | Snapshot source/progress, permission matrix, route & regression inventory | Baseline signed by owner; top P0 risks explicitly accepted/remediated |
| M1 — Navigation contract | ADR: dashboard vs sidebar IA, `NavigationItem` registry, capability API/guard tests | Authoritative branch/permission semantics reviewed |
| M2 — Console shell | `/console`, header/sidebar/cards, responsive, graceful states | Screenshots/UAT for supervisor, cashier, branch admin, no-access staff |
| M3 — TOKO coexistence | Links to existing pages; login safe routing/focused POS; zero-breakage smoke | Full TOKO regression incl Cash/QRIS/Kredit, register, returns, stock opname |
| M4 — Pilot / release | Feature flag, rollout to controlled users, analytics, rollback rehearsal | Release owner sign-off; no regression / no route auth bypass |
| M5 — KOSIPA read-first | Separate approved inventory/contract, read routes | Data ownership, perms, parity, operational UAT |
| M6 — Warehouse full onboarding | Separate bounded context and progressive rollout | Stock integrity/reconciliation, writer gate, UAT |
| M7 — Integrated reporting | Consistent cross-module definitions and provenance | Finance sign-off and KPI reconciliation |

## 14. Initial backlog (ready for ticket decomposition)

| Ticket | Scope | Priority | Dependencies |
|---|---|---|---|
| UC-001 | Establish current capability/permission-to-route matrix | P0 | existing auth/page/API guards |
| UC-002 | Build typed nav registry + server capability resolver | P0 | UC-001 |
| UC-003 | Create authenticated `/console` guard and layout | P0 | UC-001 |
| UC-004 | Build responsive sidebar, section labels, breadcrumbs, role/branch context | P0 | UC-002, UC-003 |
| UC-005 | Build honest dashboard cards + authorized operational quick links | P0 | UC-002–004 |
| UC-006 | Improve post-login redirect safely with POS-focused exception | P0 | UC-003, UC-005 |
| UC-007 | Preserve deep links and current POS/Sales/Products/Inventory shell behavior | P0 | UC-004 |
| UC-008 | Add role/branch/accessibility/responsive + payment/register/return/SO regression tests | P0 | UC-002–007 |
| UC-009 | Release/rollback runbook + production single-writer risk attestation | P0 | UC-008, operator |
| UC-010 | KOSIPA legacy inventory and contracts, including payroll coupling | P1 | domain owner/source access |
| UC-011 | Warehouse app inventory and inventory-ledger ownership | P1 | warehouse owner/source access |
| UC-012 | Reconcile/refresh migration matrix, stage statuses and parity/UAT evidence | P1 | baseline, docs owners |
| UC-013 | Credentials/security hygiene review of tracked documentation and access tokens | P0 operational safety | repo owner/security |

## 15. UAT scenarios / definition of done

1. Anonymous `/console` goes to login; malicious/off-site `next` ignored; safe deep link survives login for authorized user.
2. User with `sales_view` but without `sales_add` can reach permitted console and Sales, cannot checkout; user with `sales_add` can enter POS directly.
3. A cashier sees only permitted navigation; no ghost/disabled links to unimplemented KOSIPA/Warehouse, and checkout's screen space remains usable.
4. User without inventory permissions cannot access `/inventory` via visible menu, direct URL, or API; global warehouse master operations are restricted per existing global admin rules.
5. Role/branch changes take effect on next request; no protected business rows leak from another branch, including on back/refresh/deep links.
6. Cash/QRIS/Kredit checkout and idempotent retry, register open/close, sales history/reprint, return logic, product add/edit and stock-opname workflow function identically to baseline. Staging first; **never seed/write tests to operational DB**.
7. Mobile 375/390, tablet 768, desktop 1024/1440 tested for focus, no overflow, aria-current, visible active items, escape from drawer.
8. Console first load and empty/error states do not fabricate metrics; unavailable integrated data clearly identified.
9. Feature off/rollback restores current `/login` -> `/pos` workflow without schema/data rollback.
10. Operator verifies writer exclusivity arrangement and schema/index rollout status before expanding transactional functionality.

**Definition of Done:** linked tickets/PR evidence; tests green in authorized CI/staging; screenshots and role matrix attached; performance measured; sign-off by product/operations/security; updated `docs/migration` status; rollback tested. Documentation-only plan is not a production completion claim.

## 16. Open decisions (do not block P0 documentation)

- Actual KOSIPA application repo/API/database, exact modules, permissions, operators and data owner: **unknown from this repository**.
- Full Warehouse Management repo/API, stock location semantics, inventory/writer ownership: **unknown from this repository**.
- Default post-login behavior by real permission distribution (dashboard vs focused POS) to validate on representative users.
- Whether branch context can be shared across all three apps or needs independent active-scope mapping.
- Module cards for users with no access: hidden vs explicit informational state; product default is hidden for restricted features, informational for roadmap with appropriate audience.
- Single-writer technical prevention and safe retirement of PHP POS by branch; currently an operational rule, not a hard technical guard.
- Cross-domain KPI ownership, finance calculations, payroll return deductions, time-window semantics.

## 17. Verified source references

All links below are pinned to observed repo commit `502b237cc3c3955ade6cf924e1ecae6591090042` unless explicitly labeled historical:

- [Root README — workspace ownership/commands](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/README.md)
- [POS shell and existing menu](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/apps/web/src/components/pos/PosShell.tsx)
- [POS page permission gating](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/apps/web/src/app/pos/page.tsx)
- [Server auth page guard](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/apps/web/src/infrastructure/auth/page-guard.ts)
- [Safe post-login path](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/packages/domain/src/auth/redirect.ts)
- [Landing console vs PWA routes](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/apps/web/src/components/landing/destinations.ts)
- [Payment method domain types](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/packages/domain/src/pos/payment-method.ts)
- [Deployment handover — latest operational status](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/docs/migration/GENESIS_DEV_DEPLOYMENT.md)
- [Current ownership strategy (historical, to reconcile)](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/docs/migration/DATA_OWNERSHIP.md)
- [Older migration matrix (stale)](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/docs/migration/MIGRATION_MATRIX.md)

---
**Engineering instruction:** First read the companion baseline and existing `docs/migration/`, `docs/refactor/`, and `docs/legacy-reference/` before making any change. Do **not** perform a full legacy PHP re-audit that is already documented; conduct narrowly scoped evidence checks only where sources are missing (notably KOSIPA and standalone Warehouse Management). Implement P0 in reviewable increments, without modifying business queries, transaction semantics, permissions or production write enablement as incidental cleanup.
