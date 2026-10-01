# shellcheck shell=bash
# Shared helpers for the auth-store scripts (setup / verify / teardown). This file is SOURCED, never executed,
# and has no side effects on load. Compatible with bash 3.2 (macOS): no associative arrays, no ${var,,}.

AUTH_DB="kkisi_auth_staging"
AUTH_USER="kkisi_auth"
LEGACY_DB="kkisi_staging"
LOCAL_STAGING_CONTAINER="kkisi-staging"   # the ONLY container these scripts will ever act on (decision: local staging container only)
CONTAINER="$LOCAL_STAGING_CONTAINER"

info() { printf '%s\n' "$*"; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# Strict dotted-quad IPv4: no wildcard, no hostname, no leading zeros, each octet 0-255.
is_ipv4() {
  local ip="$1" IFS=. o
  [[ "$ip" =~ ^(0|[1-9][0-9]{0,2})(\.(0|[1-9][0-9]{0,2})){3}$ ]] || return 1
  for o in $ip; do [ "$o" -le 255 ] || return 1; done
  return 0
}

# RFC 1918 + loopback only. The application's own connection path is always one of these.
is_private_ipv4() {
  local ip="$1" a b IFS=.
  is_ipv4 "$ip" || return 1
  set -- $ip; a="$1"; b="$2"
  [ "$a" -eq 10 ] && return 0
  [ "$a" -eq 127 ] && return 0
  [ "$a" -eq 192 ] && [ "$b" -eq 168 ] && return 0
  [ "$a" -eq 172 ] && [ "$b" -ge 16 ] && [ "$b" -le 31 ] && return 0
  return 1
}

# Atomically set KEY=VALUE in an env file (mode 600); other lines are preserved. Never prints the value.
upsert_env_line() {
  local file="$1" key="$2" value="$3" tmp
  [ -f "$file" ] || die "$file not found"
  tmp="$(mktemp "${file}.XXXXXX")" || die "mktemp failed"
  chmod 600 "$tmp"
  grep -v "^${key}=" "$file" > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$file"
  chmod 600 "$file"
}

remove_env_line() {
  local file="$1" key="$2" tmp
  [ -f "$file" ] || return 0
  tmp="$(mktemp "${file}.XXXXXX")" || die "mktemp failed"
  chmod 600 "$tmp"
  grep -v "^${key}=" "$file" > "$tmp" || true
  mv "$tmp" "$file"
  chmod 600 "$file"
}

# Value of KEY in ./.env.local without surrounding double quotes (used internally, never echoed).
read_local_env_value() {
  grep "^$1=" .env.local 2>/dev/null | tail -1 | sed -e "s/^$1=//" -e 's/^"//' -e 's/"$//'
}

load_root_env() {
  [ -f .env.staging ] || die ".env.staging not found (run from kkisi.web)"
  [ -f .env.local ]   || die ".env.local not found (run from kkisi.web)"
  set -a; . ./.env.staging; set +a
  [ -n "${MARIADB_ROOT_PASSWORD:-}" ] || die "MARIADB_ROOT_PASSWORD missing in .env.staging"
}

# Root access INSIDE the local container (password via env, never argv). Used for schema/grant work and introspection only.
root_sql() { docker exec -i -e MYSQL_PWD="$MARIADB_ROOT_PASSWORD" "$CONTAINER" mariadb -uroot -N -B "$@"; }

# The database container must exist, run, and publish 3306 on loopback only.
assert_local_container() {
  local ports line
  [ "$CONTAINER" = "$LOCAL_STAGING_CONTAINER" ] || die "refusing container '$CONTAINER': only '$LOCAL_STAGING_CONTAINER' is allowed"
  [ "$AUTH_DB" != "$LEGACY_DB" ] || die "auth database and legacy database must differ"
  docker inspect "$CONTAINER" >/dev/null 2>&1 || die "container '$CONTAINER' not found"
  [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER")" = "true" ] || die "container '$CONTAINER' is not running"
  ports="$(docker port "$CONTAINER" 3306/tcp)" || die "cannot read published ports of '$CONTAINER'"
  [ -n "$ports" ] || die "container '$CONTAINER' publishes no 3306/tcp port"
  while IFS= read -r line; do
    case "$line" in 127.0.0.1:*) ;; *) die "database port is not bound to loopback only ('$line'): refusing" ;; esac
  done <<< "$ports"
}

# The application connects to the local staging database over loopback; anything else is refused (S2-10).
APP_DB_HOSTPORT=""
assert_app_path_is_loopback() {
  local url rest host
  url="$(read_local_env_value DATABASE_URL)"
  [ -n "$url" ] || die "DATABASE_URL missing in .env.local"
  rest="${url##*@}"; APP_DB_HOSTPORT="${rest%%/*}"; host="${APP_DB_HOSTPORT%%:*}"
  case "$host" in 127.0.0.1|localhost) ;; *) die "DATABASE_URL host is not loopback: refusing" ;; esac
}

# The client host MariaDB sees for the APPLICATION'S OWN path (same DSN/driver as the app), via a read-only query.
detect_client_host() {
  node --env-file=.env.local --input-type=module -e '
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  const r = await db.$queryRaw`SELECT SUBSTRING_INDEX(USER(), "@", -1) AS h`;
  process.stdout.write(String(r[0].h));
} finally { await db.$disconnect(); }
' 2>/dev/null
}

AUTH_HOST=""
resolve_auth_host() {
  local h
  h="$(detect_client_host)" || die "could not detect the client host from the application's connection path"
  is_ipv4 "$h"         || die "detected client host is not a plain IPv4 address; refusing to guess or to use a wildcard"
  is_private_ipv4 "$h" || die "detected client host is not a private address; refusing"
  AUTH_HOST="$h"
}

legacy_object_count() {
  root_sql -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${LEGACY_DB}'"
}

# Substitute __AUTH_HOST__ (and optionally __AUTH_PW__) in a template. Pure bash: nothing goes through argv.
render_template() {
  local tpl; tpl="$(cat "$1")"
  tpl="${tpl//__AUTH_HOST__/$AUTH_HOST}"
  if [ -n "${2:-}" ]; then tpl="${tpl//__AUTH_PW__/$2}"; fi
  printf '%s\n' "$tpl"
}
