# Phase 5 Test and Runtime Report

## Summary

| Check | Result | Actual evidence |
|---|---|---|
| Backend test suite | **PASS** | `50 passed, 4 warnings` |
| Backend compile check | **PASS** | `python -m compileall -q app tests` exited 0 |
| Frontend TypeScript | **PASS** | `npx tsc --noEmit` exited 0 |
| Frontend production build | **PASS** | `npm run build` completed Next.js 15.5.28 compilation and static generation |
| Docker frontend production build | **PASS** | Compose build completed Next.js compilation, type validation, and static generation |
| Compose configuration | **PASS** | `docker compose config --quiet` exited 0 |
| Compose services | **PASS** | API, frontend, PostgreSQL, Redis, Celery worker, Beat, Prometheus, and Grafana reported `running healthy` |
| Backend readiness | **PASS** | Live `/health/ready` returned HTTP 200 with database and Redis connected |
| Migration head | **PASS** | `alembic current` reported `006_legacy_webhook_idempotency (head)` |
| ORM/schema drift | **PASS** | `alembic check` reported “No new upgrade operations detected” |
| Migration startup service | **PASS** | Compose migration service exited successfully; the existing revision remained 006 |
| Backup/restore drill | **PASS** | Restore to a new temporary PostgreSQL database matched Alembic revision and key-table row counts; no temporary database or dump remained |
| Celery retry execution | **PASS** | Live task through Redis/Celery result backend returned `SUCCESS` with `retries=2` |
| Prometheus scrape | **PASS** | One active target, `ai-automation-doctor-api:up` |
| Grafana health | **PASS** | `/api/health` returned database `ok`, version `10.3.3` |
| Login rate-limit endpoint | **PASS** | Live request sequence: `401,401,401,401,401,429` |
| Legacy webhook | **PASS** | Live request returned HTTP 410 |
| CORS | **PASS** | Allowed local origin returned 200 with matching allow-origin; an untrusted origin returned 400 with no allow-origin |
| Metrics access boundary | **FAIL** | `/metrics` returned HTTP 200 without application authentication; external ingress isolation was not verified |
| Browser rendering | **PASS / NOT VERIFIED** | Login page rendered with styling in the browser. The browser already had a valid local session; no test credentials were used for login/logout/expiry/org-switch journeys. |
| Real n8n integration | **BLOCKED** | No approved n8n URL/API key was configured; integration key ring is absent in this environment. |
| Real Gemini request | **BLOCKED** | No Gemini API key was configured. |
| Production HTTPS and proxy behavior | **NOT VERIFIED** | No production TLS proxy or deployment was available. |
| Repository secret-history scan | **NOT VERIFIED** | The workspace is not a Git repository; secret values were not inspected. |

## Commands executed

### Backend tests and source validation

```powershell
Set-Location 'C:\Users\vinod\Downloads\ai-automation-doctor-platform\backend'
python -m pytest -q tests/test_backend.py tests/test_rate_limit.py tests/test_infrastructure.py tests/test_api_complete.py
python -m pytest -q
python -m compileall -q app tests
python -m alembic heads
```

Final full-suite result: **50 passed, 4 warnings**. Warnings were existing pytest-asyncio fixture-loop, Pydantic class-config, and passlib/argon2 deprecation notices.

### Frontend

```powershell
Set-Location 'C:\Users\vinod\Downloads\ai-automation-doctor-platform\frontend'
npx tsc --noEmit
npm run build
```

Both completed successfully.

### Compose and migration checks

```powershell
Set-Location 'C:\Users\vinod\Downloads\ai-automation-doctor-platform'
docker compose config --quiet
docker compose run --rm --no-deps --build api alembic check
docker compose up -d --build api celery_worker celery_beat frontend
docker compose build api celery_worker celery_beat
docker compose up -d api celery_worker celery_beat
docker compose ps --format '{{.Service}} {{.State}} {{.Health}}'
docker compose exec -T api alembic current
docker compose exec -T api alembic check
```

The first Alembic check and the final post-restart check both found no new upgrade operations. The database revision did not change.

### Runtime probes

The following checks were run against the local Compose stack:

- `/health/ready` from the API container and host API port.
- A Redis-backed `runtime_probe_task` with `failures_before_success=2`; result was `SUCCESS`, `retries=2`.
- Prometheus `/api/v1/targets`, Grafana `/api/health`, and backend `/metrics`.
- Six login requests using a newly generated, non-existent email and a dummy password; results were five `401` responses then `429`. No account was created.
- Legacy `/api/v1/webhooks/listener` returned 410.
- CORS preflight from the configured local origin and an untrusted origin.
- Browser rendering of the login page; screenshot showed styled layout. The existing browser profile had a valid session, so no logout or session clearing was performed.

### Backup and restore

```powershell
Set-Location 'C:\Users\vinod\Downloads\ai-automation-doctor-platform'
.\scripts\test-postgres-backup-restore.ps1
```

The corrected run passed, restoring to a uniquely generated database and matching its Alembic revision and counts for agencies, users, integrations, workflows, executions, and incidents. Cleanup verification found zero remaining `phase5_restore_*` databases and no matching temporary dump files.

An initial run of the script emitted `psql` argument-splitting warnings. The script was corrected to pass SQL via standard input, then rerun; **only the corrected run is counted as the successful backup/restore result**.

## Detailed limitations

- The tests validate DNS pinning and rejection of mixed public/private records without making a real customer n8n request. DNS/TLS behavior against a real provider remains **BLOCKED**.
- Gemini retry and schema validation were exercised with a mocked provider boundary. Real provider status codes, quota behavior, and model output remain **BLOCKED**.
- Existing backend tenancy tests passed as part of the full suite, but no new live cross-tenant browser journey was run.
- No production HTTPS proxy was available. The app’s `TRUSTED_PROXY_IPS` must match the deployed ingress, and forwarding behavior must be verified before enabling rate limits externally.
- `/metrics` is unauthenticated at the FastAPI layer. It is reachable on the loopback-published local API port and Prometheus scrape is healthy; production ingress must explicitly deny public `/metrics` access.
- The scheduled stuck-execution task remains a placeholder. Automatic recovery dispatch was not implemented, as required.
