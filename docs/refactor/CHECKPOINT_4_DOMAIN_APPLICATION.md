# Checkpoint 4 — Domain and Application Boundaries

Date: 2026-10-02 (Asia/Jakarta). Status: implemented and verified; stopped at the checkpoint reporting boundary. Branch: `refactor/monorepo-foundation`. The user authorized local commits and a clean Git working tree. The earlier workspace/configuration foundation was committed as `f203382`; CP4 is a separate commit after validation/review. No push, merge or deployment is included. CP5–8 remain pending.

## Reviewed

- Approved [refactor plan](MONOREPO_REFACTOR_PLAN.md), CP2/3 reports, workspace configuration, package/runtime probe evidence and developer guidance.
- Existing inventory projections/repository contract, money/errors, Product reader/catalog, auth policies/ports/use cases, register reader, preview calculations and all consumers in routes, UI, adapters, CLIs and tests.
- Existing database ownership and security constraints. No protected environment/fixture contents, dumps or legacy PHP source were inspected.

## Changes

- Added private `@koperasi/domain` and `@koperasi/application` packages with focused `.ts` subpath exports, strict/no-emit TypeScript configuration and local lint/typecheck/test scripts.
- Extracted Product values/errors/money into domain; moved repository/search ports, Product reader and catalog projections/functions into application. Updated consumers to public workspace imports.
- Validated the Product slice before continuing with auth and preview.
- Extracted pure password/redirect/session/throttle policies and errors into domain. Moved Buffer-backed session/throttle DTOs and dependency ports into application alongside login, logout, session validation, branch selection and register reading.
- Moved unchanged SHA-256 session hashing/password fingerprinting to `apps/web/src/server/auth-crypto.ts`. Injected the adapter through `AuthDeps.identity`; login uses the existing `deps.random.bytes(32)` port. The production composition still supplies Node's cryptographic random source and the same hashing functions.
- Extracted non-authoritative cart calculations to domain with minimal generic product/cart shapes. UI metadata remains attached to products; image/currency display helpers remain in web.
- Split UI-only session/member/status/payment/illustration types into `apps/web/src/features/pos/types.ts`. Application owns catalog projections. No UI redesign or HTTP contract change was made.
- Moved existing tests with their owners and retained the assertions. Added only identity/random-source injection and product-metadata preservation coverage. Updated current README ownership and marked historical migration paths as historical.

## Architecture Decisions

- Dependency direction is web → application → domain; web also consumes pure domain policies/calculations. Infrastructure remains in web for CP5 and implements application ports.
- Domain has no runtime dependencies, Buffer DTOs, Node crypto, framework/persistence imports or environment access. Application has no Next/React/Prisma/HTTP adapters; Buffer types are confined to server-facing contracts/results.
- Package exports are deliberate subpaths, not a giant root barrel or `/src` imports. Normal pnpm workspace symlinks support native Node TypeScript tests/CLIs and Next compilation. No loader, emitted package build or `transpilePackages` addition was required.
- Keep server hashing app-owned and pass it through a narrow session identity port. Preserve algorithms, session-ID size, deadline/revocation/throttle behavior and error semantics.
- Keep preview calculations explicitly non-authoritative. Their minimal product constraints do not depend on higher-layer catalog DTOs; generic cart lines preserve the complete presentation product.
- Do not create a UI/shared/validation/testing/config package or move Prisma early. Persisted queries, SQL definitions, schema, grants and data remain unchanged.

## Moved / Extracted

| Previous responsibility | Current owner / public API |
| --- | --- |
| Inventory values + Product errors | `packages/domain/src/inventory/` → `@koperasi/domain/inventory` |
| Integer-sen conversion | `packages/domain/src/money/` → `@koperasi/domain/money` |
| Pure auth rules/errors | `packages/domain/src/auth/` → focused `/auth/*` exports |
| Preview cart calculations | `packages/domain/src/pos/preview.ts` → `/pos/preview` |
| Item repository/search ports + Product reader | `packages/application/src/inventory/` → `/inventory` |
| Catalog projection/functions | `packages/application/src/pos/` → `/pos/contracts`, `/pos/catalog` |
| Auth ports and use cases | `packages/application/src/auth/` → `/auth/ports` and focused use-case exports |
| Register reader | `packages/application/src/pos/read-register.usecase.ts` → `/pos/register` |
| Session SHA-256/fingerprint adapter | `apps/web/src/server/auth-crypto.ts` |
| UI-only POS types | `apps/web/src/features/pos/types.ts` |
| Existing money/policy/preview tests | `packages/domain/tests/` |
| Existing Product/catalog tests | `packages/application/tests/` |

## Reusable Components / Functions

Pure money, inventory values/errors, auth policies and preview calculations can now be consumed independently of Next. Application readers/catalog/auth/register use cases expose focused APIs through injected ports. Existing behavior was relocated, not rewritten; image selection, currency display, HTTP handlers, worker verification and database adapters retain app ownership. No speculative abstraction or additional runtime dependency was introduced.

## Dependency Changes

- Web declares `@koperasi/domain` and `@koperasi/application` through `workspace:*`; application declares domain through `workspace:*`.
- Both packages declare existing ESLint `9.39.5` and TypeScript `5.9.3` as development tools. Application declares the already-installed Node types `22.20.4` for its Buffer-backed ports; domain excludes ambient types and uses ESNext libraries.
- All 410 third-party package/version records, integrity hashes, tarball origins and peer/dependency snapshots match `f203382`. Only workspace importers changed. pnpm's re-resolution normalization of download origins/optional Jiti metadata was restored to the baseline before frozen-install verification.

