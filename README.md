# Notification Preferences Service

A small Node.js + TypeScript service that resolves and updates notification preferences with regional defaults, user overrides, quiet hours, and global delivery policies.

## Prerequisites

- Docker + Docker Compose
- Node.js 22+
- pnpm 10+

## Run Locally (PostgreSQL)

```bash
cp .env.example .env
pnpm install
pnpm db:prepare
pnpm dev
```

One-command local startup:

```bash
pnpm dev:local
```

Useful DB commands:

```bash
pnpm db:prepare
pnpm db:reset
pnpm db:migrate:test
pnpm db:prepare:test
pnpm db:reset:test
pnpm db:logs
pnpm db:down
```

Database containers are isolated by purpose:

- `postgres_dev` on `localhost:55432` for local development.
- `postgres_test` on `localhost:55433` for integration tests.

## Architecture

- Express handles HTTP transport and routing.
- Zod validates request payloads and query params.
- Services orchestrate business rules (`PreferencesService`, `EvaluationService`).
- Repositories isolate DB access concerns.
- Drizzle is the typed SQL query layer.
- SQL migrations remain the source of truth for DDL.
- PostgreSQL stores users, metadata, defaults, user overrides, quiet hours, and global policies.

## Domain Model

Core entities:

- `users`, `regions`
- `notification_categories`, `notification_types`, `notification_channels`
- default versions and rows for preference + quiet hours
- `user_notification_preferences`, `user_quiet_hours`
- global policy versions and policy rows

Preference resolution combines user-level overrides with active regional defaults.

## Business Rules

Evaluation priority:

1. Global policies
2. User/default enabled preference
3. Quiet hours
4. Allow

Additional rules in this MVP:

- User overrides take precedence over defaults.
- Active regional default versions are resolved at read time.
- Marketing notifications respect quiet hours.
- Transactional notifications are not blocked by quiet hours.
- Update operations are strictly idempotent and return mutation metadata (`created` / `updated` / `noop`).

## API

Routes:

- `GET /health`
- `GET /users/:userId/preferences`
- `GET /users/:userId/preferences?notificationTypeCode=...&channelCode=...`
- `POST /users/:userId/preferences`
- `POST /evaluate`

`GET /users/:userId/preferences` supports two modes:

- without query params: returns effective preferences for all known notification type/channel pairs;
- with `notificationTypeCode` + `channelCode`: returns one effective preference.

Example: set preference state

```bash
curl -X POST http://localhost:3000/users/00000000-0000-0000-0000-000000000001/preferences \
  -H "Content-Type: application/json" \
  -d '{
    "notificationTypeCode": "promo_campaign",
    "channelCode": "email",
    "enabled": true
  }'
```

Response includes effective state plus idempotency metadata:

```json
{
  "data": {
    "userId": "00000000-0000-0000-0000-000000000001",
    "notificationTypeCode": "promo_campaign",
    "channelCode": "email",
    "enabled": true
  },
  "meta": {
    "operation": "updated",
    "changed": true,
    "parts": {
      "enabled": {
        "operation": "updated",
        "changed": true
      }
    }
  }
}
```

## Testing

Fast tests:

```bash
pnpm test
```

Service integration tests (uses PostgreSQL + seed data):

```bash
pnpm test:integration
```

`test:integration` prepares and uses the dedicated test database container (`postgres_test`), so it does not reset or reuse the dev database.
It uses `seeds/test.sql` plus `fixtures/test-fixtures.json` as the explicit fixture contract for integration scenarios.

Type checks:

```bash
pnpm typecheck
```

## Observability

Structured logging via `pino`:

- preference update events (`operation`, `changed`, and mutation parts);
- evaluation decisions (`decision`, `reason`, user/type/channel/region context).

Production metrics to add next:

- counters by `decision`/`reason`/`channel`/`notificationType`;
- latency histograms for preference and evaluation endpoints.

## Trade-offs

- This MVP favors readability and deterministic behavior over aggressive query-level optimization.
- Default version resolution happens at read time, which is flexible but can change behavior as defaults evolve.
- Integration tests rely on a prepared local PostgreSQL instance for realistic coverage.

## Production Improvements

- Authentication and authorization.
- Immutable audit log for preference changes.
- Outbox/event publishing on preference mutations.
- Stronger idempotency keys for externally-issued commands.
- OpenAPI spec and generated client.
- Metrics endpoint and dashboarding.
- Distributed tracing.
- Rate limiting and abuse protection.
- Transaction-safe migration rollout strategy.
- Option to pin default version IDs at user creation for historical stability.
- Admin API/UI for global policies and defaults.
