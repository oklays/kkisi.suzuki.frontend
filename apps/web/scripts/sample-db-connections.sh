#!/usr/bin/env bash
# Samples the number of open connections PER DATABASE ACCOUNT on the LOCAL staging container (checkpoint 11 capacity evidence) until it receives SIGTERM/SIGINT,
# then prints the peak per account. Pooled idle connections count (they count against max_user_connections too). Read-only (information_schema.processlist), local container only.
# This measures the SYNTHETIC UAT load of this repository: it is NOT a production measurement and says nothing about the legacy PHP application's peak.
#   scripts/sample-db-connections.sh [interval-seconds]   (run in the background around scripts/uat-run.sh; stop with kill -TERM <pid>)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=lib/auth-store-common.sh
. scripts/lib/auth-store-common.sh
load_root_env; assert_local_container
interval="${1:-0.2}"; [[ "$interval" =~ ^[0-9]+(\.[0-9]+)?$ ]] || die "interval must be a number"
tmp="$(mktemp)"; trap 'summarise' EXIT TERM INT
summarise() {
  trap - EXIT TERM INT
  [ -s "$tmp" ] || { echo "no samples"; rm -f "$tmp"; exit 0; }
  echo "account|peak_open|samples_with_connections"
  awk -F'\t' '{ if ($2 > max[$1]) max[$1] = $2; seen[$1]++ } END { for (u in max) printf "%s|%d|%d\n", u, max[u], seen[u] }' "$tmp" | sort
  rm -f "$tmp"; exit 0
}
while :; do
  docker exec -i -e MYSQL_PWD="$MARIADB_ROOT_PASSWORD" "$CONTAINER" mariadb -uroot -N -B -e "SELECT user, COUNT(*) FROM information_schema.processlist WHERE user NOT IN ('root','system user','event_scheduler') GROUP BY user" >> "$tmp" 2>/dev/null || true
  sleep "$interval"
done
