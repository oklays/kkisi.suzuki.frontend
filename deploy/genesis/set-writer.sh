#!/usr/bin/env bash
# Enable one genesis.web write feature with its own production database account, without the password ever leaving
# the server. Run ON the genesis.web server, after the account was created manually in cPanel:
#   /opt/apps/genesis.web/set-writer.sh return    n1608204_nxret   # SELECT, INSERT, UPDATE
#   /opt/apps/genesis.web/set-writer.sh inventory n1608204_nxinv   # SELECT, INSERT, UPDATE, DELETE
#   /opt/apps/genesis.web/set-writer.sh products  n1608204_nxprd   # SELECT, INSERT, UPDATE
# Steps: hidden password prompt -> login test through the running tunnel (read-only statements) -> grant check (no DDL)
# -> back up .env.production -> set DSN + flag (+ connection budget) -> recreate the app -> verify the startup guard.
# Any failure restores the previous .env.production.
set -euo pipefail
D=/opt/apps/genesis.web
ENV_FILE="$D/.env.production"
COMPOSE=(docker compose --env-file "$D/compose.env" -f "$D/src/deploy/genesis/docker-compose.yml")
die() { echo "ERROR: $*" >&2; exit 1; }

case "${1:-}" in
  return)    FLAG=SALES_RETURN_WRITES_ENABLED; VAR=DATABASE_URL_RETURN_WRITE;    NAME=returns ;;
  inventory) FLAG=INVENTORY_WRITES_ENABLED;    VAR=DATABASE_URL_INVENTORY_WRITE; NAME=inventory ;;
  products)  FLAG=PRODUCTS_WRITES_ENABLED;     VAR=DATABASE_URL_PRODUCT_WRITE;   NAME=products ;;
  *) die "usage: $0 return|inventory|products <cpanel_db_user>" ;;
esac
DB_USER="${2:-}"
[[ "$DB_USER" =~ ^n1608204_[a-z0-9_]{2,30}$ ]] || die "database user must look like n1608204_xxx"
[[ "$DB_USER" != "n1608204_kkisi" ]] || die "the legacy PHP account must never be used by genesis.web"
grep -qE "^[A-Z_]+=mysql://${DB_USER}:" "$ENV_FILE" && die "$DB_USER is already used by another connection (each writer needs its own account)"

read -rsp "Password for $DB_USER: " PW; echo
[[ -n "$PW" ]] || die "empty password"
ENC=$(PW="$PW" python3 -c 'import os, urllib.parse; print(urllib.parse.quote(os.environ["PW"], safe=""))')
URL="mysql://${DB_USER}:${ENC}@127.0.0.1:3307/n1608204_smart_kopkar?connection_limit=1&max_idle_connection_lifetime=10&connect_timeout=10&pool_timeout=10"

