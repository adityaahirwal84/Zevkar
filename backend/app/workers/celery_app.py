import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Coroutine
from celery import Celery
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.security import decrypt_secret
from app.integrations.n8n import N8NClient
from app.models.entities import Incident, Integration, RecoveryAttempt, Workflow
from app.services.n8n_sync import n8n_sync_service, run_diagnosis_for_incident

logger = logging.getLogger("celery_worker")

celery_app = Celery(
    "automation_doctor_worker",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    beat_schedule={
        "sync-active-integrations-every-5-minutes": {
            "task": "app.workers.celery_app.sync_active_integrations_task",
            "schedule": 300.0,
        },
        "evaluate-stuck-executions-every-minute": {
            "task": "app.workers.celery_app.detect_stuck_executions_task",
            "schedule": 60.0,
        },
        "evaluate-guardrails-every-5-minutes": {
            "task": "app.workers.celery_app.evaluate_guardrails_all_agencies_task",
            "schedule": 300.0,
        },
        "process-pending-recoveries-every-minute": {
            "task": "app.workers.celery_app.process_pending_recoveries_task",
            "schedule": 60.0,
        },
    },
)


def _run_async(coro: Coroutine[Any, Any, Any]) -> Any:
    return asyncio.run(coro)


async def _sync_all_active_integrations() -> Dict[str, Any]:
    synced = 0
    failed = 0
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(Integration).where(
                Integration.status == "CONNECTED",
                Integration.platform == "n8n",
            )
        )
        integrations = res.scalars().all()
        for integ in integrations:
            try:
                await n8n_sync_service.sync_integration(db, integ, inline_diagnosis_fallback=False)
                synced += 1
            except Exception as exc:
                failed += 1
                logger.warning("Integration sync failed for id=%s: %s", integ.id, exc)
    return {"status": "SUCCESS", "synced_integrations_count": synced, "failed_integrations_count": failed}


async def _detect_stuck_all() -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        result = await n8n_sync_service.detect_stuck_executions(db, inline_diagnosis_fallback=False)
        return {"status": "SUCCESS", **result}


async def _diagnose_incident(incident_id: str) -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(Incident).where(Incident.id == incident_id))
        inc = res.scalar_one_or_none()
        if not inc:
            return {"status": "NOT_FOUND", "incident_id": incident_id}
        diag = await run_diagnosis_for_incident(db, inc)
        await db.commit()
        return {
            "status": "DIAGNOSED",
            "incident_id": incident_id,
            "diagnosis_id": diag.id,
            "is_ai_generated": diag.is_ai_generated,
        }


async def _execute_recovery_request(recovery_request_id: str, agency_id: str, actor_user_id: str = "celery_worker") -> Dict[str, Any]:
    from app.services.recovery_engine import recovery_engine_service

    async with AsyncSessionLocal() as db:
        result = await recovery_engine_service.execute_and_verify_recovery(
            db,
            agency_id=agency_id,
            request_id=recovery_request_id,
            actor_user_id=actor_user_id,
            verify_result=True,
        )
        await db.commit()
        return result


async def _execute_recovery(incident_id: str, idempotency_key: str) -> Dict[str, Any]:
    from app.services.recovery_engine import recovery_engine_service

    async with AsyncSessionLocal() as db:
        inc = (await db.execute(select(Incident).where(Incident.id == incident_id))).scalar_one_or_none()
        if not inc:
            return {"status": "NOT_FOUND", "incident_id": incident_id}
        req = await recovery_engine_service.create_recovery_request(
            db,
            agency_id=inc.agency_id,
            user_id="celery_worker",
            incident_id=inc.id,
            strategy="RETRY_EXECUTION",
            idempotency_key=idempotency_key,
        )
        if req.requires_approval:
            await db.commit()
            return {"status": "PENDING_APPROVAL", "recovery_request_id": req.id, "incident_id": inc.id}
        result = await recovery_engine_service.execute_and_verify_recovery(
            db,
            agency_id=inc.agency_id,
            request_id=req.id,
            actor_user_id="celery_worker",
            verify_result=True,
        )
        await db.commit()
        return result


