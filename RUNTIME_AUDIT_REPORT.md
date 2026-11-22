# Runtime Readiness Audit

**Audit date:** 2026-11-03  
**Scope:** Repository source/configuration review plus limited local environment checks.  
**Change boundary:** This audit added only this report. Application source, configuration, and dependencies were not modified. The existing `.env` file was not opened and no secret values are included here.

## Classification key

- **A — VERIFIED FROM SOURCE:** directly evidenced by repository contents.
- **B — NOT IMPLEMENTED:** required behavior/module is absent or only a placeholder.
- **C — IMPLEMENTED BUT NOT RUNTIME VERIFIED:** implementation is present, but this audit could not successfully execute it.
- **D — MOCK / DEMO ONLY:** hard-coded, simulated, or in-memory behavior presented as product functionality.
- **E — CRITICAL BUG:** source defect that blocks startup, breaks core behavior, or creates a serious security/data-integrity risk.
- **F — BLOCKED BY MISSING CREDENTIALS OR INFRASTRUCTURE:** could not verify because the required local service or credential was unavailable.

Findings can carry more than one classification. “Verified from source” does not mean “runtime verified.”

## Executive summary

The repository contains three overlapping application surfaces: a Next.js 15/React 19 frontend under `frontend/`, a FastAPI backend under `backend/`, and an older Vite/Express React preview at the repository root (`src/`, `server.ts`, root `package.json`). Docker Compose is intended to run Next.js with FastAPI, PostgreSQL, Redis, Celery, Prometheus, and Grafana.

**The configured Compose stack is not ready to build or start as written.** The API and Celery services refer to `backend/Dockerfile`, which is absent. Independently, FastAPI imports routers that reference SQLAlchemy models that do not exist. Several test imports and API contracts also do not match the implementation. Local runtime verification was blocked by the stopped Docker Desktop engine and missing Python/frontend dependencies.

**No runtime success is claimed.** Compose configuration parsing succeeded; API startup, frontend build, migrations, tests, and service health were not verified.

## Repository architecture overview

- **Next.js frontend:** `frontend/app/` contains the root landing page, dashboard page, root layout, and CSS. `frontend/lib/api-client.ts` is the API wrapper; `frontend/next.config.ts` defines API rewrites.
- **FastAPI backend:** `backend/app/main.py` configures the app, CORS, Prometheus, health endpoints, and 13 router inclusions. `backend/app/api/v1/` contains auth, organization, workflow, integration, webhook, incident, diagnosis, recovery, approval, notification, audit, billing, and admin routers.
- **Persistence:** SQLAlchemy models are in `backend/app/models/entities.py`; Alembic is configured in `backend/alembic.ini` and `backend/migrations/`.
- **Integrations/background work:** n8n, Make, and Zapier adapter modules are present. Celery worker/Beat configuration is in `backend/app/workers/celery_app.py`.
- **Infrastructure:** `docker-compose.yml`, `Dockerfile.frontend`, Prometheus configuration, and Grafana provisioning YAML exist. No backend Dockerfile or Grafana dashboard definition was found.
- **Separate demo application:** root `package.json`, `vite.config.ts`, `server.ts`, and `src/` form a distinct Vite/Express React experience with seeded in-memory data. The root app is not the Next.js app used by the Compose frontend.
- **Repository metadata:** the directory has no `.git` repository, so tracked/untracked status and change history could not be established.

## Runtime checks performed

