# Checkpoint 2 — Workspace Foundation

Date: 2026-10-02 (Asia/Jakarta). Status: implemented and verified; stopped at the requested checkpoint boundary. Branch: `refactor/monorepo-foundation`, based on `3308355`. No commit, push, merge or deployment was performed. The full refactor remains pending CP3–8.

## Reviewed

- Approved [refactor plan](MONOREPO_REFACTOR_PLAN.md), root guidance/ignore rules and current application manifest, npm lock, Next/TypeScript/ESLint configuration.
- Application scripts, test imports, route inventory and documentation references affected by the move.
- Migration system map, ownership/boundary/validation documents, current POS integration evidence and existing POS feature specifications. Historical acceptance results remain historical.
- Existing local input paths and permissions were recorded without displaying credentials, environment contents or dumps. No legacy PHP source was inspected.

## Changes

- Moved `kkisi.web/` to `apps/web/`, retaining the existing internal layers, routes, tests, assets, Prisma schema and operational scripts.
- Added private root/workspace manifests, pinned `pnpm@10.0.0`, a single root `pnpm-lock.yaml`, root development/validation commands and filtered operational command forwarding.
- Set an explicit repository root for Next Turbopack; the build no longer infers a root from competing npm locks.
- Added the root developer README and updated live documentation/specification paths, app README and command/help text. Original reference-document contents were preserved.
- Preserved ignored local inputs during the directory move. Retained an ignored local `kkisi.web -> apps/web` symlink for the existing process and old IDE paths. Fresh clones use `apps/web/` directly.

## Architecture Decisions

- Use pnpm's workspace/filter/recursive commands. There is one application today, so Turbo provides no demonstrated benefit at this checkpoint.
- Keep the app intact while establishing the workspace. Shared configuration is CP3; domain/application extraction is CP4; persistence extraction is CP5.
- Declare `apps/*` and `packages/*` workspace patterns without creating empty future packages.
- Keep environment files and operational commands owned by the app. Filtered commands execute from `apps/web`; ordinary validation does not provision, seed, unlock, migrate or reset databases.
- Permit the four existing dependency lifecycle scripts needed by Prisma and the lint resolver through pnpm's explicit build allow list. Document explicit `pnpm db:generate` after install.

## Moved / Extracted

| Before | After | Content |
| --- | --- | --- |
| `kkisi.web/` | `apps/web/` | Existing Next.js app, configuration, assets, tests and local operations |
| `kkisi.web/docs/*.md` | `docs/legacy-reference/*.md` | All 11 original reference documents, unchanged |
| `kkisi.web/package-lock.json` | Root `pnpm-lock.yaml` | Converted dependency graph with preserved versions, integrity and origins |

All 63 `src/` files (60 TypeScript/TSX files and three stylesheets), 34 assets, test files, schema and SQL definitions match their pre-move hashes. Of 154 recorded non-sensitive application files, 144 remain byte-identical, nine changed for configuration/documentation/command text, and the npm lock is the sole expected removal. All seven recorded private input paths retain their existence and permissions.

## Reusable Components / Functions

No application logic, component, hook or reusable function was extracted in CP2. Existing helpers and business rules retain their original ownership and behavior. Root scripts provide the common developer entry points.

## Dependency Changes

- App workspace identity is now private `@koperasi/web`; no internal package dependencies exist yet.
- All 13 direct dependency specifications and resolved versions are preserved, including Next `16.3.7`, React/React DOM `19.3.0`, TypeScript `5.9.3` and Prisma/client `6.12.0`.
- The npm and pnpm locks contain the same 410 distinct package/version pairs. Every recorded integrity hash and tarball origin matches; no version was added, removed or upgraded.
- Import initially selected Prisma's `jiti@2.4.2` for ESLint's optional peer. The final lock restores the original ESLint `jiti@2.7.0` resolution while retaining Prisma's `2.4.2`; frozen installation validated that graph.
- Removed the app npm lock and local empty root npm lock after clean pnpm installation and validation passed. The original npm lock and installation are backed up at `/private/tmp/kkisi-cp2-pre-pnpm.4vbyIl/` for local recovery. This temporary backup is not a durable repository artifact; the baseline lock remains available at commit `3308355`.

## Validation

