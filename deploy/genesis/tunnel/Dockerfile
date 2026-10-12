# SSH tunnel to the Niagahoster MariaDB for genesis.web. Encrypts the database transport (the server offers no TLS).
#   docker build -t genesis-db-tunnel:<tag> deploy/genesis/tunnel
# The private key and the pinned known_hosts are mounted at runtime; nothing secret is in the image.
FROM alpine:3.22
RUN apk add --no-cache openssh-client su-exec && adduser -D -u 10001 -h /home/tunnel tunnel
COPY entrypoint.sh /usr/local/bin/tunnel-entrypoint
RUN chmod 0755 /usr/local/bin/tunnel-entrypoint
ENTRYPOINT ["/usr/local/bin/tunnel-entrypoint"]