| Check | Result | What it establishes |
|---|---|---|
| Local tool versions | Python 3.12.7, Node 24.18.0, npm 11.16.0, Docker CLI 29.5.3, Compose 5.1.4 | These command-line runtimes are installed; this does not establish application compatibility or service health. |
| `docker compose config --quiet` | Exit code 0; warning that `GEMINI_API_KEY` is unset in this environment and the Compose `version` key is obsolete | Compose YAML/config can be parsed. No images were built and no containers were started. |
| Docker daemon check | Failed to connect to the Docker Desktop Linux engine named pipe | Docker services, image builds, and Windows Docker Desktop startup are unverified and currently blocked. |
| `python -c "import app.main"` from `backend/` | Failed immediately with `ModuleNotFoundError: prometheus_client` | Backend did not start. This is an environment dependency failure before deeper application imports can be exercised. |
| `python -m pytest tests/ -q` | Could not run: current Python environment has no `pytest` module | No backend test result is available. |
| Dependency availability probe | Current environment lacks `asyncpg`, Alembic, Redis client, Celery, `python-jose`, Passlib, Argon2, Prometheus client, `email-validator`, pytest/pytest-asyncio, and Sentry SDK | The current environment cannot execute the declared backend runtime/test stack without installing requirements. |
| Frontend dependency state | No root or `frontend/node_modules` directory found | Frontend build/lint was not run. |
| Database/migration/API/integration tests | Not run | Docker engine and local database/Redis are unavailable; Alembic is also absent. No migration or endpoint success is claimed. |

## Correctly implemented modules (source review only)

- **A, C — Frontend framework dependencies:** `frontend/package.json` declares Next.js `^15.2.0`, React/React DOM `^19.0.0`, TypeScript, and supporting UI libraries. The Next.js app has a root layout, landing page, dashboard page, and standalone output configuration.
- **A, C — Async database foundation:** `backend/app/core/database.py` creates an SQLAlchemy async engine/session factory, and `backend/migrations/env.py` configures async Alembic migration execution. Neither was run against PostgreSQL.
- **A, C — Password hashing/JWT primitives:** `backend/app/core/security.py` uses Argon2 and JWT helpers. This is only a partial auth implementation; token lifecycle and secret configuration findings appear below.
- **A, C — Tenant scoping pattern:** Several workflow, incident, integration, approval, audit, and notification queries scope records through the active membership’s `agency_id`. This is not consistently enforced across all handlers and the app’s membership selection is ambiguous for users in multiple organizations.
- **A, C — Gemini and adapter code exists:** the diagnosis module uses the Google GenAI SDK with Pydantic response validation and deterministic fallback; n8n and Make include HTTP client code, and Zapier explicitly documents its manual-intervention limitations. Provider behavior and API correctness were not tested.
- **A, C — Observability hooks exist:** FastAPI can mount `/metrics` when enabled, and Compose includes Prometheus/Grafana services. The target metrics/rules/provisioning are incomplete (see below).

## Findings

### Critical bugs and exact runtime blockers

