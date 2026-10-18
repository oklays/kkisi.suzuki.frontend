#!/usr/bin/env bash
# DEV LOCAL launcher for owner testing (checkpoint 14). Synthetic data, local container, loopback only.
#   scripts/dev-local.sh start [prod|dev]   prod = built app (next start) on http://127.0.0.1:3200 (default); dev = next dev on http://127.0.0.1:3201
#   scripts/dev-local.sh stop               stops both DEV LOCAL servers (never touches other processes, e.g. a server on :3000)
#   scripts/dev-local.sh status             URL, process and health
#   scripts/dev-local.sh reset              stop, reseed the synthetic schema, rebuild kkisi_devlocal_staging, start prod
#   scripts/dev-local.sh accounts           test accounts and roles (passwords stay in apps/web/.env.dev-local-accounts.json; never printed)
#   scripts/dev-local.sh links              (re)create the KOSIPA identity links through the app (also done by start)
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
case "${1:-}" in
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
