# Operator checklist — possible credential exposure through login URLs (restricted procedure)

**Audience:** an authorised operator with server access. **This document contains no credential and must never receive one.** Engineering has not accessed production logs, browsers or credentials.

## What happened

Before checkpoint 12, the Next.js login form (`/login`, in the repository since 2 Oct 2026) had no `method`. If a user submitted it **before the page's JavaScript was ready** (slow device or network, cold start), the browser sent a native `GET /login?username=…&password=…`. The username and password then appeared in the browser address bar and history, in the Referer of the next request, and in any server log that records URLs.

**Status of the fix:** implemented and verified **locally only** (commits `87e2ee8f`, `861b234b`). **Any deployed instance remains exposed until an authorised release ships these commits.**

## 1. Establish the exposure window

1. From the deployment records (image tags of `genesis-web`), find when a build containing `apps/web/src/app/login/LoginForm.tsx` first went live, and whether a build with the fix has been deployed since. The window is from the first date to the fix (or to today).

## 2. Look for exposure without reproducing values

Work in a restricted root session. **Print counts, never matching lines.** Do not copy results into tickets, chat or e-mail.

| Source | Why it may contain credentials | Count-only check (example) |
|---|---|---|
| nginx access logs, current and rotated (`/var/log/nginx/access.log*`) | the site has no `access_log` override, so the default `combined` format logs the request URI with its query string, and the Referer | `zgrep -c 'GET /login?[^ ]*password=' /var/log/nginx/access.log*` and `zgrep -c 'login?[^"]*password=' /var/log/nginx/access.log*` (Referer field) |
| http→https redirect | port 80 `return 301 https://$host$request_uri` keeps the query; the same logs | covered by the commands above |
| Any proxy, WAF, CDN, uptime or APM service in front of the server | they log URLs too | ask each provider for a count of `/login?…password=` URLs in the window |
| Container logs (`docker logs genesis-web`) | Next.js does not log request URLs by default; confirm | `docker logs genesis-web 2>&1 \| grep -c 'password='` |
| Browsers on **shared** cashier/POS terminals | history and autocomplete keep full URLs | on each shared terminal, search history for `login?` and clear matching entries; do not record what you see |

To learn **which accounts** are affected (needed for rotation), extract **usernames only**, inside the restricted session:
`zgrep -ho 'GET /login?[^ ]*' /var/log/nginx/access.log* | sed -n 's/.*[?&]username=\([^& ]*\).*/\1/p' | sort -u | wc -l` (count), then the list without `wc -l`, read on screen only.

## 3. Containment (each step needs the authority named in parentheses)

1. **Restrict access** to the affected log files and their rotations: owner-only permissions; pause any log shipping or backup copy containing them (server operator).
2. **Retention review:** decide whether to purge or redact the affected lines under the retention policy. Redact on a copy, verify, then replace; keep an audit note of *what* was done, not of the values (operator + owner).
3. **Interim mitigation before the fixed release** (infrastructure change; separate authorisation):
   * log `/login` without its query string (an nginx `map` on `$request_uri` feeding a custom `log_format`), or
   * refuse `GET /login` requests that carry a `password` parameter (`location = /login` with an `$arg_password` check, returning 400) so they never reach a page that stores them in history.
4. **Ship the fix** in an authorised release, then re-run step 2 to confirm no new occurrences.

## 4. Credential rotation (owner authorisation required)

* `db_users` passwords are shared with the legacy TOKONEW PHP application: rotating one changes the legacy login too. A password change is a production business-record change and needs the owner's explicit authorisation.
* Rotate every account whose username was found. If attribution is impossible (rotated logs gone, Referer-only hits), rotate **all** accounts that used the Next.js login in the window.
* Ask affected users to change the same password wherever they reused it.

## 5. What to return to engineering

The exposure window (dates), **counts** per source, how many accounts were rotated, the containment actions taken, and the release date of the fix. Never return usernames, passwords or log lines.
