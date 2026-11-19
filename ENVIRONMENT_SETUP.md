# ENVIRONMENT SETUP GUIDE
## Zevkar.ai — Configuration Specification

---

## 1. Environment Variable Reference

| Variable | Requirement | Default | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Optional | `development` | Set to `production` for container deployments. |
| `PORT` | Optional | `3000` | HTTP port for web server. |
| `APP_URL` | Recommended | `http://localhost:3000` | Public URL for webhook callbacks and HMR proxying. |
| `DATABASE_URL` | **Required in Prod** | None | PostgreSQL connection string (`postgresql+asyncpg://...`). |
| `REDIS_URL` | **Required in Prod** | None | Redis connection string (`redis://redis:6379/0`). |
| `CELERY_BROKER_URL` | **Required in Prod** | None | Celery queue broker URL (`redis://redis:6379/1`). |
| `SECRET_KEY` | **Required in Prod** | None | 32+ character random secret for signing JWT access tokens. |
| `GEMINI_API_KEY` | Optional in Dev | None | Google Gemini API key for AI root-cause diagnosis. |
| `GEMINI_MODEL` | Optional | `gemini-3.8-flash` | Gemini model alias or full model name. |
| `DISABLE_HMR` | Optional | `false` | Set to `true` to cleanly disable HMR in reverse-proxied previews. |
| `ENABLE_PROMETHEUS` | Optional | `true` | Enables `/metrics` endpoint for Prometheus. |

---

## 2. Production vs. Development Modes

- **Development / Demo Mode (`NODE_ENV=development`)**:
  Allows ephemeral in-memory state so developers can preview the UI and test routes before configuring live PostgreSQL and Redis infrastructure.
- **Production Mode (`NODE_ENV=production`)**:
  Strict startup enforcement. Fails with exit code 1 if `DATABASE_URL`, `SECRET_KEY`, or `REDIS_URL` are missing or default.
