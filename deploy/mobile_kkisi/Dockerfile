# syntax=docker/dockerfile:1
# PWA Anggota (apps/mobile_kkisi) production image. Build context = repository root, filtered by Dockerfile.dockerignore next
# to this file (BuildKit), so the console image's /.dockerignore is not involved:
#   docker build -f deploy/mobile_kkisi/Dockerfile -t kkisi-mobile:<tag> .
# No configuration or credential is baked in: APP_ENV, APP_ORIGIN, MEMBER_AUTH_SECRETS and the DSNs are injected at runtime
# (deploy/mobile_kkisi/env.production.example). `next start` (not standalone) because the bcrypt eval worker resolves
# `bcryptjs` from node_modules at runtime — the same reason as deploy/genesis/Dockerfile.
# next/font downloads Archivo and IBM Plex Sans ONCE at build time (needs outbound HTTPS during the build); the running app
# serves them itself and never contacts Google.

FROM node:22.23.0-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/mobile_kkisi/package.json apps/mobile_kkisi/
COPY packages/domain/package.json packages/domain/
COPY packages/application/package.json packages/application/
RUN pnpm install --frozen-lockfile --filter @koperasi/mobile-kkisi...
COPY packages/domain packages/domain
COPY packages/application packages/application
COPY apps/mobile_kkisi apps/mobile_kkisi
RUN pnpm --filter @koperasi/mobile-kkisi build

FROM build AS runtime
ENV NODE_ENV=production
RUN mkdir -p /app/apps/mobile_kkisi/.next/cache && chown -R node:node /app/apps/mobile_kkisi/.next/cache
USER node
WORKDIR /app/apps/mobile_kkisi
EXPOSE 3000
# Liveness only (no database call).
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