## Validation

| Check | Command / procedure | Result |
| --- | --- | --- |
| Foundation gate | Fresh root lint/typecheck/tests/build before the first commit | Passed; 123 tests, 107 pass, 16 skip, zero failures |
| Product gate | Root lint/typecheck/tests/build after Product extraction, before auth | All exit 0; aggregate 123 tests, 107 pass, 16 skip, zero failures |
| Frozen install | `CI=true pnpm install --frozen-lockfile --offline --store-dir .pnpm-store` | Exit 0; four workspace projects; lock valid |
| Lint | `pnpm lint` | Exit 0 |
| Typecheck | `pnpm typecheck` | Exit 0 for domain, application and web |
| Tests | `env -u AUTH_TEST_DATABASE_URL -u AUTH_TEST_LEGACY_URL -u AUTH_TEST_FIXTURE -u POS_STAGING_DB_TEST pnpm test` | Exit 0; domain 9/9, application 12/12, web 88 pass/16 skip; aggregate **125 tests, 109 passed, 16 skipped, zero failures** |
| Build | `pnpm build` | Exit 0; `/`, `/login`, `/pos`, six API handlers and proxy retained |
| Identity regression | Targeted `auth-login.test.mjs` test for injected random/identity | Failed against pre-extraction login; passed after injection; verifies 32-byte request, exact adapter calls, stored hash/fingerprint and cookie SID |
| Preview regression | Split domain/web preview tests | 7/7 passed; all six prior scenarios retained plus product metadata/reference preservation |
| Source graph | TypeScript AST import/export/dynamic-literal resolution, including type edges | 66 TS/TSX files, 143 local edges, zero unresolved local imports, zero static cycles, zero lower-layer leaks |
| Persistence parity | TypeScript-printed adapter/key bodies excluding imports, compared with `f203382` | Identical Product/legacy/session/throttle adapter and key-generation bodies |
| Dependency parity | Parsed root lock comparison with `f203382` | All 410 package records and snapshots identical; workspace importers differ |
| Diff hygiene | `git diff --check` | Passed |

A separate clean copy at `/private/tmp/kkisi-cp4-clean-3oacdgas/`, containing manifests/source/configuration but no protected environments, fixtures, dumps or inherited `node_modules`, passed offline frozen install (352 cached package instances, no downloads), explicit Prisma generation, root lint/typecheck/tests/build and schema validation. Schema validation used a placeholder URL without connecting and retains the same three relation-mode index warnings. Generation used approved local execution for the existing Prisma engine cache permission requirement.

Production startup on loopback port 3124 passed anonymous GET checks: `/` and `/login` → 200; `/pos` → 307 `/login`; `/api/pos/products` and `/api/pos/register` → 401; GET on auth login/logout/company → 405. No login/DB write was performed. The verification server was stopped; the user's existing PID `52179` on port 3000 was left running.

A separate read-only review against `f203382` approved CP4 with no Important/Critical findings. It checked public exports/consumers, retained test scenarios, auth/persistence/preview preservation and the domain/application boundaries. Its generated-file note was addressed by restoring `next-env.d.ts` to its baseline development declarations after build.

## Behavior Compatibility

Production randomness still uses Node `randomBytes(32)` through the existing port; SHA-256 hashes/fingerprints are unchanged. Auth session deadlines, revocation, permission/branch/throttle behavior and safe errors remain intact. Price conversion, discount arithmetic, stock clamps and preview cart rules retain existing behavior. Database adapter bodies, Prisma schema, SQL definitions and assets/styles remain unchanged except for import rewiring where needed.

All original 123 test scenarios remain represented across owners; the aggregate increase is exactly the two targeted regressions. The 16 DB opt-in tests remain skipped. Synthetic fixtures and operational acceptance status were not changed.

## Risks / Notes

- Source exports and Node's native test runner are verified with Node `22.23.0`/pnpm `10.0.0`; deployment/runtime decisions remain a later gate.
- Intermediate export-key and whitespace mistakes were corrected before final checks. Final package exports resolve and the build is passing.
- A DB-test fixture composition previously supplied an empty unused random stub; it now supplies actual cryptographic randomness because login correctly consumes the declared port. Those guarded DB tests were not executed in this checkpoint.
- No authenticated browser/DB integration suite was rerun. Unit, build, clean-install and anonymous startup evidence do not replace those acceptance gates. No operational database writes occurred.
- The static graph excludes dynamically computed/eval-worker imports; worker bcrypt remains covered by existing verifier tests. Permanent full dependency enforcement is CP7.
- Local temporary verification copies are outside Git. The ignored compatibility alias/private inputs remain local. Committing does not push or deploy this branch.

## Next Checkpoint

CP5 — Data Access: move existing Prisma clients/schema and inventory/auth persistence adapters to a private data-access package through deliberate server APIs. Preserve query text/predicates/order/limits, retries/locking/purge behavior, independent pools/singletons and generation ownership. Keep bounded auth-maintenance operations available to the existing CLIs without exposing the raw auth client. Run the root validation suite and stop with its report before CP6.