First, the moved app passed its existing npm lint, typecheck, tests and production build before package-manager conversion. Then a clean workspace copy containing source, manifests and placeholder configuration—but no private environment, fixture or dump files—passed frozen pnpm install, Prisma generation, lint, typecheck, unit tests, schema validation and build. Finally the working repository passed the same root checks using pnpm.

| Check | Command / procedure | Exact result |
| --- | --- | --- |
| Install, clean copy | `pnpm install --frozen-lockfile --store-dir <repository>/.pnpm-store` | Exit 0; 352 package instances installed; no inherited npm `node_modules` |
| Install, working checkout | `CI=true pnpm install --frozen-lockfile --offline --store-dir .pnpm-store` | Exit 0; 352 reused, zero downloads, no resolution change |
| Generate | `pnpm db:generate` | Exit 0; Prisma Client `6.12.0` generated from unchanged schema |
| Lint | `pnpm lint` | Exit 0 |
| Typecheck | `pnpm typecheck` | Exit 0 |
| Tests | `env -u AUTH_TEST_DATABASE_URL -u AUTH_TEST_LEGACY_URL -u AUTH_TEST_FIXTURE -u POS_STAGING_DB_TEST pnpm test` | Exit 0; 123 tests: 107 passed, 16 skipped, zero failures |
| Schema | `DATABASE_URL=mysql://placeholder:placeholder@127.0.0.1:3307/kkisi_staging pnpm db:validate` | Exit 0; schema valid; three existing relation-mode index warnings; no connection |
| Build | `pnpm build` | Exit 0; `/`, `/login`, `/pos`, all six API handlers and proxy present |
| Development startup | Clean-copy `pnpm dev --port 3112` | Ready; anonymous HTTP checks below passed |
| Production startup | Working-checkout `pnpm start --port 3110` | Ready; anonymous HTTP checks below passed |
| Dependency parity | Compare converted lock against baseline npm lock | 410/410 package versions; zero version, integrity, origin or direct-resolution differences |
| Source/input preservation | Pre/post hashes and path/mode comparison | Source, assets, tests, reference documents, schema/SQL unchanged; seven private input paths preserved |
| Diff hygiene | `git diff --check` | Passed |

Both startup modes returned `200` for `/` and `/login`, `307` to `/login` for anonymous `/pos`, and `401` for anonymous `/api/pos/products`. These requests did not log in or exercise database writes. Verification servers were stopped afterward. The pre-existing developer server, PID `52179`, remains listening on `127.0.0.1:3000` and was not restarted.

## Behavior Compatibility

The application source, routes, UI assets/styles, authorization logic, use cases, persistence queries and schema/SQL definitions remain unchanged. Unit results match the pre-move suite and route/startup checks pass under the workspace. No operational DB, business data, grants, authentication policy or legacy acceptance status was changed.

This is structural and unit/startup evidence. The 16 opt-in tests remain skipped; authenticated browser and database integration flows were not rerun in CP2. Existing historical integration results are not presented as new monorepo acceptance evidence.

## Risks / Notes

- The runtime was verified with local Node `22.23.0` and pnpm `10.0.0`. Deployment paths/package-manager setup must be reviewed before any later deployment; no server configuration was changed.
- A fresh install's Prisma client lifecycle can warn about finding no schema at the workspace root. The documented explicit app-scoped `pnpm db:generate` succeeds and is required before development/build.
- Prisma schema validation retains three warnings about indexes under `relationMode = "prisma"`. The schema is byte-identical; adding indexes is outside this structural checkpoint.
- The sandbox initially prevented a cached Prisma-engine timestamp update and loopback server binds. The same generation/startup commands succeeded with approved local execution; these were environment restrictions, not refactor failures.
- The local compatibility symlink is ignored and absent from a fresh clone. Use root commands for subsequent sessions. The existing process retains its original dependency cache until the developer next restarts it.
- Changes remain uncommitted and reviewable as renames. Intent-to-add entries expose new files to the diff; no file content is staged.

## Next Checkpoint

CP3 — Shared Infrastructure: centralize the TypeScript and lint settings that the upcoming real packages will share, preserving strict settings and current app behavior. Do not introduce speculative shared/UI/testing packages. Validate root lint, typecheck, tests and build, then stop and report. The remaining domain/application, data-access, feature cleanup, dependency enforcement and final architecture work is CP4–8.
