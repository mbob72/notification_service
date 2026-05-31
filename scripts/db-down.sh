#!/usr/bin/env bash
set -euo pipefail

DB_SERVICE="${DB_SERVICE:-postgres_dev}"
DB_VOLUME_RESET="${DB_VOLUME_RESET:-0}"

if [ "$DB_VOLUME_RESET" = "1" ]; then
  docker compose rm -sfv "$DB_SERVICE"
else
  docker compose stop "$DB_SERVICE"
  docker compose rm -sf "$DB_SERVICE"
fi