1. **A, E — FastAPI router imports reference absent ORM classes.** `backend/app/api/v1/recovery.py` and `approvals.py` import `RecoveryApproval`, but `backend/app/models/entities.py` defines `ApprovalRequest`, not `RecoveryApproval`. `backend/app/api/v1/webhooks.py` imports `WebhookEvent`, which is absent from the model module. Because `backend/app/main.py` imports these routers during application import, the source has deterministic import-time blockers after missing environment packages are supplied. The attempted import stopped earlier at missing `prometheus_client`, so this deeper import failure was not experimentally reached.
2. **A, E — Compose cannot build API or Celery images from the checked-in tree.** Both services specify `build.context: ./backend` and `dockerfile: Dockerfile`; no `backend/Dockerfile` exists. Compose config parsing does not validate that referenced build file. This blocks `docker compose up --build` before API/worker startup.
3. **A, E — Recovery endpoint/model contract is incompatible and does not execute recovery.** `RecoveryAttempt` requires `workflow_id` and `initiated_by`, but `/recovery/execute` constructs it without those fields and passes `idempotency_key`/`execution_response`, which the model does not define. Even if those model issues were corrected, the handler sets the attempt to `SUCCESS`, marks the incident `RESOLVED`, and resets workflow health without calling n8n/Make/Zapier or dispatching a task. `bypass_approval` explicitly skips the approval check for callers allowed by the endpoint’s role gate.
4. **A, E — Webhook path is not a functioning persisted incident pipeline.** The handler references the missing `WebhookEvent` model. It does not validate an HMAC signature: it only records whether any signature header was supplied. It also creates incidents with fallback agency/workflow identifiers and a nullable client even though the ORM model requires valid agency, client, and workflow foreign keys. A new arbitrary unauthenticated webhook may therefore fail on persistence or attach to a guessed tenant; the endpoint is unauthenticated and accepts arbitrary submissions.
5. **A, E — Model/migration/API approval entities disagree.** Migration `001_initial_schema.py` creates `recovery_approvals`; the ORM defines `ApprovalRequest` with table name `approval_requests`; the API imports a nonexistent `RecoveryApproval`. The current approval list/respond endpoints therefore cannot import/run and do not match the migrated schema.
6. **A, E — Existing diagnosis is not safely repeatable.** `AIDiagnosis.incident_id` is unique, but `/diagnosis/analyze` always adds a new diagnosis instead of updating an existing one. Re-analyzing an incident with a diagnosis can violate the uniqueness constraint.
7. **A, E — Backend defaults permit predictable production JWT signing.** `Settings.SECRET_KEY` has a hard-coded development value and there is no startup validation that production uses a supplied secret. Compose does not supply `SECRET_KEY`. If deployed with defaults, tokens are signed using a publicly readable predictable value.
8. **A, E — Credential handling contradicts the “encrypted” contract.** `/integrations` stores the supplied API key directly in `Integration.encrypted_credentials`; the source comment itself says encryption is future work. `IntegrationOut` omits this field, but database-at-rest protection is not implemented. The n8n test also accepts a user-supplied `instance_url` and sends the supplied API key to it without URL/network destination restrictions, creating an SSRF/credential-disclosure risk for authorized callers.
9. **A, E — Authentication refresh/logout semantics are not implemented.** The refresh endpoint decodes the same JWT format as access tokens, issues another access token, and does not use the `RefreshToken` table, token-type claims, rotation, or revocation. Logout only returns success and does not revoke a token/session. The API/client contract advertises `refresh_token`, but backend signup/login return only `access_token`, `token_type`, and user. This is not a functioning refresh-token system.
10. **A, E — Onboarding/tenant authorization has incomplete safeguards.** Invitations create an active user with a fixed placeholder password string, mark membership `INVITED`, and do not create or deliver an invitation token or password setup flow. `MemberInvite.role` is an unrestricted string. `get_current_tenant_member()` uses `scalar_one_or_none()` for all active memberships without selecting an organization; users with multiple memberships can trigger a multiple-row exception rather than selecting a tenant.
11. **A, E — Unauthenticated analytics leaks fabricated platform-wide data.** `/api/v1/analytics/overview` in `backend/app/main.py` has no authentication dependency and returns fixed tenant-wide KPI values. This both presents false data and exposes an endpoint without tenant authorization.
12. **A, E — Root Vite preview performs unsafe recovery calls without user authentication.** `src/App.tsx` posts diagnosis/recovery/approval/webhook requests without attaching credentials. It also uses camelCase request properties that do not match the FastAPI snake_case schemas. This is a separate, inconsistent client from the Next app.

### Database migration/model parity

13. **A, E — Tables/entities are not in parity.** The migration creates `recovery_approvals`; the model defines `approval_requests`. A `WebhookEvent` table/model is referenced by the webhook handler but neither model nor migration exists. Recovery approval routes cannot map to the declared migration/model pair.
14. **A, E — Column nullability and fields disagree.** Examples: `workflows.client_id` is nullable in migration 001 but non-null in the ORM; `incidents.client_id` and `execution_id` are nullable in migration 001 but non-null in the ORM. `ai_diagnoses` migration has `created_at`, while the model has `diagnosed_at` and additional `is_ai_generated`/`token_count` columns. Migration recovery attempts do not have the model’s required `workflow_id`/`initiated_by` fields, and instead define `idempotency_key`/`execution_response` absent from the model. The approval model and migration field names also differ.
15. **A, E — Index coverage differs.** ORM `index=True` declarations create indexes on multiple workflow/client/incident and relationship columns that the migrations do not consistently create. For `workflows`, migration 001 creates only `ix_workflows_agency_id`, while ORM also indexes `client_id` and `external_workflow_id`. Migration 001 also omits ORM indexes on agency-member `agency_id`/`user_id`, integration `client_id`, and incident `client_id`/`workflow_id`/`error_category`/`severity`/`status`. Recovery-attempt `incident_id` is indexed in the ORM but not in migration 001. Production query plans and upgrade schema cannot be assumed to match ORM metadata.
16. **A, C — Migration execution/parity has not been validated.** No PostgreSQL service was available and Alembic is absent locally; no migration was applied and no live schema comparison or downgrade test was executed. There is no claim that either migration runs successfully.

