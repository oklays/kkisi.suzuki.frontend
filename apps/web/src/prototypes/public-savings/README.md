# Isolated Public Simpanan Sukarela frontend prototype

Authorised Track B preparation22 October2026, **not official CP1-T01**. React client components follow existing web presentation ownership/KOSIPA palette and reuse the exact-rupiah formatter. No App Router page/API, production import, DB/provider adapter, real token/OTP issuance or persisted data. All member/period/reference/code/signature samples are explicitly synthetic. SVG strokes demonstrate input only; no production PNG encoding, signature-security validator, immutable artifact storage or PDF renderer is implemented.

`provisionalRules` in `fixture.ts` is **PROVISIONAL_UI_ONLY**: example minimumRp1, maximum null,16digit input bound for UI only. This is not owner-approved eligibility/payroll/cutoff/duplicate/range policy. Requested period is a fixed November2026 fixture, not a calculation or effective payroll promise. Confirmation/success/receipt are simulations; contact verification uses published example123456 entirely in memory, no OTP delivery. Resetting scenario/reloading discards the draft.

Files: `PublicSavingsPrototype.tsx` form/review/states; `SignatureField.tsx` reusable drawing/example/clear; `types.ts` temporary presentation interfaces; `fixture.ts` isolated mock/feedback; `prototype.css` preview styling; `preview.tsx` local scenario workbench. Nothing is exported from domain/application packages. Before official reuse, remove mock/sample paths and separately implement/review approved policy, backend authorization and artifacts.

## Local preview only

From repository root, existing dependencies must be installed. Build/browser tools stay in a temporary directory; repository manifests/lockfile are unchanged:

```sh
npm install --prefix /private/tmp/kkisi-public-savings-tools --no-audit --no-fund --package-lock=false esbuild@0.28.2 playwright@1.64.1 axe-core@4.14.0
PROTOTYPE_ESBUILD_MODULE=/private/tmp/kkisi-public-savings-tools/node_modules/esbuild node apps/web/scripts/public-savings-prototype.mjs
```

Open `http://127.0.0.1:3478`. No Next server/login/env file/account/database needed. Exact asset allowlist only (`/`, JS, CSS), GET/HEAD only, Host/Origin checked; `connect-src 'none'`, no-store. Bind is hardcoded loopback, no host override. Do not reverse-proxy/tunnel/share/deploy this preview or import it into a production route. Stop with Ctrl-C; it does not change other local services.

The selector demonstrates verification/loading/ready/invalid/expired/revoked/consumed/unavailable/success and a first-submit failure. Use123456 for mock verification; draw or select explicitly labelled sample signature, consent, review, then simulate. Keyboard users can use the sample signature; this is **not** an approved accessible production consent/signature substitute. Back from review retains actual in-memory strokes; failure/retry preserves draft. No raw signature/PDF upload is performed.

## Checks

```sh
node --experimental-strip-types --test apps/web/tests/public-savings-prototype.test.mjs apps/web/tests/kosipa-presentation.test.mjs
pnpm --filter @koperasi/web exec tsc --noEmit --project tsconfig.public-savings-prototype.json
node apps/web/node_modules/eslint/bin/eslint.js apps/web/src/prototypes/public-savings apps/web/scripts/public-savings-prototype.mjs apps/web/tests/public-savings-prototype.test.mjs apps/web/tests/public-savings-prototype-browser.mjs
PROTOTYPE_ESBUILD_MODULE=/private/tmp/kkisi-public-savings-tools/node_modules/esbuild PLAYWRIGHT_MODULE=/private/tmp/kkisi-public-savings-tools/node_modules/playwright/index.mjs AXE_PATH=/private/tmp/kkisi-public-savings-tools/node_modules/axe-core/axe.min.js node --test apps/web/tests/public-savings-prototype-browser.mjs
```

Browser suite uses installed Google Chrome, starts its own ephemeral loopback server and closes it. It checks real React interactions, keyboard/error focus/signature/back/retry/terminal states, computed font fallback,320/390/768/1440px and200% CSS zoom, axe WCAG A/AA tags, outbound request/persistence absence and preview host/origin/method/path denial. Screenshots/results default to `/private/tmp/kkisi-public-savings-prototype/`; override with `PROTOTYPE_OUT` for test artifacts. These checks do not prove real-device handwriting accessibility, production security, public token authorization or cross-channel integration safety. See spec19 for actual results and full-app typecheck limitation.