echo "1/4 testing the account through the tunnel (read-only statements)..."
docker exec -i -e U="$URL" -w /app/apps/web genesis-web node --no-warnings --input-type=module -e '
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient({ datasourceUrl: process.env.U });
try {
  const [r] = await p.$queryRaw`SELECT CURRENT_USER() u, DATABASE() db, @@hostname h`;
  const grants = (await p.$queryRaw`SHOW GRANTS`).map((row) => String(Object.values(row)[0]).replace(/[`\\]/g, ""));
  const mine = grants.filter((g) => / ON n1608204_smart_kopkar\./.test(g) || / ON \*\.\* /.test(g)).map((g) => g.replace(/^GRANT /, "").split(" ON ")[0]);
  console.log(`   ok: ${r.u} on ${r.h}, database ${r.db}; privileges: ${mine.join(" | ")}`);
  if (r.db !== "n1608204_smart_kopkar" || r.h !== "srv149.niagahoster.com") { console.error("   wrong server or database"); process.exit(2); }
  if (mine.some((g) => /ALL PRIVILEGES|CREATE|DROP|ALTER|INDEX|TRIGGER|GRANT OPTION/.test(g))) { console.error("   account has DDL/ALL privileges: refuse (grant only SELECT, INSERT, UPDATE[, DELETE])"); process.exit(3); }
} catch (e) { console.error("   login failed:", e.errorCode ?? e.code ?? e.name); process.exit(4); }
finally { await p.$disconnect(); }' || die "account test failed; nothing was changed"

echo "2/4 writing configuration (backup first)..."
BAK="$ENV_FILE.bak-$(date +%Y%m%dT%H%M%S)"; cp -p "$ENV_FILE" "$BAK"
TMP=$(mktemp "$D/.env.tmp.XXXXXX"); chmod 600 "$TMP"
grep -vE "^(# )?${VAR}=" "$ENV_FILE" > "$TMP"
printf '%s=%s\n' "$VAR" "$URL" >> "$TMP"
sed -i "s/^${FLAG}=.*/${FLAG}=1/" "$TMP"
grep -q "^${FLAG}=1" "$TMP" || printf '%s=1\n' "$FLAG" >> "$TMP"
grep -q '^ALLOW_PRODUCTION_DB_WRITE=true' "$TMP" || sed -i 's/^ALLOW_PRODUCTION_DB_WRITE=.*/ALLOW_PRODUCTION_DB_WRITE=true/' "$TMP"
# Connection budget = sum of the pools that will be open on the Niagahoster server (max 12 of max_user_connections 20).
limit_of() { local v; v=$(grep -E "^$1=" "$TMP" | grep -oE 'connection_limit=[0-9]+' | cut -d= -f2 || true); echo "${v:-0}"; }
on() { grep -qE "^$1=1" "$TMP"; }
SUM=$(( $(limit_of DATABASE_URL) + $(limit_of DATABASE_URL_AUTH) ))
on POS_WRITES_ENABLED && SUM=$(( SUM + $(limit_of DATABASE_URL_WRITE) + $(limit_of DATABASE_URL_REGISTER_WRITE) ))
on SALES_RETURN_WRITES_ENABLED && SUM=$(( SUM + $(limit_of DATABASE_URL_RETURN_WRITE) ))
on INVENTORY_WRITES_ENABLED && SUM=$(( SUM + $(limit_of DATABASE_URL_INVENTORY_WRITE) ))
on PRODUCTS_WRITES_ENABLED && SUM=$(( SUM + $(limit_of DATABASE_URL_PRODUCT_WRITE) ))
(( SUM <= 12 )) || { rm -f "$TMP"; die "connection pools would need $SUM connections (max 12); nothing was changed"; }
CUR=$(grep -E '^LEGACY_DB_CONNECTION_BUDGET=' "$TMP" | cut -d= -f2)
(( SUM > CUR )) && sed -i "s/^LEGACY_DB_CONNECTION_BUDGET=.*/LEGACY_DB_CONNECTION_BUDGET=${SUM}/" "$TMP"
mv "$TMP" "$ENV_FILE"; chmod 600 "$ENV_FILE"

echo "3/4 restarting the app..."
"${COMPOSE[@]}" up -d --force-recreate --no-deps web >/dev/null 2>&1
for i in $(seq 1 30); do
  LINE=$(docker logs --since 2m genesis-web 2>&1 | grep '\[startup\]' | tail -1 || true)
  [[ -n "$LINE" ]] && break; sleep 2
done
echo "4/4 $LINE"
if [[ "$LINE" != *"configuration verified"* ]]; then
  echo "startup refused: restoring the previous configuration" >&2
  cp -p "$BAK" "$ENV_FILE"; "${COMPOSE[@]}" up -d --force-recreate --no-deps web >/dev/null 2>&1
  die "$NAME was NOT enabled (previous configuration restored)"
fi
echo "done: $NAME writes enabled with $DB_USER (backup of the previous environment: $BAK)"
