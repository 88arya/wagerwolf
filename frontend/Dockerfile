# The frontend, self-hosted beside the API rather than on Vercel.
#
# WHY THIS EXISTS. Vercel Hobby forbids commercial use and Pro is $20/month;
# with the EC2 box already bought and idle-ish, serving Next from it is free,
# removes the ToS question, and puts the site and the API on one origin so CORS
# stops being a class of bug. What it gives up is Vercel's CDN and the one piece
# of redundancy the stack had — see go_live.md.
#
# `output: "standalone"` in next.config.ts is what makes this small: Next traces
# the modules actually reached and emits a self-contained server, so the runtime
# stage carries no node_modules tree of its own. Without it this image would
# ship the full dependency graph and be several times the size.
#
# NEXT_PUBLIC_* ARE BAKED IN AT BUILD TIME. They are string-substituted into the
# client bundle by the compiler, so they cannot be supplied as container env at
# run time — passing them in docker-compose would do nothing at all, silently.
# That is why they are build args, and why THIS IMAGE IS ENVIRONMENT-SPECIFIC:
# an image built for production cannot be re-pointed at staging. Rebuild instead.

FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
# Skips Next's anonymous usage collection; a build server has nothing to report.
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:22-alpine
WORKDIR /app

# tini, so a `docker stop` reaches the Node process as SIGTERM rather than being
# swallowed by PID 1. Same reason the backend image carries it.
RUN apk add --no-cache tini

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# The three pieces standalone splits its output into. `static` and `public` are
# NOT included in the traced server bundle and have to be copied separately —
# omit either and the site serves HTML with no CSS, JS or images, which looks
# like a broken deploy rather than a missing COPY.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Non-root. The base image ships `node` (uid 1000); nothing here writes to disk.
USER node

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
