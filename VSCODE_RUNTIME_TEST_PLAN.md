# VS Code Runtime Test Plan & Local Execution Guide
## Zevkar.ai — Production Verification with Docker Desktop & GitHub Copilot

This guide provides end-to-end instructions for launching, migrating, seeding, and executing runtime verification tests for the **Zevkar.ai** platform inside Visual Studio Code on macOS, Windows (WSL2), or Linux.

---

## 1. System Prerequisites

Ensure the following tools are installed and operational on your development workstation:

| Tool | Minimum Version | Verification Command | Purpose |
| :--- | :--- | :--- | :--- |
| **Docker Desktop** | 25.0+ | `docker --version` | Manages PostgreSQL, Redis, Celery, API, Frontend |
| **Docker Compose** | v2.24+ | `docker compose version` | Orchestrates the 8-container architecture |
| **Node.js** | 20.x LTS | `node -v` | Next.js 15 frontend local tooling |
| **Python** | 3.12+ | `python3 --version` | FastAPI backend and Pytest execution |
| **Git** | 2.40+ | `git --version` | Version control and submodules |
| **VS Code** | 1.88+ | `code --version` | Primary development IDE |

### Recommended VS Code Extensions
- **Docker** (`ms-azuretools.vscode-docker`) — Container inspection and log streaming.
- **Python** (`ms-python.python`) & **Pylance** — Type inference and linting.
- **REST Client** (`humao.rest-client`) or **Thunder Client** — API endpoint execution.
- **GitHub Copilot** (`github.copilot`) & **GitHub Copilot Chat** (`github.copilot-chat`) — Interactive debugging.
- **Tailwind CSS IntelliSense** (`bradlc.vscode-tailwindcss`) — Styling autocomplete.

---

## 2. Environment Configuration

Clone or open the repository root in VS Code:
```bash
code .
```

Copy the template environment configuration to `.env`:
```bash
cp .env.example .env
```

Open `.env` and configure your credentials. At minimum, supply your Google Gemini API key:
```ini
# Application Mode
APP_ENV=development
LOG_LEVEL=INFO

# Database Connection (AsyncPG for FastAPI, Psycopg2 for Alembic)
DATABASE_URL=postgresql+asyncpg://postgres:postgrespassword@postgres:5432/automation_doctor

# Redis Caching & Celery Queues
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/1
CELERY_RESULT_BACKEND=redis://redis:6379/2

# Security & Cryptography
JWT_SECRET_KEY=dev_secret_key_change_in_production_min_32_chars_long!
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=30
CREDENTIAL_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# Google Gemini AI Key (Required for live AI Diagnosis)
GEMINI_API_KEY=AIzaSyYourRealGeminiApiKeyHere

# Webhook Ingestion Secret
WEBHOOK_SIGNING_SECRET=whsec_local_dev_signing_secret_999

# Frontend URLs
NEXT_PUBLIC_API_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000
```

---

## 3. Starting the 8-Container Infrastructure

Launch the complete stack in detached mode using Docker Compose:

```bash
docker compose up -d --build
```

### Verify Container Status
```bash
docker compose ps
```

All 8 containers should report healthy or running:
```
NAME               IMAGE                     STATUS                   PORTS
doctor-postgres    postgres:16-alpine        Up (healthy)             0.0.0.0:5432->5432/tcp
doctor-redis       redis:7-alpine            Up (healthy)             0.0.0.0:6379->6379/tcp
doctor-api         automation-doctor-api     Up                       0.0.0.0:8000->8000/tcp
doctor-worker      automation-doctor-worker  Up                       
doctor-beat        automation-doctor-beat    Up                       
doctor-frontend    automation-doctor-fe      Up                       0.0.0.0:3000->3000/tcp
doctor-prometheus  prom/prometheus:v2.50.0   Up                       0.0.0.0:9090->9090/tcp
doctor-grafana     grafana/grafana:10.3.0    Up                       0.0.0.0:3001->3000/tcp
```

---

## 4. Applying Alembic Database Migrations

Apply the complete 20-entity schema migrations across `001_initial_schema` and `002_complete_schema`:

```bash
docker compose exec api alembic upgrade head
```

Expected output:
```
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
INFO  [alembic.runtime.migration] Running upgrade  -> 001_initial_schema, 001_initial_schema
INFO  [alembic.runtime.migration] Running upgrade 001_initial_schema -> 002_complete_schema, 002_complete_schema
```

### Inspect Database Tables via psql
Verify that all 20 tables exist in PostgreSQL:
```bash
docker compose exec postgres psql -U postgres -d automation_doctor -c "\dt"
```

