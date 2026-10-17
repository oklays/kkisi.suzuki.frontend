# Login credential-exposure closeout (checkpoint 13)

| Status | |
|---|---|
| Implemented | yes: checkpoint 12 hydration gate (`useHydrated`, commit `87e2ee8f`) + checkpoint 13 server-rendered POST fallback and `/login` redirect-loop refusal (`861b234b`) |
| Verified locally | yes: built application, synthetic accounts, `tests/login-security-browser.mjs` (in UAT phase 1) |
| Staging accepted / production ready | **no.** Not deployed; any deployed instance remains exposed until an authorised release. Historical exposure: `docs/migration/operator-credential-exposure-checklist.md` |

## Defence in depth

1. **No JavaScript needed for safety:** the submit button is `disabled` in the server-rendered HTML until React hydrates. A disabled default button blocks both clicks and Enter-key implicit submission.
2. **Safe native fallback:** the form declares `method="post" action="/api/auth/login"`. If the disabled state is bypassed (extension, devtools, regression) or JavaScript is off, the browser sends a POST body to the JSON-only API, which refuses it. Nothing lands in a URL and no session is created.
3. **Redirect validation:** `safeNextPath` accepts only same-site paths, rejects `/api/…` and now **every** form of `/login` (`/login?…`, `/login/`, `/login#…`), so a post-login redirect cannot loop or leave the site.
4. **Server side:** the login use case logs only `login_ok user=<id>` and `login_failed reason=<code>`; no username or password is logged.

## Regression evidence (built app, synthetic credentials only)

Every scenario also asserts: no username or password in any request URL, redirect or navigation; no request leaves 127.0.0.1 (no client telemetry); and, at the end, neither value appears in the application log.

| # | Scenario | Result |
|---|---|---|
| LS-1 | JavaScript delayed 8 s (not hydrated): button disabled; Enter inert; forced native submit becomes a POST to `/api/auth/login`, refused (≥ 400), no session | pass |
| LS-2 | JavaScript disabled: same guarantees | pass |
| LS-3 | Slow initialisation (3 s): sign-in completes after the control enables; one request | pass |
| LS-4 | Enter after hydration: exactly one JSON login request | pass |
| LS-5 | Double-click: exactly one login request | pass |
| LS-6 | Refresh after a failure: nothing resubmitted, password field empty | pass |
| LS-7 | Failed authentication: generic message, no username or password echoed | pass |
| LS-8 | `next` = foreign URL, protocol-relative, backslash, `javascript:`, `/login?…`, `/login/`, `/api/…`, over-long: safe fallback on site; a valid deep link (`/sales`) is preserved | pass |
| LS-L | Application log: no credential value, no credential query string | pass |

Mutation check: removing `method`/`action` makes LS-1 fail. Unit tests: `packages/domain/tests/auth-policy.test.mjs` (redirect cases).
