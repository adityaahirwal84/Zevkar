# Phase 5 Production Hardening Audit

## Executive summary

The Phase 4 implementation establishes a useful n8n monitoring foundation: encrypted credential storage, per-integration webhook tokens, execution persistence and deduplication, incident creation, queued diagnosis, and tenant-scoped application routes. The existing Phase 4 report records 40 backend tests passing, frontend type/build checks passing, Alembic revision `006_legacy_webhook_idempotency`, and a live Compose webhook-to-diagnosis exercise.

This audit also found production-blocking gaps. Most importantly, outbound n8n requests validate DNS before making a separate HTTP request, leaving a DNS-rebinding time-of-check/time-of-use gap. A legacy globally signed webhook can select workflows without tenant scoping. The current running API reports no Gemini key, no integration-encryption key ring, and no global webhook secret configured; no customer n8n credentials are available in the evidence reviewed. Real provider behavior and backup/restore therefore remain unverified. No Phase 5 source changes have been made at the time this audit was written.

**Do not treat the application as production-ready.** Complete the security fixes, verify backups/restores and production configuration, then repeat provider and end-to-end testing against operator-provided isolated resources.

## Scope and evidence

Reviewed the Phase 4 implementation plan, implementation and test reports, n8n client, webhook routes, authentication and token security, settings validation, Gemini diagnosis engine, Celery worker, FastAPI startup, frontend API/authentication providers, deployment/security/environment documentation, and current Compose/database state.

The Phase 4 test report is historical execution evidence, not a claim that every test was rerun for this audit. Current read-only observations:

- Compose API, frontend, Celery worker, Celery Beat, and Grafana containers were reported healthy by `docker compose ps`; this is not evidence that every service or real integration is healthy.
- PostgreSQL reported Alembic revision `006_legacy_webhook_idempotency`.
- The existing database contains ordinary indexes for the legacy fields reported by `alembic check`; this inspection did not alter schema or data.
- A safe settings-flag probe inside the API container found Gemini credentials, the integration encryption key ring, and the legacy shared webhook secret are not configured. No secret values were read or printed.
- No real n8n endpoint/API key or Gemini request was available for testing.

## Findings

