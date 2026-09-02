# Multi-stage: TypeScript is compiled in a throwaway stage so the shipped image
# carries no devDependencies and no compiler.

# ---------- build ----------
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

# `tsc --noCheck` — emits without typechecking. Deliberate: drizzle-orm under
# node16 moduleResolution reports ~66 cosmetic dual-package type errors. CI
# typechecks separately via tsconfig.ci.json, so this is not the only gate.
RUN npm run build


# ---------- runtime ----------
FROM node:22-alpine

# tini as PID 1. Node does not reap zombies and does not forward signals to
# children by default; without an init, `docker compose down` waits the full
# 10s timeout and then SIGKILLs, which skips the SIGTERM handler in index.ts
# that closes the server and stops the BullMQ scheduler cleanly.
RUN apk add --no-cache tini

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# drizzle-kit reads ./src/db/schema.ts as TypeScript source, not the compiled
# output, so migrations need the source in the image. That is what lets
# `docker compose run --rm app npx drizzle-kit push` work on the host without
# ever exposing Postgres to the internet. drizzle-kit and typescript are both in
# `dependencies`, so --omit=dev keeps them.
COPY src ./src
COPY drizzle.config.ts tsconfig.json ./

# Never run as root. The Alpine node image ships a `node` user at uid 1000.
RUN chown -R node:node /app
USER node

EXPOSE 5000

# Compose gates the app on this before starting Caddy, and deploy.sh polls it.
# /health is mounted before the rate limiter, so polling cannot be throttled.
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
