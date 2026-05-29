#!/usr/bin/env bash
set -euo pipefail

if [ -f ".env" ]; then
  set -a
  source ".env"
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set"
  exit 1
fi

MAX_RETRIES="${DB_WAIT_MAX_RETRIES:-30}"
SLEEP_SECONDS="${DB_WAIT_SLEEP_SECONDS:-2}"

check_with_local_pg_isready() {
  pg_isready -d "$DATABASE_URL" >/dev/null 2>&1
}

check_with_docker_pg_isready() {
  docker compose exec -T postgres pg_isready -U notification_config_user -d notification_config_dev >/dev/null 2>&1
}

echo "Waiting for PostgreSQL..."

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
