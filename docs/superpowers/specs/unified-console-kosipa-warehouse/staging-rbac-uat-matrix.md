# Staging RBAC / UAT matrix (checkpoint 11)

Status: **verified by automated tests against fakes and the real resolver, navigation registry and HTTP handlers; staging browser UAT still requires anonymised accounts supplied by an operator** (section 5). Nothing here assigns a production role to a person.

## 1. What a persona is

A persona is a **testing role** assembled from the approved system's own vocabulary and nothing else: legacy permission slugs (`sales_*`, `items_*`, `inventory_*`, `users_edit`), the branch-chooser rule (`role ≤ 2`), KOSIPA menu grants reached **only** through an active identity link, the export allow-list (decision E1, explicit `KOSIPA_EXPORT_USER_IDS`), and the deployment flags. Fixtures live in `apps/web/tests/support/personas.mjs`; no real user, role id or KOSIPA group appears in them.

Two personas have **no defined mapping** in the approved system and say so in their fixture: **Warehouse Operator** and **Warehouse Supervisor**. The console has no `warehouse.dispatch.*` / `toko.receiving.*` capability yet (those permission names exist only inside the Warehouse application layer and its tests). The Operator therefore holds nothing in the console; the Supervisor is the *closest existing capability* (global warehouse master = `inventory_view` + branch chooser), which is exactly what the synthetic preview flag builds on. **Mapping real people to Warehouse roles is blocked on an owner decision** and must not be inferred from this table.

## 2. Matrix (generated from the code; a test fails if it drifts)

Flags for the table: console on, KOSIPA read on, Warehouse preview on, export policy on with **only** the KOSIPA Administrator persona allow-listed. API columns are HTTP statuses of the real handlers for a signed-in persona (`200` allowed, `403` forbidden); reader/audit fakes record that **no denial touches data or the audit log**.

<!-- persona-matrix:begin -->
| Persona (testing role) | Legacy role / chooser | Permission slugs | KOSIPA link | Capabilities (flags: preview ON, export policy ON) | Visible menu | Landing | loan list | payroll list | loan report | member savings | loan export | payroll export |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Console Administrator** | 1 / yes | sales_add, sales_view, sales_payment_view, sales_return_view, sales_return_add, items_view, items_add, items_edit, inventory_so, inventory_view, users_edit | none | iam.link.manage, t.inventory.so, t.inventory.view, t.inventory.warehouse, t.pos.checkout, t.products.create, t.products.edit, t.products.view, t.returns.create, t.returns.view, t.sales.payments, t.sales.view, w.preview.view | dashboard, toko-pos, toko-sales, toko-returns, toko-products, warehouse-inventory, warehouse-preview, warehouse-distribution, warehouse-mapping, warehouse-receiving, settings-identity | /console | 403 | 403 | 403 | 403 | 403 | 403 |
| **KOSIPA Administrator** | 2 / yes | sales_view, items_view | linked (5 controllers) | k.loan.view, k.member.view, k.payroll.view, k.report.export, k.savings.view, k.store-credit.view, t.products.view, t.sales.view | dashboard, kosipa-members, kosipa-savings, kosipa-loans, kosipa-payroll, toko-sales, toko-products, reports-kosipa | /console | 200 | 200 | 200 | 200 | 200 | 200 |
| **KOSIPA Operational Staff** | 5 / no | — | linked (3 controllers) | k.loan.view, k.member.view, k.savings.view | dashboard, kosipa-members, kosipa-savings, kosipa-loans, reports-kosipa | /console | 200 | 403 | 200 | 200 | 403 | 403 |
| **TOKO Cashier** | 4 / no | sales_add | none | t.pos.checkout | dashboard, toko-pos | /pos | 403 | 403 | 403 | 403 | 403 | 403 |
| **TOKO Supervisor** | 3 / no | sales_add, sales_view, sales_payment_view, sales_return_view, sales_return_add, items_view, items_edit, inventory_so | none | t.inventory.so, t.inventory.view, t.pos.checkout, t.products.edit, t.products.view, t.returns.create, t.returns.view, t.sales.payments, t.sales.view | dashboard, toko-pos, toko-sales, toko-returns, toko-products, warehouse-inventory | /console | 403 | 403 | 403 | 403 | 403 | 403 |
| **Warehouse Operator** | 4 / no | — | none | — | dashboard | /console | 403 | 403 | 403 | 403 | 403 | 403 |
| **Warehouse Supervisor** | 2 / yes | inventory_view, inventory_so | none | t.inventory.so, t.inventory.view, t.inventory.warehouse, w.preview.view | dashboard, warehouse-inventory, warehouse-preview, warehouse-distribution, warehouse-mapping, warehouse-receiving | /console | 403 | 403 | 403 | 403 | 403 | 403 |
| **Read-only Auditor** | 2 / yes | sales_view, sales_return_view, items_view, inventory_view | linked (5 controllers) | k.loan.view, k.member.view, k.payroll.view, k.savings.view, k.store-credit.view, t.inventory.view, t.inventory.warehouse, t.products.view, t.returns.view, t.sales.view, w.preview.view | dashboard, kosipa-members, kosipa-savings, kosipa-loans, kosipa-payroll, toko-sales, toko-returns, toko-products, warehouse-inventory, warehouse-preview, warehouse-distribution, warehouse-mapping, warehouse-receiving, reports-kosipa | /console | 200 | 200 | 200 | 200 | 403 | 403 |
<!-- persona-matrix:end -->