| ID | Classification | Severity | Finding and evidence | Status |
|---|---|---:|---|---|
| P5-01 | A. VERIFIED FROM SOURCE / E. CRITICAL BUG | High | `backend/app/integrations/n8n.py` resolves the submitted hostname and rejects non-global addresses, but `httpx.AsyncClient` then performs its own DNS lookup. The connection is not pinned to the validated address, so DNS rebinding can change the target between validation and connection. Redirects and ambient proxy use are disabled, but do not close this gap. | Fix required before production. |
| P5-02 | A. VERIFIED FROM SOURCE / E. CRITICAL BUG | High | `backend/app/api/v1/webhooks.py` exposes `/webhooks/listener`, authenticates all tenants with one optional global `WEBHOOK_SECRET`, then selects a workflow using only `external_workflow_id`. If enabled, a holder of that shared key can submit an event for a workflow in another organization. The newer tokenized n8n receiver is integration-bound and is the safer path. | Must be disabled or replaced with tenant-bound authentication before production. |
| P5-03 | A. VERIFIED FROM SOURCE / B. NOT IMPLEMENTED | High | There is no request throttling for password login/refresh or webhook authentication in the reviewed route/middleware paths. Password verification and token endpoints are therefore exposed to unbounded repeated attempts unless an external edge policy intervenes. No such required edge policy is enforced by this application. | Add focused rate limits or enforce an explicitly documented trusted edge control; verify behavior. |
| P5-04 | A. VERIFIED FROM SOURCE / F. BLOCKED BY MISSING CREDENTIALS OR INFRASTRUCTURE | High | The API container reports no integration encryption key ring configured. Production settings correctly reject a missing key ring, and credential operations should fail closed. No existing key values were inspected. | Configure and test the key ring before connecting any provider. |
| P5-05 | A. VERIFIED FROM SOURCE / F. BLOCKED BY MISSING CREDENTIALS OR INFRASTRUCTURE | Medium | The API container reports no Gemini API key. The diagnosis engine validates structured JSON and has deterministic fallback, but no real Gemini request, rate-limit response, provider retry, or model-specific schema behavior has been verified. The current engine has a 20-second application timeout and catches failures into deterministic classification; it does not implement a provider retry/backoff policy. | Live verification blocked; add deterministic provider-failure tests and document fallback. |
| P5-06 | C. IMPLEMENTED BUT NOT RUNTIME VERIFIED / F. BLOCKED BY MISSING CREDENTIALS OR INFRASTRUCTURE | High | The n8n client implements HTTPS URL normalization, API-key authentication, workflow/execution pagination, bounded timeouts, redirects disabled, and public-address validation. Phase 4 exercised synthetic/webhook and local client paths, but no real n8n instance, API credential, provider response schema, timeout, or rate limit was verified. | Live verification blocked pending isolated n8n endpoint and credential. |
| P5-07 | A. VERIFIED FROM SOURCE / C. IMPLEMENTED BUT NOT RUNTIME VERIFIED | High | Phase 4 report records a forward migration to revision 006 and an `alembic check` mismatch for unique constraint/index representation on `agencies.slug`, `invitations.token`, `refresh_tokens.token_hash`, `subscription_plans.tier_code`, and `users.email`. Current database inspection found ordinary indexes on these fields. This is metadata/catalog drift, not evidence that a migration failed. | Resolve non-destructively; never drop or recreate these objects or reset the database without proven need and approval. |
| P5-08 | B. NOT IMPLEMENTED / C. IMPLEMENTED BUT NOT RUNTIME VERIFIED | High | The reviewed deployment/environment docs describe the Compose services and TLS reverse proxy expectation, but no tested backup-and-restore procedure or isolated restore evidence was found. | Add documented non-destructive backup/restore procedure and validate only against an isolated temporary database. |
| P5-09 | A. VERIFIED FROM SOURCE / B. NOT IMPLEMENTED | Medium | Celery sync and diagnosis tasks have retry policies and the Phase 4 report records a worker retry probe. Beat's `detect_stuck_executions_task` explicitly logs that the feature is not implemented and returns `NOT_IMPLEMENTED`. | Keep visibly documented as unavailable; no recovery dispatch is in scope. |
| P5-10 | A. VERIFIED FROM SOURCE | Medium | `backend/app/main.py` configures credentialed CORS from settings and exposes readiness checks for PostgreSQL and Redis. The reviewed CORS middleware allows all methods and headers. Production settings require explicit non-wildcard origins, but method/header scope remains broader than necessary. Compose publishes browser/API ports to loopback; HTTPS depends on a separately operated reverse proxy. | Restrict CORS methods/headers if compatible and document/verify the required HTTPS edge. |
| P5-11 | A. VERIFIED FROM SOURCE | Medium | Authentication uses Argon2 password hashing and rotates hashed refresh tokens in an HttpOnly, SameSite=Lax cookie scoped to `/api/v1/auth`; `Secure` is enabled only when `ENVIRONMENT=production`. Access tokens are short-lived only if configured accordingly: current settings default to 24 hours, while `SECURITY.md` says 15 minutes. | Correct the policy/config mismatch and add cookie/rotation/expiry tests. |
| P5-12 | A. VERIFIED FROM SOURCE | Medium | Frontend startup restores sessions and organization selection; organization switching rolls back the selected ID after an API error. `AuthProvider` catches all restoration errors and clears local state without surfacing the cause. | Improve user-visible expiry/error handling and test organization switching/session expiry. |
| P5-13 | D. MOCK / DEMO ONLY / C. IMPLEMENTED BUT NOT RUNTIME VERIFIED | Medium | Provider absence deliberately takes the deterministic diagnosis fallback. Phase 4 runtime verification exercised this fallback, not Gemini. The report also identifies integration sync with zero configured integrations. | Keep UI/report labels clear; do not describe fallback as live AI or provider verification. |
| P5-14 | A. VERIFIED FROM SOURCE / C. IMPLEMENTED BUT NOT RUNTIME VERIFIED | Medium | FastAPI mounts `/metrics` without application authentication. The Compose Prometheus service scrapes it over the observability network and published ports bind to loopback, but production ingress rules were not available to verify that this path cannot be exposed externally. | Keep `/metrics` internal at ingress/network level and verify the deployed proxy/firewall rules. |

## Existing implementation

