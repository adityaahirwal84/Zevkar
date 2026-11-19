# ARCHITECTURE.md
## ZEVKAR.AI — ARCHITECTURE LOCK & SPECIFICATION

**Product Tagline**: Intelligence That Keeps Your Automations Running.  
**Official Domain**: https://zevkar.ai  
**Version**: 1.0.0-rc1  
**Status**: ARCHITECTURE LOCKED & SPECIFIED  

---

## 1. Architectural Confirmation & Stack Lock

The technology stack is strictly locked per Master Build Instructions. No prohibited technologies (Node.js backend in production, Express.js in production, Firebase, Supabase, MongoDB, Prisma, Drizzle, Mongoose, SQLite in production, mock authentication, or fake integrations) are permitted in the target architecture.

### Non-Negotiable Technology Matrix

| Layer | Locked Technology | Purpose & Governance |
| :--- | :--- | :--- |
| **Backend API** | Python 3.12+, FastAPI, Pydantic v2 | High-throughput asynchronous REST APIs, dependency injection, strict schema validation. |
| **Data Layer** | PostgreSQL 16+, SQLAlchemy 2.0 (asyncio), Alembic | ACID relational persistence, UUID primary keys, JSONB metadata, foreign keys, transaction rollbacks. |
| **Worker / Queue** | Redis 7+, Celery 5.4+, Celery Beat | Asynchronous webhook ingestion, distributed lock coordination, scheduled heartbeat evaluation, retries. |
| **AI Diagnosis** | Google Gemini API (`@google/genai` / `google-genai`) | Structured failure classification, root-cause derivation, and recovery recommendations. |
| **Frontend** | Next.js 15+ (App Router), React 19, TypeScript | Server-Side Rendering (SSR), TanStack Query v5, Tailwind CSS, shadcn/ui, Recharts. |
| **Observability** | Prometheus, Grafana, OpenTelemetry | Counter/gauge scraping (`/metrics`), latency histograms, alert rules, health checks. |
| **Testing** | Pytest, HTTPX AsyncClient, Playwright | Unit, integration, schema validation, and end-to-end browser workflows. |
| **Deployment** | Docker, Docker Compose | Containerized multi-service orchestration (frontend, backend, worker, beat, postgres, redis, prometheus, grafana). |

---

## 2. Implementation Roadmap (Phases 1 to 9)

```
[Phase 1: Foundation] ────► [Phase 2: Authentication] ────► [Phase 3: Core SaaS]
         │                            │                           │
         ▼                            ▼                           ▼
[Phase 4: Automation Mon.] ──► [Phase 5: AI Diagnosis] ───► [Phase 6: Recovery Engine]
         │                            │                           │
         ▼                            ▼                           ▼
[Phase 7: Observability] ──► [Phase 8: Business Mgmt] ───► [Phase 9: Production Hardening]
```

### Detailed Phase Milestones

1. **PHASE 1 — FOUNDATION**:
   - Monorepo directory structure (`frontend/`, `backend/`, `infrastructure/`).
   - FastAPI application factory, lifespan management, async database session pool (`asyncpg`).
   - Docker Compose definitions for 8 isolated services.
   - Comprehensive environment validation (`.env.example`).
2. **PHASE 2 — AUTHENTICATION & MULTI-TENANCY**:
   - Argon2id password hashing (`passlib[argon2]`).
   - Dual-token JWT architecture (Short-lived access token + rotating refresh token stored in PostgreSQL).
   - Organization tenancy boundaries (`organization_id` foreign keys enforced at repository query filters).
   - RBAC matrix: `SUPER_ADMIN`, `ORG_OWNER`, `ADMIN`, `DEVELOPER`, `VIEWER`.
3. **PHASE 3 — CORE SAAS & WORKFLOW MANAGEMENT**:
   - Workflows CRUD with integration binding, schedule frequency, and threshold alerts.
   - Execution log ingestion and normalization pipeline.
   - Incident state-machine lifecycle (`DETECTED` -> `INVESTIGATING` -> `DIAGNOSED` -> `AWAITING_APPROVAL` -> `RECOVERING` -> `RESOLVED` / `FAILED`).