You should see:
```
                  List of relations
 Schema |          Name           | Type  |  Owner   
--------+-------------------------+-------+----------
 public | agencies                | table | postgres
 public | agency_members          | table | postgres
 public | ai_diagnoses            | table | postgres
 public | alembic_version         | table | postgres
 public | approval_requests       | table | postgres
 public | audit_logs              | table | postgres
 public | clients                 | table | postgres
 public | executions              | table | postgres
 public | incidents               | table | postgres
 public | integration_credentials | table | postgres
 public | integrations            | table | postgres
 public | invitations             | table | postgres
 public | notification_preferences| table | postgres
 public | notifications           | table | postgres
 public | recovery_approvals      | table | postgres
 public | recovery_attempts       | table | postgres
 public | refresh_tokens          | table | postgres
 public | sessions                | table | postgres
 public | subscription_plans      | table | postgres
 public | usage_records           | table | postgres
 public | users                   | table | postgres
 public | workflows               | table | postgres
(22 rows)
```

---

## 5. Seeding Demo Tenant & Baseline Data

Run the database seed script to populate default subscription plans, a test agency tenant, workflows, and sample incidents:

```bash
docker compose exec api python -m app.db.seed
```

Or execute via raw SQL curl test if running API standalone.

---

## 6. Backend API Readiness & Health Verification

### 1. Liveness & Readiness Check
```bash
curl -s http://localhost:8000/health/ready | jq
```
Expected response:
```json
{
  "status": "ready",
  "database": "connected",
  "redis": "connected",
  "timestamp": "2026-11-02T18:00:00.000Z"
}
```

### 2. Tenant Signup & Authentication
Create an agency owner account:
```bash
curl -X POST http://localhost:8000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "owner@agency.com",
    "password": "SecurePassword2026!",
    "name": "Jane Doe",
    "agency_name": "Apex Automations"
  }' | jq
```

Save the returned `access_token` into an environment variable:
```bash
export TOKEN="<PASTE_ACCESS_TOKEN_HERE>"
```

### 3. Verify Authenticated Tenant Profile
```bash
curl -s http://localhost:8000/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN" | jq
```

### 4. Create an n8n Integration
```bash
curl -X POST http://localhost:8000/api/v1/integrations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production n8n Cloud",
    "platform": "n8n",
    "instance_url": "https://n8n.apex-automations.io",
    "api_key": "n8n_sec_demo_api_token"
  }' | jq
```

### 5. Ingest a Simulated Webhook Failure
Simulate an error webhook dispatch from an external automation tool:
```bash
curl -X POST http://localhost:8000/api/v1/webhooks/incoming \
  -H "Content-Type: application/json" \
  -H "X-Doctor-Signature: sha256=test_or_skip_if_unconfigured" \
  -d '{
    "platform": "n8n",
    "event_type": "execution.failed",
    "workflow_id": "wf_stripe_payout_sync",
    "execution_id": "exec_98741",
    "error_message": "401 Unauthorized: Invalid Stripe API secret key provided in header",
    "severity": "HIGH",
    "payload": {
      "node": "Stripe Balance Trigger",
      "attempt": 1
    }
  }' | jq
```

### 6. Verify Incident Creation & AI Diagnosis Trigger
Fetch the created incident ID and trigger real Gemini AI diagnosis:
```bash
# Get incident ID
INC_ID=$(curl -s http://localhost:8000/api/v1/incidents -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')

# Trigger Gemini AI Diagnosis
curl -X POST "http://localhost:8000/api/v1/incidents/$INC_ID/diagnose" \
  -H "Authorization: Bearer $TOKEN" | jq
```

Expected response containing structured Pydantic diagnosis:
```json
{
  "id": "diag_6f8b...",
  "incident_id": "...",
  "error_category": "AUTH_FAILURE",
  "severity": "CRITICAL",
  "root_cause": "Expired or malformed Stripe API credential in node configuration",
  "simple_explanation": "The payment sync workflow was rejected because the Stripe secret key is invalid.",
  "technical_explanation": "HTTP 401 Unauthorized returned by https://api.stripe.com/v1/balance.",
  "recommended_actions": [
    "Rotate Stripe API key in integration vault",
    "Verify webhook HMAC signature secret"
  ],
  "suggested_recovery": "Do not auto-retry financial transactions. Update credentials and request human approval.",
  "requires_human_approval": true,
  "confidence": 0.96,
  "is_ai_generated": true
}
```

---

## 7. Celery Background Worker Verification

Check that Celery workers and scheduler tasks are executing properly:

### Inspect Active Workers
```bash
docker compose exec api celery -A app.core.celery inspect active
```

### Inspect Scheduled Periodic Tasks (Celery Beat)
```bash
docker compose exec api celery -A app.core.celery inspect scheduled
```

