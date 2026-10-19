# ---------- build ----------
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

# tsc --noCheck; CI typechecks separately.
RUN npm run build

# ---------- runtime ----------
FROM node:22-alpine

# tini as PID 1 so SIGTERM reaches node and graceful shutdown runs.
RUN apk add --no-cache tini

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# drizzle-kit reads the TypeScript schema, so the source ships too.
COPY src ./src
COPY drizzle.config.ts tsconfig.json ./

# Never run as root. The Alpine node image ships a `node` user at uid 1000.
RUN chown -R node:node /app
USER node

EXPOSE 5000

# /health is mounted before the rate limiter.
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
