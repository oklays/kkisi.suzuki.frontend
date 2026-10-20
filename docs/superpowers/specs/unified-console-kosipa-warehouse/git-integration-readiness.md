# Git integration readiness — review package (checkpoint 16)

**Review only. Nothing was pushed, merged or deployed. Owner decision: owner manual UAT comes first.** All figures were measured on 20 Oct 2026 from the local repository after `git fetch`.

## 1. Branch state (measured)

| Ref | Commit | Relation |
|---|---|---|
| `origin/master`, `origin/master-dev` | `da664297` | **already contain the whole Unified Console**, KOSIPA read modules and Warehouse preview (fast-forwarded earlier on the owner's explicit request, before UAT) |
| local `master` | `8fbf5402` | origin + 1 unpushed commit (`seed-products`, DEV LOCAL tooling only) |
| local `master-dev` | `da664297` | equals origin |
| `feat/unified-console` (working branch) | `852a1954` + this checkpoint's commits | master + 1 (KOSIPA navigation); master-dev + 2 |
| `hotfix/login-credential-exposure` | `9ddb7cd2` | one commit on the **old** master `81dab9ed` (44 commits behind current master) |

So the statement "do not merge into master yet" is already partly moot: the large accumulated feature set is on the remote integration branches **with every new capability behind a flag that defaults to off** (§4). What is still unpushed is small: `8fbf5402` (dev tooling), `852a1954` (KOSIPA navigation: 26 files, +596/−36) and this checkpoint's process-safety and documentation commits. The accumulated change since `81dab9ed` is 44 commits, 344 files, +22 873/−48.

## 2. Merge-conflict and content review

* `feat/unified-console` → `master` and → `master-dev`: fast-forward (no divergence in either direction), therefore no conflicts.
* `hotfix/login-credential-exposure` → current `master`: `git merge-tree` produces a tree **identical to master's tree**. The login fix (`87e2ee8f`, `861b234b`) is already on `master`; the hotfix adds nothing there. The only textual difference is `LoginForm`'s console `fallback` prop, which master has and the minimal hotfix deliberately lacks. See §6.
* Commit hygiene: 0 `Co-Authored-By` trailers in `81dab9ed..feat/unified-console`; all commits authored by one identity; subjects ≤ 118 characters.

## 3. Sensitive-content review

| Check | Result |
|---|---|
| Tracked env files | only `apps/web/.env.example` (placeholders `replace_me`); `.env*` is ignored |
| DEV LOCAL synthetic passwords (7 accounts) in the tip of `feat/unified-console`, `master`, `master-dev`, hotfix | **0 occurrences** (`git grep -F` per value; values never printed) |
| `.env.dev-local`, `.env.dev-local-accounts.json`, `.dev-local-run/` | git-ignored; credential files mode 600 |
| Database dumps / production rows | none tracked. Tracked `.sql` files are structure, proposals and synthetic fixtures (one fixture marker row `kkisi-pos-disposable-synthetic`) |
| `legacy-anomalies.md` (detailed legacy vulnerability notes) | git-ignored, not tracked |
| **Review item 1** | `docs/legacy-reference/09-security.md` (legacy vulnerability list) **is tracked and already on origin**. It pre-dates this program; the owner should decide whether it should stay in a shared repository. Not changed here |
| **Review item 2** | `deploy/genesis/env.production.example` names production hosting identifiers (database user/name pattern `n1608204_*`, host `srv149…`). No password, but it identifies infrastructure; consider generic placeholders before any wider sharing |
| `.DS_Store` | tracked and modified on every session; recommend untracking in a separate housekeeping commit |
| Operational financial writers enabled by default | none: every writer flag defaults to `0`/unset; KOSIPA has no writer; Warehouse has no stock posting |

## 4. Feature-flag and configuration inventory (defaults)

| Flag / setting | Default | Effect when on | Needs |
|---|---|---|---|
| `CONSOLE_ENABLED` | unset = **off** (`/console` answers 404, login falls back to `/pos`) | Unified Console shell, TOKO shortcuts | `DATABASE_URL_AUTH` (existing) |
| `KOSIPA_READ_ENABLED` | off | KOSIPA read-only pages and APIs | `CONSOLE_ENABLED` + console store `DATABASE_URL_CONSOLE` (identity links + audit) |
| `KOSIPA_EXPORT_ENABLED` + `KOSIPA_EXPORT_USER_IDS` | off / empty | CSV export for the listed console user ids only | KOSIPA read |
| `WAREHOUSE_PREVIEW_ENABLED` | off | **synthetic** Warehouse preview, no Gudang link, no stock effect | `CONSOLE_ENABLED` |
| `CONSOLE_LANDING_ROLES` (R1) | empty = derived landing | explicit role → landing mapping | owner decision R1 + real role export (O3) |
| `KOSIPA_STORE_COLUMN_MAP` (D5) | empty | payroll ↔ TOKO store column mapping | owner decision D5 |
| `POS_WRITES_ENABLED`, `PRODUCTS_WRITES_ENABLED`, `SALES_RETURN_WRITES_ENABLED`, `INVENTORY_WRITES_ENABLED` | `0` | existing TOKO writers (unchanged by this program) | each has its own least-privilege DSN |
| `APP_ENV`, `ALLOW_PRODUCTION_DB_WRITE`, `LEGACY_DB_CONNECTION_BUDGET` | deployment guard | startup refuses unsafe combinations | unchanged |

Turning `CONSOLE_ENABLED` off is a complete functional rollback of the console (no data change).

## 5. Database and deployment implications

* **No automatic migration runs with the application.** Required out-of-band objects, all operator-run and reviewed (`docs/migration/sql/`, `apps/web/db/`): the **console store** (`console-store-production.sql`: identity links + audit; needs trigger permission, question O7) — required only if `CONSOLE_ENABLED` + `KOSIPA_READ_ENABLED` are turned on; KOSIPA read indexes (`kosipa-read-indexes-proposed.sql`, proposal); `toko-stock-posting-idempotency-proposed.sql` (T1, not needed until D7).
* No change to legacy tables, legacy PHP or the existing auth store schema. `deploy/` changed by 14 lines of **commented** console settings in `env.production.example`.
* Connection pools: console store adds a small pool (`connection_limit=1`); the Warehouse writer pool is not wired. Capacity verdict (O4) is still missing; enabling more than one writer or a second app process needs it.
* Existing TOKO compatibility: `scripts/uat-run.sh` (8 phases incl. flags off) and the TOKO regression pass; with flags off TOKO behaves as before.

## 6. Independent login-security hotfix

* The fix exists **twice**: as the minimal one-commit branch `9ddb7cd2` (base: old master `81dab9ed`, no console code) and inside current `master`/`master-dev` (`87e2ee8f`, `861b234b`, plus the console `fallback`).
* Therefore: if production runs an image built from the **old** master line (no console), the minimal hotfix is the right artefact and remains valid. If the next production image is built from current `master`, the fix is already in it and the hotfix branch is redundant for that build (merging it is a no-op).
* **Owner/operator decision needed:** which commit does production currently run (image tag)? That single fact selects the release path. The hotfix must not be merged into the feature branch as a substitute for its own release path; it stays a separate artefact.
* Exact release steps, rollback and post-deployment checks: `login-hotfix-release-plan.md` (§4–§7). Containment (restrict log access, count-only exposure check) does not wait for the release.

## 7. Recommended integration sequence (nothing below is authorised yet)

1. Local verification on `feat/unified-console` (done: lint, typecheck, unit tests, browser suites, flag-state checks).
2. **Owner manual UAT** on DEV LOCAL (`kosipa-owner-walkthrough.md`, `owner-uat-checklist.md`). Only written owner results count.
3. Fix confirmed defects with regression tests; re-run the suites.
4. Prepare a reviewable pull request from `feat/unified-console` limited to the commits after `da664297` (small), with this document as its description.
5. After approval: integrate to `master-dev` first (fast-forward), keep `master` as the release line.
6. Representative staging (`representative-staging-plan.md`; entry criteria incl. O1, O3, O4 evidence and sanitised data authorisation).
7. Production release planning per module and per flag (console first with flags off, then KOSIPA read for named users, never a writer); separate written production approval for each step.
8. The login hotfix follows its own track and may be released before any of the above.

Do **not** treat the accumulated branch as one unrestricted production release: unfinished modules stay off through their flags; KOSIPA official balances, payroll parity, Warehouse real integration and every financial writer remain blocked (see the blocker list in `owner-operator-action-package.md`).