4. **PHASE 4 — AUTOMATION MONITORING & WEBHOOK ENGINE**:
   - Webhook ingress endpoints with HMAC signature verification.
   - Redis-backed event deduplication and Celery ingestion queue.
   - Celery Beat scheduled jobs: 5-minute integration health probes, 1-minute stuck execution detection.
5. **PHASE 5 — GEMINI AI DIAGNOSIS ENGINE**:
   - Direct integration with Google Gemini 3.8 Flash using structured JSON schemas.
   - Pydantic response parsing: `AIDiagnosisSchema` validating category, severity, root cause, technical breakdown, and recovery requirements.
   - Deterministic rule fallback with explicit reason logging.
6. **PHASE 6 — RECOVERY & HUMAN APPROVAL ENGINE**:
   - Risk matrix evaluation: Low risk (auto-retry if allowed) vs. High/Critical (mandatory approval gate).
   - Idempotency key generation (`SHA256(incident_id + execution_id + attempt_count)`).
   - Execution retry dispatches via provider adapters with post-retry verification.
7. **PHASE 7 — OBSERVABILITY & TELEMETRY**:
   - Prometheus ASGI middleware collecting request rates, latency, active incidents, and recovery ratios.
   - Pre-configured Grafana dashboards and Prometheus alerting rules.
8. **PHASE 8 — BUSINESS & ADMINISTRATIVE FEATURES**:
   - In-app notification center and Celery email dispatchers.
   - Organization member invitation workflows.
   - Usage tracking, workflow quotas, and plan tier limits (`FREE`, `STARTER`, `GROWTH`, `ENTERPRISE`).
   - Tamper-evident operational audit logs.
9. **PHASE 9 — PRODUCTION HARDENING & VERIFICATION**:
   - Pytest unit and integration test suites.
   - End-to-end user scenario validation.
   - Healthcheck endpoints (`/healthz`, `/health/ready`, `/metrics`).

---

## 3. Project Directory Structure

```
zevkar/
├── frontend/                     # Next.js 15+ App Router application
│   ├── app/
│   │   ├── (auth)/               # Login, Signup, Forgot Password routes
│   │   ├── (dashboard)/          # Authenticated agency views
│   │   │   ├── overview/
│   │   │   ├── incidents/
│   │   │   ├── diagnosis/
│   │   │   ├── recovery/
│   │   │   ├── approvals/
│   │   │   ├── workflows/
│   │   │   ├── integrations/
│   │   │   ├── team/
│   │   │   ├── billing/
│   │   │   └── settings/
│   │   ├── layout.tsx
│   │   └── page.tsx              # Public SaaS landing page
│   ├── components/               # Atomic shadcn/ui components
│   ├── hooks/                    # TanStack Query & auth hooks
│   ├── lib/                      # API client, utilities, Zod schemas
│   ├── types/                    # Shared TypeScript interfaces
│   ├── Dockerfile
│   └── package.json
│
├── backend/                      # Python 3.12+ FastAPI backend
│   ├── app/
│   │   ├── api/
│   │   │   ├── deps.py           # Dependency injection (get_db, get_current_user, check_role)
│   │   │   └── v1/
│   │   │       ├── auth.py       # Authentication & JWT rotation
│   │   │       ├── users.py      # Profile & account settings
│   │   │       ├── orgs.py       # Multi-tenant organization CRUD
│   │   │       ├── workflows.py  # Automation pipeline management
│   │   │       ├── integrations.py # Provider credentials & connection probes
│   │   │       ├── webhooks.py   # Inbound failure webhook listener
│   │   │       ├── incidents.py  # Incident tracking lifecycle
│   │   │       ├── diagnosis.py  # Gemini root-cause trigger
│   │   │       ├── recovery.py   # Safe retry dispatcher
│   │   │       ├── approvals.py  # Human authorization gates
│   │   │       ├── metrics.py    # Analytics overview
│   │   │       ├── notifications.py # Notification queries & mark-read
│   │   │       ├── audit.py      # Audit trail inspection
│   │   │       └── admin.py      # Platform super-admin endpoints
│   │   ├── core/
│   │   │   ├── config.py         # Pydantic BaseSettings (.env loading & validation)
│   │   │   ├── database.py       # SQLAlchemy 2.0 AsyncEngine & sessionmaker
│   │   │   └── security.py       # Argon2id hashing, JWT encode/decode, AES secret cipher
│   │   ├── models/
│   │   │   └── entities.py       # 20 normalized SQLAlchemy ORM models
│   │   ├── schemas/
│   │   │   └── pydantic_models.py # Comprehensive request/response validation schemas
│   │   ├── repositories/         # Tenant-scoped database query repositories
│   │   ├── services/             # Domain logic (tenant isolation, health scoring)
│   │   ├── integrations/
│   │   │   ├── base.py           # BaseIntegrationAdapter abstract interface
│   │   │   ├── n8n.py            # Official n8n v1 API adapter
│   │   │   ├── zapier.py         # Zapier webhook ingestion adapter
│   │   │   ├── make.py           # Make.com (Integromat) API adapter
│   │   │   └── custom.py         # Custom Python / FastAPI script adapter
│   │   ├── ai/
│   │   │   └── gemini_engine.py  # Gemini 3.8 Flash client with JSON schema enforcement
│   │   ├── recovery/
│   │   │   └── engine.py         # Safety gate evaluator & idempotency generator
│   │   ├── workers/
│   │   │   └── celery_app.py     # Celery app, Beat schedules, and task handlers
│   │   └── main.py               # FastAPI application entrypoint
│   ├── migrations/               # Alembic database migration scripts
│   │   ├── versions/
│   │   ├── env.py
│   │   └── alembic.ini
│   ├── tests/                    # Pytest test suite
│   │   ├── conftest.py
│   │   ├── test_auth.py
│   │   ├── test_tenancy.py
│   │   ├── test_workflows.py
│   │   ├── test_engine.py
│   │   └── test_integrations.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── infrastructure/               # Production observability configurations
│   ├── prometheus/
│   │   ├── prometheus.yml
│   │   └── alerts.yml
│   └── grafana/
│       ├── provisioning/
│       └── dashboards/
│
├── docker-compose.yml            # 8-service production orchestrator
├── .env.example                  # Exhaustive environment variable specification
├── README.md
└── ARCHITECTURE.md
```

