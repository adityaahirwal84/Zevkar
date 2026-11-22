# Phase 4 Audit and Implementation Plan

## Audit scope and current architecture

Repository inspection confirms the approved modular monolith: FastAPI/Python 3.12 with async SQLAlchemy/PostgreSQL and Alembic; Redis/Celery; Next.js 15 App Router/React 19 with a centralized typed API client; and Prometheus/Grafana. Existing revisions are 001–004. Compose defines the API, frontend, PostgreSQL, Redis, worker, Beat, Prometheus, and Grafana services.

### Existing reusable components

- `Integration`, `IntegrationCredential`, `Workflow`, `Execution`, `Incident`, `AIDiagnosis`, and `WebhookEvent` already exist in `backend/app/models/entities.py`.
- `backend/app/integrations/n8n.py` has an HTTPX n8n API client with API-key header, credential probe, workflow listing, execution listing, and a retry method. Monitoring must reuse this client while not enabling automatic execution retries.
- `backend/app/api/v1/integrations.py`, `workflows.py`, `incidents.py`, `diagnosis.py`, and `webhooks.py` already define API surfaces.
- `backend/app/api/deps.py` resolves active organization membership from authentication and `X-Organization-ID`; existing integration/workflow/incident list/detail routes generally filter on the resolved agency.
- `backend/app/diagnosis/gemini_engine.py` and `backend/app/lib/classifier.py` provide a Gemini path and deterministic severity classification.
- `backend/app/workers/celery_app.py` registers Beat entries for integration sync and stuck-execution evaluation, but both tasks currently return `NOT_IMPLEMENTED`.
- `frontend/lib/api-client.ts` has integration, workflow, and incident API types/calls. The dashboard already contains Integrations, Workflows, and Incidents sections, but integrations are read-only and no execution list exists.
- Tests cover API route contracts, basic n8n URL/header behavior, HMAC helpers, tenant membership checks, and webhook rejection cases; they do not exercise persisted n8n event handling or integration credential lifecycle.

## Verified gaps and risks

1. `Integration.encrypted_credentials` receives the raw `api_key` directly. `IntegrationCredential` has encrypted-named storage but no encryption service or caller.
2. The n8n connection test actually contacts the submitted URL, but it does not apply SSRF restrictions, redirects are not explicitly disabled, and connection status responses conflate attempted and verified states.
3. There is no integration update/delete route, sync endpoint, webhook token, per-integration webhook authentication, n8n-specific event normalization, or webhook payload size limit.
4. The generic webhook uses one global HMAC secret and resolves workflow by globally queried external ID. It stores a generic event but no execution row and does not scope the workflow lookup to integration/agency.
5. `Execution` has no completion time, stack trace, integration-aware event identity, or uniqueness preventing duplicate provider executions. `Incident.execution_id` is a string rather than an FK to an execution record.
6. Celery sync/detection tasks are placeholders. The scheduled job does not import provider workflows/executions.
7. Diagnosis persistence enforces one `AIDiagnosis` per incident and updates it in place, so it cannot retain history. Gemini accepts raw user-controlled error text and uses a synchronous SDK call inside an async function.
8. Integration/workflow create routes do not validate that referenced client and integration IDs belong to the active agency. Webhook ownership is not bound to a tenant-specific integration.
9. The UI does not create/test/edit/delete integrations, expose webhook setup, show per-workflow execution status/history, or provide full incident status/history operations.
10. Existing global legacy webhook data and existing plaintext integration credential values must be treated as sensitive. No credential values were read during this audit; any existing provider key requires rotation and a separately planned re-encryption before production use.

## Schema and migration plan

Create one forward-only Alembic revision after `004_align_orm_schema`. Preserve all existing rows and revision history. The revision is expected to:

- Add integration connection metadata and a nullable per-integration webhook token hash.
- Add integration ownership/event identity and processing metadata to webhook receipts; replace global event-idempotency uniqueness with integration-scoped uniqueness after checking the exact deployed constraint/index names and duplicate data.
- Add execution completion/stack-trace fields and event identity/uniqueness scoped by workflow; preserve historical rows.
- Link incidents to internal execution records with a nullable FK while retaining the legacy external execution ID.
- Enable multiple diagnosis records per incident by removing the existing one-diagnosis uniqueness and changing the ORM relationship to a history collection/latest view.
- Add only query-backed indexes and required constraints. Before any uniqueness change, inspect existing duplicate rows in the running development database; never delete records to force a migration.

Migration implementation will be additive/non-destructive where possible. If existing data prevents a uniqueness constraint, fail explicitly and report remediation rather than deleting or silently merging records. Run revision graph and offline SQL checks first, then upgrade the configured development database only after confirming the Compose DB target; do not reset volumes.

## Security design

