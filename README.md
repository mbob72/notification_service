# Notification Service Local Development

## Prerequisites

- Docker and Docker Compose
- Node.js + pnpm

Optional:

- PostgreSQL client tools (`psql`) in `PATH` (if missing, migration script falls back to `docker compose exec`)

## Setup

```bash
cp .env.example .env
pnpm install
pnpm db:up
pnpm db:migrate
pnpm dev
```

## One-command local start

```bash
pnpm dev:local
```

This command will:

1. Start PostgreSQL in Docker Compose
2. Wait until PostgreSQL is ready
3. Apply SQL migrations
4. Start the app in development mode (`pnpm dev`)

## Development commands

- `pnpm dev`: runs `tsx watch src/server.ts`
- `pnpm test`: runs unit tests via Vitest
- `pnpm typecheck`: runs strict TypeScript checks (`tsc --noEmit`)

## Reset local database

```bash
docker compose down -v
pnpm db:up
pnpm db:migrate
```

## Useful database commands

```bash
pnpm db:logs
pnpm db:down
```

## Notes

- Migrations are explicit commands and are not run automatically inside app runtime code.
- The notification schema migration is idempotent, so re-running `pnpm db:migrate` is safe.
- The SQL migration is the source of truth for DDL.
- Drizzle schema mirrors the existing database schema and is used as a typed query layer.
- Current MVP resolves active regional default versions at read time.
- In production, we could pin default version IDs on user creation if historical stability of defaults is required.
