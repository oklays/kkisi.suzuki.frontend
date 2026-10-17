# KOSIPA export — security assessment (checkpoint 11)

Scope: the five CSV export endpoints (`/api/kosipa/reports/{loans,payroll,data-quality,membership,savings-movements}/export`). Decision **E1 is retained**: the explicit allow-list (`KOSIPA_EXPORT_ENABLED` + `KOSIPA_EXPORT_USER_IDS`) stays; **no persistent policy store is introduced.** Every row below names the code that enforces it and the test that fails if it regresses. Result: **no code change was necessary; one operational limit (per-process rate limiting) and one open audit question (finding F5, payroll list) are recorded.**

## 1. Control review

| # | Control | Enforcement | Evidence (test) | Result |
|---|---|---|---|---|
| 1 | Export is a separate, explicit grant; a view grant never implies it | capability `kosipa.report.export` only from the deployment policy (flag + allow-list) **and** an active identity link with at least one KOSIPA view capability; the report's own view grant is also required (`begin()`) | `kosipa-report-export.test.mjs` "export needs the export grant AND the report's own view grant"; `console-persona-matrix.test.mjs` "export permission" (all 8 personas; policy off removes it for everyone) | pass |
| 2 | Allow-list evaluation fails closed | `exportUserIds()`: unset/empty → nobody; **one malformed entry invalidates the whole list**; > 50 ids → nobody; ids are positive integers ≤ 10 digits; the web app cannot change the list (environment only) | `apps/web/tests/export-config.test.mjs` (strict parsing, one bad entry empties the list); `export-capability.test.mjs` (application); `console-reports-export-http.test.mjs` "view without export is 403…" | pass |
| 3 | Authentication, origin and flag gates precede everything | flag off 404 → anonymous 401 → services absent 503 → `Sec-Fetch-Site: cross-site` 403, all before any audit or read; GET only (POST is 405) | `console-reports-export-http.test.mjs` "flag off 404, anonymous 401…"; browser EXP-1 | pass |
| 4 | Audit before read | `begin()` writes `kosipa.report.export` **before** any reader call; if the audit cannot be written nothing is read (503). A rate-limited refusal is itself audited as `denied`. Audit records carry opaque subjects (`report:loan`) and counts, never figures, names or NIK | `kosipa-report-export.test.mjs` audit tests; persona matrix "audit failure behaviour" (five audited endpoints read nothing with the audit store down); browser EXP-A | pass |
| 5 | CSV formula injection | `neutralizeFormula`: any text cell starting (after spaces) with `=`, `+`, `-`, `@`, TAB, CR or LF is prefixed with `'`; other control characters become spaces; RFC 4180 quoting with CRLF. Only validated decimal cells (`{decimal}`) may start with `-` | `packages/domain/tests/kosipa-csv.test.mjs` (neutralisation, quoting, decimals) | pass |
| 6 | Exact decimals | amounts are integers in 1/10,000 rupiah (`amount4`) rendered by `amount4ToDecimal`; a cell must match `^-?\d{1,18}(\.\d{1,4})?$` else the export fails (`AMOUNT_INVALID`); floating point is never used for output | `kosipa-csv.test.mjs` + export tests ("exact decimals"); browser EXP-1 asserts literal figures such as `61,60250.00,500.00,12.50` | pass |
| 7 | Caps | at most 5,000 data rows and 1,000,000 bytes (`EXPORT_TOO_LARGE` 413-class refusal instead of a partial file); the loan-bucket reader's 600-row `LIMIT` is treated as "possibly incomplete" and written as such, never as complete; each report read is bounded and `max_statement_time = 5 s` | `kosipa-report-export.test.mjs` caps and truncation tests | pass |
| 8 | No personal data in exports | aggregate or diagnostic reports only; no per-member export exists; no name, NIK, salary or bank detail column; official balances are stated as unavailable | EXP-1 (`doesNotMatch` of synthetic names/NIK/e-mail), export content tests | pass |
| 9 | Response hardening | `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment` with a **fixed, sanitised** filename (never user input), `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` | `console-reports-export-http.test.mjs` "an allowed export is a no-store, nosniff, attachment CSV"; EXP-1 | pass |
| 10 | Filters are validated | `tahun` must be a 4-digit year in range; invalid input is a 400 before audit and read | EXP-1 (`tahun=26` → 400) | pass |
| 11 | Download link is not rendered without the capability | pages render the link only when `kosipa.report.export` is held | browser EXP-3 | pass |
| 12 | Rate limiting | `WindowThrottle(6, 10 min)` per console user, **in memory** | see section 2 | **limited, documented** |

## 2. Rate limiter — what it is and what it is not

Measured behaviour (built application, synthetic data):

* **One limiter instance per process, shared by all five export routes.** After 6 loan exports plus a refusal, payroll, membership, savings-movement and data-quality exports are all refused (429) for the same user (browser test EXP-2b; in a Next.js build module-level state could in principle be duplicated per route bundle — it is not).
* **A second process has its own window.** With two instances of the built app on one database and one allow-list, the same user received `[200 ×6, 429]` on the *second* instance after exhausting the first (`scripts/uat-export-instances.sh`, test EXP-2c; unit test "the limiter is in-memory per instance"). The effective limit is therefore **6 × number of instances per 10 minutes**, and a restart empties the window.
* Memory is bounded: only users who already hold the export grant reach the limiter, so at most 50 users × 6 timestamps are ever stored.
* A token is consumed *before* the audit write; if the audit store is down the attempt is refused anyway (503), costing the user a token — harmless.

