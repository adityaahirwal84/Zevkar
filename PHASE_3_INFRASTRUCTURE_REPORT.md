# Phase 3 Infrastructure Report

## Scope and evidence standard

This report covers the Phase 3 infrastructure changes and source/configuration review. Static checks and unit tests are distinguished from live runtime checks. Docker Desktop's Linux engine was unavailable, so no container, PostgreSQL, Redis, Celery, Prometheus, or Grafana runtime success is claimed.

## Architecture overview

The Compose stack defines PostgreSQL 16, password-protected Redis 7, a one-shot Alembic migration service, FastAPI, Next.js, a Celery worker, Celery Beat, Prometheus, and Grafana. PostgreSQL, Redis, Prometheus, and Grafana use named persistent volumes. Published ports bind to loopback by default.

Three private Compose networks separate browser-facing application traffic, PostgreSQL/Redis traffic, and monitoring traffic. The API joins all three; Prometheus and Grafana are not attached to the database/Redis network. API, frontend, PostgreSQL, Redis, worker, Beat, Prometheus, and Grafana have configured health checks. The API and workers wait for the migration job and/or healthy Redis as appropriate.

## Correctly configured or improved (source/configuration verified)

- The Python 3.12 backend image installs runtime dependencies and runs as a non-root user.
- The frontend image uses the lockfile with `npm ci`; production image execution remains non-root.
- Compose requires explicit environment mode, signing secret, database password, Redis password, Grafana password, and browser CORS origins instead of silently constructing a stack from default secrets.
- Production settings reject the development signing key, short signing keys, wildcard/empty CORS, and localhost database URLs.
- Readiness (`/health/ready`) checks PostgreSQL and Redis and returns HTTP 503 when either check fails. `/healthz` is a liveness endpoint and does not establish dependency health.
- Redis and PostgreSQL have health checks. The Redis health check uses `REDISCLI_AUTH`, avoiding a password command-line argument.
- Compose startup applies Alembic `upgrade head` before API and worker startup; migrations are additive and no existing migration history was removed.
- Migration `004_align_orm_schema` adds the ORM fields and indexes missing from revisions 001-003. The ORM's execution index name and incident output nullability were aligned with the historical schema contract.
- Prometheus is configured to scrape the API `/metrics` endpoint; Grafana's provisioned datasource points to Prometheus.
- The Celery probe task and `python -m app.workers.verify_runtime` exercise an actual broker/worker retry when a configured Redis/Celery runtime is available.
- Webhook ingestion now rejects an unconfigured signing secret, rejects missing/invalid HMAC signatures, and returns 404 for an unknown workflow rather than manufacturing fallback tenant/workflow identifiers. Unit tests cover these cases.
- Production runtime dependencies are separated from pytest dependencies; CI installs `backend/requirements-dev.txt`.

## Classification of findings

| Class | Finding | Evidence/status |
|---|---|---|
| A. Verified from source | Compose service definitions, private networks, named volumes, secret-required environment substitutions, health checks, and startup dependencies are present. | Compose config parses; no service startup verified. |
| A. Verified from source | Revision 004 is additive and follows revision 003; migration history is retained. | Alembic history and offline SQL generation passed. |
| A. Verified from source | API readiness checks PostgreSQL and Redis; liveness is separate. | Source inspected; only liveness was exercised without services. |
| B. Not implemented | Scheduled integration synchronization and stuck-execution detection return `NOT_IMPLEMENTED`; background recovery dispatch is also explicitly unimplemented. | Celery tasks are registered but do not perform provider operations. Provider recovery dispatch remains out of scope. |
| C. Implemented but not runtime verified | Docker images, Compose startup ordering, health checks, migrations, database schema, Redis authentication/persistence, Celery worker/Beat, Prometheus scraping, and Grafana provisioning. | Docker engine unavailable; no containers were started. |
| D. Mock/demo only | No fake successful provider execution was introduced. The Celery runtime probe is a diagnostic task only; it is not application recovery functionality. | Static source review. |
| E. Critical bug | No remaining critical startup bug was demonstrated by the source checks or unit tests. | Live startup remains unverified, so this is not a runtime guarantee. |
| F. Blocked by missing credentials or infrastructure | Live database, Redis/Celery, Gemini diagnosis, signed webhook integration, and observability validation need running services and/or credentials. | Docker Desktop daemon unavailable; optional Gemini/webhook credentials were not supplied. |

## Security and deployment findings

1. **Production frontend dependency audit has outstanding advisories.** `npm audit --omit=dev` exited nonzero with three findings (one moderate, two high), including a PostCSS advisory through Next.js and a Zod advisory. The suggested forced remediation would make major dependency changes; those were not applied during this infrastructure phase. Reassess and upgrade compatible patched versions before production deployment.
2. **Secret exposure history was not audited.** The workspace is not a Git repository, and the populated `.env` was deliberately not read. `.env.example` contains placeholders only; this does not establish that no secrets exist elsewhere or in repository history.
3. **Webhook configuration uses a shared global signing secret.** The route now fails closed when absent and verifies the HMAC, but credential provisioning and a real provider callback were not tested. Configure a strong secret before enabling webhook delivery.
4. **Production configuration remains operator-dependent.** Set `ENVIRONMENT=production`, unique secrets, a non-local database host, and exact deployed HTTPS CORS origins. The example file is development-only.
5. **Application runtime warnings remain.** Pytest reports Pydantic v2 deprecations in workflow, notification, and audit response models, plus dependency deprecation warnings. They did not fail tests but should be cleaned up before a future major dependency upgrade.

## Database and tenancy

The migration chain ends at `004_align_orm_schema`. Offline SQL generation covers revisions 001-004, but it does not prove that the migration runs against PostgreSQL or that an existing database is at the expected predecessor schema. No database was dropped, reset, or modified. Tenant authorization and database query behavior were not exercised against a live database in this phase.

The migration must first be tested against a newly provisioned, isolated development database. Before applying it to any existing database, inspect that database's current Alembic revision and schema; do not remove or recreate its persistent volume.

## Deployment readiness

The stack is **not certified for production deployment**. It is statically configured and unit-tested, but Docker runtime, migrations against PostgreSQL, service health, Celery execution, application integration paths, and observability remain unverified. Resolve the dependency audit and complete the runtime test report's blocked checks before production use.
