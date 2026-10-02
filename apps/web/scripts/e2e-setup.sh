#!/usr/bin/env bash
# Gate A E1 (+ E2 seed): synthetic legacy-shaped schema kkisi_e2e_legacy and two minimum-privilege accounts, on the LOCAL
# staging container only. DEFAULT IS A DRY RUN (read-only checks). Nothing is ever dropped here (E3b is not approved).
#   scripts/e2e-setup.sh            dry run
#   scripts/e2e-setup.sh --apply    E1 (DDL + accounts) then E2 (synthetic rows via the seed account)
set -euo pipefail
umask 077
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=lib/auth-store-common.sh
. scripts/lib/auth-store-common.sh

E2E_DB="kkisi_e2e_legacy"
main() {
  local mode="dry-run"; [ "${1:-}" = "--apply" ] && mode="apply"
  [ $# -le 1 ] && { [ -z "${1:-}" ] || [ "$1" = "--apply" ]; } || die "usage: scripts/e2e-setup.sh [--apply]"
  info "== Gate A E1/E2 ($mode) =="
  load_root_env; assert_local_container; assert_app_path_is_loopback; resolve_auth_host
  local host="$AUTH_HOST" have_db have_acct legacy_before
  [ "$E2E_DB" != "$LEGACY_DB" ] && [ "$E2E_DB" != "$AUTH_DB" ] || die "e2e schema must differ from the legacy and auth schemas"
  have_db="$(root_sql -e "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='${E2E_DB}'")"
  have_acct="$(root_sql -e "SELECT COUNT(*) FROM mysql.global_priv WHERE User LIKE 'kkisi_e2e%'")"
  legacy_before="$(legacy_object_count)"
  info "container=$CONTAINER (loopback only) legacy=$LEGACY_DB(objects=$legacy_before) auth=$AUTH_DB e2e=$E2E_DB(exists=$have_db)"
  info "accounts: kkisi_e2e_seed@$host (SELECT,INSERT,DELETE on $E2E_DB.*), kkisi_e2e_read@$host (SELECT on $E2E_DB.*); existing kkisi_e2e* accounts: $have_acct"
  info "operations: 1) db/e2e/001_e2e_structure.sql (8 structure-only tables + marker) 2) db/e2e/002_e2e_grants.sql.tpl 3) write .env.e2e (mode 600) 4) scripts/e2e-seed.mjs (synthetic rows) 5) read-only verification"
  [ "$mode" = "apply" ] || { info "DRY RUN: nothing was changed."; return 0; }
  [ "$have_db" = "0" ] && [ "$have_acct" = "0" ] || die "e2e schema or accounts already exist: refusing to re-run E1 (use the verify commands)"

  local seed_pw read_pw tpl
  seed_pw="$(openssl rand -hex 24)"; read_pw="$(openssl rand -hex 24)"
  info "[1/5] E1 structure";  root_sql < db/e2e/001_e2e_structure.sql
  info "[2/5] E1 accounts"
  tpl="$(cat db/e2e/002_e2e_grants.sql.tpl)"; tpl="${tpl//__E2E_HOST__/$host}"; tpl="${tpl//__SEED_PW__/$seed_pw}"; tpl="${tpl//__READ_PW__/$read_pw}"
  printf '%s\n' "$tpl" | root_sql
  [ "$(legacy_object_count)" = "$legacy_before" ] || die "legacy object count changed: STOP"
  info "[3/5] .env.e2e"
  : > .env.e2e; chmod 600 .env.e2e
  printf 'E2E_SEED_URL="mysql://kkisi_e2e_seed:%s@%s/%s?connection_limit=4"\nE2E_READ_URL="mysql://kkisi_e2e_read:%s@%s/%s?connection_limit=8"\nE2E_HOST=%s\n' \
    "$seed_pw" "$APP_DB_HOSTPORT" "$E2E_DB" "$read_pw" "$APP_DB_HOSTPORT" "$E2E_DB" "$host" >> .env.e2e
  info "[4/5] E2 seed (synthetic rows, through the seed account)"
  E2E_FIXTURE="${E2E_FIXTURE:-.e2e-fixture.json}" node --env-file=.env.e2e scripts/e2e-seed.mjs
  info "[5/5] verification (read-only)"
  [ "$(legacy_object_count)" = "$legacy_before" ] || die "legacy object count changed: STOP"
  info "done. Legacy objects unchanged ($legacy_before)."
}
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
