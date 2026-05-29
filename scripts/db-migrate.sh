#!/usr/bin/env bash
set -euo pipefail

if [ -f ".env" ]; then
  set -a
  source ".env"
  set +a
fi

MIGRATION_FILE="migrations/20260529_001_notification_config_schema.sql"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set"
  exit 1
fi

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "Migration file not found: $MIGRATION_FILE"
  exit 1
fi

echo "Running database migration: $MIGRATION_FILE"

if command -v psql >/dev/null 2>&1; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$MIGRATION_FILE"
else
  echo "Local psql is not available, using docker compose exec fallback"
  docker compose exec -T postgres psql \
    -U notification_config_user \
    -d notification_config_dev \
    -v ON_ERROR_STOP=1 < "$MIGRATION_FILE"
fi

echo "Database migrations completed."
