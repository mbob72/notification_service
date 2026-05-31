#!/usr/bin/env bash
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ] && [ -f ".env" ]; then
  set -a
  source ".env"
  set +a
fi

SEED_FILE="${SEED_FILE:-seeds/dev.sql}"
FIXTURES_FILE="${FIXTURES_FILE:-}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set"
  exit 1
fi

DB_SERVICE="${DB_SERVICE:-postgres_dev}"
DB_USER="${DB_USER:-notification_config_user}"
DB_NAME="${DB_NAME:-notification_config_dev}"

if [ ! -f "$SEED_FILE" ]; then
  echo "Seed file not found: $SEED_FILE"
  exit 1
fi

echo "Running database seed: $SEED_FILE"

PSQL_ARGS=(-v ON_ERROR_STOP=1)

if [ -n "$FIXTURES_FILE" ]; then
  if [ ! -f "$FIXTURES_FILE" ]; then
    echo "Fixtures file not found: $FIXTURES_FILE"
    exit 1
  fi

  mapfile -t FIXTURE_LINES < <(
    node -e "
      const fs = require('fs');
      const file = process.argv[1];
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const required = [
        ['fixture_user_id', data.userId],
        ['fixture_promo_type_code', data.promoTypeCode],
        ['fixture_transactional_type_code', data.transactionalTypeCode],
        ['fixture_email_channel_code', data.channelCodes?.email],
        ['fixture_push_channel_code', data.channelCodes?.push],
        ['fixture_sms_channel_code', data.channelCodes?.sms],
      ];
      for (const [key, value] of required) {
        if (!value) {
          throw new Error('Missing fixture value: ' + key);
        }
        console.log(key + '=' + value);
      }
    " "$FIXTURES_FILE"
  )

  for line in "${FIXTURE_LINES[@]}"; do
    key="${line%%=*}"
    value="${line#*=}"
    PSQL_ARGS+=(-v "${key}=${value}")
  done
fi

if command -v psql >/dev/null 2>&1; then
  psql "$DATABASE_URL" "${PSQL_ARGS[@]}" -f "$SEED_FILE"
else
  echo "Local psql is not available, using docker compose exec fallback"
  docker compose exec -T "$DB_SERVICE" psql \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    "${PSQL_ARGS[@]}" < "$SEED_FILE"
fi

echo "Database seed completed."
