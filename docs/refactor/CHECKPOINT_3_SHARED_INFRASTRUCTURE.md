# Checkpoint 3 — Shared Infrastructure

Date: 2026-10-02 (Asia/Jakarta). Status: implemented and verified; stopped at the checkpoint reporting boundary. Branch: `refactor/monorepo-foundation`, based on `3308355`. CP2 changes remain in the working tree alongside CP3. No commit, push, merge or deployment was performed. CP4–8 remain pending.

## Reviewed

- Approved CP3 scope in [the refactor plan](MONOREPO_REFACTOR_PLAN.md), CP2 report, root/app manifests and developer instructions.
- Existing TypeScript options, Next flat ESLint presets, auth-client/legacy-write lint restrictions and route/source security tests.
- Native Node test runner, package-manager resolution, current source imports and ownership boundaries. Documentation-first/no operational DB writes constraints were retained; no PHP audit was performed.

## Changes

- Added root `tsconfig.base.json` with the app's existing shared strict, no-emit, bundler-resolution settings. Web extends it, retaining browser libraries, JS/JSX handling, incremental compilation, the Next plugin, `@/*` alias and generated-type includes locally.
- Added root `eslint.config.mjs`. Web re-exports it through its app-local configuration. Next/React rules remain scoped to web; package code receives the existing TypeScript preset. Existing auth-client restrictions and legacy-write restrictions are preserved; legacy-write restrictions also cover package source.
- Root lint now invokes the web-owned installed ESLint from the repository working directory, discovering both app and package code. Dependencies, generated outputs, documentation, the compatibility alias and legacy source are excluded.
- Updated the root README with shared configuration ownership and real-package conventions for exports, dependencies and local lint/typecheck/test scripts.

## Architecture Decisions

- Share root configuration files rather than introduce a configuration package. No empty packages, generic helpers, new UI primitives or testing framework were added.
- Reuse web's explicitly declared ESLint/Next tooling with Node's `createRequire`; do not assume pnpm hoists undeclared dependencies to the root. The root CLI entry point uses the installed web-owned binary. Future real packages declare the tooling for their own local checks.
- Use absolute config base paths and an explicit Next root setting so root and app commands apply the same rules. The Next root setting is the only intentional addition to the app's effective settings; lint rules and parser options remain unchanged.
- Keep existing auth configuration, HTTP helpers, currency functions, tests and fakes in their current locations. Domain/application extraction belongs to CP4.
- Prepare source-package consumption through real temporary `workspace:*` links, deliberate `.ts` exports and the existing type-stripping test runner. Avoid a loader, cross-package aliases, preserve-symlink flags or emitted package builds.

## Moved / Extracted

| Responsibility | Owner |
| --- | --- |
| Framework-independent compiler settings | Root `tsconfig.base.json` |
| Browser/Next compiler settings and local includes | `apps/web/tsconfig.json` |
| Shared lint presets, scopes and security restrictions | Root `eslint.config.mjs` |
| App-local lint discovery | One-line re-export in `apps/web/eslint.config.mjs` |

## Reusable Components / Functions

Only compiler/lint configuration was consolidated. No runtime functions, components, hooks, business rules or tests were moved or changed. New packages can use the shared configuration without copying the app's Next/browser configuration.

## Dependency Changes

No dependency specifications, package ownership or resolved versions changed. The root lockfile and app manifest remain byte-identical to CP2. There are still no extracted production packages. The two probe packages and their additional workspace dependencies exist only in `/private/tmp/kkisi-cp3-workspace-d9e2k_0f/`; they are not repository changes.

## Validation

