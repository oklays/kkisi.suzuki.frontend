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

## 3. Verification already done on the hotfix branch (local, synthetic data)

| Check | Result |
|---|---|
| `pnpm lint` / `typecheck` | 0 errors, 4 warnings (master baseline) / OK |
| `pnpm test` | domain 29/29, application 22/22, web 228 pass, 42 opt-in skipped |
| `pnpm build` | OK |
| `login-security-browser.mjs` against the hotfix build | **all eight scenarios + log scan pass** (not hydrated, JS disabled, slow init, Enter, double-click, refresh, failed login, malformed redirects/deep link) |
| `pos-browser.mjs` (TOKO POS regression) against the hotfix build | PASS |
| `e2e-local.mjs` against the hotfix build | fails at step B (catalog category button). **Control:** the same test against **unmodified master** fails at the same step, so it is pre-existing drift between master's test and the current synthetic seed, not caused by the hotfix. Must be re-run with a seed matching master before release (prerequisite 3) |

## 4. Deployment prerequisites

1. Owner's written authorisation for a production release of `9ddb7cd2` (and nothing else).
2. Code review of the 5-file diff (`git show 9ddb7cd2`).
3. Re-run `e2e-local.mjs` on the hotfix with master's own synthetic seed (or record the owner's acceptance of the known pre-existing drift).
4. A deployment window, and the deploy procedure of `deploy/genesis` (image build with a new `GENESIS_WEB_TAG`, single container). No database change, no environment change.
5. Operator ready to run the post-deployment checks (§6) and the exposure checklist (§7).

## 5. Rollback

Redeploy the previous image tag. No data, schema or configuration was changed, so rollback is immediate. Rolling back re-opens the exposure, so only roll back for a functional regression and then re-run §7.

## 6. Post-deployment login security verification (production, no real credential needed for 1–3)

1. Open `/login`, view source: the form has `method="post"` and `action="/api/auth/login"`; the submit button carries `disabled` in the server HTML.
2. In a browser with JavaScript disabled: the button stays disabled; pressing Enter does nothing; the address bar never shows `username=`/`password=`.
3. With the browser's network throttled ("Slow 3G"): clicking "Masuk" before the page is ready does nothing; after it enables, login works.
4. One normal sign-in by an authorised user: lands on the usual page; nginx access log for that request shows `POST /api/auth/login` (no query string).
5. 24 h later the operator re-runs the count-only check from §7: **zero new** `GET /login?…password=` lines.

## 7. Historical exposure

Run `docs/migration/operator-credential-exposure-checklist.md` (restricted; counts only; containment and rotation steps; rotation needs owner authorisation because `db_users` passwords are shared with legacy TOKONEW).