### Frontend architecture and API contracts

17. **A, E — Next.js client URLs and backend routes do not match.** Representative mismatches in `frontend/lib/api-client.ts` include `/health` vs backend `/healthz`; `/orgs/*` vs `/organizations/*`; `/auth/password` vs `/auth/change-password`; `/integrations/{id}/test` vs `/integrations/test`; `/incidents/{id}/diagnose` vs `/diagnosis/analyze`; `/recovery/trigger` vs `/recovery/execute`; `/audit` vs `/audit-logs`; and `/billing/subscription` vs backend `/billing/usage`. Payload names/status values also differ (e.g. diagnosis `incidentId` vs `incident_id`; billing `tier` vs `target_tier`; approval `APPROVED`/`REJECTED` vs backend `APPROVE`/`REJECT`). Many frontend operations have no backend route at all.
18. **A, E — Container frontend points at itself for backend rewrites.** Compose sets `BACKEND_URL=http://api:8000`, but `next.config.ts` reads `NEXT_PUBLIC_API_URL`. With no `NEXT_PUBLIC_API_URL`, its rewrite fallback is `http://localhost:8000`; in the frontend container that means the frontend container itself, not the API service. Containerized browser/API calls will not reach FastAPI as configured.
19. **A, B — Next dashboard has no login route or access-token flow.** The landing page links to `/login`, but there is no `frontend/app/login` route. The dashboard fetches protected API endpoints without storing/sending a token or redirecting to authentication. The page can render but cannot provide authenticated dashboard data.
20. **A, D — Dashboard uses fabricated fallback metrics.** When no workflows exist it displays `18`; the recovery rate and MTTR are fixed literals. This can make empty/offline state look like production telemetry.
21. **A, B/C — Tailwind 4 processing is not configured in the Next app.** `frontend/app/globals.css` imports `tailwindcss` and the package includes `@tailwindcss/postcss`, but no `frontend/postcss.config.*` was found. Tailwind’s PostCSS plugin is not wired in this app; utility styling/build behavior is unverified and likely incomplete.
22. **A, C — No frontend lockfile/build verification.** The root has `bun.lock`, but neither root `package-lock.json` nor `frontend/package-lock.json` is present. `frontend/Dockerfile.frontend` runs `npm install` rather than a lockfile-enforced install. There are no installed node modules, so Next build/lint/type checks were not run.
23. **A, E — The root package/CI targets a different app and CI install is inconsistent.** Root `package.json` scripts target Vite/Express and its `src/`, while Docker builds `frontend/` (Next.js). The CI workflow runs `npm ci` at repository root but no `package-lock.json` exists; it cannot use the checked-in `bun.lock` as an npm lockfile. The root `lint` is TypeScript compilation, not a Next lint check.
24. **A, B — The separate root client has an inconsistent, partly nonexistent API contract.** `src/App.tsx` requests `/api/v1/clients`, `/team`, `/assistant/chat`, and other routes not mounted in FastAPI; some paths/payloads differ from existing routes. Root `server.ts` provides a different demo implementation. It is not a reliable substitute for the Next app/API integration.

### Backend architecture and integration gaps

