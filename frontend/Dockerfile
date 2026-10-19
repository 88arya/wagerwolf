# Next.js standalone build, served from the same box as the API.

FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
# Error reporting, off when empty. See instrumentation.ts.
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_GIT_COMMIT_SHA
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_GIT_COMMIT_SHA=$NEXT_PUBLIC_GIT_COMMIT_SHA
# Skips Next's anonymous usage collection; a build server has nothing to report.
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:22-alpine
WORKDIR /app

# tini so docker stop reaches node as SIGTERM.
RUN apk add --no-cache tini

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone output doesn't include static/ and public/; copy them separately.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER node

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
