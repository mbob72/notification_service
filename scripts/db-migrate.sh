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

if [ ! -d "migrations" ]; then
  echo "Migrations directory not found: migrations"
  exit 1
fi

mapfile -t MIGRATION_FILES < <(find migrations -maxdepth 1 -type f -name '*.sql' | sort)

if [ "${#MIGRATION_FILES[@]}" -eq 0 ]; then
  echo "No SQL migration files found in migrations/"
  exit 1
fi

run_migration() {
  local migration_file="$1"
  echo "Running database migration: ${migration_file}"

  if command -v psql >/dev/null 2>&1; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration_file"
  else
    echo "Local psql is not available, using docker compose exec fallback"
    docker compose exec -T postgres psql \
      -U notification_config_user \
      -d notification_config_dev \
      -v ON_ERROR_STOP=1 < "$migration_file"
  fi
}

for migration_file in "${MIGRATION_FILES[@]}"; do
  run_migration "$migration_file"
done

echo "Database migrations completed."