- **Authentication and tenant context:** FastAPI bearer access tokens, Argon2 password hashes, one-use hashed refresh tokens, an HttpOnly refresh cookie, and an organization membership dependency. Reviewed application queries for integrations, workflows, incidents, approvals, and analytics use organization membership/scope. Phase 4 recorded a cross-organization denial test for execution history.
- **Integration secrets:** AES-GCM credential encryption helper and key IDs are present. Production configuration validates key-ring format and requires a configured ring. Current local runtime has no ring.
- **n8n event path:** Integration-specific random webhook bearer tokens are stored by hash; the n8n event route is payload-size limited, parses normalized n8n execution events, scopes integration/workflow resolution, records idempotency, persists execution and incident records, and queues diagnosis after commit.
- **Polling and task execution:** Celery sync polls connected n8n integrations and enqueues diagnosis; diagnosis avoids duplicate records under a row lock. Retry policies exist for sync and diagnosis. Stuck-execution detection and recovery dispatch are explicitly placeholders.
- **Diagnosis:** Gemini output is requested as JSON, validated through Pydantic, and falls back to deterministic classification on errors. No live API call or Gemini rate-limit behavior was verified.
- **Database:** Phase 4 migration head is 006. Historical Phase 4 testing reports migration to head, a clean temporary DB migration, and five known legacy unique-index/constraint metadata mismatches.
- **Frontend:** Typed centralized API client uses same-origin browser requests and the refresh cookie; AuthProvider restores profile/org context and supports org switching. Phase 4 report records type/build checks.
- **Observability/deployment:** Prometheus/Grafana and Compose services are present. Phase 4 report records Compose health and Redis/Celery probes at that time. A live TLS termination layer is not part of Compose.

## Missing or not verified

1. Outbound n8n connection to the exact IP that was validated, including DNS rebinding resistance while preserving HTTPS certificate and SNI validation.
2. Safe tenant-bound authentication for every enabled webhook mode; the legacy global-secret listener must not remain an alternate cross-tenant path.
3. Login, refresh, and public webhook rate limiting (or enforceable edge protection), with explicit limits and `429` tests.
4. Real n8n workflow synchronization, execution polling, provider timeouts, and actual provider response compatibility.
5. Real Gemini request, structured output, provider throttling, retry behavior, and fallback under provider/network errors.
6. Non-destructive backup and isolated restore test against PostgreSQL.
7. Clean resolution of legacy Alembic metadata drift without destructive operations.
8. End-to-end session expiry, logout, organization switching, and visible frontend error-state coverage.
9. Production HTTPS/reverse-proxy validation and a least-privilege CORS policy.
10. Current post-Phase-4 full test/build/runtime rerun (the Phase 4 results are historical).

## Required configuration and operator inputs

- Production `SECRET_KEY`, restricted exact HTTPS CORS origin(s), production PostgreSQL/Redis credentials, Grafana password, and a valid AES-256 integration key ring with an active key ID.
- A customer-approved, isolated n8n test instance URL and API key to run live synchronization and timeout/error tests. Do not send customer credentials through reports/logs.
- A Gemini API key and approved model/usage budget for live structured-response, rate-limit, and timeout tests. Without this, provider behavior remains BLOCKED.
- A trusted HTTPS reverse proxy/ingress with TLS renewal and a documented source of client IPs before applying IP-based rate limits. The application must not trust spoofable forwarded headers.
- An isolated temporary PostgreSQL database for restore testing; do not use or overwrite the existing development/production database.
- A protected backup destination with retention and encryption policies. Backup artifacts must not be added to source control.

## Recommended implementation sequence

1. Close the SSRF DNS-rebinding gap with a tested outbound transport that connects only to a validated public IP while preserving original-host TLS SNI/certificate validation; reject the request if any DNS answer is non-public. Avoid a check-then-resolve design.
2. Remove the global tenant-ambiguous webhook path from production use or replace it with per-tenant/per-integration authentication and scoped workflow lookup. Add regression tests for cross-organization spoofing and idempotency.
3. Add bounded login/refresh/webhook rate limiting with a deployment-aware client identity strategy, retry responses, and tests; do not trust unvalidated forwarded headers.
4. Align access-token lifetime docs and settings; test refresh rotation, cookie attributes, logout, and frontend expiry/error UX.
5. Inspect current ORM metadata and actual PostgreSQL catalogs for the five legacy index/constraint mismatches. Choose a metadata alignment or a forward-only migration only after demonstrating the exact safe change. Preserve all rows and migration history.
6. Add backup/restore commands and documentation, then validate them only against a uniquely named temporary database and verify restored revision/row counts without touching the configured database.
7. Add deterministic mocked-boundary tests for n8n/Gemini provider error paths and live provider tests only when credentials/endpoints are provided. Do not substitute mocks for live verification in reports.
8. Run targeted backend/security tests, full backend tests, frontend type/build, Compose config, current migrations/readiness, and document exact outcomes and remaining external blockers.

## Data safety and scope

No source or database changes have been made to produce this audit. No database was dropped/reset and no credential value was read. Automatic recovery dispatch remains intentionally out of scope. Any migration must be forward-only and must preserve existing records; backup/restore validation must use an isolated temporary database.
