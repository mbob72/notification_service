#!/usr/bin/env bash
set -euo pipefail

DB_SERVICE="${DB_SERVICE:-postgres_dev}"

docker compose up -d --remove-orphans "$DB_SERVICE"
