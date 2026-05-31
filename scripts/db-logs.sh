#!/usr/bin/env bash
set -euo pipefail

DB_SERVICE="${DB_SERVICE:-postgres_dev}"

docker compose logs -f "$DB_SERVICE"
