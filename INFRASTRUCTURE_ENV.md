# Docker Compose environment configuration

The Compose stack uses PostgreSQL 16, Redis 7, FastAPI, the root Vite/React frontend served by Nginx, Celery worker/Beat, Prometheus, and Grafana. The separate Next.js app under `frontend/` is retained as a backup and is not used by Compose. Copy `.env.example` to `.env`, replace every placeholder, and never commit `.env`.

## Required values

| Variable | Required | Purpose |
|---|---:|---|
| `ENVIRONMENT` | Yes | Runtime mode. Set `production` for a deployment; do not rely on development defaults. |
| `SECRET_KEY` | Yes | JWT signing secret; use a random value of at least 32 characters. Production rejects the development-only default. |
| `POSTGRES_PASSWORD` | Yes | PostgreSQL initial database password. Use URL-safe characters because Compose constructs the async PostgreSQL connection URL from it. |
| `REDIS_PASSWORD` | Yes | Redis authentication. Use URL-safe characters because the value is embedded in internal Redis URLs. |
| `GRAFANA_ADMIN_PASSWORD` | Yes | Grafana administrator password. |
| `POSTGRES_USER`, `POSTGRES_DB` | No | Database user and database name; defaults are development-oriented identifiers, not passwords. |
| `GEMINI_API_KEY` | No | Required only for live Gemini diagnosis; unset diagnosis behavior is not a successful live-model test. |
| `BACKEND_CORS_ORIGINS` | Yes | JSON array of allowed browser origins. Use only the exact deployed HTTPS origin(s) in production. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | Access-token lifetime; defaults to 15 minutes. |
| `AUTH_LOGIN_LIMIT_PER_MINUTE` | No | Per-source-IP and per-email login request limit. |
| `AUTH_REFRESH_LIMIT_PER_MINUTE` | No | Per-source-IP refresh request limit. |
| `WEBHOOK_LIMIT_PER_MINUTE` | No | Per-source-IP n8n webhook request limit. |
| `TRUSTED_PROXY_IPS` | Required in production | JSON list of trusted proxy IPs/CIDRs. Only these peers may supply `X-Forwarded-For` for rate-limit client identification; `[]` is local-development only. |
| `SENTRY_DSN` | No | Optional exception reporting DSN. |

`API_PORT`, `FRONTEND_PORT`, `POSTGRES_PORT`, `REDIS_PORT`, `PROMETHEUS_PORT`, and `GRAFANA_PORT` change host port bindings. All published ports bind to `127.0.0.1`; expose the frontend through a TLS reverse proxy for remote access. PostgreSQL, Redis, and Prometheus are not intended to be publicly exposed.

`DATABASE_URL`, `REDIS_URL`, `CELERY_BROKER_URL`, and `CELERY_RESULT_BACKEND` are constructed inside Compose; do not put host-side URLs into those settings for containers. The app uses `BACKEND_CORS_ORIGINS` as a JSON list. Set `ENVIRONMENT=production` only with unique secrets, production database host, and explicitly restricted CORS origins.

The retired shared-secret `/api/v1/webhooks/listener` endpoint is disabled. Configure n8n with the integration-scoped webhook URL returned when an integration is created. Production rejects a non-empty legacy `WEBHOOK_SECRET`. Redis-backed rate limits fail closed with HTTP 503 if Redis is unavailable. Behind a reverse proxy, set `TRUSTED_PROXY_IPS` only to the exact proxy addresses/CIDRs; otherwise forwarded client-address headers are ignored.

The Compose stack separates the browser-facing application network, the private database/Redis network, and the monitoring network. The API joins all three as required; Prometheus and Grafana do not join the database/Redis network.

## Safe local startup

1. Copy `.env.example` to `.env` and replace all `replace-with-*` placeholders with local-only values.
2. Confirm no valuable data already exists in the Compose `postgres_data` volume. The stack does not run `down -v`, delete volumes, or drop schemas.
3. Run `docker compose config --quiet`.
4. Run `docker compose up --build -d`.
5. Check `docker compose ps` and `docker compose logs --tail=100 migrate api celery_worker celery_beat frontend prometheus grafana`.
6. Confirm Alembic current revision and API readiness before using the dashboard.

The `migrate` service runs only `alembic upgrade head`, after PostgreSQL reports healthy and before API/worker startup. This applies forward migrations to the configured database. Existing named volumes are persistent and must be treated as user data. Never remove the volume to troubleshoot a migration.
