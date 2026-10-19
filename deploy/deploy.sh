#!/usr/bin/env bash
# Runs on the instance over SSH. Pulls the given images, starts the stack,
# waits for health checks and rolls both services back if either fails.

set -euo pipefail

APP_DIR="/opt/wagerwolf"
HEALTH_TIMEOUT=120   # seconds; a cold boot also runs runStartupSeed()

cd "$APP_DIR"

: "${APP_IMAGE:?APP_IMAGE must be set (pinned, e.g. ghcr.io/…:sha-abc1234)}"
: "${WEB_IMAGE:?WEB_IMAGE must be set (pinned, e.g. ghcr.io/…:sha-abc1234)}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-0}"

if [ ! -f .env ]; then
  echo "ERROR: $APP_DIR/.env is missing — the workflow should have copied it." >&2
  exit 1
fi

# Remember what's running so a failed deploy can roll back.
running_image() {
  docker compose ps -q "$1" 2>/dev/null \
    | xargs -r docker inspect --format='{{.Config.Image}}' 2>/dev/null || true
}

PREVIOUS_IMAGE="$(running_image app)"
PREVIOUS_WEB="$(running_image web)"
echo "==> Currently serving: api=${PREVIOUS_IMAGE:-<nothing>} web=${PREVIOUS_WEB:-<nothing>}"
echo "==> Deploying:         api=$APP_IMAGE"
echo "                       web=$WEB_IMAGE"

# Pull both before starting either.
echo "==> Pulling images"
docker pull "$APP_IMAGE"
docker pull "$WEB_IMAGE"

export APP_IMAGE WEB_IMAGE

echo "==> Starting Redis"
docker compose up -d redis

if [ "$RUN_MIGRATIONS" = "1" ]; then
  echo "==> Applying schema (drizzle-kit push)"
  # Staging only; production pushes schema via db-push.yml.
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
  web_cid="$(docker compose ps -q web || true)"
  web_status="$(docker inspect --format='{{.State.Health.Status}}' "$web_cid" 2>/dev/null || echo unknown)"
  if [ "$web_status" != "healthy" ]; then
    echo "==> API healthy but web is '$web_status'" >&2
    healthy=0
  fi
fi

if [ "$healthy" = "1" ]; then
  echo "==> Healthy."
  docker compose exec -T app wget -qO- http://127.0.0.1:5000/health || true
  echo
  # Prune only after the new image is healthy; rollback may need the old one.
  docker image prune -f >/dev/null 2>&1 || true
  exit 0
fi

echo "==> DEPLOY FAILED — last 50 lines:" >&2
docker compose logs --tail 50 app >&2 || true
docker compose logs --tail 50 web >&2 || true

# Roll both back together; they're built from the same commit.
if [ -n "$PREVIOUS_IMAGE" ] && [ -n "$PREVIOUS_WEB" ]; then
  echo "==> Rolling back to api=$PREVIOUS_IMAGE web=$PREVIOUS_WEB" >&2
  APP_IMAGE="$PREVIOUS_IMAGE" WEB_IMAGE="$PREVIOUS_WEB" \
    docker compose up -d app web caddy
  echo "==> Rolled back. The failed images were NOT promoted." >&2
else
  echo "==> No previous images to roll back to (first deploy)." >&2
fi

exit 1