async def _dispatch_alert_delivery(delivery_id: str, agency_id: str) -> Dict[str, Any]:
    from app.models.entities import AlertChannel, AlertDelivery
    from app.services.alert_delivery import deliver_alert_for_channel

    async with AsyncSessionLocal() as db:
        delivery = (
            await db.execute(
                select(AlertDelivery).where(
                    AlertDelivery.id == delivery_id,
                    AlertDelivery.agency_id == agency_id,
                )
            )
        ).scalar_one_or_none()
        if not delivery:
            return {"status": "NOT_FOUND", "delivery_id": delivery_id}
        channel = (
            await db.execute(
                select(AlertChannel).where(
                    AlertChannel.id == delivery.channel_id,
                    AlertChannel.agency_id == agency_id,
                )
            )
        ).scalar_one_or_none()
        if not channel:
            delivery.status = "FAILED"
            delivery.response_summary = "Alert channel no longer exists."
            await db.commit()
            return {"status": "CHANNEL_NOT_FOUND", "delivery_id": delivery_id}

        updated = await deliver_alert_for_channel(
            db,
            agency_id=agency_id,
            channel=channel,
            event_type=delivery.event_type,
            severity=delivery.severity,
            title=delivery.title,
            message=delivery.message,
            rule_id=delivery.rule_id,
            rule_name=delivery.rule_name,
            dispatched_via="CELERY",
            existing_delivery=delivery,
        )
        await db.commit()
        return {"status": updated.status, "delivery_id": updated.id, "http_status": updated.http_status}


async def _evaluate_guardrails_all_agencies() -> Dict[str, Any]:
    from app.models.entities import Agency
    from app.services.alert_delivery import evaluate_agency_guardrails

    agencies_evaluated = 0
    triggered_total = 0
    failed_agencies = 0
    async with AsyncSessionLocal() as db:
        agencies = (await db.execute(select(Agency))).scalars().all()
        for agency in agencies:
            try:
                report = await evaluate_agency_guardrails(
                    db,
                    agency_id=agency.id,
                    use_celery_queue=True,
                )
                agencies_evaluated += 1
                triggered_total += int(report.get("triggeredCount", 0))
            except Exception as exc:
                failed_agencies += 1
                logger.warning("Guardrail evaluation failed for agency %s: %s", agency.id, exc)
    return {
        "status": "SUCCESS",
        "agencies_evaluated": agencies_evaluated,
        "triggered_rules": triggered_total,
        "failed_agencies": failed_agencies,
    }


async def _process_pending_recoveries() -> Dict[str, Any]:
    from app.services.recovery_engine import recovery_engine_service

    async with AsyncSessionLocal() as db:
        result = await recovery_engine_service.process_scheduled_and_verifying_recoveries(db)
        await db.commit()
        return {"status": "SUCCESS", **result}


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def sync_active_integrations_task(self):
    logger.info("Executing scheduled n8n integration synchronization...")
    try:
        return _run_async(_sync_all_active_integrations())
    except Exception as exc:
        logger.error("Scheduled sync task error: %s", exc)
        raise self.retry(exc=exc, countdown=min(300, 30 * (2 ** self.request.retries)))


@celery_app.task(bind=True, max_retries=3, default_retry_delay=15)
def detect_stuck_executions_task(self):
    logger.info("Evaluating workflows for stuck executions...")
    try:
        return _run_async(_detect_stuck_all())
    except Exception as exc:
        logger.error("Stuck execution detection failed: %s", exc)
        raise self.retry(exc=exc, countdown=min(120, 15 * (2 ** self.request.retries)))


