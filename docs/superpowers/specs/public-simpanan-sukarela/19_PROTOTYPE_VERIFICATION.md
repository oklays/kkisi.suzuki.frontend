# 19 — Controlled frontend preparation: results and handover

Prototype results22 Oktober2026; **CP0.6 baseline updated23 Oktober2026, Asia/Jakarta: full web/workspace TypeScript PASS; TSC-01 CLOSED.** No official CP1-T01 code started. Parent P0 closure remains0/6; U-01 prevention and U-02 prototype scope approved, business/security/operational decisions still pending13/15/17. No re-audit, remote source/DB/provider access or legacy changes in CP0.6.

## Implemented

Isolated React/TypeScript presentation in `apps/web/src/prototypes/public-savings/`: readonly synthetic member context, exact-rupiah input/summary, controlled SVG signature/example/clear, explicit example consent, actual-stroke review, back/edit, failure/retry preserving draft, mock verification and loading/invalid/expired/revoked/consumed/unavailable/success states. Existing KOSIPA palette/system-font fallback and exact-rupiah helper reused.10 selectable fixture scenarios; no App Router page/API/navigation import or real business service.

Provisional minimumRp1 / maximum null is labelled **PROVISIONAL_UI_ONLY**, not approved business policy. Requested November2026 is fixed fixture data. All runtime state is memory-only; no real token/OTP generation/delivery, public API, file upload/PDF/security signature encoding or production account involved. Success is explicitly a simulation and not approval/payroll effect.

Local-only preview serves an exact3-path GET/HEAD allowlist at127.0.0.1, validates Host/Origin, forbids network connections via CSP, and never loads env/account files. Preview/browser tools installed only in temporary directory; no repository manifest/lockfile change. [Preview and reproducible commands](../../../../apps/web/src/prototypes/public-savings/README.md).

## Actual verification

| Check | Actual result / scope |
|---|---|
| TDD unit/markup | initial scaffold produced5 expected assertion failures/1 isolation pass; final6 prototype tests PASS |
| Relevant regression |5 existing KOSIPA presentation tests PASS; combined focused command11/11 PASS,0 skips |
| Browser/component interactions |8/8 PASS on installed Google Chrome headless; own ephemeral loopback server closed after suite |
| Signature/review/retry | real pointer drawing/clear, review shows identical stroke coordinates, back retains signature/amount/consent; simulated first failure then retry succeeds; regression originally caught lost-stroke bug and passes after controlled-state fix |
| Accessibility |15 axe WCAG A/AA-tag scans across verification/form/errors/review/terminal states and viewports,0 violations; keyboard Tab/focus/error summary also checked. Not a manual screen-reader certification or approved accessible production signature alternative |
| Responsive/visual |320/390/768/1440px,16digit display,200% CSS zoom without page overflow; desktop/mobile/review screenshots inspected; standalone missing-font-variable fallback caught and corrected with computed-font regression |
| Isolation/security boundary | browser0 outbound or mutation requests,0 runtime page errors, empty local/session storage/cookies; raw HTTP foreign Host/Origin403, POST405, env/API paths404, bind127.0.0.1 verified. Node fetch rewrites Host, so actual Host rejection tested with raw HTTP client |
| Scoped TypeScript | `pnpm --filter @koperasi/web exec tsc --noEmit --project tsconfig.public-savings-prototype.json` PASS; strict inherited settings, prototype and imported presentation dependency checked |
| Lint | targeted ESLint over prototype, preview server and both tests PASS,0 warnings/errors |
| Full app TypeScript |22 Oct historical BLOCKED: `.next/dev/types/validator.ts:812` TS1128. **23 Oct RESOLVED/PASS**, app and workspace commands exit0 after framework regeneration; see TSC-01 below |
| Full Next build/full workspace suites | NOT RUN; standalone fixture bundle built for real browser tests. No production route/integration change; relevant existing regression ran separately |
| Actual Laravel/CI2/MariaDB integration | **NOT RUN / NOT PROVEN**;18 INT-01..04 requires separately approved source-equivalent staging, actual handlers/accounts/controls and human owner sign-off. UI tests do not close P0-05 |

## CP0.6 TSC-01 — full application baseline CLOSED23 Oktober2026

**Reproduction:** unchanged `pnpm --filter @koperasi/web typecheck` failed TS1128 line812. Existing generated dev validator contained `xpected<typeof handler>` and duplicated root/sales layout tail, while omitting KOSIPA page/layout validation. `apps/web/tsconfig.json` correctly includes generated production and dev types; no exclusion/relaxed compiler setting was added.

**Source of the error:** stale/corrupted generated route artifact, not a current page/config TypeScript syntax error. Installed Next.js **16.3.7** docs support `next typegen`; inspected `dist/cli/next-typegen.js`, `dist/server/lib/router-utils/{typegen,route-types-utils}.js` and actual app config. Config only reads package version and sets Turbopack root; no business service imported/executed. The exact historic event that corrupted the cache is **unknown**; no claim of a proven Next bug or concurrent-server cause. Relevant dev process3201 was left running;3000 and3203 belong to other workspace roots, not evidence of shared-cache writers.

