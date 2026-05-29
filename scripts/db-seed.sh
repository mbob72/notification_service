#!/usr/bin/env bash
set -euo pipefail

if [ -f ".env" ]; then
  set -a
  source ".env"
  set +a
fi

SEED_FILE="seeds/dev.sql"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set"
  exit 1
fi

if [ ! -f "$SEED_FILE" ]; then
  echo "Seed file not found: $SEED_FILE"
  exit 1
fi

echo "Running database seed: $SEED_FILE"

if command -v psql >/dev/null 2>&1; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SEED_FILE"
else
  echo "Local psql is not available, using docker compose exec fallback"
  docker compose exec -T postgres psql \
    -U notification_config_user \
    -d notification_config_dev \
    -v ON_ERROR_STOP=1 < "$SEED_FILE"
fi

echo "Database seed completed."
