# Koperasi Suzuki workspace

The Next.js application lives in [`apps/web`](apps/web/README.md). Pure policies/calculations and application use cases now live in private domain/application packages. Persistence adapters remain app-owned until Checkpoint 5.

## Development

Use pnpm **10.0.0**, pinned in the root `package.json`. The current tooling has been verified on Node **22.23.0**; target deployment runtime decisions remain in the migration plan.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm dev
```

Open `http://127.0.0.1:3000/login`. Existing local environment files belong in `apps/web/`; pnpm's filtered commands run with that application working directory. A new checkout can use `apps/web/.env.example` as the placeholder reference. Never commit real credentials, fixtures or database dumps.

## Commands

| Root command | Responsibility |
| --- | --- |
| `pnpm dev` | Start Next.js on loopback |
| `pnpm build` | Build the web application |
| `pnpm start` | Serve the production build on loopback |
| `pnpm lint` | Lint web and package code using the root configuration |
| `pnpm typecheck` | Typecheck workspace packages |
| `pnpm test` / `pnpm test:unit` | Run existing Node tests; DB tests remain opt-in |
| `pnpm db:generate` | Generate Prisma Client from the existing schema; no database migration |
| `pnpm db:validate` | Validate the existing Prisma schema; no database connection |

App-only commands are also available through `pnpm --filter @koperasi/web <script>`, for example `pnpm --filter @koperasi/web dev --port 3100`. Script arguments do not need npm's extra `--` separator.

Database-backed commands (`db:read-products`, `auth:status`, `auth:unlock`) and optional `test:browser` are forwarded at the root. They retain their existing local-staging guards and side effects; ordinary install/build/unit-test commands do not provision or reset databases. Shell operations under `apps/web/scripts/` remain explicit, separate actions.

## Shared configuration

`tsconfig.base.json` owns strict, no-emit compiler settings. Web extends it while retaining its browser libraries, JSX, Next plugin, local alias and generated-type includes. Pure TypeScript packages should extend the same base with `lib: ["esnext"]` and package-local source includes.

`eslint.config.mjs` owns lint settings and the existing auth-client/legacy-write restrictions. Next/React rules apply to web; package code uses the existing TypeScript preset. Generated outputs, dependencies, legacy source, documentation and the compatibility symlink are excluded. The app config re-exports the root config for app-local commands.

Lint dependencies remain declared by web. The root lint command invokes that installed ESLint from the repository working directory so it discovers both web and package code; no duplicate toolchain or config package is added.

When adding a real source package, declare private ESM exports pointing to intentional `.ts` subpaths and dependencies through `workspace:*`. Its local checks should use `tsc --noEmit`, `eslint .` and `node --experimental-strip-types --test tests/*.test.mjs`, with the corresponding tooling declared as development dependencies. Keep internal relative `.ts` extensions for the current Node runner; do not add cross-package TypeScript aliases or `--preserve-symlinks`. Package typecheck/tests join the existing recursive root commands. The installed-version workspace probe and its limits are recorded in the [Checkpoint 3 report](docs/refactor/CHECKPOINT_3_SHARED_INFRASTRUCTURE.md).

## Repository ownership

- `apps/web/`: App Router, UI, server crypto/composition, existing persistence/framework adapters, Prisma mappings, assets, integration tests and local operations.
- `packages/domain/`: pure inventory values, money, auth policies/errors and non-authoritative preview calculations; no runtime dependencies or framework/database/Node imports.
- `packages/application/`: inventory/auth/register use cases, repository ports and catalog projections; depends on domain through `workspace:*`. Buffer-backed auth storage ports remain server-facing.
- `docs/legacy-reference/`: original reverse-engineering documents, relocated without content changes.
- `docs/migration/`: migration rules, data ownership, implementation backlog and acceptance gates.
- `docs/refactor/`: [approved refactor plan](docs/refactor/MONOREPO_REFACTOR_PLAN.md) and checkpoint reports.
- `.kiro/specs/`: existing feature specifications.

The workspace uses one root `pnpm-lock.yaml` and deliberate package subpath exports, for example `@koperasi/domain/money` and `@koperasi/application/inventory`. Domain never imports application/web; application imports domain and its own ports. Web composes use cases with persistence and server identity adapters. No empty packages or Turbo configuration is introduced. The legacy PHP source and operational databases remain outside this refactor.

During the local directory move, an ignored `kkisi.web` compatibility symlink may exist for an already-running development server. It is not part of the repository structure in a fresh clone. Start future development sessions from the root commands above; the refactor does not automatically restart an existing process.