25. **A, B/D — Integrations are not wired into sync/recovery.** Only n8n has a connection probe exposed by `/integrations/test`. Make and Zapier adapters are not instantiated by the API; Zapier returns an “ingestion listener ready” success response without validating credentials or listing workflows. The scheduled sync task returns a fixed count and does not call any adapter.
26. **A, D — Celery tasks are placeholders.** Sync, stuck-execution detection, and background recovery tasks only log and return hard-coded success-shaped dictionaries. No database scans, provider polling, task dispatch, retries, or recovery operations are performed.
27. **A, E — Approval safety is not consistently enforced.** The webhook never creates an approval record. `/recovery/execute` only checks for an approved row if incident status equals `AWAITING_APPROVAL`, but the domain/model comments and client types use other status values; the request’s `bypass_approval` skips the check. Diagnosis can set the incident to awaiting approval but does not create an approval request. The approval endpoint accepts any decision string and treats anything other than `APPROVE` as rejection.
28. **A, D — Gemini fallback is deterministic, not evidence of live AI.** The engine falls back to keyword rules for missing credentials or any generation/parse/validation exception. That fallback is useful for availability but can be mistaken for Gemini output unless the UI surfaces `is_ai_generated`; the dashboard does not consistently render that flag. The SDK call is synchronous inside an async FastAPI handler. No live Gemini call was possible or attempted.
29. **A, B — No customer/client router or tenant-facing API exists in the FastAPI router set.** Client schemas/models exist and the demo client calls `/api/v1/clients`, but no clients router is included or present in `backend/app/api/v1/`.
30. **A, D — Billing is not a real subscription integration.** Plan values are static; usage counts incidents rather than diagnosis usage, reports fixed execution counts, and upgrade directly changes an organization tier without payment verification. It is a demo tier switch, not production billing.
31. **A, C — Health/observability semantics are incomplete.** `/healthz` always reports healthy; `/health/ready` probes only PostgreSQL, returns an HTTP success response when database status is degraded, and does not check Redis/Celery/Gemini. Prometheus alert rules refer to custom metrics not defined in the application.

### Security vulnerabilities

32. **A, E — Public unauthenticated webhook with no signature verification.** Any caller can submit events; a supplied header is recorded as verification without checking it. Event idempotency is based on a global body hash with no tenant or provider event identity and no database uniqueness constraint is evidenced on the missing event model. This permits forged incidents and does not provide robust concurrent deduplication.
33. **A, E — Credentials can be sent to arbitrary user-controlled n8n URLs.** The connection-test endpoint accepts a URL and API key from the request and forwards both to that destination. There is no scheme/host/private-network allowlist or redirect policy visible in the client. A privileged tenant caller could target internal services or leak a supplied key.
34. **A, E — JWT configuration and revocation are unsafe for production.** A known source default is used when `SECRET_KEY` is absent, and access tokens have a 24-hour default lifetime. Refresh revocation/logout are not implemented. Production startup does not reject a placeholder/default secret.
35. **A, E — Sensitive integration credentials are stored in plaintext.** No AES-GCM implementation is present in the integration write path; the comment says production encryption is pending. The example/security docs describe encryption that code does not perform.
36. **A, E — Compose ships permissive default credentials/exposure.** PostgreSQL and Grafana use static development credentials in Compose, Redis/PostgreSQL/Grafana ports are published to the host, Redis has no authentication configured, and no secret manager or production override is shown. Do not deploy this Compose profile to an untrusted network as-is.
37. **A, C — Browser tokens are stored in localStorage.** The Next API client stores access/refresh tokens in `localStorage`, making tokens accessible to any successful same-origin script injection. No Next auth/session or CSRF/XSS hardening layer was found in the app.
38. **A, E — Organization invite accepts arbitrary privilege strings.** Role input is not constrained to an enum/allowlist, and the membership update route does not show a route at all. Authorization decisions depend on exact strings, increasing privilege-management risk.
39. **A, C — CORS and request controls are permissive.** FastAPI allows all methods/headers with credentials and a static list that includes a hosted deployment origin. Rate limiting, brute-force controls, webhook quotas/body limits, and authentication attempt throttling were not found in the audited routes/config.

### Mock/demo-only and incomplete functionality