What it protects: accidental loops and casual repetition by an authorised, audited user. What it does **not** protect: it is not a security boundary (the boundaries are the allow-list, the view grant, the link, the audit and the caps). It is also not a defence against a determined authorised user, who is constrained by caps and by the audit trail, not by the limiter.

### Is a shared limiter required?

* **For the supported deployment — no.** The application is deployed as one Next.js process in one container (`deployment-guard.ts`: "Only one Next.js process per container and one container are supported"), and the connection budget (12 of 20) assumes it. The 6/10-minute policy holds as written.
* **Before running more than one process or container — yes, if the 6/10-minute bound is to remain a policy** (and, independently, the connection-capacity analysis shows a second instance doubles every pool: the local two-instance probe exhausted a console account capped at 2 connections). Running two instances is therefore a *joint* change that needs both the capacity decision (B5) and a shared limiter, and must not happen implicitly.
* **Proposed design (not built, because it is not needed now and E1 forbids a policy store):** count the caller's recent `kosipa.report.export` rows in the existing append-only console audit table (`actor_user_id`, `action`, `occurred_at`) — the audit row is already written for every attempt, including `denied` — with a supporting index on `(actor_user_id, action, occurred_at)` (operator DDL, to be reviewed like every production change). This reuses an existing, shared, durable store and adds no table and no policy store; cost is one indexed `COUNT` per export, and the console account is already granted SELECT, INSERT, UPDATE on its database (`console-store-production.sql`, STEP 0). Alternative: an external cache, rejected because it adds an unapproved dependency.
* **Operational guard until then:** the deployment runbook states "exactly one application process"; scaling out is blocked on the items above.

## 3. Findings

| ID | Finding | Severity | Status |
|---|---|---|---|
| X1 | Rate limit is per process (6 × instances; reset by restart) | Low today (single instance supported); Medium if scaled out | Documented; shared limiter required before scale-out (proposal above) |
| X2 | Allow-list changes need an environment change and restart; there is no in-app revoke | Low (owner choice E1) | Accepted; revocation latency = restart; every export is attributable through the audit |
| X3 | The payroll batch *list* API is not audited (finding F5 in the staging matrix); it returns header-level data only | Low–Medium (policy) | Open question for the owner; not an export path |
| X4 | Exports are only as complete as the verified reports; official balances are explicitly absent | Info | By design (OFFICIAL_BALANCE_UNVERIFIED) |

No finding blocks a staging UAT of the export. None changes E1.

## 4. Checkpoint 12 — single-instance assumption verified; shared limiter designed (not built)

E1 stands: the operator-controlled allow-list remains, and no persistent policy store was added. All export authorisation, auditing and CSV protections are unchanged.

### The single-instance assumption is structural, and now pinned by a test

`apps/web/tests/single-instance-deployment.test.mjs` (always on) fails if any of these change:

1. **One container:** the `web` service has a fixed `container_name: genesis-web` and no replicas/scale/deploy settings, so `docker compose up --scale web=2` cannot create a second container.
2. **One listener:** the service runs in `network_mode: "service:netns"`, so a second server in that namespace could not bind port 3000.
3. **One server process:** the image's only `CMD` is a single `next start`, with no cluster mode and no process manager.

A deliberate scale-out therefore has to edit this test, which brings the shared-limiter requirement (below) and the capacity decision (B5) with it. Operator runtime check at each deployment: `docker ps --filter name=genesis-web --format '{{.Names}}' | wc -l` must print `1`.

### Shared limiter for future multi-instance operation (design, required before any multi-process rollout)

* **Store:** the existing append-only console audit table, which already receives one `kosipa.report.export` row per attempt (success or `denied`). No new table, no new connection: it uses the console client the export already uses for its audit write, so the 12-connection budget is unchanged.
* **Algorithm (count after insert):** write the attempt's audit row first, inside the same short statement sequence, then `SELECT COUNT(*) FROM console_audit_event WHERE actor_user_id = ? AND action = 'kosipa.report.export' AND occurred_at > UTC_TIMESTAMP(3) - INTERVAL 10 MINUTE`. If the count (including this attempt) exceeds 6, refuse with 429 and record the refusal. Because every request counts its own row, two concurrent requests on different instances can never both slip under the limit: the worst case is over-refusal at the boundary, never over-admission.
* **Index (operator DDL, reviewed like any production change):** `(actor_user_id, action, occurred_at)` on `console_audit_event`.
* **Failure behaviour:** if the console store is unavailable the audit write already fails closed (503, nothing read). The limiter adds no new failure mode.
* **Clock:** the database's `UTC_TIMESTAMP(3)`, not the application hosts' clocks.
* **Cost:** one indexed COUNT per export request on the console connection. Exports are rare (at most 6 per user per 10 minutes, and only allow-listed users).
* **Not built now**, because the deployment is provably single-process and E1 asks for no policy store. Building it is a prerequisite of the scale-out decision (decision register X1).
