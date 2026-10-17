#!/usr/bin/env bash
# Two-instance probe of the export rate limiter (checkpoint 11), on the SYNTHETIC schema and the local console store ONLY. Starts the BUILT app twice (127.0.0.1:3100 and :3101, same database,
# same allow-list), exhausts one user's export budget on the first instance and shows that the second instance starts a fresh window: the limiter is per process, so the effective limit is
# (6 per 10 minutes) x (instances). Pools are shrunk locally so two instances fit the local accounts' max_user_connections; that is a LOCAL accommodation, and it also illustrates that
# every instance holds its own pools (see connection-capacity-analysis.md). Requires pnpm build, scripts/e2e-setup.sh done, the kkisi-staging container running, Playwright (PLAYWRIGHT_MODULE).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[ -f .env.e2e ] && [ -f .e2e-fixture.json ] && [ -d .next ] || { echo "ERROR: run scripts/e2e-setup.sh --apply and pnpm build first" >&2; exit 1; }
set -a; . ./.env.e2e; . ./.env.local; set +a
case "$E2E_READ_URL" in *"/kkisi_e2e_legacy"*) ;; *) echo "ERROR: E2E_READ_URL does not name kkisi_e2e_legacy" >&2; exit 1;; esac
P1=3100; P2=3101; LOG="${UAT_LOG:-/tmp/kkisi-uat-instances}"
export POS_URL="http://127.0.0.1:$P1" POS_FIXTURE="$PWD/.e2e-fixture.json" E2E_FIXTURE="$PWD/.e2e-fixture.json" CONSOLE_STORE_TEST_URL="$DATABASE_URL_CONSOLE"
stop_all() { for p in $P1 $P2; do lsof -nP -tiTCP:$p -sTCP:LISTEN | xargs -r kill 2>/dev/null || true; done; sleep 1; }
trap stop_all EXIT
start() { # $1 = port
  ( DATABASE_URL="${E2E_READ_URL//connection_limit=8/connection_limit=3}" DATABASE_URL_AUTH="${DATABASE_URL_AUTH//connection_limit=8/connection_limit=3}" DATABASE_URL_CONSOLE="$DATABASE_URL_CONSOLE" \
    CONSOLE_ENABLED=true KOSIPA_READ_ENABLED=true KOSIPA_EXPORT_ENABLED=true KOSIPA_EXPORT_USER_IDS=900002 APP_ORIGIN="http://127.0.0.1:$1" pnpm exec next start -H 127.0.0.1 -p "$1" > "$LOG-$1.log" 2>&1 & )
  for _ in $(seq 1 60); do curl -s -o /dev/null "http://127.0.0.1:$1/login" && return 0; sleep 0.5; done; echo "ERROR: app on $1 did not start" >&2; exit 1
}
stop_all
node --experimental-strip-types --env-file=.env.local --env-file=.env.e2e scripts/e2e-cleanup.mjs >/dev/null
node --experimental-strip-types --env-file=.env.e2e scripts/e2e-seed.mjs >/dev/null
start $P1; start $P2
EXPORT_SECOND_BASE="http://127.0.0.1:$P2" EXPORT_EXPECT=on node --env-file=.env.e2e --experimental-strip-types tests/console-export-browser.mjs