40. **A, D — Root Express app seeds demo tenant and business records in memory.** `server.ts` labels its development mode as mock and initializes a sample agency/team/client store. It is volatile and separate from the SQLAlchemy-backed FastAPI service; it must not be treated as persistent or tenant-isolated SaaS behavior.
41. **A, D — KPI/analytics endpoints return constants.** The FastAPI overview handler returns fixed totals and incident/recovery metrics; billing also returns a fixed monthly execution count. Root demo state repeats similar sample figures.
42. **A, B/D — Monitoring and alerting are not fully provisioned.** Compose mounts Prometheus config but does not configure/load `alerts.yml`; it does not mount Grafana provisioning directories. No dashboard JSON was found. The Prometheus config targets `host.docker.internal:3000`, where the Next frontend does not expose `/metrics`, and references alert metric names not defined in backend code.
43. **A, B — Playwright E2E suite is absent.** No Playwright dependency, config, or browser tests were found despite the testing guide describing Playwright CLI verification.
44. **A, B — Audit logging is read-only.** An audit-log model/list endpoint exists, but audited mutations do not consistently write audit events; no verified audit-event pipeline was found.
45. **A, B/D — Notification delivery/preferences are incomplete.** The API can list and mark all notifications read, but per-notification routes advertised by the frontend do not exist; no email/Slack/webhook delivery implementation or preference enforcement was found.
46. **A, E — Existing backend test suite has import-contract failures.** `backend/tests/test_api_complete.py` imports symbols not defined by the referenced modules, including `verify_signature`, `WebhookEventPayload`, `ApprovalDecision`, `classify_error_message`, and `is_financial_or_destructive`. These prevent collection once pytest and dependencies are installed. Tests mostly exercise helpers/simulated tenant filtering rather than HTTP endpoints, PostgreSQL migrations, actual tenant boundaries, or provider recovery.

## Dependency and configuration findings

- **A, E — Missing declared runtime dependency:** `EmailStr` is used in schemas and API request models, but `email-validator` is not listed in `backend/requirements.txt`. Pydantic email fields require it when those models are constructed.
- **A, C — Local backend environment incomplete:** required packages are listed in `requirements.txt`, but several were absent locally; the observed API import failure was specifically missing `prometheus_client`. Installing packages was intentionally not attempted.
- **A, E — CI install lockfile mismatch:** GitHub Actions uses `npm ci` from root; there is a Bun lockfile, not an npm `package-lock.json`.
- **A, B — Environment docs diverge from code:** `.env.example` documents variables/defaults for the old Vite preview and does not document the actual Next rewrite variable `NEXT_PUBLIC_API_URL`. `BACKEND_URL` is used in Compose but not by Next config. `Settings` uses uppercase environment names/defaults not consistently enforced by documentation.
- **A, C — Local secrets not audited:** `.env` exists and `.gitignore` excludes `.env*` while re-including `.env.example`; because the folder is not a Git checkout and `.env` was not opened, whether it contains valid credentials or was previously committed cannot be established.
- **A, C — Node runtime difference:** the local Node version is 24 while Docker uses Node 20. Next build behavior was not tested under either version.

## Exact runtime blockers

1. **Docker Desktop engine is not running/reachable** on this machine, so no Compose container can be started or health-checked.
2. **`backend/Dockerfile` is missing** although API and Celery Compose services require it; image builds cannot proceed.
3. **The current Python environment lacks required packages**; FastAPI import stopped at missing `prometheus_client`, and pytest is not installed. No backend test execution occurred.
4. **Even after dependencies are installed, source-level router imports are unresolved** (`RecoveryApproval`, `WebhookEvent`), preventing normal API import.
5. **Current frontend dependencies are not installed**, and no npm lockfile exists. Frontend build/lint was not run.
6. **Compose does not configure the frontend with the variable Next.js actually reads**; its container rewrite points to its own localhost rather than the API service.
7. **`email-validator` is absent from the Python dependency manifest**, so email schema initialization is an additional expected startup/test blocker after other missing dependencies are resolved.
8. **Database/Redis/Gemini availability is not established.** Compose parsing warned that `GEMINI_API_KEY` is unset in the current environment; no credential was tested. No database connection or Alembic migration was attempted.

## Prioritized production deployment issues

### P0 — Must fix before any deployment