- Use AES-256-GCM with a validated environment-supplied key ring and active key ID. Store nonce, ciphertext, and key ID in `IntegrationCredential`; API responses never include credentials. Existing plaintext legacy values are not automatically treated as encrypted data.
- Generate 256-bit webhook bearer tokens using a cryptographic RNG, return only at creation/rotation, store SHA-256 hashes, and bind lookup to one integration. Never trust tenant identifiers from callback payloads.
- Bound webhook request bytes before JSON decoding; normalize only supported n8n event shapes and redact secrets/PII from stored error/payload and AI context.
- Resolve webhook integration first, then workflow by `(integration_id, external_workflow_id)` and matching agency. Use a composite unique idempotency key and idempotent execution upsert.
- Validate ownership of client/integration IDs on every write. Scope all reads and mutations by `member.agency_id`.
- Restrict n8n URLs to approved HTTPS destinations, disallow redirects and ambient proxy use, validate DNS/IP targets, and return sanitized upstream errors. URL validation must account for SSRF and document any residual DNS-rebinding limitation.
- Enqueue diagnosis only after the execution/incident transaction commits. AI output is advisory and never dispatches recovery.

## Planned implementation files

### Backend

- Modify `backend/app/core/config.py`, `.env.example`, and `docker-compose.yml` for encryption key-ring settings and validation.
- Add an encryption/key-management helper under `backend/app/core/`.
- Harden and extend `backend/app/integrations/n8n.py`; add provider normalization/service code under `backend/app/integrations/`.
- Modify `backend/app/models/entities.py` and add a forward Alembic revision under `backend/migrations/versions/`.
- Extend schemas and tenant-scoped routes in `backend/app/schemas/pydantic_models.py`, `backend/app/api/v1/integrations.py`, `webhooks.py`, `workflows.py`, `incidents.py`, and `diagnosis.py`.
- Implement processing, integration sync, and bounded diagnosis tasks in `backend/app/workers/celery_app.py` or adjacent worker modules.
- Harden `backend/app/diagnosis/gemini_engine.py` for sanitized untrusted context, structured validation, timeouts, and explicit failure behavior.
- Add focused tests in new/related `backend/tests/` modules for encryption, n8n client behavior, webhook normalization/idempotency, task processing, and tenant authorization.

### Frontend and documentation

- Extend `frontend/lib/api-client.ts`.
- Update `frontend/app/dashboard/page.tsx` to expose integration management/webhook setup, workflow health/executions, and incident status/history while retaining current sections and loading/error patterns.
- Add `N8N_INTEGRATION_SETUP.md`, `PHASE_4_IMPLEMENTATION_REPORT.md`, and `PHASE_4_TEST_REPORT.md`.

## Implementation sequence

1. **Credential and tenant foundations:** validate encryption configuration, encrypted credential service, n8n URL/timeout controls, and ownership checks. Add focused tests before exposing CRUD.
2. **Schema and persistence:** add the forward migration and ORM relationships/constraints. Inspect live development data for duplicates before applying uniqueness changes.
3. **Integration management:** create/update/delete/test/sync routes; redact secrets; rotate webhook tokens; add actual n8n workflow sync.
4. **Webhook and execution pipeline:** define supported payload variants, verify per-integration token, persist receipt, queue idempotent event processing, write execution and deterministic incident in one transaction, update workflow health.
5. **Async diagnosis:** enqueue after commit, sanitize fields, persist diagnosis history, tolerate Gemini failure without losing incidents; do not implement recovery dispatch.
6. **Frontend:** integrate actions and views with the typed client/TanStack Query and preserve tenant selection and existing dashboard behavior.
7. **Verification and docs:** run backend tests, frontend type/build, Alembic checks, Compose config, live service checks available in this environment, multi-tenant tests, and document actual outcomes and operator setup.

## Test plan

- AES-GCM encrypt/decrypt, tamper detection, invalid/missing key rejection, key rotation across key IDs, no secret in response/log.
- n8n API-key probe success/401/timeout/rate limit/malformed response; URL scheme, loopback/private/link-local, redirect and DNS validation.
- Tenant-scoped integration CRUD and connection tests; reject foreign client/integration IDs; redact credentials on every response.
- Webhook authentication, payload byte limit, schema/status validation, supported n8n formats, unknown workflow rejection, replay/duplicate delivery and concurrent idempotency.
- Successful event records execution and resets failure state without incident; failed event records execution, updates counters, creates/updates one correctly linked incident and queues diagnosis only after commit; unknown status never creates an incident.
- Celery retry/duplicate processing and diagnosis failure preserve incident; Gemini output validation and sensitive-data redaction.
- Cross-tenant integration/workflow/execution/incident/diagnosis/webhook-token access returns denial/not-found; changing organization header cannot grant access.
- Frontend integration create/test/status/edit/delete and webhook setup; workflow execution display; incident detail/status/history; loading, empty and error conditions.

## Pre-implementation audit conclusion

The repository contained useful adapter, model, route, task, diagnosis and dashboard foundations, but did not implement end-to-end n8n monitoring. The main gaps were plaintext credential persistence, global webhook trust/lookup, absent execution persistence and task processing, missing reference-ownership validation, and no integration/execution management UI. The implementation and verification outcomes are documented in [PHASE_4_IMPLEMENTATION_REPORT.md](./PHASE_4_IMPLEMENTATION_REPORT.md) and [PHASE_4_TEST_REPORT.md](./PHASE_4_TEST_REPORT.md). No automatic recovery was enabled.
