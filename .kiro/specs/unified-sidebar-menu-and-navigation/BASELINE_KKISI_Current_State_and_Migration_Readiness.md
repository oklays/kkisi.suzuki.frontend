# Baseline — KKISI TB2 Current State & Migration Readiness

| Atribut | Nilai |
|---|---|
| Document ID | BL-KKISI-UC-001 |
| Status | Evidence-based baseline v1.0 (16 Oktober 2026, WIB) |
| Repository | [`oklays/kkisi.suzuki.frontend`](https://github.com/oklays/kkisi.suzuki.frontend) |
| Branch + frozen head | `master` / `502b237cc3c3955ade6cf924e1ecae6591090042` (latest commit observed 13 Oktober 2026) |
| Coupled PRD | `PRD_KKISI_Unified_Management_Console.md` |
| Batas verifikasi | Review GitHub repository, source paths, commit timeline dan dokumentasi yang ter-commit. **Tidak ada login ke server, database, CI runtime, pengguna produksi, atau end-to-end verification langsung.** |
| Status operasional TOKO | Menurut user, TOKO sudah selesai direvamp. Repo menunjukkan cakupan core TOKO telah diimplementasikan; handover deployment 13 Oktober mencatat POS utama dengan write aktif. Ini **bukan** bukti seluruh legacy TOKO mencapai parity/UAT pada setiap cabang. |

## 1. Executive baseline

**Kesimpulan:** aplikasi yang ada **bukan scaffold baru**. Telah menjadi monorepo Next.js untuk TOKO dengan autentikasi persisten, checkout Cash/QRIS/Kredit, register, riwayat dan retur penjualan, produk, master warehouse dan stock opname. Landing Console/PWA juga sudah hadir. Namun **unified management dashboard** tidak ada, sidebar masih spesifik TOKO, sedangkan KOSIPA dan full Warehouse Management masih belum memiliki implementasi terbukti di repo ini.

**Rekomendasi next build:** mulai dari protected `/console`, central nav/capability resolution dan desain sidebar section-based **tanpa memindahkan** TOKO routes, tanpa membuat skema baru, tanpa mengganti auth, tanpa menyentuh business SQL. Pekerjaan KOSIPA dan standalone Warehouse menunggu inventarisasi sumbernya sendiri.

### 1.1 Evidence reliability model

- **E1 — Code confirmed:** file/route/test/dependency muncul di snapshot GitHub. Membuktikan implementasi ada, **bukan** perilaku live benar.
- **E2 — Documented verification:** hasil tes/ops tercatat dalam committed docs. Bukti historis, tidak sama dengan tes yang kami jalankan ulang.
- **E3 — Owner reported:** konteks/prioritas/penetapan selesai dari user. Dipakai untuk prioritas produk, tetap dipisahkan dari technical acceptance.
- **E4 — Proposed only:** desain/rekomendasi atau backlog yang belum memiliki implementasi.
- **Unknown:** repo terhubung tidak menyediakan data relevan; jangan otomatis tandai Not Started untuk aplikasi lain yang source-nya belum diberikan.

## 2. Repository and technology inventory

| Area | Evidence-based state | Source |
|---|---|---|
| Monorepo workspace | `pnpm@10.0.0`, workspace `apps/web`, `packages/domain`, `packages/application` | `README.md`, `package.json`, `pnpm-workspace.yaml` |
| Web runtime | Next.js `^16.3.7`, React `^19.2.0`, TS, App Router, ESLint 9 | `apps/web/package.json` |
| Database access | Prisma `6.12.0`; app-owned adapter/repository boundary; MariaDB business DB and separate auth store | `apps/web/package.json`, `apps/web/prisma/schema.prisma`, `apps/web/src/infrastructure/` |
| Architecture | Web UI/framework → application use cases/ports → pure domain, persistence in web infrastructure | `README.md`, `docs/refactor/CHECKPOINT_4_DOMAIN_APPLICATION.md` |
| Authentication | Opaque cookie sessions, validated legacy user/role/company permissions, CSRF, throttle; existing login/session endpoints | `apps/web/src/infrastructure/auth/`, `packages/application/src/auth/`, `apps/web/src/app/api/auth/` |
| Deployment | `https://smart.kkisitb2.id` on DEV host (`genesis.web`) through encrypted SSH tunnel to Niagahoster MariaDB; recorded latest writers ON | `docs/migration/GENESIS_DEV_DEPLOYMENT.md` |
| Member experience | `/anggota` is coming soon; member PWA application not yet implemented | `apps/web/src/app/anggota/page.tsx`, `apps/web/src/components/landing/destinations.ts` |
| Historical legacy reference | Source docs focus on **TOKONEW CodeIgniter 3**, not confirmed complete KOSIPA or standalone Warehouse | `CLAUDE.md`, `docs/legacy-reference/` |

**Version caution:** `apps/web/README.md` still contains old staging/read-only descriptions from earlier checkpoints. Runtime dependency versions and live-stage conclusions must be taken from actual manifests, code and newest dated deployment note, not from one older README paragraph.

## 3. User experience and route baseline

| Existing path | Status in repo | Business scope | Primary auth/permission note |
|---|---|---|---|
| `/` | E1 implemented | Public landing with Console + member entry | Static; Console links to `/login` |
| `/login` | E1 implemented | Staff auth | Login success path defaults to `/pos` via `safeNextPath`, unless safe `next` |
| `/anggota` | E1 placeholder | Future member PWA | Coming soon; not a live member app |
| `/pos` | E1 implemented | Checkout, product search/cart, session, receipt | Requires `sales_add` |
| `/pos/receipt/[id]` | E1 implemented | Receipt | Verify existing authorization mode |
| `/products` | E1 implemented | Product list, add/edit | View `items_view`; add/edit capability checks |
| `/sales` | E1 implemented | Sales history and filters | Requires `sales_view` |
| `/sales/invoice/[id]` | E1 implemented | Sales detail | Server-guarded, review compound permission per handler |
| `/sales/returns` | E1 implemented | Return list | Page supports `sales_return_view` OR `sales_return_add`, but surrounding Sales layout requires `sales_view` |
| `/sales/returns/[id]` | E1 implemented | Return detail | Verify relevant permission along route chain |
| `/inventory` | E1 implemented | Stock opname + global warehouse master | `inventory_so` OR `inventory_view` initial page gate; subcapabilities narrow actions |
| `/console` | **Not present in frozen app router** | Proposed unified console | New protected route needed, not `sales_add`-only |
| `/console/kosipa` | **Not present** | Proposed KOSIPA entry | No dedicated Next.js KOSIPA module confirmed |
| `/console/warehouse` | **Not present** | Proposed full Warehouse entry | Distinguish from existing `/inventory` |

**Important:** Existing `PosShell.tsx` is the shared TOKO sidebar for several screens. It contains enabled links to POS/history/returns/products/inventory based on session flags, while `Dashboard Supervisor` and `Laporan Keuangan` are disabled placeholders. New console navigation should not equate the disabled labels with production-ready pages.

### 3.1 Snapshot of current menu vs recommended menu

| Existing | Current result | Target presentation in console |
|---|---|---|
| Dashboard Supervisor | Disabled item in `PosShell` | Working `/console` dashboard |
| POS / Kasir | Working `/pos` | TOKO section + dedicated cashier focused mode |
| Riwayat Transaksi | Working `/sales` | TOKO section |
| Retur Penjualan | Working `/sales/returns` | TOKO section; permission matrix fixes required |
| Produk & Inventory | Working `/products` | TOKO section |
| Warehouse & Stock Opname | Working `/inventory` | WAREHOUSE section, labeled accurately as current subset |
| Laporan Keuangan | Disabled in `PosShell` | Future only until approved data/permission contract |
| KOSIPA | No nav/route present | Future read-first module |
| Full Warehouse Management | No separate complete flow found | Future read-first module |

### 3.2 Authentication redirect caveat

`packages/domain/src/auth/redirect.ts` defaults post-login to `/pos`. This is coherent for a TOKO-first app but inappropriate as a universal destination after introducing console roles lacking `sales_add`. Required change: role/capability-aware safe landing logic without redirect loops or open redirects, preserving Cashier -> POS. New `/console` must only require validated authenticated context plus whatever minimal console visibility policy is formally approved; it must not inherit `sales_add` as universal permission.

## 4. Functional inventory and maturity

| ID | Module/function | Code | Documented test/ops | Proposed classification | Notes |
|---|---|---|---|---|---|
| T-01 | POS sales/catalog/scanner/cart | E1 | E2 | **Built — TOKO** | `PosScreen`, `/pos`, POS APIs; preserve active behavior |
| T-02 | Checkout Cash / Kredit | E1 | E2 | **Built — TOKO** | Checkout backend/domain; correctness gates remain necessary |
| T-03 | QRIS static payment method | E1 | E2 | **Built — TOKO** | Domain recognizes Cash/QRIS/Kredit; QRIS does not affect cash drawer; no dynamic QRIS API implied |
| T-04 | Register open/close/recap | E1 | E2 | **Built — TOKO** | Separate write and guard flows; preserve state semantics |
| T-05 | Sales history/detail/reprint | E1 | E2 | **Built — TOKO** | Read, detail, payments, invoice routes; previous handover noted staging parity pending |
| T-06 | Sales returns | E1 | E2 | **Built — TOKO** | Existing routes/API/domain; payroll integration dependency for Kredit must be tracked |
| T-07 | Product master list/create/edit | E1 | E2 | **Built — TOKO** | `items_view/add/edit` scope; writers noted ON in newest deployment doc |
| T-08 | Global warehouse master | E1 | E2 | **Built subset** | Master `db_warehouse` is global; not warehouse-location stock engine |
| T-09 | Stock opname lifecycle | E1 | E2 | **Built subset** | Draft/count/approve/cancel workflow on `/inventory`; not warehouse transfer/receiving |
| T-10 | Login/session/branch awareness | E1 | E2 | **Built platform** | Legacy user permissions, session and branch-scoped pages |
| T-11 | Public landing Console/PWA | E1 | E2 | **Built platform** | Console button leads to login; PWA link to placeholder |
| C-01 | Unified Dashboard `/console` | — | — | **Not built** | New scope P0 |
| C-02 | Unified section-based sidebar | — | — | **Not built** | `PosShell` exists, not unified three-domain nav |
| C-03 | Central typed cross-domain nav + permission policy | Partial per-page capabilities | — | **Gap** | `PosSession.can*` duplicated across pages; no full cross-domain nav resolver |
| C-04 | KOSIPA Next.js | No evidence in this repo | — | **Unknown / not onboarded** | Requires source audit of different app, not a guess about features |
| C-05 | Complete Warehouse Management Next.js | No evidence in this repo | — | **Unknown / not onboarded** | Subset exists under T-08/T-09 |
| C-06 | Integrated cross-domain KPI reports | — | — | **Not built** | Existing Report disabled placeholder, no verified aggregation |
| C-07 | Member PWA functional app | — | — | **Not built** | `/anggota` coming soon |

**Do not read the table as total feature parity:** User's “TOKO selesai” is a product milestone; technical parity with every historical legacy controller is a separate acceptance milestone. The `MIGRATION_MATRIX.md` in GitHub predates much of the code and should be updated only after an evidence-based reconciliation.

## 5. Existing technical boundaries

### 5.1 Code responsibility

```text
repo/
├── apps/web/
│   ├── src/app/             current pages, /api route handlers, auth guarded routes
│   ├── src/components/      landing, pos, products, sales, inventory UI
│   ├── src/infrastructure/  auth, Prisma DB clients, repositories, write services
│   ├── prisma/              existing schema projections
│   └── tests/               Node tests + optional browser/DB workflows
├── packages/domain/         pure auth, money, inventory, POS, sales rules
├── packages/application/    auth, inventory, POS, sales use cases and ports
├── docs/legacy-reference/   CodeIgniter TOKONEW reverse-engineering
├── docs/migration/          migration, ownership, deployment history
└── docs/refactor/           workspace and architecture checkpoints
```

### 5.2 Existing relevant data/security concepts

- Legacy business entities include `db_company`, `db_users`, `db_roles`, `db_permissions`, `db_items`, `db_sales`, `db_salesitems`, `db_salespayments`, `db_buka_kasir`, stock-opname and warehouse tables, plus `m_anggota` for member credit. Names come from inspected docs/source; **do not infer KOSIPA ownership solely from prefixes**.
- Application reads branch through session `companyId`, not trusted request parameters. Privilege and branch filtering must remain server-enforced.
- Auth store separate from business database; user continuity with legacy password hashes is described in auth docs. Do not alter existing login or session tables casually.
- `db_warehouse` seen in TOKO is a global name/contact/status master, **not** a location-specific stock-balance table. Do not invent warehouse-location stock relationships.
- Writers are controlled per feature; source documents emphasize single-writer, but newer ops notes reveal residual dual-write exposure with PHP.

### 5.3 Current payment behavior

`packages/domain/src/pos/payment-method.ts` lists **Cash**, **QRIS**, **Kredit**. QRIS is not physical cash drawer; Kredit requires a member. Preserve the distinctions through sidebar refactor, reporting and return refund behavior. Dynamic QRIS gateway, provider webhooks and auto-reconciliation are **not** implied by the existing static QRIS checkout.

## 6. Deployment and operational baseline

**Observed handover (13 Oct 2026, not independently re-tested):**

| Dimension | Recorded state |
|---|---|
| Public app | `https://smart.kkisitb2.id` |
| Server alias | `genesis.web` on DEV machine behind nginx/HTTPS |
| Business database | Production MariaDB remains on Niagahoster; tunneled access from DEV; no database moved to DEV |
| Login | Existing legacy identity validated, independent session/auth DB |
| Production writer status | 13 Oct doc says POS, register, inventory, products, returns writers **ON** |
| Operational role | Next.js designated main POS app by owner decision |
| Legacy PHP | Still live; PHP POS technically capable of writing; one-app-per-branch/cashier is operating rule |
| Known issue | Contention/lock waits and missing indexes can affect checkout; app retry/idempotency/8-second lock cap mitigates, not fully removes conflict |
| Open operations | Manual production index deployment, authenticated user E2E check, monitoring, privileges, index/workflow reconciliation and cutover guard |

**Important recency conflict:** Older `GCP_PARTIAL_CUTOVER.md` states GCP network blocked / writes disabled; this was explicitly **superseded** by `GENESIS_DEV_DEPLOYMENT.md`. Older `SALES_RETURN_IMPLEMENTATION.md` and `apps/web/README.md` show local/staging flags disabled; newest deployment note says enabled. Keep each document dated instead of treating contradictions as separate active environments.

## 7. Critical risks and blockers (priority ordered)

| ID | Severity | Risk/observation | Required mitigation before wider migration |
|---|---|---|---|
| R-01 | **Critical** | Legacy PHP POS retains write capability in same business DB while Next.js is running as primary; one-app-per-branch/cashier rule is operational, not hard technical isolation | Owner-approved per-branch writer enforcement/route guard, transaction ownership inventory, operator control, rollback rehearsal; prove no overlap |
| R-02 | **High** | Checkout lock contention and production missing indexes described in 13 Oct handover | Follow reviewed production index plan with backup, off-peak execution, schema DBA sign-off and post-run query/locking benchmarks |
| R-03 | **High** | At least one committed documentation file appears to include account/password-like operational content in a **public** repository | Security owner urgently review public tracked docs/history for secrets, revoke/rotate any real credentials, purge sensitive exposure appropriately, enable secret scanning. **Do not copy credentials into PRD, tickets or chat.** |
| R-04 | **High** | KOSIPA full architecture, source, ACL, DB/API and payroll coupling not provided by repo | Obtain legitimate source/docs from owner; use targeted inventory, not infer or invent |
| R-05 | **High** | Separate Warehouse app semantics, location stock, transfer flow and system writer ownership unknown | Obtain source/schema/workflow, reconcile existing `/inventory` overlap and authority |
| R-06 | **High** | Old migration checklist/matrix reports all implementation zero, now materially stale | Reconcile module-by-module with commit/date and tests before treating as source of truth |
| R-07 | **High** | New `/console` could accidentally inherit `sales_add`, excluding non-TOKO staff | Introduce general authenticated guard, central capability resolver and dedicated role/branch tests |
| R-08 | **High** | New navigation/shell can regress POS (screen area, form focus, open register, QRIS/cash classification) | POS focused mode and automated regression; no business-flow changes in P0 |
| R-09 | **High** | Credit returns and external payroll deduction generator have separate data reconciliation | Owner of payroll generator must confirm deductions offset existing Kredit returns before financial integration |
| R-10 | **Medium** | Member PWA placeholder can be mistaken for live app | Maintain coming-soon gating and clear landing behavior |
| R-11 | **Medium** | Dashboard KPI might mix incomplete freshness/branch scopes | Initial dashboard cards only; verified KPI adapters with `as_of`, source and no fake zeros later |

### 7.1 R-03 handling guidance

This baseline **does not reproduce any password, test credential, private URL with token, SSH material, or database connection string**. Source ownership/security team should run a private Git history and repository-secret audit, rotate valid secrets, and maintain an incident record outside public repo. Deleting a line only in the latest commit is insufficient if a live secret remains in public Git history.

### 7.2 R-01 decision note

The 13 October handover explicitly records owner acceptance of residual risk with an operating rule. That does not satisfy a technical single-writer release gate for more modules. Recommended: no new KOSIPA/Warehouse financial/inventory write cutover until writer exclusivity can be verified independently. Preserve current operations; coordinate remediation with owner rather than turning off any running system unilaterally.

## 8. Readiness gates: what is and is not proven

| Gate | TOKO existing | Unified Console P0 | KOSIPA | Full Warehouse |
|---|---|---|---|---|
| Relevant source available | Yes | Yes | **No evidence** | **No evidence** |
| Architecture boundaries | Yes (monorepo) | Proposed | Pending discovery | Pending discovery |
| Product requirements | Feature specs/handover exist | New PRD | Pending | Pending |
| Implemented pages/handlers | Yes, several | No | Not found | Not found (except master/SO subset) |
| Node unit tests | Source tests exist, prior reports pass | Not written | Unknown | Unknown |
| Live representative UAT | Some local/deployment evidence, not audited live | Not performed | Unknown | Unknown |
| Production write | Newest handover says ON for TOKO features | P0 must not add writes | No | No verified full-warehouse writes |
| Single-writer control | Residual risk | Must not worsen | Block write phase | Block write phase |
| Rollback rehearsal | Operational runbook exists | New shell rollback to design/test | Pending | Pending |

**Interpretation:** "Yes source" is not "pass end-to-end". Anything absent from this specific repo is "Not found/Unknown" rather than categorical proof the separate legacy app does not exist.

## 9. Recommended staged migration baseline

### Stage 0 — Freeze & safety reconciliation (required)

- Pin target commit SHA and working deployment tag; review drift since 13 October before actual implementation.
- Confirm current production writer flags/grants and per-branch operator behavior *read-only* with authorized operator; reconcile PHP capability with Next.js owner policy.
- Request security review of tracked docs, secrets and Git history; rotate if real credentials exposed.
- Capture existing route/permission matrix, screenshot UI baseline, smoke suite, rollback image and app health gates.
- Reconcile stale `MIGRATION_MATRIX.md` through evidence-linked entries; do not overwrite historic plan without preserving provenance.

### Stage 1 — Unified shell / zero business migration

- Add `/console` route/guard/sidebar/cards, typed nav registry, dashboard empty/fallback states.
- Preserve old TOKO URLs, logic and production flags; keep POS focused view.
- Build role/branch matrix for protected nav, malicious deep links, responsiveness and accessibility.
- Deploy behind gradual rollout/reversible feature flag after staging checks.

### Stage 2 — KOSIPA read-first onboarding

- Obtain current separate KOSIPA owner, source location and authoritative system map.
- Validate names, flows, DB tables, `m_anggota` and `trans_*` dependencies, payroll writer ownership, permission mapping.
- Create strict read adapters into KOSIPA section with branch/person scope, then parity/UAT. No write until finance and owner gates pass.

### Stage 3 — Full Warehouse read-first onboarding

- Obtain separate Warehouse source; inventory the location and stock semantics, goods receipt, transfer/approval, purchasing/supplier roles.
- Reconcile TOKO `db_items.stock`, `db_stockentry`, `db_warehouse` and stock-opname with full warehouse ledger; define one owner for each mutation.
- Pilot read-only and reconcile counts; activate write through one bounded context and one branch at a time with controlled switch and rollback.

### Stage 4 — Cross-module reporting / member experience

- Finance-approved KPIs and definitions; source-of-truth per measure, date and branch; support stale/unavailable rather than zero.
- Independently roadmap Member PWA and member auth, keeping staff management session policies separate.

## 10. Mapping initial engineering work to existing files

| Workstream | Reuse / touch point (review first) | No-go boundaries |
|---|---|---|
| Console entry | `apps/web/src/app/page.tsx`, `components/landing/destinations.ts`, `app/login/LoginForm.tsx`, `packages/domain/src/auth/redirect.ts` | Do not break public landing or member placeholder |
| Auth/context | `infrastructure/auth/page-guard.ts`, `infrastructure/auth/container.ts`, `packages/application/src/auth/validate-session.usecase.ts` **(confirm exact exports during implementation)** | No session schema/cryptography/grants change |
| Nav shell | `components/pos/PosShell.tsx`, `features/pos/types.ts`, `app/sales/layout.tsx` | No large refactor of all TOKO pages in first PR |
| TOKO routes | `/pos`, `/sales`, `/products`, `/inventory` + `/api` descendants | No breaking URLs/contract changes |
| UI tests | `apps/web/tests/`, `packages/domain/tests/`, `packages/application/tests/` | Do not run write/fixture tests on production |
| Migration context | `docs/migration/`, `docs/refactor/`, `docs/legacy-reference/` | Avoid re-audit of entire old TOKONEW; resolve only actual evidence gaps |

> Path warning: filenames in the inventory row are representative; open the current tree before coding. The repository has `packages/application/src/auth/validate-session.usecase.ts` and other subpath exports; do not assume historical paths remain identical.

## 11. Test & acceptance baseline for P0

**Mandatory checks:**

1. `pnpm install --frozen-lockfile` (in approved CI/staging), `pnpm db:generate`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. Results must be recorded against specific new commit SHA; old passing reports are not test execution now.
2. Anonymous/direct-route auth fail-closed; safe `next` checks (offsite/`//`/control characters), no login loop, no stale permission caching.
3. Persona/permission matrix: cashier (checkout), sales viewer (no checkout), stock opname worker, global admin, unauthorized staff, disabled role/company, branch change.
4. Existing production-like functional smoke in **approved non-production** database or no-write mock: Cash, QRIS, Kredit, register lifecycle, sale detail/returns, add/edit products, SO draft/count/approve/cancel; preserve idempotency.
5. Responsive, keyboard and screen reader navigation; no popup/menu overlap with POS checkout on 375/390/768/1024/1440.
6. Monitor error budget and health on gradual release; rollback to prior image/feature flag without any database migration or loss of transactional data.
7. Document if DB-specific opt-in tests are skipped because credentials/fixtures unavailable; never mark parity pass on that basis.

**Stage 1 exit:** console available for authorized staff; existing TOKO routes work, no new writes/API business semantics, no data leaks, no unauthorized menu access, operator release/rollback sign-off. This is *not* exit for KOSIPA/Full Warehouse migration.

## 12. Traceability, status semantics and maintenance

Recommended revised `MIGRATION_MATRIX` values:

- `Planned` — PRD only.
- `Implemented (code)` — source exists at pinned SHA.
- `Verified (unit)` — test command and SHA recorded.
- `Verified (staging parity)` — representative real-schema sample/financial comparison with evidence.
- `UAT approved` — stakeholder acceptance with date/scope.
- `Production enabled` — exact module, branch, flags, deployment tag confirmed.
- `Retired legacy writer` — prevention validated technically, not just operator instruction.

Every matrix row should carry **evidence URL, test date, branch/scope, reviewer and residual issues**. Never use the original green/red icons alone as evidence.

## 13. Priority decisions and immediate follow-up

| Decision | Baseline recommendation | Owner / evidence needed |
|---|---|---|
| Initial console IA | Unified dashboard + section sidebar, shortcut cards | Product/design |
| First implementation | Console foundation without TOKO rewrite | Engineering |
| Route policy | Keep `/pos`, `/products`, `/sales`, `/inventory`; introduce `/console` | Engineering/test |
| Post-login fallback | Cashier `/pos`; other staff first permitted console page; preserve safe deep link | Operations/auth |
| KOSIPA source | Request actual app/repo/API and data ownership (not in TOKO repo) | KOSIPA operator |
| Warehouse source | Request standalone app/repo/DB and stock ledger semantics | Warehouse operator |
| PHP/Next dual-write | Add technical exclusivity; maintain controlled operators until approved | Operations/DB owner |
| Repo secrets | Privately investigate and rotate real exposures | Security/repo owner |
| Production DB indexes | Follow pre-reviewed SQL, off-hours backup and DBA sign-off | DB owner |

## 14. Pinned GitHub evidence index

> Snapshot `502b237cc3c3955ade6cf924e1ecae6591090042`, dated 13 October 2026. Commit links are stable; live repository can move after this baseline.

| Evidence | URL |
|---|---|
| Latest observed commit | [502b237](https://github.com/oklays/kkisi.suzuki.frontend/commit/502b237cc3c3955ade6cf924e1ecae6591090042) |
| Monorepo README | [README.md](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/README.md) |
| Web dependencies | [apps/web/package.json](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/apps/web/package.json) |
| Current POS sidebar | [PosShell.tsx](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/apps/web/src/components/pos/PosShell.tsx) |
| Page auth guard | [page-guard.ts](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/apps/web/src/infrastructure/auth/page-guard.ts) |
| POS route | [pos/page.tsx](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/apps/web/src/app/pos/page.tsx) |
| Products route | [products/page.tsx](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/apps/web/src/app/products/page.tsx) |
| Sales route | [sales/page.tsx](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/apps/web/src/app/sales/page.tsx) |
| Sales return route | [sales/returns/page.tsx](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/apps/web/src/app/sales/returns/page.tsx) |
| Inventory route | [inventory/page.tsx](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/apps/web/src/app/inventory/page.tsx) |
| Payments | [payment-method.ts](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/packages/domain/src/pos/payment-method.ts) |
| Login redirect | [redirect.ts](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/packages/domain/src/auth/redirect.ts) |
| Landing destinations | [destinations.ts](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/apps/web/src/components/landing/destinations.ts) |
| Deployment status 13 Oct | [GENESIS_DEV_DEPLOYMENT.md](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/docs/migration/GENESIS_DEV_DEPLOYMENT.md) |
| Data ownership strategy | [DATA_OWNERSHIP.md](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/docs/migration/DATA_OWNERSHIP.md) |
| Stale migration matrix | [MIGRATION_MATRIX.md](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/docs/migration/MIGRATION_MATRIX.md) |
| Sales return integration caveat | [SALES_RETURN_IMPLEMENTATION.md](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/docs/migration/SALES_RETURN_IMPLEMENTATION.md) |
| Inventory scope and non-goals | [POS_INVENTORY_ENHANCEMENT_IMPLEMENTATION.md](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/docs/migration/POS_INVENTORY_ENHANCEMENT_IMPLEMENTATION.md) |
| Refactor checkpoints | [CHECKPOINT_4_DOMAIN_APPLICATION.md](https://github.com/oklays/kkisi.suzuki.frontend/blob/502b237cc3c3955ade6cf924e1ecae6591090042/docs/refactor/CHECKPOINT_4_DOMAIN_APPLICATION.md) |

---
**Baseline decision:** The next engineering stage should be a **navigation/authenticated shell change**, not a TOKO rebuild or blind migration of every legacy PHP module. Treat financial correctness, permission/branch isolation and legacy writer prevention as invariants. Reconcile `MIGRATION_MATRIX.md` with this evidence before marking new milestones complete.
