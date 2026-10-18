# Login credential-exposure hotfix — release plan (PREPARATION ONLY)

**Not pushed, not deployed.** Release needs a separate written authorisation from the owner.

## 1. Why a separate hotfix

The defect (credentials in the URL when the login form is submitted before hydration) exists in every deployed build that contains the Next.js login form. The fix lives on `feat/unified-console` in commits `87e2ee8f` and `861b234b`. **Neither commit can be cherry-picked as is:**

* `87e2ee8f` also changes UAT isolation scripts and console tests, and touches `IdentityLinkManager` (Unified Console only).
* `master`'s `LoginForm.tsx` has no console `fallback` prop (that came with the console foundation, `8cea9a12`). Cherry-picking would drag console code into production.

## 2. Minimal hotfix (prepared and verified)

Local branch **`hotfix/login-credential-exposure`**, one commit **`9ddb7cd2`** on top of `master` (`81dab9ed`):

| File | Change |
|---|---|
| `apps/web/src/components/use-hydrated.ts` | new: `useHydrated()` (false in the server render and before hydration) |
| `apps/web/src/app/login/LoginForm.tsx` | submit disabled until hydrated; `method="post" action="/api/auth/login"` safe native fallback. **No** console code |
| `packages/domain/src/auth/redirect.ts` | refuse every form of `/login` as a post-login target (no redirect loop) |
| `packages/domain/tests/auth-policy.test.mjs` | redirect cases |
| `apps/web/tests/login-security-browser.mjs` | eight-scenario closeout suite |

5 files, +129 / −3. **No feature flag is involved, added or changed.** The fix applies whether or not `CONSOLE_ENABLED` is set (master has no console).

## 3. Review and verification evidence (local, synthetic data; checkpoint 15 re-verified)

### 3.1 Diff review against `master` (`git diff master hotfix/login-credential-exposure`)

| Question | Finding |
|---|---|
| Is the hotfix a clean descendant of `master`? | yes: merge-base = `master` HEAD `81dab9ed`; one commit `9ddb7cd2` |
| Files | 5 (+129 / −3): `LoginForm.tsx`, new `use-hydrated.ts`, `redirect.ts`, two test files. No other source file |
| Unrelated Unified Console changes? | **none** in `src/`: no console, KOSIPA, Warehouse, flag or `process.env` reference. The only "console" strings are `console.log` calls and a landing-URL pattern inside the new test file |
| Dependencies | adds only `react`'s `useSyncExternalStore` (already a dependency) and the existing `@/*` alias (present on master); `package.json` and lockfile unchanged |
| Behaviour change | submit disabled until hydrated; native fallback is `POST /api/auth/login` (refused by the JSON-only API) instead of `GET /login?…`; `/login…` redirect targets fall back (no loop) |

### 3.2 Test evidence

| Check | `master` (control) | Hotfix |
|---|---|---|
| `pnpm lint` / `typecheck` / `build` | baseline | 0 errors, 4 warnings (= baseline) / OK / OK |
| `pnpm test` | — | domain 29/29, application 22/22, web 228 pass (+42 opt-in skipped) |
| `login-security-browser.mjs` (8 scenarios + log scan) | not applicable (fails by design: the defect) | **all pass** |
| `pos-browser.mjs` (TOKO POS regression) | — | PASS |
| `e2e-local.mjs` **as committed on master** | fails at step B ("SYNTH MAKANAN" chip) | fails at step B, **identically** |
| `e2e-local.mjs` **corrected** (the branch's version, category chips replaced by the API check), each tree with its **own** seed and build | **PASS A–H** (397 requests) | **PASS A–H** (396 requests) |

Conclusion on the earlier failure: it is **baseline-only drift in master's own test**. `f3b8bad6` (3 Oct) removed the category chips from the POS UI on `master`, while `e2e-local.mjs` was last edited on 2 Oct. With the test corrected, the full suite (anonymous access, catalog, idle/absolute session expiry, throttle, CSRF, RBAC changes taking effect on the next request, database failures) passes on `master` and on the hotfix alike, so the hotfix introduces no authorisation, session or TOKO regression. The ±1 request-count difference is within the run-to-run variation seen on identical code (584–587 and 396–397 in repeated runs). The corrected test is **not** part of the hotfix commit; if the owner wants master's suite green it is a separate test-only change.

## 4. Deployment prerequisites

1. Owner's written authorisation for a production release of `9ddb7cd2` (and nothing else).
2. Code review of the 5-file diff (`git show 9ddb7cd2`).
3. ~~Re-run `e2e-local.mjs`~~ done (§3.2). Optional, separate: fix master's stale `e2e-local.mjs` (test-only).
3b. **Pre-deployment backup check:** the hotfix changes no data, but the standard pre-release backup must be verified restorable as for any release (operator confirms the latest backup of the auth store and the legacy database and the image tag currently running).
4. A deployment window, and the deploy procedure of `deploy/genesis` (image build with a new `GENESIS_WEB_TAG`, single container). No database change, no environment change.
5. Operator ready to run the post-deployment checks (§6) and the exposure checklist (§7).

## 4b. Feature-flag and configuration impact

None. No flag, environment variable, database object or deployment setting is added or changed; behaviour is identical with or without `CONSOLE_ENABLED` (master has no console). The build needs no new secret.

## 5. Rollback

Redeploy the previous image tag. No data, schema or configuration was changed, so rollback is immediate. Rolling back re-opens the exposure, so only roll back for a functional regression and then re-run §7.

## 6. Post-deployment login security verification (production, no real credential needed for 1–3)

1. Open `/login`, view source: the form has `method="post"` and `action="/api/auth/login"`; the submit button carries `disabled` in the server HTML.
2. In a browser with JavaScript disabled: the button stays disabled; pressing Enter does nothing; the address bar never shows `username=`/`password=`.
3. With the browser's network throttled ("Slow 3G"): clicking "Masuk" before the page is ready does nothing; after it enables, login works.
4. One normal sign-in by an authorised user: lands on the usual page; nginx access log for that request shows `POST /api/auth/login` (no query string).
5. 24 h later the operator re-runs the count-only check from §7: **zero new** `GET /login?…password=` lines.

## 7. Historical exposure and shared-password considerations

* Run the restricted checklist below first; **do not wait for the release** to restrict log access (containment is independent of the code fix).
* `db_users` passwords are shared with the legacy TOKONEW PHP application: rotating a password changes the legacy login at the same time, and a rotation is a production business-record change that needs the owner's explicit authorisation. Rotate only accounts the count-only check implicates, or all accounts that used the Next.js login in the exposure window if attribution is impossible.
* Rotation must not coincide with the release window (a failed login after a rotation must not be confused with a regression).
* The release itself neither reads nor changes any credential.

Run `docs/migration/operator-credential-exposure-checklist.md` (restricted; counts only; containment and rotation steps; rotation needs owner authorisation because `db_users` passwords are shared with legacy TOKONEW).