**Recovery:** backed up generated dev files and tracked tsconfig/next-env to `/private/tmp/kkisi-cp06-20261023/`; ran `pnpm --filter @koperasi/web exec next typegen` (PASS, production-type output). CLI does not replace this separate dev validator, so invoked the **installed framework's own** `discoverRoutes` → `createRouteTypesManifest` → `writeRouteTypesManifest` / `writeRootParamsTypes` / `writeValidatorFile` for `.next/dev/types`, with actual `src/app`, configured default page extensions and dev-relative paths. Generated content was parsed successfully in memory before replacement and checked byte-for-byte after write. **No handwritten generated-file patch**, deleted app cache tree, dependency upgrade, compiler weakening, source/config change or service restart.

| Evidence | Actual23 Oct result |
|---|---|
| Old generated validator | SHA256 `10e247440d3221565e9683dde28f009c1e1c664dcd20982af01f4eba97f83ba3`,31500bytes, parse diagnostic1128/line812 |
| Regenerated dev validator | SHA256 `809b58786d946edbd352fe687ecdcb77a0a66200c0ad2ae3820475e8acf861b7`,31500bytes,0 parse diagnostics; restored missing KOSIPA page/layout checks and removed corrupt duplicate tail |
| Fresh discovery coverage |38 app pages,45 handlers,5 layouts; production and dev route checkers generated from current source, not a replacement stub |
| Full app check | `pnpm --filter @koperasi/web typecheck` **PASS / exit0**,0 remaining TypeScript errors |
| Full workspace check | `pnpm typecheck` **PASS / exit0**,domain/application/web all Done; no remaining pre-existing/source/regression errors surfaced |
| Focused regression |6 prototype+5 existing KOSIPA presentation tests **11/11 PASS**,0 skips23 Oct. Browser8/8+axe15/0 remain22 Oct evidence; all prototype source hashes unchanged, not falsely dated as rerun23 Oct |
| Preservation |935 tracked/untracked non-env file hashes recorded before recovery; before documentation edits all unchanged, including app source, tsconfig, next-env, manifests and prototype. HEAD/index SHA unchanged; no Git staging operation |

Recovery evidence JSON and corrupt validator backup remain local in the temporary directory; no secrets/member rows copied. Native generation is version-specific: if this recurs after tooling changes, recheck installed generator/config and live process paths; do not paste an old validator or exclude `.next/dev/types` to mask errors. Typegen is a type-artifact command, not a build/deployment/business-runtime test.

Artifacts: `/private/tmp/kkisi-public-savings-prototype/results.json` and6 screenshots (`form-390`, `form-1440`, `review`, `submit-error`, `success`, `zoom-200`). Temporary screenshots are local review artifacts, not committed requirements or evidence of production behavior. Tests/reproduction commands are in prototype README.

Final documentation validation PASS:30 Markdown files including prototype README,80 local links,41 all-family requirement IDs, skill coverage validator and whitespace/fence/table checks; `git diff --check` clean. HEAD and pre-existing user index digest unchanged. No tracked application/legacy/package/manifest/lockfile edited; new code is limited to the isolated prototype, preview harness, two tests and scoped TypeScript config.

## Gate handover

| Gate | Status / exact remaining condition |
|---|---|
| Safe prototype | **GO within U-02 scope**;22 Oct browser evidence+unchanged source and23 Oct focused checks; still mock-only/local-only |
| Official CP1-T01 | **NO-GO / not started**:17 G04..11 signed policy/contract/authority/source assumptions, review and explicit official start required. U-02 expressly excludes this transition |
| CP1 DB-write readiness | **NO-GO**: operator metadata/grant specification/target/capacity and approved control/change scope absent; no migration/grants/writer implemented |
| Operational activation | **NO-GO**: all P0 acceptance, actual all-writer INT/XC integration proof, canonical/effective payroll/print compatibility, contact/provider/RBAC/retention and system-owner rollout approval |

Human actions: product can approve presentation/copy; business/payroll must sign B-01..08 and effective period/duplicate policy; DB/infra supply O-01/07 metadata/topology/custody; membership/security/provider supply B-09/10,O-04; legacy owners O-02/03/05/06; KOSIPA/security/operator B-13/14,O-08.18 consolidates choices and evidence without repeating prior audit. No parent blocker closed by recommendation or UI progress.

Prohibited work remains deferred: production route/exposure/deploy, real public submission/DB writes/token/OTP issuance, schema/grants, Laravel/CI2/payroll/approval changes, official CP1 transition, commit/push/merge. Existing user staging and HEAD are preserved; all new prototype changes remain local for review.