---

## 4. Database Schema (PostgreSQL 16+ Relational Architecture)

All entities utilize RFC 4122 UUID primary keys (`String(36)` or `UUID`), indexed foreign keys with referential actions (`CASCADE` / `SET NULL`), ISO 8601 UTC timestamps, and JSONB fields for dynamic diagnostic metadata.

```
+--------------------+       +--------------------+       +--------------------+
|   organizations    |1     *|       users        |1     *| organization_members|
|--------------------|<----->|--------------------|<----->|--------------------|
| id (UUID PK)       |       | id (UUID PK)       |       | id (UUID PK)       |
| name               |       | email (UNIQUE)     |       | org_id (FK)        |
| slug (UNIQUE)      |       | password_hash      |       | user_id (FK)       |
| tier (ENUM)        |       | is_active          |       | role (ENUM)        |
+--------------------+       +--------------------+       +--------------------+
         | 1                                                         |
         | *                                                         |
+--------------------+       +--------------------+       +--------------------+
|    integrations    |1     *|     workflows      |1     *|     incidents      |
|--------------------|<----->|--------------------|<----->|--------------------|
| id (UUID PK)       |       | id (UUID PK)       |       | id (UUID PK)       |
| org_id (FK)        |       | org_id (FK)        |       | org_id (FK)        |
| platform (ENUM)    |       | integration_id(FK) |       | workflow_id (FK)   |
| credentials (ENCR) |       | health_status      |       | status (ENUM)      |
+--------------------+       +--------------------+       | severity (ENUM)    |
                                                                 +--------------------+
                                                                           | 1
                                                                           | 1
                                                                 +--------------------+
                                                                 |    ai_diagnoses    |
                                                                 |--------------------|
                                                                 | id (UUID PK)       |
                                                                 | incident_id (FK)   |
                                                                 | error_category     |
                                                                 | root_cause         |
                                                                 | technical_details  |
                                                                 | recommended_actions|
                                                                 +--------------------+
                                                                           | 1
                                                                           | *
                                                                 +--------------------+
                                                                 | recovery_attempts  |
                                                                 |--------------------|
                                                                 | id (UUID PK)       |
                                                                 | incident_id (FK)   |
                                                                 | action (ENUM)      |
                                                                 | status (ENUM)      |
                                                                 | idempotency_key    |
                                                                 +--------------------+
```

