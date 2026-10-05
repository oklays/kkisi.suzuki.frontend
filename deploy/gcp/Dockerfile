# syntax=docker/dockerfile:1
# KKISI web (Next.js) production image. Build context = repository root, filtered by the allowlist in /.dockerignore:
#   docker build -f deploy/gcp/Dockerfile -t kkisi-web:<tag> .
# No configuration or credential is baked in. DATABASE_URL*, AUTH_SECRETS, APP_ORIGIN, APP_ENV and the production
# allowlist are injected at runtime (deploy/gcp/env.production.example lists the names).
#
# `next start` is used instead of `output: 'standalone'`: the bcrypt worker is an eval worker that resolves
# `bcryptjs` from node_modules at runtime, which standalone file tracing does not see (POS plan 6.17.4 (c)).

FROM node:22.23.0-bookworm-slim AS build
# Prisma's query engine needs OpenSSL; generating inside the image yields the linux engine for the runtime platform.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/domain/package.json packages/domain/
COPY packages/application/package.json packages/application/
RUN pnpm install --frozen-lockfile
COPY packages/domain packages/domain
COPY packages/application packages/application
COPY apps/web apps/web
RUN pnpm --filter @koperasi/web db:generate && pnpm --filter @koperasi/web build

FROM build AS runtime
ENV NODE_ENV=production
# The process runs unprivileged; only the Next.js cache directory is writable (a tmpfs in docker-compose).
RUN mkdir -p /app/apps/web/.next/cache && chown -R node:node /app/apps/web/.next/cache
USER node
WORKDIR /app/apps/web
EXPOSE 3000
# Liveness only (no database). Readiness (/health/ready) is checked by the operator/runbook, not by Docker restarts.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
