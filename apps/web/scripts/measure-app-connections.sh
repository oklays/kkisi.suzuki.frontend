#!/usr/bin/env bash
# Reproducible connection-capacity measurement (checkpoint 12) — LOCAL staging container and SYNTHETIC schema only.
# Starts ONE built Next.js process with production-sized pools (reader 3, auth 2, console 1 unless overridden), drives a mixed page/API load, and samples
# information_schema.processlist INSIDE the container every ~50 ms. Reports per account: configured connection_limit, peak simultaneous connections,
# peak active (non-Sleep) connections, distinct connection ids seen over the run (accumulated, NOT simultaneous), and the number of app processes.
#   scripts/measure-app-connections.sh [mode=mixed|pages|api] [concurrency=8] [seconds=20]
#   READER_LIMIT=3 AUTH_LIMIT=2 overrides; requires pnpm build and scripts/e2e-setup.sh. Never touches production.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=lib/auth-store-common.sh
. scripts/lib/auth-store-common.sh
load_root_env; assert_local_container
MODE="${1:-mixed}"; CONC="${2:-8}"; SECS="${3:-20}"; RL="${READER_LIMIT:-3}"; AL="${AUTH_LIMIT:-2}"; PORT=3110; BASE="http://127.0.0.1:$PORT"
[ -f .env.e2e ] && [ -f .e2e-fixture.json ] && [ -d .next ] || die "run scripts/e2e-setup.sh --apply and pnpm build first"
set -a; . ./.env.e2e; . ./.env.local; set +a
export E2E_FIXTURE="$PWD/.e2e-fixture.json" POS_FIXTURE="$PWD/.e2e-fixture.json"
case "$E2E_READ_URL" in *"/kkisi_e2e_legacy"*) ;; *) die "E2E_READ_URL does not name kkisi_e2e_legacy";; esac
limit() { printf '%s' "$1" | sed -E "s/connection_limit=[0-9]+/connection_limit=$2/"; }
READER_URL="$(limit "$E2E_READ_URL" "$RL")"; AUTH_URL="$(limit "$DATABASE_URL_AUTH" "$AL")"; CONSOLE_URL="$(limit "$DATABASE_URL_CONSOLE" 1)"
stop_app() { lsof -nP -tiTCP:$PORT -sTCP:LISTEN | xargs -r kill 2>/dev/null || true; }
SAMPLES="$(mktemp)"; SPID=""
cleanup() { [ -n "$SPID" ] && kill "$SPID" 2>/dev/null || true; docker exec "$CONTAINER" sh -c 'pkill -f measure-loop-marker' >/dev/null 2>&1 || true; stop_app; rm -f "$SAMPLES"; }
trap cleanup EXIT
node --experimental-strip-types --env-file=.env.local --env-file=.env.e2e scripts/e2e-cleanup.mjs >/dev/null
node --experimental-strip-types --env-file=.env.e2e scripts/e2e-seed.mjs >/dev/null
node --env-file=.env.e2e scripts/lib/connection-load-grants.mjs
stop_app; sleep 1
( DATABASE_URL="$READER_URL" DATABASE_URL_AUTH="$AUTH_URL" DATABASE_URL_CONSOLE="$CONSOLE_URL" CONSOLE_ENABLED=true KOSIPA_READ_ENABLED=true APP_ORIGIN="$BASE" pnpm exec next start -H 127.0.0.1 -p $PORT > /tmp/kkisi-measure-app.log 2>&1 & )
for _ in $(seq 1 60); do curl -s -o /dev/null "$BASE/login" && break; sleep 0.5; done
APP_PIDS="$(lsof -nP -tiTCP:$PORT -sTCP:LISTEN | tr '\n' ' ')"
NODE_PROCS="$(pgrep -f 'next start -H 127.0.0.1 -p '"$PORT"'|next-server' | wc -l | tr -d ' ')"
# In-container sampler: one shell loop, one short client per sample; ids let us separate simultaneous from accumulated connections.
docker exec -i -e MYSQL_PWD="$MARIADB_ROOT_PASSWORD" "$CONTAINER" sh -c 'n=0; while :; do n=$((n+1)); mariadb -uroot -N -B -e "SELECT $n, user, id, command FROM information_schema.processlist WHERE user IN (\"kkisi_e2e_read\",\"kkisi_auth\",\"kkisi_console\")" 2>/dev/null; sleep 0.05; done # measure-loop-marker' > "$SAMPLES" &
SPID=$!
sleep 1
LOAD="$(POS_FIXTURE="$PWD/.e2e-fixture.json" node scripts/lib/connection-load.mjs "$BASE" "$CONC" "$SECS" "$MODE")"
sleep 2; kill "$SPID" 2>/dev/null || true; SPID=""; docker exec "$CONTAINER" sh -c 'pkill -f measure-loop-marker' >/dev/null 2>&1 || true
echo "load: $LOAD"
echo "app listener pids: ${APP_PIDS:-none}; node processes matching the app: $NODE_PROCS"
echo "account|configured_limit|peak_simultaneous|peak_active|distinct_ids_over_run|samples"
awk -F'\t' -v rl="$RL" -v al="$AL" '
  { key=$1 SUBSEP $2; n[key]++; if ($4 != "Sleep") a[key]++; ids[$2 SUBSEP $3]=1; users[$2]=1; s[$1]=1 }
  END { for (k in n) { split(k, p, SUBSEP); if (n[k] > peak[p[2]]) peak[p[2]] = n[k] } for (k in a) { split(k, p, SUBSEP); if (a[k] > act[p[2]]) act[p[2]] = a[k] }
        for (k in ids) { split(k, p, SUBSEP); d[p[1]]++ } ns = 0; for (x in s) ns++
        lim["kkisi_e2e_read"] = rl; lim["kkisi_auth"] = al; lim["kkisi_console"] = 1
        for (u in users) printf "%s|%s|%d|%d|%d|%d\n", u, lim[u], peak[u], act[u] + 0, d[u], ns }' "$SAMPLES" | sort
