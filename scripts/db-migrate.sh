#!/usr/bin/env bash
set -euo pipefail

MIGRATION_FILE="migrations/20260529_001_notification_config_schema.sql"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set"
  exit 1
fi

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "Migration file not found: $MIGRATION_FILE"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is not installed or not in PATH"
  echo "Install PostgreSQL client tools to run migrations."
  exit 1
fi

echo "Running database migration: $MIGRATION_FILE"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$MIGRATION_FILE"
echo "Database migrations completed."
