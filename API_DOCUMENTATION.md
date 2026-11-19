# API DOCUMENTATION
## Zevkar.ai — Production REST API Specification

Base URL: `/api/v1`  
Protocol: HTTPS / JSON  
Authentication: Bearer JWT Token (`Authorization: Bearer <token>`)

---

## 1. Authentication (`/auth`)

### `POST /api/v1/auth/signup`
Creates a new tenant agency, organization owner user account, and issues access JWT token.
- **Request Body**:
  ```json
  {
    "email": "owner@agency.com",
    "name": "Jane Doe",
    "password": "SecurePassword123!",
    "agency_name": "Apex Automations"
  }
  ```
- **Response** (`201 Created`):
  ```json
  {
    "access_token": "eyJhbGciOiJIUzI1NiIsIn...",
    "token_type": "bearer",
    "user": {
      "id": "usr_9981",
      "email": "owner@agency.com",
      "name": "Jane Doe",
      "is_active": true,
      "created_at": "2026-11-02T12:00:00Z"
    }
  }
  ```

### `POST /api/v1/auth/login`
Authenticates credentials against Argon2id hashed password and returns session token.
- **Request Body**: `{"email": "owner@agency.com", "password": "SecurePassword123!"}`
- **Response** (`200 OK`): Token payload.

### `POST /api/v1/auth/refresh`
Rotates access token using valid refresh token.
- **Request Body**: `{"refresh_token": "..."}`
- **Response** (`200 OK`): New access token payload.

### `GET /api/v1/auth/me`
Retrieves authenticated user profile, organization metadata, and role permissions.

---

## 2. Multi-Tenant Organizations (`/organizations`)

### `GET /api/v1/organizations`
Lists organizations associated with current user account.

### `POST /api/v1/organizations`
Creates a new isolated organization. Requires authenticated session.

### `GET /api/v1/organizations/{id}/members`
Lists active and invited members of organization. Tenant-scoped.

### `POST /api/v1/organizations/{id}/members/invite`
Invites member with specified role (`OWNER`, `ADMIN`, `MEMBER`, `DEVELOPER`, `VIEWER`).

---

## 3. Workflows (`/workflows`)

### `GET /api/v1/workflows`
Lists all monitored workflows owned by the caller's organization.

### `POST /api/v1/workflows`
Registers a new monitored workflow.
- **Request Body**:
  ```json
  {
    "name": "Stripe NetSuite Sync",
    "platform": "n8n",
    "external_workflow_id": "flow_88124",
    "client_id": "cli_1"
  }
  ```

### `DELETE /api/v1/workflows/{id}`
Deletes workflow with cascade cleanup.

---

## 4. Integrations (`/integrations`)

### `GET /api/v1/integrations`
Lists connected automation instances (`n8n`, `Make`, `Zapier`, `custom`).

### `POST /api/v1/integrations/test`
Dispatches live connection probe to provider API.
- **Request Body**:
  ```json
  {
    "platform": "n8n",
    "instance_url": "https://n8n.internal.agency/api/v1",
    "api_key": "n8n_api_key_..."
  }
  ```

---

## 5. Webhooks (`/webhooks`)

### `POST /api/v1/webhooks/listener`
Public high-throughput webhook ingress endpoint for incoming execution error payloads.
- **Headers**: `X-Webhook-Signature` (HMAC verification)
- **Features**: Deduplication via SHA-256 payload hashing, durable event persistence, automatic incident creation.

---

## 6. Incidents (`/incidents`)

### `GET /api/v1/incidents`
Lists incidents for tenant. Supports `status_filter` (`OPEN`, `INVESTIGATING`, `AWAITING_APPROVAL`, `RECOVERING`, `RESOLVED`, `DISMISSED`).

### `GET /api/v1/incidents/{id}`
Full incident payload with attached `ai_diagnosis` and historic `recovery_attempts`.

---

## 7. AI Diagnosis (`/diagnosis`)

### `POST /api/v1/diagnosis/analyze`
Triggers Gemini 3.8 Flash structured root-cause analysis.
- **Request Body**: `{"incident_id": "inc_8041"}`
- **Response**: Full structured JSON adherence to `AIDiagnosisSchema` (error category, severity, root cause, client explanation, technical breakdown, remediation steps, and recovery method).
- **Fallback Behavior**: Transparently logs `fallbackReason` and provides deterministic diagnostic classification if external AI quota or credentials are restricted.

---

## 8. Recovery & Approvals (`/recovery`, `/approvals`)

### `POST /api/v1/recovery/execute`
Executes safe recovery attempt.
- **Request Body**: `{"incident_id": "inc_8041", "action": "MANUAL_RETRY", "bypass_approval": false}`
- **Safety Gate**: Rejects with `403 Forbidden` if human approval is required and unfulfilled.
- **Idempotency**: Prevents duplicate executions using `SHA-256(incident_id + action + occurrence)`.

### `GET /api/v1/approvals`
Lists pending quarantined recovery operations awaiting admin sign-off.

### `POST /api/v1/approvals/{id}/respond`
Authorizes or rejects recovery plan.
- **Request Body**: `{"decision": "APPROVE" | "REJECT", "rejection_reason": "..."}`
