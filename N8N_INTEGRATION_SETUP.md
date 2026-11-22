# n8n Integration Setup

## Requirements

- An n8n instance reachable from the backend over HTTPS with a publicly routable DNS address. Loopback, private, link-local, and internal-only destinations are rejected.
- An n8n API key with read access to workflows and executions. The integration currently reads data only; it does not dispatch retries or modify n8n workflows.
- PostgreSQL and Redis available to the application, plus a running Celery worker and Beat scheduler.
- A configured AES-256 key ring before creating integrations. Do not put keys in frontend variables, source control, or reports.

## Configure credential encryption

Generate a random 32-byte key and base64 encode it using a trusted local secret manager or shell. For example, Python can print a candidate:

```powershell
python -c "import base64,secrets; print(base64.b64encode(secrets.token_bytes(32)).decode())"
```

Store it in the server-side `.env` as a JSON key ring, with a stable key ID:

```dotenv
INTEGRATION_ENCRYPTION_KEYS={"v1":"<base64-encoded-32-byte-key>"}
INTEGRATION_ACTIVE_ENCRYPTION_KEY_ID=v1
```

Restrict `.env` access and use a production secret manager outside local development. The API, migration, worker, and Beat services must receive the same key-ring settings. Production startup rejects a missing, malformed, or incorrectly sized key. Development may start without a key, but integration credential operations fail closed.

The key ID is stored with each encrypted credential. Keep every old key available while ciphertext still refers to it. This release does not provide an automated re-encryption/rotation command; plan and verify a credential re-encryption procedure before removing an old key. Rotate n8n API keys separately if a key may have been exposed.

## Connect an n8n instance

1. In the dashboard, select **Integrations** and create a connection with a name, canonical HTTPS instance URL, n8n API key, and optional client.
2. The backend verifies the key against the n8n API before persisting the connection.
3. The API key is stored as AES-GCM ciphertext in `integration_credentials`; it is never returned by list, detail, or test responses.
4. Save the webhook URL and token shown after creation. They are displayed once. The database stores only a SHA-256 token hash.
5. Use **Sync** to import workflow metadata. Celery Beat repeats workflow and execution polling every five minutes.
6. Use **Test** to re-check a saved connection. A failed check marks the integration as `ERROR`; a successful check restores `CONNECTED`.
7. **Rotate webhook** invalidates the previous URL immediately. Update the n8n error workflow with the newly returned URL.

The API key is sent to n8n in the `X-N8N-API-KEY` header. Redirects and ambient proxy configuration are disabled. The backend rejects DNS answers that are not globally routable. It does not currently pin the validated DNS address to the subsequent HTTP connection, so DNS rebinding remains a residual SSRF risk. For production, enforce outbound network allowlists and use operator-controlled DNS while connection pinning is addressed.

## Send failed execution events

In n8n, create an error workflow using an **Error Trigger** and an **HTTP Request** node. Configure an HTTP `POST` to the saved webhook URL with JSON content type. The path token is the credential; do not copy it into logs, screenshots, workflow names, or shared documents.

The receiver accepts `workflowId`, `executionId`, `status`, optional `startedAt`/`stoppedAt`, and an optional `error` object. A representative body is:

```json
{
  "workflowId": "n8n-workflow-id",
  "executionId": "n8n-execution-id",
  "workflow": {
    "id": "n8n-workflow-id",
    "name": "Customer automation"
  },
  "status": "error",
  "startedAt": "2026-01-15T10:00:00Z",
  "stoppedAt": "2026-01-15T10:00:04Z",
  "error": {
    "message": "The upstream request timed out",
    "stack": "Sanitized provider stack trace"
  }
}
```

Use the corresponding n8n Error Trigger expressions for the workflow, execution, timestamp, and error values. Send only fields needed for diagnosis; request/response bodies and credentials should not be forwarded. Supported terminal event statuses are success/succeeded, error/failed/failure, and canceled/cancelled; `running` is accepted but not persisted by the polling path as a terminal execution. Unknown statuses are rejected.

The receiver caps raw request bodies using `N8N_WEBHOOK_MAX_BYTES` (default 1 MiB), resolves the tenant from the webhook token rather than payload fields, and matches workflows only within that integration and organization. Repeated deliveries are deduplicated. A processed failure creates or updates an execution and linked incident, updates workflow health, and enqueues diagnosis after the database transaction commits.

## Diagnosis and recovery behavior

Gemini diagnosis is optional. When `GEMINI_API_KEY` is absent or a Gemini response cannot be validated, a deterministic classifier still records a diagnosis and the incident remains persisted. Error text and stack traces are redacted before storage and before sending to Gemini. Diagnosis is advisory only.

No automatic recovery or provider retry dispatch is enabled. Where a diagnosis requires approval, a pending approval is recorded for an organization administrator/developer to review. The existing recovery endpoint remains unavailable until a provider recovery adapter is implemented and approved.

## Polling and data limits

- Beat schedules n8n synchronization every five minutes.
- The sync imports up to 1,000 workflow records per integration and up to 1,000 recent execution records per workflow per poll, following n8n cursors.
- Execution polling is idempotent by `(workflow_id, external_execution_id)`; a failed execution links to a single incident record.
- This bounded poll is not a permanent event archive. If a workflow can exceed 1,000 executions between polls or has a large backlog, tune the cap and schedule before relying on complete historical capture.
- The manual dashboard sync refreshes workflow metadata; execution history is collected by the scheduled Celery task and webhook events.

## Migration and operations

Apply the forward-only schema changes without deleting or resetting volumes:

```powershell
docker compose run --rm --build migrate
docker compose up -d --build api celery_worker celery_beat frontend
```

The migration adds integration metadata, scoped idempotency, execution linkage, and diagnosis history support. Do not run Alembic downgrade in an environment that has accumulated multiple diagnoses per incident or integration-scoped webhook events; older uniqueness rules cannot represent that history.

Check service health and worker logs:

```powershell
docker compose ps
docker compose logs --tail 100 api celery_worker celery_beat
```

Never include `.env` contents, API keys, webhook tokens, or authorization headers in support reports.