Abbreviations: `t.` = `toko.`, `k.` = `kosipa.`, `w.` = `warehouse.`. Menu ids are the ids of `apps/web/src/features/console/navigation.ts`.

## 3. Checks and where they are proven

| Requirement | How it is verified | Test |
|---|---|---|
| Menu visibility | every persona's capabilities, visible menu entries and landing page equal a hand-written oracle (independent of the resolver) | `console-persona-matrix.test.mjs` — "menu visibility…" |
| Protected API access | six representative KOSIPA endpoints per persona; allowed only with the matching view capability; export additionally needs the allow-list; **denials read nothing and audit nothing** | "protected API access per persona…" |
| Identity-link enforcement | an unlinked, revoked or group-less account is 403 on every endpoint, whatever its role or permissions (Console Administrator and TOKO Supervisor included) | "identity-link enforcement…" |
| Member / identity isolation | only the **session** user id is used to find the link; `userId`, `consoleUserId`, `externalUserId` in query and `x-user-id` headers are ignored; audit actor = session user | "member / identity isolation…" |
| Company / branch isolation | the session carries the branch; role > 2 cannot switch (403, session unchanged); role ≤ 2 switches only the session. Branch scoping of data reads is proven by the TOKO suites that predate this checkpoint: `sales-history.test.mjs`, `sales-returns.test.mjs`, `inventory-management.test.mjs`, `pos-*.test.mjs`, and the Warehouse branch-scoped reads in `warehouse-read.test.mjs` / `warehouse-use-cases.test.mjs` | "company / branch isolation…" + the suites named |
| Export permission | view never implies export; only the allow-listed linked persona holds `kosipa.report.export`; the policy flag off removes it for all; the Auditor sees every report but cannot export | "export permission…" |
| Audit failure behaviour | with the audit store failing, a fully entitled persona gets 503 on **all six** endpoints and **nothing is read** (audit-before-read). Until checkpoint 12 the payroll batch list answered 200 (finding F5); owner decision A4 closed it | "audit failure behaviour…", "A4 over HTTP…" |
| Warehouse access isolation | preview capability ⇔ global warehouse capability; branch-bound roles never get it; Operator/Supervisor have no defined mapping (asserted in the fixture text) | "warehouse access isolation…" |
| Feature-flag behaviour | KOSIPA API flag off → 404 for every persona with no read; preview flag off removes the capability **and its four menu entries** (the TOKO `/inventory` entry stays); KOSIPA off removes only `kosipa.*`, TOKO capabilities unchanged | "feature-flag behaviour…" |

## 4. Findings recorded by the matrix

1. **Branch-chooser coupling.** `iam.link.manage` and the Warehouse preview both require `role ≤ 2`, so a TOKO Supervisor (role 3) can never administer links or open the preview regardless of permissions. This is deliberate and unchanged.
2. **Auditor is not a role in the legacy system.** The persona is only "view permissions + linked + not allow-listed"; whether production needs a dedicated read-only group is an owner/operator question (no code change implied).
3. **Store credit** is visible to no persona through the menus because only the KOSIPA group's `anggota/trans_toko_c` grant opens it; the matrix shows it for the two personas whose fixture includes that controller.
4. **Warehouse Operator has no console surface at all.** Until an owner-defined mapping exists, warehouse staff cannot be given a working role; the preview is read-only and synthetic.
5. **F5 — closed in checkpoint 12 (owner decision A4).** The payroll batch list (`GET /api/kosipa/payroll`, `/console/kosipa/payroll`) now writes `kosipa.payroll.list.view` before the read and fails closed when the audit cannot be written, like the loan list.

## 5. Staging browser UAT (needs operator-supplied anonymised accounts)

The automated matrix does not replace a staging walk-through. Synthetic accounts already seeded for `scripts/e2e-seed.mjs` cover: Console Administrator-like (`synth_admin`, role 1), KOSIPA-linked staff (`synth_koperasi`, export allow-list used in UAT phase 5), TOKO Supervisor-like (`synth_kepala`), TOKO Cashier (`synth_kasir1/2`), plus the negative accounts (`synth_off`, `synth_nobranch`). **Not seeded:** Warehouse Operator, Warehouse Supervisor, Read-only Auditor and KOSIPA Operational Staff variants — an operator must provide anonymised staging accounts with the slugs/menus of section 2, or the seed must be extended deliberately (a separate, reviewed change; no production data).

Walk-through per persona (staging, flags per section 2): sign in → landing page equals the table → sidebar equals the table → open one allowed and one forbidden page (forbidden shows 404/redirect, never data) → call one allowed and one forbidden API → try the export link (Auditor: absent) → switch branch (role ≤ 2 only) → sign out. Record outcome per persona; any difference from the table is a defect in either the table or the code.