### Complete List of Required Entities (20 Models)
1. `users`: Credentials, status, and verification metadata.
2. `organizations`: Tenant customer container.
3. `organization_members`: User-to-organization join table with role-based permissions.
4. `invitations`: Pending tenant invitations with cryptographic tokens and expiry.
5. `refresh_tokens`: Stored rotating refresh tokens for secure JWT re-issuance.
6. `sessions`: Active user browser sessions and security metadata.
7. `workflows`: Monitored automation processes with schedule and threshold policies.
8. `integrations`: Connected automation platforms (`n8n`, `Zapier`, `Make`, `custom`).
9. `integration_credentials`: AES-256 encrypted access tokens, base URLs, and webhook keys.
10. `webhook_events`: Durable event log of inbound failure payloads with signature audit.
11. `executions`: Individual automation run telemetry records.
12. `incidents`: Problem records with status lifecycle and occurrence counters.
13. `ai_diagnoses`: Structured Gemini root-cause analyses and technical breakdowns.
14. `recovery_attempts`: Executed retries, actions taken, and verified status.
15. `recovery_approvals`: Human-in-the-loop authorization gates for financial/sensitive flows.
16. `notifications`: In-app notification queue.
17. `notification_preferences`: Per-user email and webhook dispatch rules.
18. `audit_logs`: Immutable, append-only operational event trail.
19. `subscription_plans`: Plan definitions (`FREE`, `STARTER`, `GROWTH`, `ENTERPRISE`).
20. `usage_records`: Monthly tracked workflow and diagnostic token quotas.

---

## 5. API Contracts (REST v1 Specifications)

All API endpoints reside under `/api/v1` and strictly validate requests and responses against Pydantic models.

### Core Endpoints

