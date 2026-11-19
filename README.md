# Zevkar.ai

> **"Intelligence That Keeps Your Automations Running."**  
> AI-Powered Automation Intelligence Platform — autonomous incident detection, Gemini AI root-cause diagnosis, human-in-the-loop safety gates, and idempotent self-healing recovery across n8n, Make, Zapier, and custom automation workflows (`https://zevkar.ai`).

---

## 1. Executive Summary

Zevkar addresses the multi-client reliability challenge faced by AI automation consultants, agencies, and engineering teams. When client automations break, businesses suffer lost leads, missed notifications, duplicated orders, and revenue loss.

Zevkar acts as an autonomous automation intelligence platform that:
1. **Detects** failed, delayed, stuck, and anomalous executions in real-time.
2. **Diagnoses** the technical root cause using Google Gemini AI (`gemini-2.5-flash` / `gemini-3.8-flash`) and provides dual explanations:
   - *Technical Engineering Details* (HTTP error codes, database locks, schema conflicts).
   - *Client-Friendly Non-Technical Summary* (safe to share directly in client Slack or email reports).
3. **Quarantines & Approves** risky operations via a **Human-in-the-Loop Approval Gate** (protecting Stripe charges, email blasts, and DB writes).
4. **Recovers** workflows idempotently with SHA-256 deduplication locks, exponential backoff, and circuit breakers.
5. **Aggregates** fleet-wide health scores, MTTR (Mean Time to Recovery), and transaction revenue at risk.

---

## 2. Locked Architecture & Tech Stack

| Layer | Technology | Version | Key Components |
| :--- | :--- | :--- | :--- |
| **Frontend** | Next.js App Router | 15.2+ | React 19, TypeScript, Tailwind CSS, TanStack Query, Recharts, Lucide |
| **Backend** | Python & FastAPI | 3.12+ | Pydantic v2, SQLAlchemy 2.0 Async, Uvicorn, HTTPX |
| **Database** | PostgreSQL | 16+ | 20 Relational Entities, Multi-Tenant Segregation, Alembic Migrations |
| **Queue / Cache** | Redis & Celery | 7+ | Celery Worker & Beat scheduler for background health probes |
| **Artificial Intelligence** | Google Gemini API | Modern SDK | Pydantic JSON schema output validation, backend-only key access |
| **Monitoring** | Prometheus & Grafana | v2.50+ / 10.3+ | Real-time metrics scrape and system observability dashboards |
| **Infrastructure** | Docker & Docker Compose | v2.24+ | 8-service orchestration (`docker-compose.yml`) |

---

## 3. Repository Structure

```
├── .env.example                     # Exhaustive environment variable matrix
├── docker-compose.yml               # 8-service production orchestration
├── Dockerfile.frontend              # Multi-stage Next.js 15 standalone build
├── VSCODE_RUNTIME_TEST_PLAN.md      # Step-by-step local VS Code & Copilot runbook
├── ARCHITECTURE.md                  # Comprehensive architectural specification
├── IMPLEMENTATION_STATUS.md         # Full audit ledger across all 20 modules
├── API_DOCUMENTATION.md             # REST API contracts for all 13 v1 routers
├── DATABASE_SCHEMA.md               # 20-entity relational mapping & indexes
├── INTEGRATION_GUIDE.md             # Official adapter guides for n8n, Make, Zapier
├── ENVIRONMENT_SETUP.md             # Environment mode & variable matrix
├── DEPLOYMENT_GUIDE.md              # Production container deployment guide
├── SECURITY.md                      # Multi-tenant isolation & cryptographic safety
├── TESTING_GUIDE.md                 # Test strategy, unit, integration & e2e
├── TROUBLESHOOTING.md               # Runtime failure triage & runbooks
├── backend/                         # Production Python FastAPI Backend
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── migrations/                  # Alembic Migrations
│   │   └── versions/
│   │       ├── 001_initial_schema.py    # Tables 1-10 (Agencies, Users, Workflows, Incidents, etc.)
│   │       └── 002_complete_schema.py   # Tables 11-20 (Executions, Tokens, Sessions, Plans, etc.)
│   ├── app/
│   │   ├── main.py                  # FastAPI application with all 13 routers mounted
│   │   ├── core/                    # Security, database, Celery, and config
│   │   ├── models/                  # SQLAlchemy 2.0 entities (all 20 models)
│   │   ├── schemas/                 # Pydantic v2 request & response schemas
│   │   ├── api/v1/                  # 13 REST API Routers
│   │   ├── integrations/            # Provider adapters (n8n, Make, Zapier)
│   │   └── services/                # Gemini AI diagnosis service & classifier
│   └── tests/                       # Pytest test suite (10 unit & tenancy tests)
├── frontend/                        # Production Next.js 15+ App Router Frontend
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── lib/api-client.ts            # Typed FastAPI client for all 13 domains
│   └── app/                         # App Router layout, pages & dashboards
├── src/                             # AI Studio preview React application
│   ├── lib/doctor-engine.ts         # Pure algorithmic reliability engine
│   └── lib/doctor-engine.test.ts    # 7 passing unit tests (Node test runner)
└── server.ts                        # Development preview server on port 3000
```

---

## 4. Quick Start: VS Code & Docker Desktop

### 1. Launch Stack
```bash
docker compose up -d --build
```

### 2. Apply Alembic Migrations (All 20 Tables)
```bash
docker compose exec api alembic upgrade head
```

### 3. Verify Health & Open Applications
- **Frontend App**: `http://localhost:3000`
- **FastAPI OpenAPI Docs**: `http://localhost:8000/docs`
- **Prometheus**: `http://localhost:9090`
- **Grafana**: `http://localhost:3001` (admin / admin)

### 4. Run Pytest Suite
```bash
docker compose exec api pytest -v /app/tests
```

For complete runtime testing, seed data loading, and interactive GitHub Copilot prompts, see **[VSCODE_RUNTIME_TEST_PLAN.md](./VSCODE_RUNTIME_TEST_PLAN.md)**.
