#!/usr/bin/env bash
# Process OWNERSHIP for the DEV LOCAL launcher (checkpoint 16). Sourced by scripts/dev-local.sh (and by tests/dev-local-process.test.mjs).
# Rule: a server may be stopped only if THIS tooling started (or the user explicitly adopted) it AND its identity still matches the record.
# A port number, a process name or a stale PID file never authorises a kill. Anything ambiguous is left alone.
# A record (one file per port in $RUN_DIR) holds: listener pid + start time, optional launcher pid + start time, the application directory.
# Identity of a process = pid + start time (ps lstart) + command line contains "next" + working directory equals the recorded application directory.
RUN_DIR="${DEV_LOCAL_RUN_DIR:-$PWD/.dev-local-run}"
APP_DIR="${DEV_LOCAL_APP_DIR:-$(pwd -P)}"
pid_on() { lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null | head -1 || true; }
proc_start() { ps -o lstart= -p "$1" 2>/dev/null | sed 's/^ *//;s/ *$//'; }
proc_cmd() { ps -o command= -p "$1" 2>/dev/null || true; }
proc_cwd() { lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1; }
rec_file() { printf '%s/%s.rec' "$RUN_DIR" "$1"; }
rec_get() { sed -n "s/^$2=//p" "$(rec_file "$1")" 2>/dev/null | head -1; }
# is_ours_process PID EXPECTED_START: alive, same start time, a next process, started from the application directory
is_ours_process() {
  local pid="$1" start="$2"
  [[ "$pid" =~ ^[0-9]+$ ]] && [ -n "$start" ] || return 1
  [ "$(proc_start "$pid")" = "$start" ] || return 1
  proc_cmd "$pid" | grep -qi 'next' || return 1
  [ "$(proc_cwd "$pid")" = "$APP_DIR" ] || return 1
}
# record_server PORT [LAUNCHER_PID]: records the CURRENT listener of PORT, but only if it really is a next process of this application directory
record_server() {
  local port="$1" launcher="${2:-}" lp lstart
  lp="$(pid_on "$port")"; [ -n "$lp" ] || return 1
  lstart="$(proc_start "$lp")"; [ -n "$lstart" ] || return 1
  is_ours_process "$lp" "$lstart" || return 1
  mkdir -p "$RUN_DIR"; chmod 700 "$RUN_DIR"
  { echo "port=$port"; echo "listener=$lp"; echo "listener_start=$lstart"; echo "app_dir=$APP_DIR"
    if [[ "$launcher" =~ ^[0-9]+$ ]] && [ -n "$(proc_start "$launcher")" ]; then echo "launcher=$launcher"; echo "launcher_start=$(proc_start "$launcher")"; fi
  } > "$(rec_file "$port")"
}
# server_state PORT -> prints one of: owned | none | stale | ambiguous | foreign
#   owned      record matches the live listener of PORT
#   none       no record and nothing listens
#   foreign    something listens on PORT but this tooling has no (valid) record for it: NEVER touched
#   stale      a record exists but its process is gone or is a different process now (record is obsolete)
#   ambiguous  record's process is alive and ours, but it is not the listener of PORT (still starting / changed): never touched
server_state() {
  local port="$1" listener lstart live; live="$(pid_on "$port")"
  if [ ! -f "$(rec_file "$port")" ]; then [ -n "$live" ] && echo foreign || echo none; return; fi
  listener="$(rec_get "$port" listener)"; lstart="$(rec_get "$port" listener_start)"
  if ! is_ours_process "$listener" "$lstart"; then [ -n "$live" ] && { echo stale-foreign; return; }; echo stale; return; fi   # whatever listens now is NOT the recorded process, even if the pid number matches
  [ "$live" = "$listener" ] && echo owned || echo ambiguous
}
# stop_server PORT: stops the recorded server only. Returns 0 when nothing of ours remains running, 2 when something was deliberately left alone.
stop_server() {
  local port="$1" state listener launcher lstart waited=0; state="$(server_state "$port")"
  case "$state" in
    none) echo ":$port not running"; return 0;;
    foreign) echo ":$port is in use by process $(pid_on "$port") that DEV LOCAL did not start: left alone"; return 2;;
    stale) rm -f "$(rec_file "$port")"; echo ":$port not running (obsolete record removed; no process was signalled)"; return 0;;
    stale-foreign) rm -f "$(rec_file "$port")"; echo ":$port: obsolete record removed; the process now on the port ($(pid_on "$port")) is not the recorded one and was left alone"; return 2;;
    ambiguous) echo ":$port: recorded process is alive but is not the listener of this port: left alone (check scripts/dev-local.sh status)"; return 2;;
  esac
  listener="$(rec_get "$port" listener)"; lstart="$(rec_get "$port" listener_start)"
  launcher="$(rec_get "$port" launcher)"
  kill -TERM "$listener" 2>/dev/null || true
  if [ -n "$launcher" ] && is_ours_process "$launcher" "$(rec_get "$port" launcher_start)"; then kill -TERM "$launcher" 2>/dev/null || true; fi
  while [ "$waited" -lt 30 ] && is_ours_process "$listener" "$lstart"; do sleep 0.5; waited=$((waited + 1)); done
  if is_ours_process "$listener" "$lstart"; then kill -KILL "$listener" 2>/dev/null || true; sleep 0.5; echo ":$port stopped (pid $listener, forced after 15 s)"
  else echo ":$port stopped (pid $listener)"; fi
  rm -f "$(rec_file "$port")"; return 0
}
# adopt_server PORT: explicit user action for a server started by an older version of the script. Verifies it is a next process of this directory.
adopt_server() {
  local port="$1" lp; lp="$(pid_on "$port")"; [ -n "$lp" ] || { echo "nothing listens on :$port" >&2; return 1; }
  [ ! -f "$(rec_file "$port")" ] || { echo ":$port already has a record" >&2; return 1; }
  record_server "$port" || { echo "process $lp on :$port is not a next process started from $APP_DIR: not adopted" >&2; return 1; }
  echo ":$port adopted (pid $lp): from now on 'stop' may stop it"
}
# status_line PORT
status_line() {
  local port="$1" state pid name; state="$(server_state "$port")"; pid="$(pid_on "$port")"
  name=prod; [ "$port" = "${DEV_PORT:-3201}" ] && name=dev
  case "$state" in
    owned) echo ":$port running (managed, pid $pid) http=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/login") -> http://127.0.0.1:$port/login";;
    foreign|stale-foreign) echo ":$port in use by pid $pid, NOT managed by DEV LOCAL (never stopped by it; use 'adopt $name' only if you started it from this script) http=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/login")";;
    ambiguous) echo ":$port ambiguous: recorded process alive but not listening here";;
    stale) echo ":$port stopped (stale record; removed on next stop/start)";;
    none) echo ":$port stopped";;
  esac
}