@celery_app.task(bind=True, max_retries=3, default_retry_delay=20)
def diagnose_incident_task(self, incident_id: str):
    logger.info("Running diagnosis task for incident %s", incident_id)
    try:
        return _run_async(_diagnose_incident(incident_id))
    except Exception as exc:
        logger.error("Diagnosis task failed for incident %s: %s", incident_id, exc)
        raise self.retry(exc=exc, countdown=min(180, 20 * (2 ** self.request.retries)))


@celery_app.task(bind=True, max_retries=5, default_retry_delay=60)
def execute_background_recovery_task(self, incident_id: str, idempotency_key: str):
    logger.info("Processing background recovery for incident %s", incident_id)
    try:
        return _run_async(_execute_recovery(incident_id, idempotency_key))
    except Exception as exc:
        logger.error("Background recovery failed for incident %s: %s", incident_id, exc)
        raise self.retry(exc=exc, countdown=min(300, 60 * (2 ** self.request.retries)))


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def execute_recovery_request_task(self, recovery_request_id: str, agency_id: str, actor_user_id: str = "celery_worker"):
    logger.info("Executing scheduled recovery request %s", recovery_request_id)
    try:
        return _run_async(_execute_recovery_request(recovery_request_id, agency_id, actor_user_id))
    except Exception as exc:
        logger.error("Scheduled recovery request task failed for %s: %s", recovery_request_id, exc)
        raise self.retry(exc=exc, countdown=min(300, 30 * (2 ** self.request.retries)))


@celery_app.task(bind=True, max_retries=3, default_retry_delay=15)
def dispatch_alert_delivery_task(self, delivery_id: str, agency_id: str):
    logger.info("Dispatching queued alert delivery %s for agency %s", delivery_id, agency_id)
    try:
        return _run_async(_dispatch_alert_delivery(delivery_id, agency_id))
    except Exception as exc:
        logger.error("Alert delivery task failed for %s: %s", delivery_id, exc)
        raise self.retry(exc=exc, countdown=min(120, 15 * (2 ** self.request.retries)))


@celery_app.task(bind=True, max_retries=2, default_retry_delay=30)
def evaluate_guardrails_all_agencies_task(self):
    logger.info("Running scheduled SLA & reliability guardrail evaluation...")
    try:
        return _run_async(_evaluate_guardrails_all_agencies())
    except Exception as exc:
        logger.error("Scheduled guardrail evaluation failed: %s", exc)
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(bind=True, max_retries=2, default_retry_delay=15)
def process_pending_recoveries_task(self):
    logger.info("Polling scheduled & verifying recovery requests...")
    try:
        return _run_async(_process_pending_recoveries())
    except Exception as exc:
        logger.error("Pending recovery processor failed: %s", exc)
        raise self.retry(exc=exc, countdown=30)


async def _execute_control_action(
    action_request_id: str,
    agency_id: str,
    actor_user_id: str = "celery_worker",
    actor_role: str = "SYSTEM",
) -> Dict[str, Any]:
    from app.services.control_engine import control_engine_service

    async with AsyncSessionLocal() as db:
        req = await control_engine_service.execute_action_request(
            db,
            agency_id=agency_id,
            request_id=action_request_id,
            actor_user_id=actor_user_id,
            actor_role=actor_role,
        )
        await db.commit()
        return {
            "status": req.status,
            "action_request_id": req.id,
            "verification_status": req.verification_status,
        }


@celery_app.task(bind=True, max_retries=2, default_retry_delay=15)
def execute_control_action_task(
    self,
    action_request_id: str,
    agency_id: str,
    actor_user_id: str = "celery_worker",
    actor_role: str = "SYSTEM",
):
    logger.info("Dispatching control action request %s for agency %s", action_request_id, agency_id)
    try:
        return _run_async(_execute_control_action(action_request_id, agency_id, actor_user_id, actor_role))
    except Exception as exc:
        logger.error("Control action dispatch task failed for %s: %s", action_request_id, exc)
        raise self.retry(exc=exc, countdown=30)