| Check | Command / procedure | Result |
| --- | --- | --- |
| Install | `CI=true pnpm install --frozen-lockfile --offline --store-dir .pnpm-store` | Exit 0; already up to date; lock unchanged |
| Root lint | `pnpm lint` | Exit 0; discovers 86 app/config/script/test files and zero unrelated files |
| App lint | `pnpm --filter @koperasi/web lint` | Exit 0 |
| Typecheck | `pnpm typecheck` | Exit 0 |
| Tests | `env -u AUTH_TEST_DATABASE_URL -u AUTH_TEST_LEGACY_URL -u AUTH_TEST_FIXTURE -u POS_STAGING_DB_TEST pnpm test` | Exit 0; 123 tests: 107 passed, 16 skipped, zero failures |
| Build | `pnpm build` | Exit 0; three application pages, six API handlers and proxy retained |
| Compiler parity | TypeScript API parses old standalone config and new inherited config | Compiler options and included files match after removing config-filename metadata |
| Lint parity | ESLint API compares five representative UI/server/CLI/test paths under root and app working directories | All effective rules and parser options match |
| Security/exclusion probes | ESLint `lintText`/`isPathIgnored` assertions, using virtual paths | Forbidden auth import and legacy-write variable rejected; auth-owner exception retained; unrelated/generated/dependency paths excluded; package TypeScript scope has no Next plugin rules |
| Source/input preservation | Pre-move hashes and input path/mode comparison | All 63 source files, 34 assets, tests, 11 reference docs and schema/SQL unchanged; all seven private inputs preserved |
| Diff hygiene | `git diff --check` | Passed |

An isolated copy with no private environment files, fixtures or dumps added two tiny private ESM probe packages: web → application-probe → domain-probe. Both use `workspace:*`, public `.ts` exports and the shared base config with ESNext libraries. Each declares local `lint`, `typecheck` and Node test commands. Its install reused the existing package versions offline; a subsequent frozen install passed. Explicit Prisma generation passed without a database connection.

In that copy, root and package-local lint passed, root typecheck passed for all three workspace consumers, and root tests passed: 126 total, 110 passed, 16 skipped, zero failures. Root lint discovered 91 files, including both package implementations and their tests. The three extra tests verify the exported package APIs and web's transitive import under `node --experimental-strip-types`.

The temporary home page also imported the application probe for rendering. Its production build passed, and generated HTML contained `data-workspace-probe="42"`, demonstrating that Next compiled the application → domain source exports. No `transpilePackages` setting, loader or compiled package output was needed for this probe. This is tooling evidence for small source packages; CP4 must still validate the actual extracted business modules.

## Behavior Compatibility

Application runtime source, routes, API handlers, UI styles/copy/assets, database queries, schema and existing tests remain unchanged. Effective app compiler settings and lint rules are preserved. No DB setup, integration write, operational DB access, user-server restart or deployment occurred. Existing PID `52179` remains listening on `127.0.0.1:3000`.

## Risks / Notes

- A first lint attempt traversed the repository from the filtered app working directory and failed at the parent traversal boundary. Root lint now runs the web-owned CLI with the repository cwd; both file-discovery counts and package inclusion were verified. No unmatched-pattern suppression remains.
- The first temporary-copy test run happened before explicit Prisma generation and failed three test-file imports of the ungenerated client. After running the existing documented prerequisite, all tests passed. The sandbox cache timestamp restriction required approved local Prisma generation, as in CP2; no application fix was needed.
- Root lint intentionally excludes root documentation/tooling files and other apps outside `apps/web`. Add scopes when a real additional app is introduced. The root config currently requires the web-owned lint dependencies to be installed.
- The 16 DB opt-in tests remain skipped; authenticated browser/DB behavior was not rerun. The source-package probe does not replace integration acceptance or the actual CP4 extraction checks.
- Original generated Next environment declarations were restored after build to avoid a generated-only source diff. Changes remain uncommitted; no content is staged.

## Next Checkpoint

CP4 — Domain and Application Boundaries: start with the established Product slice, extracting pure values/errors/money into domain and repository ports/read use cases/catalog into application through focused public exports. Validate that slice before the separately verified auth/preview slice. Preserve calculations, session/throttle rules, errors and API contracts; do not implement unbuilt migration modules. Stop and report at the approved checkpoint boundary.

Configuration references checked on 2026-10-02: [TypeScript inheritance](https://www.typescriptlang.org/tsconfig/extends.html), [ESLint configuration scopes](https://eslint.org/docs/latest/use/configure/configuration-files), [ESLint exclusions](https://eslint.org/docs/latest/use/configure/ignore), [Node TypeScript runtime limits](https://nodejs.org/api/typescript.html). Installed-version commands above are the compatibility evidence.
