import hashlib
import hmac
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decrypt_secret
from app.lib.classifier import classify_error, is_financial_or_destructive
from app.models.entities import Execution, Incident, Integration, Notification, WebhookEvent, Workflow
from app.services.alert_delivery import dispatch_lifecycle_alerts
from app.services.n8n_sync import run_diagnosis_for_incident

logger = logging.getLogger("webhooks_router")

router = APIRouter(prefix="/webhooks", tags=["Webhook Ingestion"])


class WebhookPayload(BaseModel):
    workflow_id: Optional[str] = None
    workflow_name: Optional[str] = "External Automation Pipeline"
    client_name: Optional[str] = "External Client"
    platform: Optional[str] = "n8n"
    execution_id: Optional[str] = None
    status: Optional[str] = None
    error: Optional[str] = None
    integration_id: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None


def verify_signature(raw_body: bytes, signature: Optional[str], secret: Optional[str]) -> bool:
    """Timing-safe HMAC SHA-256 signature verification (supports optional 'sha256=' prefix)."""
    if not signature or not secret:
        return False
    cleaned_sig = signature.strip()
    if cleaned_sig.startswith("sha256="):
        cleaned_sig = cleaned_sig[7:]
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, cleaned_sig)


@router.post("/listener", status_code=status.HTTP_201_CREATED)
async def ingest_webhook_listener(
    body: WebhookPayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_webhook_signature: Optional[str] = Header(None),
):
    raw_body_bytes = await request.body()
    event_hash = hashlib.sha256(raw_body_bytes).hexdigest()

    # 1. Duplicate webhook idempotency check
    existing = await db.execute(select(WebhookEvent).where(WebhookEvent.idempotency_key == event_hash))
    if existing.scalar_one_or_none():
        return {"status": "DUPLICATE_EVENT_IGNORED", "idempotency_key": event_hash}

    # 2. Locate workflow & integration (tenant isolation)
    wf: Optional[Workflow] = None
    if body.workflow_id:
        wf_res = await db.execute(
            select(Workflow).where(
                (Workflow.id == body.workflow_id) | (Workflow.external_workflow_id == body.workflow_id)
            )
        )
        wf = wf_res.scalar_one_or_none()

    integ: Optional[Integration] = None
    if body.integration_id:
        integ = (await db.execute(select(Integration).where(Integration.id == body.integration_id))).scalar_one_or_none()
    elif wf and wf.integration_id:
        integ = (await db.execute(select(Integration).where(Integration.id == wf.integration_id))).scalar_one_or_none()

    # 3. Verify HMAC signature if a signing secret is configured
    configured_secret = None
    if integ and integ.webhook_secret_encrypted:
        configured_secret = decrypt_secret(integ.webhook_secret_encrypted)
    elif settings.WEBHOOK_SIGNING_SECRET:
        configured_secret = settings.WEBHOOK_SIGNING_SECRET

    sig_verified = False
    if configured_secret:
        if not verify_signature(raw_body_bytes, x_webhook_signature, configured_secret):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook HMAC signature")
        sig_verified = True
    else:
        sig_verified = bool(x_webhook_signature)

    now_utc = datetime.now(timezone.utc)
    agency_id = wf.agency_id if wf else (integ.agency_id if integ else None)

    event_record = WebhookEvent(
        agency_id=agency_id,
        integration_id=integ.id if integ else None,
        platform=body.platform or "n8n",
        event_type="EXECUTION_FAILED" if body.error else "EXECUTION_RECORD",
        idempotency_key=event_hash,
        payload=body.model_dump(),
        signature_verified=sig_verified,
        received_at=now_utc,
    )
    db.add(event_record)

    incident_id: Optional[str] = None
    created_incident: Optional[Incident] = None

    if wf:
        ext_exec_id = body.execution_id or f"wh_{event_hash[:16]}"
        exec_status = "FAILED" if body.error else (body.status or "SUCCESS").upper()

        exec_res = await db.execute(
            select(Execution).where(
                Execution.workflow_id == wf.id,
                Execution.external_execution_id == ext_exec_id,
            )
        )
        exec_rec = exec_res.scalar_one_or_none()
        if exec_rec is None:
            exec_rec = Execution(
                workflow_id=wf.id,
                integration_id=wf.integration_id,
                external_execution_id=ext_exec_id,
                status=exec_status,
                raw_status=exec_status.lower(),
                started_at=now_utc,
                finished_at=now_utc if exec_status in ("SUCCESS", "FAILED", "TIMED_OUT") else None,
                mode="webhook",
                error_message=body.error,
                error_payload=body.payload,
                synced_at=now_utc,
            )
            db.add(exec_rec)
            await db.flush()
        else:
            exec_rec.status = exec_status
            exec_rec.error_message = body.error or exec_rec.error_message
            exec_rec.finished_at = now_utc if exec_status in ("SUCCESS", "FAILED", "TIMED_OUT") else exec_rec.finished_at

        wf.last_execution_at = now_utc
        if exec_status == "SUCCESS":
            wf.last_successful_at = now_utc
            wf.consecutive_failures = 0
            wf.health_status = "HEALTHY"
        elif body.error:
            wf.last_failed_at = now_utc
            wf.consecutive_failures += 1
            wf.health_status = "FAILING" if wf.consecutive_failures >= 3 else "DEGRADED"

        if body.error:
            # Prevent duplicate incident for the same execution
            dup_inc_res = await db.execute(
                select(Incident).where(
                    Incident.workflow_id == wf.id,
                    Incident.execution_id == ext_exec_id,
                )
            )
            existing_inc = dup_inc_res.scalar_one_or_none()
            if existing_inc:
                incident_id = existing_inc.id
            else:
                classified = classify_error(body.error)
                requires_approval = bool(classified["requires_approval"] or is_financial_or_destructive(wf.name))
                created_incident = Incident(
                    agency_id=wf.agency_id,
                    client_id=wf.client_id,
                    workflow_id=wf.id,
                    execution_id=ext_exec_id,
                    execution_record_id=exec_rec.id,
                    error_category=classified["category"],
                    error_message=body.error,
                    severity=classified["severity"],
                    status="APPROVAL_REQUIRED" if requires_approval else "OPEN",
                    first_detected_at=now_utc,
                    last_detected_at=now_utc,
                    occurrence_count=1,
                )
                db.add(created_incident)
                await db.flush()
                incident_id = created_incident.id

                db.add(
                    Notification(
                        agency_id=wf.agency_id,
                        type="APPROVAL_REQUEST" if requires_approval else "CRITICAL_FAILURE",
                        title=f"Webhook Failure: {wf.name}",
                        message=body.error[:240],
                        incident_id=created_incident.id,
                    )
                )

    await db.commit()
    await db.refresh(event_record)

    # Trigger Celery diagnosis + lifecycle alerts (or inline fallback) for newly created incident
    if created_incident is not None:
        dispatched = False
        try:
            from app.workers.celery_app import diagnose_incident_task
            diagnose_incident_task.delay(created_incident.id)
            dispatched = True
        except Exception:
            dispatched = False
        if not dispatched:
            try:
                await run_diagnosis_for_incident(db, created_incident, wf, execution_metadata=body.payload)
                await db.commit()
            except Exception as exc:
                logger.warning("Webhook inline diagnosis fallback failed: %s", exc)
        if wf is not None:
            try:
                await dispatch_lifecycle_alerts(
                    db,
                    agency_id=wf.agency_id,
                    event_type="INCIDENT_CREATED",
                    severity=created_incident.severity,
                    title=f"Webhook Incident: {wf.name}",
                    message=created_incident.error_message[:260],
                    use_celery_queue=True,
                )
                await db.commit()
            except Exception as alert_exc:
                logger.warning("Webhook alert dispatch failed: %s", alert_exc)

    return {
        "status": "INCIDENT_CREATED" if incident_id else "EVENT_PERSISTED",
        "event_id": event_record.id,
        "incident_id": incident_id,
        "idempotency_key": event_hash,
    }
