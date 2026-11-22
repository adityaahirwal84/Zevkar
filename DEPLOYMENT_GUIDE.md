# DEPLOYMENT GUIDE
## Zevkar.ai — Production Multi-Container Orchestration

---

## 1. Quick Start via Docker Compose

To start the complete 8-service production stack:

```bash
# 1. Clone repository
git clone https://github.com/agency/ai-automation-doctor.git
cd ai-automation-doctor

# 2. Configure environment
cp .env.example .env
# Edit .env and supply your GEMINI_API_KEY and SECRET_KEY

# 3. Start all services in detached mode
docker compose up -d --build

# 4. Run database migrations
docker compose exec api alembic upgrade head

# 5. Access services
# Frontend: http://localhost:3000
# FastAPI Docs: http://localhost:8000/api/v1/docs
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3001 (admin / admin)
```

---

## 2. Container Topology

1. `frontend`: root Vite + React production bundle served by Nginx on port 3000. Nginx proxies `/api/`, `/healthz`, `/health/ready`, and `/metrics` to FastAPI using `BACKEND_URL` (default: `http://api:8000`). The separate Next.js app under `frontend/` is retained as a backup and is not used by Compose.
2. `api`: Python 3.12+ FastAPI backend running via Uvicorn on port 8000.
3. `celery_worker`: Celery task worker consuming from Redis queue.
4. `celery_beat`: Celery Beat scheduler executing 5-min integration sync & 1-min stuck run detector.
5. `postgres`: PostgreSQL 16 Alpine with persistent volume `postgres_data`.
6. `redis`: Redis 7 Alpine with persistent volume `redis_data`.
7. `prometheus`: Prometheus v2.50.0 collecting `/metrics` every 15 seconds.
8. `grafana`: Grafana 10.3.3 visualizing API latency, health scores, and queue backlogs.
