#!/usr/bin/env bash
# Host monitor for .178 (P2). Runs every 2 minutes from kkisi-monitor.timer, as root, read-only:
#   PWA Anggota   http://127.0.0.1:3150/health?check=metrics   readiness of both pools + per-query p95/errors alerts (internal endpoint)
#   genesis.web   http://127.0.0.1:3140/health/ready            the console's database readiness (legacy, auth, console)
#   containers    kkisi-mobile-{web,db-tunnel}, genesis-{web,db-tunnel}: running + healthy (a refused tunnel key shows up here first)
# Overall state = ok | warn | critical. It is written to syslog (tag kkisi-monitor) on EVERY change, and POSTed to ALERT_WEBHOOK_URL (optional,
# /opt/apps/kkisi-mobile/monitor.env, mode 600) as {"text": "..."} — compatible with Slack/Discord/Google Chat/Mattermost incoming webhooks.
# No member data, SQL or secrets are ever included: only labels like "select trans_pinjaman_dtl p95 3120ms".
set -uo pipefail
STATE_DIR=/var/lib/kkisi-monitor; mkdir -p "$STATE_DIR"; chmod 700 "$STATE_DIR"
ENV_FILE=/opt/apps/kkisi-mobile/monitor.env
ALERT_WEBHOOK_URL=""; [ -f "$ENV_FILE" ] && . "$ENV_FILE"
problems=(); level=ok
raise() { problems+=("$2"); if [ "$1" = critical ] || [ "$level" = ok ]; then level=$1; fi; }

pwa=$(curl -s -m 10 'http://127.0.0.1:3150/health?check=metrics' || true)
if [ -z "$pwa" ]; then raise critical "PWA: no response on 127.0.0.1:3150"
else
  summary=$(printf '%s' "$pwa" | python3 -c 'import json,sys
d=json.load(sys.stdin); print(d.get("status","critical"))
for a in d.get("alerts",[]): print("%s %s %s %s (limit %s)"%(a["level"],a["code"],a["subject"],a["value"],a["threshold"]))' 2>/dev/null || echo critical)
  st=$(printf '%s\n' "$summary" | head -1)
  while IFS= read -r line; do [ -n "$line" ] && raise "${line%% *}" "PWA: ${line#* }"; done < <(printf '%s\n' "$summary" | tail -n +2)
  [ "$st" = critical ] && [ "$level" != critical ] && raise critical "PWA: status critical"
fi

gen=$(curl -s -m 10 http://127.0.0.1:3140/health/ready || true)
printf '%s' "$gen" | grep -q '"status":"ready"' || raise critical "Console smart.kkisitb2.id: not ready ${gen:0:160}"

for c in kkisi-mobile-web kkisi-mobile-db-tunnel genesis-web genesis-db-tunnel; do
  s=$(docker inspect --format '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$c" 2>/dev/null || echo missing/none)
  case "$s" in running/healthy|running/none) ;; *) raise critical "container $c: $s" ;; esac
done

text="[$level] .178 kkisi: $( [ ${#problems[@]} -eq 0 ] && echo 'all checks ok' || printf '%s; ' "${problems[@]}")"
fingerprint=$(printf '%s' "$level ${problems[*]:-}" | sed -E 's/[0-9]+(ms)?//g' | sha256sum | cut -c1-16)
previous=$(cat "$STATE_DIR/last" 2>/dev/null || true)
if [ "$fingerprint" != "$previous" ]; then
  logger -t kkisi-monitor -p "user.$( [ "$level" = ok ] && echo info || echo warning )" -- "$text"
  if [ -n "$ALERT_WEBHOOK_URL" ]; then
    payload=$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1]}))' "$text")
    curl -s -m 10 -o /dev/null -X POST -H 'content-type: application/json' --data "$payload" "$ALERT_WEBHOOK_URL" || logger -t kkisi-monitor -p user.warning "webhook delivery failed"
  fi
  printf '%s' "$fingerprint" > "$STATE_DIR/last"
fi
[ "$level" = ok ]