| Method | Endpoint | Description | Auth & Permission |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/signup` | Register user & organization | Public |
| `POST` | `/api/v1/auth/login` | Authenticate user, issue access token & refresh cookie | Public |
| `POST` | `/api/v1/auth/refresh` | Rotate refresh token, issue fresh access token | Public (Cookie) |
| `GET` | `/api/v1/auth/me` | Fetch active user profile, tenant, and role permissions | Authenticated |
| `GET` | `/api/v1/analytics/overview` | Live operational dashboard statistics | Authenticated |
| `GET` | `/api/v1/workflows` | List all monitored workflows for tenant | Authenticated |
| `POST` | `/api/v1/workflows` | Register a new monitored workflow | Org Admin+ |
| `GET` | `/api/v1/integrations` | List configured integration adapters | Authenticated |
| `POST` | `/api/v1/integrations/test` | Live connection probe against provider API | Org Admin+ |
| `POST` | `/api/v1/webhooks/listener` | Ingestion endpoint for automated failure webhooks | HMAC / Token Auth |
| `GET` | `/api/v1/incidents` | List active & historic automation incidents | Authenticated |
| `POST` | `/api/v1/diagnosis/analyze` | Trigger Gemini 3.8 Flash structured root-cause analysis | Authenticated |
| `POST` | `/api/v1/recovery/execute` | Dispatch verified recovery action | Developer+ (Gate Check) |
| `GET` | `/api/v1/approvals` | List pending human approval requests | Authenticated |
| `POST` | `/api/v1/approvals/{id}/respond` | Approve or reject a quarantined recovery operation | Org Admin+ |
| `GET` | `/healthz` | Liveness healthcheck | Public |
| `GET` | `/health/ready` | Readiness check (validates PostgreSQL & Redis connectivity)| Public |
| `GET` | `/metrics` | Prometheus metrics scrape endpoint | Protected |

---

## 6. Integration Adapter Architecture

Each provider communicates through an abstract base class (`BaseIntegrationAdapter`):

```python
class BaseIntegrationAdapter(ABC):
    @abstractmethod
    async def validate_credentials(self) -> Dict[str, Any]:
        """Probes remote API to verify credentials, permissions, and network availability."""
        pass

    @abstractmethod
    async def fetch_workflows(self) -> List[Dict[str, Any]]:
        """Retrieves list of active workflows from the platform."""
        pass

    @abstractmethod
    async def fetch_executions(self, workflow_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Fetches execution logs for diagnosis."""
        pass

    @abstractmethod
    async def retry_execution(self, execution_id: str) -> Dict[str, Any]:
        """Triggers execution retry where supported by the provider API."""
        pass

    @abstractmethod
    def normalize_error(self, raw_payload: Dict[str, Any]) -> NormalizedError:
        """Parses vendor-specific error payloads into standardized failure objects."""
        pass
```

- **n8n**: Connects to official n8n v1 REST API (`/api/v1/workflows`, `/api/v1/executions/{id}/retry`) using `X-N8N-API-KEY`.
- **Make.com**: Connects to Make API v2 using scoped API tokens.
- **Zapier**: Processes incoming error webhooks using signature validation.
- **Custom Python / Node**: Webhook ingestion with shared bearer token authorization.

---

## 7. Celery Task Architecture

Background workers consume from Redis queues with explicit rate limits, exponential backoff, and late acknowledgement:

1. `tasks.process_webhook_event`: Ingests raw failure event, normalizes payload, generates incident record, and schedules AI diagnosis.
2. `tasks.execute_gemini_diagnosis`: Calls Gemini 3.8 Flash asynchronously to diagnose incidents without blocking HTTP API request threads.
3. `tasks.execute_workflow_retry`: Dispatches recovery attempts to provider adapters, evaluates idempotency keys, and verifies upstream execution status.
4. `tasks.send_email_notification`: Asynchronous notification dispatch via SMTP/SendGrid.
5. `tasks.sync_active_integrations` (Beat: Every 5 minutes): Health checks all connected n8n and Make instances.
6. `tasks.detect_stuck_executions` (Beat: Every 1 minute): Identifies workflows that exceeded duration thresholds or missed expected heartbeats.

---

## 8. Security & Multi-Tenant Isolation Strategy

1. **Tenant Isolation**:
   - Every tenant-scoped query in SQLAlchemy incorporates `filter(Model.organization_id == current_user.org_id)`.
   - Never trust `org_id` supplied in request bodies or query parameters. The authenticated user's token determines tenant scope.
2. **Password Security**:
   - Passwords hashed using Argon2id (`time_cost=3`, `memory_cost=65536`, `parallelism=4`).
3. **Token Management**:
   - Access tokens: 15-minute lifetime, signed with HMAC-SHA256.
   - Refresh tokens: 7-day lifetime, stored in PostgreSQL, rotated upon every refresh call.
4. **Credential Encryption**:
   - Third-party API keys and integration secrets encrypted at rest in PostgreSQL using AES-256-GCM.
5. **Human Authorization Gates**:
   - Workflows involving payments (Stripe/PayPal), customer notifications, or non-idempotent database mutations are quarantined until an Admin approves the recovery plan.

---

## 9. Current Environment Status & Verification Mapping

Per Master Build Instructions:
- Features with real logic and executed unit tests are marked **IMPLEMENTED — VERIFIED**.
- Features implemented via complete source code awaiting external services are marked **IMPLEMENTED — NOT VERIFIED**.
- Interactive development/demo features operating in memory are marked **MOCK / DEMO ONLY**.
- Features requiring live third-party keys are marked **WAITING FOR CREDENTIALS**.

### Status Ledger
- **Deterministic Diagnostic Engine**: IMPLEMENTED — VERIFIED (7/7 tests passing)
- **Vite HMR Reverse-Proxy Fix**: IMPLEMENTED — VERIFIED (0 console errors in Playwright)
- **Production Safety Guard**: IMPLEMENTED — VERIFIED (Halts safely on missing infrastructure)
- **Python FastAPI Backend Source**: IMPLEMENTED — NOT VERIFIED (Full source tree in `backend/`, pending Docker/Python runtime)
- **PostgreSQL Database Persistence**: IMPLEMENTED — NOT VERIFIED (SQLAlchemy models & migrations defined in `backend/`, pending live DB)
- **Redis & Celery Workers**: IMPLEMENTED — NOT VERIFIED (Worker definitions in `backend/app/workers/`, pending Redis broker)
- **Gemini AI Diagnosis**: WAITING FOR CREDENTIALS / IMPLEMENTED — VERIFIED FALLBACK (Fallback engine active when Gemini quota/credentials are throttled)
