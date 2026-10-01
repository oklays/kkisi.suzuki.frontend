#!/usr/bin/env bash
# Gate A run: starts the BUILT app on 127.0.0.1:3100 against the SYNTHETIC legacy schema (kkisi_e2e_legacy via kkisi_e2e_read) and the
# real auth store, runs the browser tests, then stops the app. It never points the app at kkisi_staging.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[ -f .env.e2e ] && [ -f .e2e-fixture.json ] || { echo "ERROR: run scripts/e2e-setup.sh --apply first" >&2; exit 1; }
set -a; . ./.env.e2e; set +a
case "$E2E_READ_URL" in *"/kkisi_e2e_legacy"*) ;; *) echo "ERROR: E2E_READ_URL does not name kkisi_e2e_legacy: refusing" >&2; exit 1;; esac
case "$E2E_READ_URL" in *"kkisi_e2e_read:"*) ;; *) echo "ERROR: E2E_READ_URL is not the e2e read account: refusing" >&2; exit 1;; esac
[ -d .next ] || { echo "ERROR: build first (npm run build)" >&2; exit 1; }
PORT=3100
lsof -nP -tiTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1 && { echo "ERROR: port $PORT busy" >&2; exit 1; }
LOG="${E2E_LOG:-/tmp/kkisi-e2e-app.log}"
( DATABASE_URL="$E2E_READ_URL" APP_ORIGIN="http://127.0.0.1:$PORT" npx next start -H 127.0.0.1 -p $PORT > "$LOG" 2>&1 & )
trap 'lsof -nP -tiTCP:'$PORT' -sTCP:LISTEN | xargs -r kill' EXIT
for i in $(seq 1 60); do curl -s -o /dev/null "http://127.0.0.1:$PORT/login" && break; sleep 0.5; done
export POS_URL="http://127.0.0.1:$PORT" POS_FIXTURE="$PWD/.e2e-fixture.json" E2E_FIXTURE="$PWD/.e2e-fixture.json"
echo "== pos-browser.mjs"; node --env-file=.env.local tests/pos-browser.mjs
echo "== e2e-local.mjs";   node --experimental-strip-types --env-file=.env.local tests/e2e-local.mjs
