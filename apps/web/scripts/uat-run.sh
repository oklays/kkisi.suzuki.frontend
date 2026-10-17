#!/usr/bin/env bash
# Integrated read-only UAT (checkpoint 9) on the SYNTHETIC schema kkisi_e2e_legacy and the local console store. It starts the BUILT app on
# 127.0.0.1:3100 four times (flags on / reader outage / console store down / flags off), runs the browser suites, and always stops the app.
# It never points the app at kkisi_staging, never uses production, and executes no financial transaction. Requires: pnpm build, scripts/e2e-setup.sh done,
# the local kkisi-staging container running, Playwright (PLAYWRIGHT_MODULE).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[ -f .env.e2e ] && [ -f .e2e-fixture.json ] && [ -d .next ] || { echo "ERROR: run scripts/e2e-setup.sh --apply and pnpm build first" >&2; exit 1; }
set -a; . ./.env.e2e; . ./.env.local; set +a
case "$E2E_READ_URL" in *"/kkisi_e2e_legacy"*"") ;; *) echo "ERROR: E2E_READ_URL does not name kkisi_e2e_legacy" >&2; exit 1;; esac
PORT=3100; CONSOLE_URL="$DATABASE_URL_CONSOLE"; LOG="${UAT_LOG:-/tmp/kkisi-uat-app.log}"
export POS_URL="http://127.0.0.1:$PORT" POS_FIXTURE="$PWD/.e2e-fixture.json" E2E_FIXTURE="$PWD/.e2e-fixture.json" CONSOLE_STORE_TEST_URL="$CONSOLE_URL"
stop_app() { lsof -nP -tiTCP:$PORT -sTCP:LISTEN | xargs -r kill 2>/dev/null || true; sleep 1; }
start_app() { # $1 = CONSOLE_ENABLED, $2 = KOSIPA_READ_ENABLED, $3 = console store URL
  stop_app
  ( DATABASE_URL="$E2E_READ_URL" DATABASE_URL_CONSOLE="$3" CONSOLE_ENABLED="$1" KOSIPA_READ_ENABLED="$2" KOSIPA_EXPORT_ENABLED="${EXPORT_ENABLED:-}" KOSIPA_EXPORT_USER_IDS="${EXPORT_IDS:-}" APP_ORIGIN="http://127.0.0.1:$PORT" pnpm exec next start -H 127.0.0.1 -p $PORT > "$LOG" 2>&1 & )
  for _ in $(seq 1 60); do curl -s -o /dev/null "http://127.0.0.1:$PORT/login" && return 0; sleep 0.5; done; echo "ERROR: app did not start" >&2; exit 1
}
trap 'stop_app; bash scripts/uat-outage.sh restore >/dev/null 2>&1 || true' EXIT
run() { echo "== $*"; "$@"; }
bash scripts/uat-outage.sh restore >/dev/null
# Fresh synthetic state (also clears the login throttle rows of the synthetic users that the TOKO suites deliberately lock): E3a cleanup, then the Gate A seed.
fresh() {
  node --experimental-strip-types --env-file=.env.local --env-file=.env.e2e scripts/e2e-cleanup.mjs >/dev/null
  node --experimental-strip-types --env-file=.env.e2e scripts/e2e-seed.mjs >/dev/null
}
fresh
echo "##### 1. flags ON, console store up"
start_app true true "$CONSOLE_URL"
UAT_MODE=ok run node --env-file=.env.e2e --experimental-strip-types tests/console-uat-browser.mjs
run node --env-file=.env.e2e --experimental-strip-types tests/console-browser.mjs
echo "##### TOKO regression with the console flags ON"
run node --env-file=.env.local tests/pos-browser.mjs
run node --experimental-strip-types --env-file=.env.local tests/e2e-local.mjs
echo "##### 2. KOSIPA reader outage (synthetic tables renamed, restored afterwards)"
fresh
UAT_MODE=reader-outage run node --env-file=.env.e2e --experimental-strip-types tests/console-uat-browser.mjs
echo "##### 3. console store (identity + audit) DOWN"
fresh
start_app true true "mysql://nobody:nopass@127.0.0.1:1/kkisi_console_down?connection_limit=1&connect_timeout=2"
UAT_MODE=store-down run node --env-file=.env.e2e --experimental-strip-types tests/console-uat-browser.mjs
echo "##### 4. flags OFF (TOKO exactly as before)"
fresh
start_app false false "$CONSOLE_URL"
CONSOLE_EXPECT=off run node --env-file=.env.e2e --experimental-strip-types tests/console-browser.mjs
run node --env-file=.env.local tests/pos-browser.mjs
run node --experimental-strip-types --env-file=.env.local tests/e2e-local.mjs
echo "##### 5. secure CSV export: policy ON for synth_koperasi only (id 900002), then OFF"
fresh
EXPORT_ENABLED=true EXPORT_IDS=900002 start_app true true "$CONSOLE_URL"
EXPORT_EXPECT=on run node --env-file=.env.e2e --experimental-strip-types tests/console-export-browser.mjs
fresh
EXPORT_ENABLED= EXPORT_IDS= start_app true true "$CONSOLE_URL"
EXPORT_EXPECT=off run node --env-file=.env.e2e --experimental-strip-types tests/console-export-browser.mjs
echo "UAT complete."
