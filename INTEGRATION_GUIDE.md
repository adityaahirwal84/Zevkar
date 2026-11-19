# INTEGRATION GUIDE
## Zevkar.ai — Platform Connectivity Architecture

---

## 1. n8n (Official v1 REST API)

n8n is the primary supported platform with automated failure webhook ingestion, execution inspection, and execution retry.

### Supported Operations
- `GET /workflows`: Workflow discovery and status inspection.
- `GET /executions`: Execution history and error payload retrieval.
- `POST /executions/{id}/retry`: Automated safe retry dispatch.
- **Ingestion Webhook**: n8n Error Trigger Node dispatches failure payloads to `/api/v1/webhooks/listener`.

### Authentication
- Uses `X-N8N-API-KEY` header generated from n8n Settings -> API.
- Credentials stored with AES-256-GCM encryption in PostgreSQL.

---

## 2. Make.com (formerly Integromat API v2)

### Supported Operations
- `GET /api/v2/users/me`: Connection probe.
- `GET /api/v2/scenarios`: Scenario inventory.
- `GET /api/v2/scenarios/{id}/logs`: Execution logs.
- `POST /api/v2/scenarios/{id}/run`: Scenario manual re-run dispatch.

### Authentication
- Uses `Authorization: Token <api_token>` generated from Make Profile -> API Access.

---

## 3. Zapier (Catch Hook & Webhook Actions)

Zapier integrations operate via webhook events:
1. In Zapier editor, add an **Error Catcher** step or **Webhook by Zapier** action on failure.
2. Configure URL to point to `https://<your-instance>/api/v1/webhooks/listener`.
3. Payload normalization automatically converts Zap step errors into structured `Incident` records.

---

## 4. Custom Python & FastAPI Scripts

Integrate custom scripts using the lightweight client snippet:
```python
import httpx

async def report_automation_failure(workflow_name: str, error: Exception, execution_id: str):
    payload = {
        "workflow_name": workflow_name,
        "platform": "custom_python",
        "execution_id": execution_id,
        "error": str(error),
    }
    async with httpx.AsyncClient() as client:
        await client.post("https://zevkar.ai/api/v1/webhooks/listener", json=payload)
```