### Stream Celery Worker Logs in VS Code Terminal
```bash
docker compose logs -f celery_worker
```
Verify that tasks like `tasks.health_check_workflows` and `tasks.process_failed_event` are logged without errors.

---

## 8. Executing Pytest Backend Tests Inside Container

Run the complete Python test suite in the API container:

```bash
docker compose exec api pytest -v /app/tests
```

Expected output:
```
============================= test session starts ==============================
rootdir: /app
plugins: asyncio-0.23.5, anyio-4.3.0
collected 10 items

tests/test_backend.py::test_password_hashing PASSED                      [ 10%]
tests/test_backend.py::test_jwt_token_flow PASSED                         [ 20%]
tests/test_backend.py::test_n8n_client_url_normalization PASSED           [ 30%]
tests/test_backend.py::test_n8n_headers PASSED                            [ 40%]
tests/test_tenancy.py::test_idempotency_key_consistency PASSED            [ 50%]
tests/test_tenancy.py::test_ai_diagnosis_schema_validation PASSED        [ 60%]
tests/test_api_complete.py::test_tenant_isolation_id_scoping PASSED      [ 70%]
tests/test_api_complete.py::test_argon2id_password_hashing PASSED        [ 80%]
tests/test_api_complete.py::test_webhook_hmac_signature_verification PASSED [ 90%]
tests/test_api_complete.py::test_financial_safety_gate_blocking PASSED   [100%]

============================== 10 passed in 1.42s ==============================
```

---

## 9. GitHub Copilot Interactive Debugging Prompts

Use the following prompts directly in **GitHub Copilot Chat** (`Ctrl+Alt+I` or `Cmd+Alt+I` in VS Code) for guided runtime inspection:

### Prompt 1: Verify Multi-Tenancy Scoping
> *"Inspect `backend/app/api/v1/incidents.py` and `backend/app/api/v1/workflows.py`. Confirm whether all SELECT queries include `where(Model.agency_id == current_tenant.agency_id)` to prevent cross-tenant data leakage. Explain how tenant identity is resolved from the JWT."*

### Prompt 2: Analyze AI Diagnosis Fallback
> *"Inspect `backend/app/services/ai_doctor.py`. If GEMINI_API_KEY is not set or network times out, how does the service fall back? Show the exact code path where deterministic fallback is returned and verify whether `is_ai_generated` is set to False."*

### Prompt 3: Audit Financial Safety Gate
> *"Review `backend/app/api/v1/recovery.py`. Identify the logic that checks `is_financial_or_destructive`. When a workflow contains keywords like 'charge', 'refund', or 'delete', explain what status is assigned and why human approval is required."*

### Prompt 4: Explain Idempotency Lock
> *"Look at `generate_idempotency_key` in `backend/app/api/v1/recovery.py`. Explain how the SHA-256 hash is computed using `incident_id`, `action`, and `retry_count`, and how PostgreSQL's unique constraint on `idempotency_key` prevents race conditions."*

---

## 10. Common Runtime Errors & Remediation

| Issue | Root Cause | Solution |
| :--- | :--- | :--- |
| **`ConnectionRefusedError: [Errno 111] Connection refused (postgres:5432)`** | PostgreSQL container is still initializing | Check `docker compose logs postgres`. Ensure `depends_on` has `condition: service_healthy`. |
| **`Gemini diagnosis failed: AI diagnosis request timed out`** | Missing or invalid `GEMINI_API_KEY` in `.env` | Ensure a valid Gemini API key is placed in `.env` and restart the API container: `docker compose restart api`. |
| **`401 Unauthorized` on `/api/v1/*`** | Missing `Authorization: Bearer <TOKEN>` header | Run signup or login first, copy token, and set header in client. |
| **`alembic: command not found` inside container** | Alembic path not in PATH | Execute using `python -m alembic upgrade head` or `docker compose exec api alembic upgrade head`. |
| **Port 3000 or 8000 already in use** | Another local dev process is occupying the port | Run `lsof -i :3000` or `netstat -ano \| findstr :3000` on Windows and terminate the conflicting process. |

---

## 11. Verification Checklist Before Handover

- [x] Docker Compose starts all 8 services cleanly with `docker compose up -d`.
- [x] Alembic migration `001_initial_schema` and `002_complete_schema` succeed with zero errors.
- [x] PostgreSQL schema contains all 20 tables with indexes and foreign keys.
- [x] Redis responds to `PING` on port 6379.
- [x] FastAPI `/health/ready` probe returns status `"ready"`.
- [x] Celery worker connects to Redis broker.
- [x] Gemini AI diagnosis returns structured Pydantic analysis with valid API key.
- [x] Next.js 15 App Router frontend connects to FastAPI through typed API client.
- [x] Multi-tenant isolation verified by unit and integration tests.
