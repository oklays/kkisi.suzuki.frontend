# Staging role-configuration readiness package (checkpoint 12)

Status: **process implemented and locally verified on the 30 Sep copy; not staging-accepted.** No operational grant was invented, no role was changed, and no feature was given financial or inventory privileges by default.

## 1. Why

The Checkpoint 11 persona matrix proves that the resolver behaves correctly for **synthetic** testing personas. It does not prove that the console is compatible with the **real** role configuration: which legacy roles exist, what they hold, who lands where, and which personas a staging walk-through can actually use.

## 2. Reproducible process

| Step | Who | Tool | Output |
|---|---|---|---|
| 1. Export | operator (staging or production, read-only) | `docs/migration/sql/role-config-export-readonly.sql` with a private random `@salt` | one JSON: TOKO roles + slugs, branches, TOKO users as **salted pseudonyms** (role, branch, active), KOSIPA groups + controller URLs, KOSIPA accounts as pseudonyms + memberships. No usernames, names, e-mails or member data |
| 2. Validate | operator or engineering, offline | `node --experimental-strip-types apps/web/scripts/validate-role-config.mjs --bundle roles.json --out report.md` | every role and KOSIPA group evaluated with the console's **runtime** rules (`tokoCapabilities`, `iamCapabilities`, `kosipaCapabilitiesFromMenus`, navigation registry, landing rule): capabilities, menu, landing, the persona it resembles, findings. The intake refuses user-identifying fields and non-pseudonymous ids |
| 3. Choose walk-through accounts | operator + owner | report "Persona coverage" | per covered persona, one anonymised **staging** account of a matching role/group; personas with no real configuration are walked through only with synthetic accounts and are marked so |
| 4. Walk through | authorised users on staging | `staging-rbac-uat-matrix.md` §5 | per account: landing, sidebar, one allowed and one forbidden page/API, export link, branch switch; differences are defects in either the table or the code |

The report contains role/group ids and names and counts only. Keep the JSON export outside the repository (`docs/migration/_baseline/`).

## 3. Result on the local 30 Sep copy (not production)

4 TOKO roles (3 active), 11 active TOKO users, 7 KOSIPA groups, 7 active KOSIPA accounts.

| Testing persona | Real configuration that resembles it |
|---|---|
| Console Administrator | roles 1 and 2 (users_edit + branch chooser) |
| KOSIPA Administrator | 5 groups grant all five console KOSIPA views (export still only through the allow-list) |
| TOKO Supervisor | role 4 |
| KOSIPA Operational Staff | **none** |
| TOKO Cashier | **none** (see R1) |
| Warehouse Supervisor (closest: global warehouse master) | **none** |
| Read-only Auditor | **none** |
| Warehouse Operator | **impossible**: no role maps to `warehouse.dispatch.*` / `toko.receiving.*` (W5) |

Findings:

* **R1: the real cashier role resembles a supervisor.** The role used by cashiers carries management-level legacy permissions, so with `CONSOLE_ENABLED` its users would land on `/console` (not `/pos`) and see the screens those permissions already open in legacy. The console grants nothing beyond the legacy slugs; details are in the private register (ANO-R01). This is an **owner decision** (register R1): accept the legacy grants as they are, or have an authorised operator narrow the role in legacy before console enablement. Engineering changes nothing by default.
* Branch-bound roles holding `users_edit` / `inventory_view` cannot administer identity links or see the global warehouse master in the console. This is by design.
* 49 legacy KOSIPA controller URLs have no console equivalent and grant nothing in the console.
* The KOSIPA menu query does not filter deactivated groups (legacy parity unverified); no account on the copy is affected (private ANO-R02). Recheck on the production export.

## 4. Still unresolved (features stay gated)

* Warehouse Operator and Warehouse Supervisor mappings (W5). The Warehouse preview stays synthetic and read-only.
* Production role parity: the copy is 30 Sep; run step 1 on production or authorised staging.
* Actual branch and company scope per user: the export carries the branch per pseudonymous user; acceptance needs the owner to confirm that this assignment is intended.
* R1 (cashier landing and permissions) before any console enablement for cashiers.