1. Restore application importability by reconciling/implementing missing models and updating all router imports; include startup/import tests that exercise `app.main`.
2. Add and validate a backend Dockerfile; build all configured images and boot the full Compose stack with health checks.
3. Reconcile SQLAlchemy metadata, both Alembic revisions, and API model construction; test fresh upgrade, downgrade, and metadata/schema parity against PostgreSQL 16.
4. Replace placeholder recovery with actual provider dispatch, transactional attempt records, enforced approval state transitions, and concurrency-safe idempotency. Remove user-controlled approval bypass or restrict it through an explicit audited control.
5. Secure webhook ingestion: provider-specific HMAC verification, tenant/provider identity mapping, durable event table, unique idempotency constraint, payload limits, and unauthenticated-ingress abuse controls.
6. Remove hard-coded/default production signing and infrastructure credentials; require deployment-provided secrets, rotate existing credentials, and use managed/secret-backed configuration.
7. Encrypt integration credentials before persistence and prevent n8n URL-based SSRF/credential exfiltration with strict URL validation, network restrictions, and safe redirect handling.

### P1 — Required for a working product and tenant safety

8. Align Next.js API client routes, HTTP methods, payload names, and response schemas with the FastAPI routers; add contract tests.
9. Implement authentication UI/session flow and enforce authorization for every dashboard operation; replace localStorage token handling with a deliberate secure session design and working refresh/revocation.
10. Implement tenant selection and enforce organization scope on all resource reads/writes; constrain roles to an enum and complete invitation acceptance/password setup.
11. Wire n8n/Make/Zapier sync and recovery adapters into the API/Celery pipeline; replace success-shaped Celery placeholders with persistent work and observable failures.
12. Remove hard-coded dashboard, analytics, billing, and health values; expose only measured tenant-scoped data and truthful readiness status.
13. Configure `NEXT_PUBLIC_API_URL` for container networking, add the missing Tailwind PostCSS config as needed, and verify Next production build and browser behavior.

### P2 — Release engineering and operations

14. Add required `email-validator`, lock dependencies for root and frontend with the package manager used by CI, and make the CI install/build commands consistent with the deployed Next.js application.
15. Add pytest coverage for actual endpoint/auth/tenant/migration/recovery/webhook behavior and Playwright E2E coverage; fix imports in existing tests before relying on them.
16. Provision Prometheus alert rules and Grafana dashboards/data sources, expose only real metrics, and add health checks for API, frontend, Celery, Redis, and database.
17. Replace demo security/deployment docs that claim completed encryption, refresh rotation, tests, or runtime verification with behavior verified in source and CI.
18. Decide whether the root Vite/Express demo is supported; otherwise clearly quarantine/remove it in a later approved change so it cannot be confused with the Next.js production application.

## Audit limitations

This is a repository/source and local-tooling audit, not a penetration test or production certification. The Docker daemon, PostgreSQL, Redis, external n8n/Make/Zapier systems, Gemini credentials, and browser test environment were unavailable or unverified. No source changes were made beyond creating this report.

## Phase 1 remediation status (backend startup/build blockers)

The initial Phase 1 fix pass was completed in source and validated locally for importability and backend unit-test behavior:

- Added the missing `backend/Dockerfile` using Python 3.12.
- Resolved the import-time model mismatch by defining the missing `WebhookEvent` and `RecoveryApproval` symbols and aligning `RecoveryAttempt` with the migration schema.
- Restored missing helper/schema contracts required by the backend test suite (`verify_signature`, `WebhookEventPayload`, `ApprovalDecision`, `classify_error_message`, `is_financial_or_destructive`, and workflow schema models).
- Added the missing runtime dependencies (`email-validator`, `gunicorn`) and confirmed the backend can import with `python -c "import app.main"`.
- Executed `python -m pytest -q` and achieved 16/16 passing tests in the current environment.
- Database migration execution remains blocked by the absence of a live PostgreSQL service. `python -m alembic -c alembic.ini current` fails against the current machine because the backend database is not running.
- Docker Compose configuration parsing succeeds, but no Compose containers were started because the Docker daemon is unavailable on this machine. No runtime claim is made for container health or end-to-end DB connectivity.

The remaining blockers are external to the source fix: a live PostgreSQL 16 instance, Docker Desktop/engine availability, and any required external credentials such as Gemini or webhook secrets.
