from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import make_asgi_app
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
import sentry_sdk

from app.core.config import settings
from app.core.database import engine, get_db
from app.api.deps import get_current_tenant_member
from app.api.v1 import (
    auth, orgs, clients, workflows, integrations, webhooks,
    incidents, diagnosis, recovery, approvals, notifications, audit, billing, admin, contact, alerts_sla, control_center
)
from app.models.entities import (
    AgencyMember,
    ApprovalRequest,
    Client,
    Execution,
    Incident,
    Integration,
    RecoveryAttempt,
    RecoveryRequest,
    Workflow,
)
from app.services.alert_delivery import compute_real_mttr_minutes

if settings.SENTRY_DSN:
    sentry_sdk.init(dsn=settings.SENTRY_DSN, environment=settings.ENVIRONMENT)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Zevkar AI — Workflow Monitoring, AI Diagnosis, and Safe Recovery Platform (FastAPI Backend)",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Prometheus Metrics
if settings.ENABLE_PROMETHEUS:
    metrics_app = make_asgi_app()
    app.mount("/metrics", metrics_app)

# Include v1 Routers
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(orgs.router, prefix=settings.API_V1_STR)
app.include_router(orgs.orgs_compat_router, prefix=settings.API_V1_STR)
app.include_router(clients.router, prefix=settings.API_V1_STR)
app.include_router(workflows.router, prefix=settings.API_V1_STR)
app.include_router(integrations.router, prefix=settings.API_V1_STR)
app.include_router(webhooks.router, prefix=settings.API_V1_STR)
app.include_router(incidents.router, prefix=settings.API_V1_STR)
app.include_router(diagnosis.router, prefix=settings.API_V1_STR)
app.include_router(recovery.router, prefix=settings.API_V1_STR)
app.include_router(approvals.router, prefix=settings.API_V1_STR)
app.include_router(notifications.router, prefix=settings.API_V1_STR)
app.include_router(audit.router, prefix=settings.API_V1_STR)
app.include_router(billing.router, prefix=settings.API_V1_STR)
app.include_router(admin.router, prefix=settings.API_V1_STR)
app.include_router(contact.router, prefix=settings.API_V1_STR)
app.include_router(alerts_sla.router, prefix=settings.API_V1_STR)
app.include_router(control_center.router, prefix=settings.API_V1_STR)

app.add_api_route(
    f"{settings.API_V1_STR}/pricing",
    billing.get_plans,
    methods=["GET"],
    tags=["Billing & Subscriptions"],
)
app.add_api_route(
    f"{settings.API_V1_STR}/audit",
    audit.list_audit_logs,
    methods=["GET"],
    tags=["Audit Logs"],
)

@app.get("/healthz", tags=["System"])
async def healthz():
    return {
        "status": "healthy",
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "framework": "FastAPI (Python 3.12+)",
    }

@app.get("/health/ready", tags=["System"])
async def health_ready():
    db_connected = False
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
            db_connected = True
    except Exception:
        db_connected = False

    return {
        "status": "ready" if db_connected else "degraded",
        "database": "connected" if db_connected else "disconnected",
        "environment": settings.ENVIRONMENT,
    }


@app.get(f"{settings.API_V1_STR}/analytics/overview", tags=["Analytics"], include_in_schema=True)
async def get_tenant_overview(
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    since_24h = datetime.now(timezone.utc) - timedelta(hours=24)
    agency_id = member.agency_id

    total_clients = (
        await db.execute(select(func.count(Client.id)).where(Client.agency_id == agency_id))
    ).scalar_one() or 0
    total_integrations = (
        await db.execute(select(func.count(Integration.id)).where(Integration.agency_id == agency_id))
    ).scalar_one() or 0
    total_workflows = (
        await db.execute(select(func.count(Workflow.id)).where(Workflow.agency_id == agency_id))
    ).scalar_one() or 0
    successful_24h = (
        await db.execute(
            select(func.count(Execution.id))
            .join(Workflow, Execution.workflow_id == Workflow.id)
            .where(
                Workflow.agency_id == agency_id,
                Execution.status == "SUCCESS",
                Execution.started_at >= since_24h,
            )
        )
    ).scalar_one() or 0
    failed_24h = (
        await db.execute(
            select(func.count(Execution.id))
            .join(Workflow, Execution.workflow_id == Workflow.id)
            .where(
                Workflow.agency_id == agency_id,
                Execution.status.in_(("FAILED", "TIMED_OUT")),
                Execution.started_at >= since_24h,
            )
        )
    ).scalar_one() or 0
    active_incidents = (
        await db.execute(
            select(func.count(Incident.id)).where(
                Incident.agency_id == agency_id,
                Incident.status.notin_(("RESOLVED", "IGNORED", "DISMISSED")),
            )
        )
    ).scalar_one() or 0
    pending_approvals = (
        await db.execute(
            select(func.count(ApprovalRequest.id))
            .join(Incident, ApprovalRequest.incident_id == Incident.id)
            .where(
                Incident.agency_id == agency_id,
                ApprovalRequest.status == "PENDING",
            )
        )
    ).scalar_one() or 0
    total_recoveries = (
        await db.execute(
            select(func.count(RecoveryAttempt.id))
            .join(Incident, RecoveryAttempt.incident_id == Incident.id)
            .where(Incident.agency_id == agency_id)
        )
    ).scalar_one() or 0
    successful_recoveries = (
        await db.execute(
            select(func.count(RecoveryAttempt.id))
            .join(Incident, RecoveryAttempt.incident_id == Incident.id)
            .where(Incident.agency_id == agency_id, RecoveryAttempt.status == "SUCCESS")
        )
    ).scalar_one() or 0

    agency_incidents = (
        await db.execute(select(Incident).where(Incident.agency_id == agency_id))
    ).scalars().all()
    agency_attempts = (
        await db.execute(
            select(RecoveryAttempt)
            .join(Incident, RecoveryAttempt.incident_id == Incident.id)
            .where(Incident.agency_id == agency_id)
        )
    ).scalars().all()
    agency_requests = (
        await db.execute(select(RecoveryRequest).where(RecoveryRequest.agency_id == agency_id))
    ).scalars().all()
    real_mttr = compute_real_mttr_minutes(agency_incidents, agency_attempts, recovery_requests=agency_requests)

    total_execs = successful_24h + failed_24h
    wf_rate = round((successful_24h / total_execs) * 100, 1) if total_execs > 0 else 100.0
    rec_rate = round((successful_recoveries / total_recoveries) * 100, 1) if total_recoveries > 0 else 100.0
    health_score = max(0, min(100, round(wf_rate - min(30, active_incidents * 8))))

    return {
        "totalClients": total_clients,
        "totalIntegrations": total_integrations,
        "totalWorkflows": total_workflows,
        "successfulExecutions24h": successful_24h,
        "failedExecutions24h": failed_24h,
        "activeIncidentsCount": active_incidents,
        "pendingApprovalsCount": pending_approvals,
        "recoverySuccessRate": rec_rate,
        "workflowSuccessRate": wf_rate,
        "overallHealthScore": health_score,
        "meanTimeToRecoveryMinutes": real_mttr,
        "estimatedRevenueAtRisk": active_incidents * 2500,
    }
