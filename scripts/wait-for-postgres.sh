#!/usr/bin/env bash
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ] && [ -f ".env" ]; then
  set -a
  source ".env"
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set"
  exit 1
fi

DB_SERVICE="${DB_SERVICE:-postgres_dev}"
DB_USER="${DB_USER:-notification_config_user}"
DB_NAME="${DB_NAME:-notification_config_dev}"
MAX_RETRIES="${DB_WAIT_MAX_RETRIES:-30}"
SLEEP_SECONDS="${DB_WAIT_SLEEP_SECONDS:-2}"

check_with_local_pg_isready() {
  pg_isready -d "$DATABASE_URL" >/dev/null 2>&1
}

check_with_docker_pg_isready() {
  docker compose exec -T "$DB_SERVICE" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1
}

echo "Waiting for PostgreSQL ($DB_SERVICE)..."

for ((i=1; i<=MAX_RETRIES; i++)); do
  if command -v pg_isready >/dev/null 2>&1; then
    if check_with_local_pg_isready; then
      echo "PostgreSQL is ready."
      exit 0
    fi
  else
    if check_with_docker_pg_isready; then
      echo "PostgreSQL is ready."
      exit 0
    fi
  fi

  echo "PostgreSQL is not ready yet (attempt $i/$MAX_RETRIES)."
  sleep "$SLEEP_SECONDS"
done

echo "Timed out waiting for PostgreSQL after $((MAX_RETRIES * SLEEP_SECONDS)) seconds."
exit 1
