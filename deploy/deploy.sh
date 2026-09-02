#!/usr/bin/env bash
#
# Runs ON the EC2 instance, invoked over SSH by the deploy workflow.
#
# Expects, already present in $APP_DIR (scp'd by the workflow from the commit
# being deployed):
#   .env                 secrets for this environment, including DATABASE_URL
#                        (Supabase — Postgres does not run on this box)
#   docker-compose.yml   from THIS commit
#   Caddyfile            from THIS commit
#
# And in the environment:
#   APP_IMAGE            image pinned by commit SHA, never `latest`
#   RUN_MIGRATIONS       1 to run drizzle-kit push before starting the app
#
# TWO THINGS THIS DOES DIFFERENTLY, both deliberate:
#
#   1. The compose file and Caddyfile are shipped with the deploy, not fetched
#      from the default branch at run time. Pulling them from `main` means a
#      rollback to an older image still picks up today's compose file — you get
#      a combination that was never tested anywhere.
#
#   2. The image is pinned to sha-<commit>. `latest` makes `docker pull` a
#      moving target and makes rollback impossible: there is no older tag to go
#      back to.

set -euo pipefail

APP_DIR="/opt/wagerwolf"
HEALTH_TIMEOUT=120   # seconds; a cold boot also runs runStartupSeed()

cd "$APP_DIR"

: "${APP_IMAGE:?APP_IMAGE must be set (pinned, e.g. ghcr.io/…:sha-abc1234)}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-0}"

if [ ! -f .env ]; then
  echo "ERROR: $APP_DIR/.env is missing — the workflow should have copied it." >&2
  exit 1
fi

# Remember what is serving right now, so a failed deploy has somewhere to go
# back to. Empty on the very first deploy, which the rollback path handles.
PREVIOUS_IMAGE="$(docker compose ps -q app 2>/dev/null \
  | xargs -r docker inspect --format='{{.Config.Image}}' 2>/dev/null || true)"
echo "==> Currently serving: ${PREVIOUS_IMAGE:-<nothing>}"
echo "==> Deploying:         $APP_IMAGE"

echo "==> Pulling image"
docker pull "$APP_IMAGE"

export APP_IMAGE

# Redis first and on its own. The app's `depends_on: service_healthy` would
# bring it up anyway, but starting it explicitly means a Redis that fails to
# come up reports itself as a Redis failure rather than as an app that never
# became healthy.
#
# There is no Postgres here — it is Supabase, reached over the internet. See
# docker-compose.yml.
echo "==> Starting Redis"
docker compose up -d redis

if [ "$RUN_MIGRATIONS" = "1" ]; then
  echo "==> Applying schema (drizzle-kit push)"
  # A one-shot container rather than the runner, only so the schema is applied
  # by the exact image being deployed. --force skips the interactive
  # confirmation that would hang a non-tty session; production passes
  # RUN_MIGRATIONS=0 and goes through db-push.yml instead, precisely because
  # --force auto-approves data loss.
  docker compose run --rm --no-deps -T app npx drizzle-kit push --force
fi

echo "==> Starting app and proxy"
docker compose up -d --remove-orphans

echo "==> Waiting for health (max ${HEALTH_TIMEOUT}s)"
deadline=$(( SECONDS + HEALTH_TIMEOUT ))
healthy=0
while [ $SECONDS -lt $deadline ]; do
  cid="$(docker compose ps -q app || true)"
  if [ -n "$cid" ]; then
    status="$(docker inspect --format='{{.State.Health.Status}}' "$cid" 2>/dev/null || echo starting)"
    if [ "$status" = "healthy" ]; then
      healthy=1
      break
    fi
    if [ "$status" = "unhealthy" ]; then
      echo "==> Container reported unhealthy"
      break
    fi
  fi
  sleep 3
done

if [ "$healthy" = "1" ]; then
  echo "==> Healthy."
  docker compose exec -T app wget -qO- http://127.0.0.1:5000/health || true
  echo
  # Only prune once the new image is known good — pruning earlier can delete
  # the very image the rollback below needs.
  docker image prune -f >/dev/null 2>&1 || true
  exit 0
fi

echo "==> DEPLOY FAILED — last 50 lines:" >&2
docker compose logs --tail 50 app >&2 || true

if [ -n "$PREVIOUS_IMAGE" ] && [ "$PREVIOUS_IMAGE" != "$APP_IMAGE" ]; then
  echo "==> Rolling back to $PREVIOUS_IMAGE" >&2
  APP_IMAGE="$PREVIOUS_IMAGE" docker compose up -d app caddy
  echo "==> Rolled back. The failed image was NOT promoted." >&2
else
  echo "==> No previous image to roll back to (first deploy)." >&2
fi

exit 1
