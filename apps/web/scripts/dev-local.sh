#!/usr/bin/env bash
# DEV LOCAL launcher for owner testing (checkpoint 14). Synthetic data, local container, loopback only.
#   scripts/dev-local.sh start [prod|dev]   prod = built app (next start) on http://127.0.0.1:3200 (default); dev = next dev on http://127.0.0.1:3201
#   scripts/dev-local.sh stop               stops both DEV LOCAL servers (never touches other processes, e.g. a server on :3000)
#   scripts/dev-local.sh status             URL, process and health
#   scripts/dev-local.sh reset [--with-products]   stop, reseed the synthetic schema, rebuild kkisi_devlocal_staging, (optionally seed the product catalog), start prod
#   scripts/dev-local.sh accounts           test accounts and roles (passwords stay in apps/web/.env.dev-local-accounts.json; never printed)
#   scripts/dev-local.sh links              (re)create the KOSIPA identity links through the app (also done by start)
#   scripts/dev-local.sh seed-products [1|2|3]  OPTIONAL: copy the PRODUCT CATALOG ONLY (items, categories, brands, units, taxes; no members, sales or any personal/financial table) of one real branch
#                                           of the local 30 Sep copy into DEV LOCAL branch 1 (SYNTH BRANCH 1) for realistic product testing; staff-name fields are blanked. Re-run after every reset.
#   scripts/dev-local.sh r1-trial           R1 landing policy trial on a THROW-AWAY instance (:3202): synthetic cashier role gets management grants temporarily, checks landing
#                                           without and with the mapping 4:pos,1:console, then restores everything. The owner-facing server never carries the mapping.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
PROD_PORT=3200; DEV_PORT=3201
die() { echo "ERROR: $*" >&2; exit 1; }
pid_on() { lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null | head -1 || true; }
need() { [ -f .env.dev-local ] || die "no DEV LOCAL profile: run scripts/dev-local.sh reset (or scripts/setup-dev-local.sh --apply)"; docker inspect -f '{{.State.Running}}' kkisi-staging 2>/dev/null | grep -q true || die "local container kkisi-staging is not running: docker start kkisi-staging"; }
launch() { # $1 mode, $2 port
  need; node scripts/lib/dev-local-preflight.mjs || die "preflight refused: nothing started"
  [ -z "$(pid_on "$2")" ] || die "port $2 is already in use"
  set -a; . ./.env.dev-local; set +a; export APP_ORIGIN="http://127.0.0.1:$2"
  if [ "$1" = prod ]; then [ -d .next ] || die "no production build: run pnpm build at the repository root"; nohup pnpm exec next start -H 127.0.0.1 -p "$2" > "/tmp/kkisi-devlocal-$2.log" 2>&1 &
  else nohup pnpm exec next dev -H 127.0.0.1 -p "$2" > "/tmp/kkisi-devlocal-$2.log" 2>&1 & fi
  for _ in $(seq 1 120); do curl -s -o /dev/null "http://127.0.0.1:$2/login" && break; sleep 0.5; done
  if grep -q "Another next dev server is already running" "/tmp/kkisi-devlocal-$2.log" 2>/dev/null; then
    die "Next.js allows ONE 'next dev' per directory and another one is already running (see the log for its port/PID). Stop that server yourself, or use: scripts/dev-local.sh start prod"
  fi
  curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$2/login" | grep -q 200 || die "server did not answer on $2 (log: /tmp/kkisi-devlocal-$2.log)"
  node scripts/lib/dev-local-links.mjs "http://127.0.0.1:$2" || echo "WARNING: identity links not created (see above)"
  echo "DEV LOCAL ($1) running: http://127.0.0.1:$2/login   (log /tmp/kkisi-devlocal-$2.log)"
}
seed_products() {
  need; local src="${1:-1}"; [[ "$src" =~ ^[123]$ ]] || die "source branch must be 1, 2 or 3 (company ids of the local 30 Sep copy)"
  set -a; . ./.env.staging; set +a
  root() { docker exec -i -e MYSQL_PWD="$MARIADB_ROOT_PASSWORD" kkisi-staging mariadb -uroot -N -B "$@"; }
  local DL=kkisi_devlocal_staging S=kkisi_staging
  [ "$(root -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DL' AND table_name='_devlocal_marker'")" = "1" ] || die "$DL does not carry the DEV LOCAL marker: refusing"
  [ "$(root -e "SELECT COUNT(*) FROM $DL.db_company WHERE id=9001")" = "1" ] || die "synthetic branch 9001 missing: run reset first"
  # items: ids shifted by 1,000,000 (no clash with synthetic ids), branch forced to the synthetic 9001, staff-name/ip fields blanked, opname lock cleared
  local cols sel c; cols="$(root -e "SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY ORDINAL_POSITION) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$S' AND TABLE_NAME='db_items'")"; sel=""
  for c in ${cols//,/ }; do case "$c" in id) sel="$sel,id + 1000000";; company_id) sel="$sel,9001";; created_by|added_by|system_ip|system_name) sel="$sel,''";; status_so) sel="$sel,0";; *) sel="$sel,\`$c\`";; esac; done
  root -e "SET SESSION sql_mode='';
    INSERT IGNORE INTO $DL.db_category SELECT * FROM $S.db_category; INSERT IGNORE INTO $DL.db_brands SELECT * FROM $S.db_brands;
    INSERT IGNORE INTO $DL.db_units SELECT * FROM $S.db_units; INSERT IGNORE INTO $DL.db_tax SELECT * FROM $S.db_tax;
    DELETE FROM $DL.db_items WHERE id >= 1000000;
    INSERT INTO $DL.db_items (\`${cols//,/\`,\`}\`) SELECT ${sel#,} FROM $S.db_items WHERE company_id = $src;"
  echo "product catalog copied from branch $src of the 30 Sep copy into DEV LOCAL branch 1: $(root -e "SELECT COUNT(*) FROM $DL.db_items WHERE id >= 1000000") items ($(root -e "SELECT COUNT(*) FROM $DL.db_items WHERE id >= 1000000 AND stock > 0") with stock), $(root -e "SELECT COUNT(*) FROM $DL.db_category") categories. Members, sales and financial tables were NOT copied."
}
r1_trial() {
  need; local port=3202 slugs="sales_view sales_payment_view sales_return_view sales_return_add items_view items_add items_edit inventory_so inventory_view users_edit" rc=0
  [ -z "$(pid_on "$port")" ] || die "port $port is in use"
  set -a; . ./.env.local; . ./.env.staging; set +a
  root() { docker exec -i -e MYSQL_PWD="$MARIADB_ROOT_PASSWORD" kkisi-staging mariadb -uroot -N -B "$@"; }
  local s; for s in $slugs; do root -e "INSERT INTO kkisi_devlocal_staging.db_permissions (role_id, permissions) SELECT 4, '$s' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM kkisi_devlocal_staging.db_permissions WHERE role_id=4 AND permissions='$s')"; done
  trial_cleanup() { local p; p="$(pid_on "$port")"; [ -n "$p" ] && kill "$p" 2>/dev/null; for s in $slugs; do root -e "DELETE FROM kkisi_devlocal_staging.db_permissions WHERE role_id=4 AND permissions='$s'"; done; }
  trap trial_cleanup EXIT
  for mode in derived policy; do
    local roles=""; [ "$mode" = policy ] && roles="4:pos,1:console"
    CONSOLE_LANDING_ROLES="$roles" node scripts/lib/dev-local-preflight.mjs $([ "$mode" = policy ] && echo --r1-trial) >/dev/null || die "preflight refused the trial ($mode)"
    ( set -a; . ./.env.dev-local; set +a; export APP_ORIGIN="http://127.0.0.1:$port" CONSOLE_LANDING_ROLES="$roles"; nohup pnpm exec next start -H 127.0.0.1 -p "$port" > "/tmp/kkisi-devlocal-$port.log" 2>&1 & )
    for _ in $(seq 1 60); do curl -s -o /dev/null "http://127.0.0.1:$port/login" && break; sleep 0.5; done
    node scripts/lib/dev-local-r1-trial.mjs "http://127.0.0.1:$port" "$mode" || rc=1
    local p; p="$(pid_on "$port")"; [ -n "$p" ] && kill "$p"; sleep 1
  done
  trap - EXIT; trial_cleanup
  echo "R1 trial finished; synthetic cashier grants removed; owner-facing server untouched. Result: $([ $rc = 0 ] && echo PASS || echo FAIL)"; return $rc
}
case "${1:-}" in
  r1-trial) r1_trial ;;
  seed-products) seed_products "${2:-1}" ;;
  start) case "${2:-prod}" in prod) launch prod "$PROD_PORT";; dev) launch dev "$DEV_PORT";; *) die "start prod|dev";; esac ;;
  stop) for p in $PROD_PORT $DEV_PORT; do pid="$(pid_on "$p")"; [ -n "$pid" ] && kill "$pid" && echo "stopped :$p (pid $pid)"; done; true ;;
  status) for p in $PROD_PORT $DEV_PORT; do pid="$(pid_on "$p")"; if [ -n "$pid" ]; then echo ":$p running (pid $pid) http=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$p/login") -> http://127.0.0.1:$p/login"; else echo ":$p stopped"; fi; done ;;
  links) need; port="$PROD_PORT"; [ -n "$(pid_on "$port")" ] || port="$DEV_PORT"; node scripts/lib/dev-local-links.mjs "http://127.0.0.1:$port" ;;
  reset)
    "$0" stop || true
    export E2E_FIXTURE="$PWD/.e2e-fixture.json"
    node --experimental-strip-types --env-file=.env.local --env-file=.env.e2e scripts/e2e-cleanup.mjs >/dev/null
    node --experimental-strip-types --env-file=.env.e2e scripts/e2e-seed.mjs >/dev/null
    bash scripts/setup-dev-local.sh --apply
    [ "${2:-}" = "--with-products" ] && seed_products 1
    launch prod "$PROD_PORT" ;;
  accounts) cat <<'TXT'
Akun uji DEV LOCAL (SINTETIS; password: apps/web/.env.dev-local-accounts.json, kunci = nama setelah "synth_"; jangan disalin ke Git/chat)
  synth_admin     role 1 (pemilih cabang)  Administrator console + pratinjau Warehouse (izin uji: users_edit, sales/items/inventory)
  synth_kepala    role 3 (cabang 9001)     Supervisor TOKO (izin uji: penjualan, pembayaran, retur, produk ubah, stock opname)
  synth_kasir1    role 4 (cabang 9001)     Kasir TOKO (sales_add saja) -> mendarat di /pos; juga dipakai untuk uji akses tanpa izin
  synth_koperasi  role 2 (pemilih cabang)  Administrator KOSIPA: ditautkan ke synth_ksp (semua tampilan KOSIPA) + satu-satunya pengguna ekspor CSV
  synth_kasir2    role 4 (cabang 9002)     Staf KOSIPA baca-saja: ditautkan ke synth_ksp_staff (anggota, simpanan, pinjaman; tanpa payroll)
  synth_off       role 4, akun NONAKTIF    tidak dapat masuk
  synth_nobranch  role 4, cabang nonaktif  tidak dapat masuk
Semua pemetaan izin di atas HANYA untuk uji lokal (database kkisi_devlocal_staging), bukan izin produksi.
TXT
  ;;
  *) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
