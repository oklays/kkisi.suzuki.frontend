#!/bin/sh
# Copies the mounted key/known_hosts into a private tmpfs with ssh's required ownership, drops to the unprivileged
# "tunnel" user and runs one foreground ssh. Any failure exits non-zero; Docker's restart policy reconnects.
set -eu
: "${TUNNEL_SSH_HOST:?}" "${TUNNEL_SSH_PORT:?}" "${TUNNEL_SSH_USER:?}" "${TUNNEL_LOCAL_PORT:?}" "${TUNNEL_REMOTE_PORT:?}"
case "$TUNNEL_LOCAL_PORT$TUNNEL_REMOTE_PORT$TUNNEL_SSH_PORT" in *[!0-9]*) echo "[tunnel] invalid port" >&2; exit 64;; esac
# Permissions first, ownership last (root has CAP_CHOWN but not CAP_FOWNER).
mkdir -p /home/tunnel/.ssh
cp /run/tunnel/id_ed25519 /home/tunnel/.ssh/id_ed25519
cp /run/tunnel/known_hosts /home/tunnel/.ssh/known_hosts
chmod 700 /home/tunnel/.ssh; chmod 600 /home/tunnel/.ssh/id_ed25519; chmod 644 /home/tunnel/.ssh/known_hosts
chown -R tunnel:tunnel /home/tunnel/.ssh
echo "[tunnel] connecting: 127.0.0.1:${TUNNEL_LOCAL_PORT} -> ${TUNNEL_SSH_HOST}:${TUNNEL_SSH_PORT} -> 127.0.0.1:${TUNNEL_REMOTE_PORT}"
exec su-exec tunnel ssh -N -T \
  -i /home/tunnel/.ssh/id_ed25519 -o IdentitiesOnly=yes -o BatchMode=yes \
  -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/home/tunnel/.ssh/known_hosts -o HostKeyAlgorithms=ssh-ed25519 \
  -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o TCPKeepAlive=yes \
  -o ConnectTimeout=15 -o Compression=no -o LogLevel=ERROR \
  -o AddressFamily="${TUNNEL_ADDRESS_FAMILY:-inet}" \
  -p "$TUNNEL_SSH_PORT" \
  -L "127.0.0.1:${TUNNEL_LOCAL_PORT}:127.0.0.1:${TUNNEL_REMOTE_PORT}" \
  "${TUNNEL_SSH_USER}@${TUNNEL_SSH_HOST}"
