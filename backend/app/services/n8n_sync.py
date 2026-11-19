import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import decrypt_secret
from app.diagnosis.gemini_engine import gemini_engine
from app.integrations.n8n import N8NClient, normalize_n8n_execution
from app.lib.classifier import classify_error, is_financial_or_destructive
from app.services.alert_delivery import dispatch_lifecycle_alerts
from app.models.entities import (
    AIDiagnosis,
    Client,
    Execution,
    Incident,
    Integration,
    Notification,
    Workflow,
)

logger = logging.getLogger("n8n_sync_service")

ACTIVE_INCIDENT_STATUSES = ("OPEN", "INVESTIGATING", "APPROVAL_REQUIRED", "RECOVERING")


def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def compute_stuck_timeout_seconds(workflow: Workflow) -> int:
    """Computes effective stuck execution threshold honoring per-workflow overrides."""
    if workflow.stuck_timeout_seconds is not None and workflow.stuck_timeout_seconds > 0:
        return int(workflow.stuck_timeout_seconds)
    if workflow.allow_long_running:
        return int(settings.LONG_RUNNING_EXECUTION_SECONDS)
    return int(settings.DEFAULT_STUCK_EXECUTION_SECONDS)


async def run_diagnosis_for_incident(
    db: AsyncSession,
    incident: Incident,
    workflow: Optional[Workflow] = None,
    execution_metadata: Optional[Dict[str, Any]] = None,
) -> AIDiagnosis:
    """Runs Gemini (or deterministic fallback) diagnosis and upserts AIDiagnosis for an Incident."""
    if workflow is None:
        wf_res = await db.execute(select(Workflow).where(Workflow.id == incident.workflow_id))
        workflow = wf_res.scalar_one_or_none()

    client_name = "Unassigned Client"
    if incident.client_id:
        cli_res = await db.execute(select(Client).where(Client.id == incident.client_id))
        cli = cli_res.scalar_one_or_none()
        if cli:
            client_name = cli.name

    diag_dict = await gemini_engine.diagnose_incident(
        workflow_name=workflow.name if workflow else "Automation Workflow",
        platform=workflow.platform if workflow else "n8n",
        client_name=client_name,
        error_message=incident.error_message,
        execution_id=incident.execution_id,
        execution_metadata=execution_metadata,
    )

    existing_res = await db.execute(select(AIDiagnosis).where(AIDiagnosis.incident_id == incident.id))
    diag = existing_res.scalar_one_or_none()
    now_utc = datetime.now(timezone.utc)

    if diag:
        diag.error_category = diag_dict["error_category"]
        diag.severity = diag_dict["severity"]
        diag.root_cause = diag_dict["root_cause"]
        diag.simple_explanation = diag_dict["simple_explanation"]
        diag.technical_explanation = diag_dict["technical_explanation"]
        diag.recommended_actions = diag_dict["recommended_actions"]
        diag.verified_facts = diag_dict.get("verified_facts", [])
        diag.ai_hypotheses = diag_dict.get("ai_hypotheses", [])
        diag.suggested_recovery = diag_dict["suggested_recovery"]
        diag.requires_human_approval = diag_dict["requires_human_approval"]
        diag.is_recoverable = diag_dict.get("is_recoverable", True)
        diag.recommended_strategy = diag_dict.get("suggested_strategy", "MANUAL_RECOVERY")
        diag.recommendation_reason = diag_dict.get("recommendation_reason")
        diag.expected_risk_level = diag_dict.get("expected_risk_level", "HIGH")
        diag.required_user_action = diag_dict.get("required_user_action")
        diag.max_recommended_retries = diag_dict.get("max_recommended_retries", 2)
        diag.confidence = diag_dict["confidence"]
        diag.is_ai_generated = diag_dict["is_ai_generated"]
        diag.model_used = diag_dict.get("model_used", settings.GEMINI_MODEL)
        diag.fallback_reason = diag_dict.get("fallback_reason")
        diag.token_count = diag_dict.get("token_count", 0)
        diag.diagnosed_at = now_utc
    else:
        diag = AIDiagnosis(
            incident_id=incident.id,
            error_category=diag_dict["error_category"],
            severity=diag_dict["severity"],
            root_cause=diag_dict["root_cause"],
            simple_explanation=diag_dict["simple_explanation"],
            technical_explanation=diag_dict["technical_explanation"],
            recommended_actions=diag_dict["recommended_actions"],
            verified_facts=diag_dict.get("verified_facts", []),
            ai_hypotheses=diag_dict.get("ai_hypotheses", []),
            suggested_recovery=diag_dict["suggested_recovery"],
            requires_human_approval=diag_dict["requires_human_approval"],
            is_recoverable=diag_dict.get("is_recoverable", True),
            recommended_strategy=diag_dict.get("suggested_strategy", "MANUAL_RECOVERY"),
            recommendation_reason=diag_dict.get("recommendation_reason"),
            expected_risk_level=diag_dict.get("expected_risk_level", "HIGH"),
            required_user_action=diag_dict.get("required_user_action"),
            max_recommended_retries=diag_dict.get("max_recommended_retries", 2),
            confidence=diag_dict["confidence"],
            is_ai_generated=diag_dict["is_ai_generated"],
            model_used=diag_dict.get("model_used", settings.GEMINI_MODEL),
            fallback_reason=diag_dict.get("fallback_reason"),
            token_count=diag_dict.get("token_count", 0),
            diagnosed_at=now_utc,
        )
        db.add(diag)

    incident.error_category = diag.error_category
    incident.severity = diag.severity
    if diag.requires_human_approval and incident.status == "OPEN":
        incident.status = "APPROVAL_REQUIRED"

    await db.flush()
    return diag


class N8NSyncService:
    """
    Shared pipeline service for:
    - Syncing workflows & paginated executions from n8n with persistent watermarks
    - Deduplicating executions and maintaining accurate workflow health/timestamps
    - Auto-creating/updating incidents and dispatching Celery diagnosis
    - Detecting stuck executions with configurable per-workflow timeouts
    """

    def __init__(
        self,
        client_factory: Optional[Callable[[Integration], N8NClient]] = None,
        diagnosis_dispatcher: Optional[Callable[[str], Any]] = None,
    ):
        self._client_factory = client_factory
        self._diagnosis_dispatcher = diagnosis_dispatcher

    def _make_client(self, integration: Integration) -> N8NClient:
        if self._client_factory:
            return self._client_factory(integration)
        api_key = decrypt_secret(integration.encrypted_credentials) or ""
        if not integration.instance_url or not api_key:
            raise ValueError("Integration is missing instance_url or encrypted credentials.")
        return N8NClient(base_url=integration.instance_url, api_key=api_key)

    def _dispatch_diagnosis(self, incident_id: str) -> bool:
        """Dispatches Celery diagnosis task when configured; returns True if queued asynchronously."""
        if self._diagnosis_dispatcher:
            self._diagnosis_dispatcher(incident_id)
            return True
        try:
            from app.workers.celery_app import diagnose_incident_task
            diagnose_incident_task.delay(incident_id)
            return True
        except Exception as exc:
            logger.debug("Celery dispatch unavailable (%s); caller may run inline fallback.", exc)
            return False

    async def sync_integration(
        self,
        db: AsyncSession,
        integration: Integration,
        inline_diagnosis_fallback: bool = True,
    ) -> Dict[str, Any]:
        if integration.platform.lower() != "n8n":
            integration.last_synced_at = datetime.now(timezone.utc)
            integration.last_sync_status = "SUCCESS"
            integration.last_sync_error = None
            await db.commit()
            return {
                "integration_id": integration.id,
                "platform": integration.platform,
                "workflows_synced": 0,
                "executions_ingested": 0,
                "incidents_created": 0,
                "incidents_updated": 0,
                "status": "SUCCESS",
            }

        now_utc = datetime.now(timezone.utc)
        integration.last_sync_status = "SYNCING"
        integration.last_sync_error = None
        await db.flush()

        try:
            client = self._make_client(integration)
            remote_workflows = await client.fetch_workflows(limit=settings.N8N_SYNC_BATCH_LIMIT)

            wf_by_external: Dict[str, Workflow] = {}
            existing_wfs_res = await db.execute(
                select(Workflow).where(
                    Workflow.agency_id == integration.agency_id,
                    Workflow.platform == integration.platform,
                )
            )
            for wf in existing_wfs_res.scalars().all():
                wf_by_external[wf.external_workflow_id] = wf

            caps_snapshot = client.get_capabilities().model_dump()
            workflows_synced = 0
            for raw_wf in remote_workflows:
                ext_id = str(raw_wf.get("id") or "").strip()
                if not ext_id:
                    continue
                wf_name = str(raw_wf.get("name") or f"n8n Workflow {ext_id}")
                is_active = bool(raw_wf.get("active", True))
                wf_settings = raw_wf.get("settings") if isinstance(raw_wf.get("settings"), dict) else None

                existing_wf = wf_by_external.get(ext_id)
                if existing_wf:
                    existing_wf.name = wf_name
                    existing_wf.is_active = is_active
                    if not is_active:
                        existing_wf.control_status = "INACTIVE"
                    elif existing_wf.health_status == "FAILING":
                        existing_wf.control_status = "FAILED"
                    else:
                        existing_wf.control_status = "ACTIVE"
                    existing_wf.capabilities = caps_snapshot
                    if wf_settings is not None:
                        existing_wf.provider_settings = wf_settings
                    existing_wf.integration_id = integration.id
                    if not existing_wf.client_id and integration.client_id:
                        existing_wf.client_id = integration.client_id
                else:
                    existing_wf = Workflow(
                        agency_id=integration.agency_id,
                        client_id=integration.client_id,
                        integration_id=integration.id,
                        platform=integration.platform,
                        external_workflow_id=ext_id,
                        name=wf_name,
                        is_active=is_active,
                        control_status="ACTIVE" if is_active else "INACTIVE",
                        health_status="HEALTHY",
                        consecutive_failures=0,
                        provider_settings=wf_settings,
                        capabilities=caps_snapshot,
                    )
                    db.add(existing_wf)
                    await db.flush()
                    wf_by_external[ext_id] = existing_wf
                workflows_synced += 1

            # Incremental polling watermark with overlap window so in-flight runs aren't missed
            since_dt: Optional[datetime] = None
            if integration.last_execution_watermark:
                since_dt = _ensure_utc(integration.last_execution_watermark) - timedelta(
                    seconds=settings.N8N_WATERMARK_OVERLAP_SECONDS
                )

            raw_executions, next_cursor = await client.fetch_executions_with_checkpoint(
                limit=settings.N8N_SYNC_BATCH_LIMIT,
                include_data=True,
                since_started_at=since_dt,
            )

            # Refresh older in-flight RUNNING executions so terminal transitions aren't missed by watermark
            seen_exec_ids = {str(raw.get("id") or "") for raw in raw_executions if raw.get("id")}
            inflight_rows = (
                await db.execute(
                    select(Execution)
                    .where(
                        Execution.integration_id == integration.id,
                        Execution.status == "RUNNING",
                    )
                    .order_by(Execution.started_at.desc())
                    .limit(settings.N8N_INFLIGHT_REFRESH_LIMIT)
                )
            ).scalars().all()
            for inflight in inflight_rows:
                ext_id = inflight.external_execution_id
                if not ext_id or ext_id in seen_exec_ids:
                    continue
                try:
                    refreshed = await client.get_execution(ext_id, include_data=True)
                    if isinstance(refreshed, dict) and refreshed.get("id"):
                        raw_executions.append(refreshed)
                        seen_exec_ids.add(str(refreshed.get("id")))
                except Exception as refresh_exc:
                    logger.debug("In-flight execution refresh skipped for %s: %s", ext_id, refresh_exc)

            executions_ingested = 0
            incidents_created = 0
            incidents_updated = 0
            newly_touched_incidents: List[tuple[Incident, Workflow, Dict[str, Any], bool]] = []
            max_started_at: Optional[datetime] = _ensure_utc(integration.last_execution_watermark)

            # Process oldest -> newest so workflow consecutive_failures & last_* stay accurate
            normalized_items = [normalize_n8n_execution(raw) for raw in raw_executions]
            normalized_items.sort(key=lambda item: item["started_at"])

            for norm in normalized_items:
                ext_exec_id = norm["external_execution_id"]
                ext_wf_id = norm["external_workflow_id"]
                if not ext_exec_id or not ext_wf_id:
                    continue

                wf = wf_by_external.get(ext_wf_id)
                if wf is None:
                    # Auto-register workflow if an execution arrived for a newly created workflow
                    wf = Workflow(
                        agency_id=integration.agency_id,
                        client_id=integration.client_id,
                        integration_id=integration.id,
                        platform=integration.platform,
                        external_workflow_id=ext_wf_id,
                        name=f"n8n Workflow {ext_wf_id}",
                        is_active=True,
                        health_status="HEALTHY",
                        consecutive_failures=0,
                    )
                    db.add(wf)
                    await db.flush()
                    wf_by_external[ext_wf_id] = wf

                exec_started = _ensure_utc(norm["started_at"]) or now_utc
                if max_started_at is None or exec_started > max_started_at:
                    max_started_at = exec_started

                existing_exec_res = await db.execute(
                    select(Execution).where(
                        Execution.workflow_id == wf.id,
                        Execution.external_execution_id == ext_exec_id,
                    )
                )
                exec_rec = existing_exec_res.scalar_one_or_none()

                previous_status = exec_rec.status if exec_rec else None
                if exec_rec:
                    # Update status if an in-flight execution transitioned to terminal state
                    exec_rec.status = norm["status"]
                    exec_rec.raw_status = norm["raw_status"]
                    exec_rec.finished_at = norm["finished_at"]
                    exec_rec.duration_ms = norm["duration_ms"] or exec_rec.duration_ms
                    exec_rec.error_message = norm["error_message"] or exec_rec.error_message
                    exec_rec.error_payload = norm["error_payload"] or exec_rec.error_payload
                    exec_rec.synced_at = now_utc
                else:
                    exec_rec = Execution(
                        workflow_id=wf.id,
                        integration_id=integration.id,
                        external_execution_id=ext_exec_id,
                        status=norm["status"],
                        raw_status=norm["raw_status"],
                        duration_ms=norm["duration_ms"],
                        started_at=exec_started,
                        finished_at=norm["finished_at"],
                        mode=norm["mode"],
                        error_message=norm["error_message"],
                        error_payload=norm["error_payload"],
                        synced_at=now_utc,
                    )
                    db.add(exec_rec)
                    await db.flush()
                    executions_ingested += 1

                # Update workflow timestamps & health
                wf_last = _ensure_utc(wf.last_execution_at)
                if wf_last is None or exec_started >= wf_last:
                    wf.last_execution_at = exec_started

                if norm["duration_ms"] > 0:
                    wf.avg_duration_ms = (
                        norm["duration_ms"]
                        if wf.avg_duration_ms == 0
                        else int((wf.avg_duration_ms * 0.7) + (norm["duration_ms"] * 0.3))
                    )

                if norm["status"] == "SUCCESS" and previous_status != "SUCCESS":
                    wf_succ = _ensure_utc(wf.last_successful_at)
                    if wf_succ is None or exec_started >= wf_succ:
                        wf.last_successful_at = exec_started
                    wf.consecutive_failures = 0
                    wf.health_status = "HEALTHY"
                    wf.control_status = "ACTIVE" if wf.is_active else "INACTIVE"
                elif norm["status"] in ("FAILED", "TIMED_OUT"):
                    wf_fail = _ensure_utc(wf.last_failed_at)
                    if wf_fail is None or exec_started >= wf_fail:
                        wf.last_failed_at = exec_started
                    if previous_status not in ("FAILED", "TIMED_OUT"):
                        wf.consecutive_failures += 1
                    wf.health_status = "FAILING" if wf.consecutive_failures >= 3 else "DEGRADED"
                    if wf.is_active and wf.health_status == "FAILING":
                        wf.control_status = "FAILED"

                    # Incident deduplication & creation/update
                    inc_result = await self._upsert_incident_for_execution(
                        db=db,
                        workflow=wf,
                        execution=exec_rec,
                        error_message=norm["error_message"] or "n8n execution failed.",
                        detected_at=norm["finished_at"] or exec_started,
                    )
                    if inc_result is not None:
                        inc, was_created = inc_result
                        if was_created:
                            incidents_created += 1
                        else:
                            incidents_updated += 1
                        newly_touched_incidents.append((inc, wf, norm["error_payload"] or {}, was_created))

            integration.last_synced_at = now_utc
            integration.last_execution_watermark = max_started_at or now_utc
            integration.sync_cursor = next_cursor
            integration.last_sync_status = "SUCCESS"
            integration.last_sync_error = None
            integration.status = "CONNECTED"

            await db.commit()

            # Trigger diagnosis & lifecycle alert routing asynchronously (with inline fallback)
            for inc, wf, meta, was_created in newly_touched_incidents:
                queued = self._dispatch_diagnosis(inc.id)
                if not queued and inline_diagnosis_fallback:
                    try:
                        await run_diagnosis_for_incident(db, inc, wf, execution_metadata=meta)
                        await db.commit()
                    except Exception as diag_exc:
                        logger.warning("Inline diagnosis fallback failed for %s: %s", inc.id, diag_exc)
                if was_created:
                    try:
                        await dispatch_lifecycle_alerts(
                            db,
                            agency_id=integration.agency_id,
                            event_type="INCIDENT_CREATED",
                            severity=inc.severity,
                            title=f"Incident Detected: {wf.name}",
                            message=f"[{inc.error_category}] {(inc.error_message or '')[:260]}",
                            use_celery_queue=True,
                        )
                        await db.commit()
                    except Exception as alert_exc:
                        logger.warning("Incident alert dispatch failed for %s: %s", inc.id, alert_exc)

            return {
                "integration_id": integration.id,
                "platform": integration.platform,
                "workflows_synced": workflows_synced,
                "executions_ingested": executions_ingested,
                "incidents_created": incidents_created,
                "incidents_updated": incidents_updated,
                "watermark": integration.last_execution_watermark.isoformat() if integration.last_execution_watermark else None,
                "status": "SUCCESS",
            }
        except Exception as exc:
            integration.last_sync_status = "ERROR"
            integration.last_sync_error = str(exc)[:500]
            await db.commit()
            raise

    async def _upsert_incident_for_execution(
        self,
        db: AsyncSession,
        workflow: Workflow,
        execution: Execution,
        error_message: str,
        detected_at: datetime,
    ) -> Optional[tuple[Incident, bool]]:
        """
        Ensures 1 failed execution never spawns duplicate incidents.
        Groups recurring failures of the same category on an open incident, or creates a new one.
        """
        # 1. Exact execution already linked to an incident -> do not duplicate
        by_exec = await db.execute(
            select(Incident).where(
                Incident.workflow_id == workflow.id,
                Incident.execution_id == (execution.external_execution_id or execution.id),
            )
        )
        if by_exec.scalar_one_or_none():
            return None

        classified = classify_error(error_message)
        requires_approval = bool(classified["requires_approval"] or is_financial_or_destructive(workflow.name))

        # 2. Group into an active incident for same workflow + error category
        active_res = await db.execute(
            select(Incident)
            .where(
                Incident.workflow_id == workflow.id,
                Incident.error_category == classified["category"],
                Incident.status.in_(ACTIVE_INCIDENT_STATUSES),
            )
            .order_by(Incident.last_detected_at.desc())
        )
        existing_inc = active_res.scalars().first()
        if existing_inc:
            existing_inc.occurrence_count += 1
            existing_inc.last_detected_at = detected_at
            existing_inc.execution_id = execution.external_execution_id or execution.id
            existing_inc.execution_record_id = execution.id
            existing_inc.error_message = error_message
            await db.flush()
            return existing_inc, False

        inc = Incident(
            agency_id=workflow.agency_id,
            client_id=workflow.client_id,
            workflow_id=workflow.id,
            execution_id=execution.external_execution_id or execution.id,
            execution_record_id=execution.id,
            error_category=classified["category"],
            error_message=error_message,
            severity=classified["severity"],
            status="APPROVAL_REQUIRED" if requires_approval else "OPEN",
            first_detected_at=detected_at,
            last_detected_at=detected_at,
            occurrence_count=1,
        )
        db.add(inc)
        await db.flush()

        notif = Notification(
            agency_id=workflow.agency_id,
            type="APPROVAL_REQUEST" if requires_approval else "CRITICAL_FAILURE",
            title=f"Failure Detected: {workflow.name}",
            message=error_message[:240],
            incident_id=inc.id,
        )
        db.add(notif)
        await db.flush()
        return inc, True

    async def detect_stuck_executions(
        self,
        db: AsyncSession,
        now_utc: Optional[datetime] = None,
        agency_id: Optional[str] = None,
        inline_diagnosis_fallback: bool = True,
    ) -> Dict[str, Any]:
        """
        Evaluates RUNNING executions against per-workflow or global timeout thresholds.
        Flags stuck runs cleanly without false-flagging long-running workflows, and prevents duplicate alerts.
        """
        current_time = now_utc or datetime.now(timezone.utc)

        query = (
            select(Execution, Workflow)
            .join(Workflow, Execution.workflow_id == Workflow.id)
            .where(
                Execution.status == "RUNNING",
                Execution.is_stuck_alerted == False,  # noqa: E712
                Workflow.is_active == True,  # noqa: E712
            )
        )
        if agency_id:
            query = query.where(Workflow.agency_id == agency_id)

        rows = (await db.execute(query)).all()
        detected_incidents: List[tuple[Incident, Workflow]] = []

        for exec_rec, wf in rows:
            timeout_sec = compute_stuck_timeout_seconds(wf)
            started = _ensure_utc(exec_rec.started_at) or current_time
            elapsed_sec = (current_time - started).total_seconds()

            if elapsed_sec <= timeout_sec:
                continue

            exec_rec.is_stuck_alerted = True
            exec_rec.status = "TIMED_OUT"
            exec_rec.duration_ms = int(elapsed_sec * 1000)
            avg_note = (
                f" Baseline avg duration: {round(wf.avg_duration_ms / 1000.0, 1)}s."
                if (wf.avg_duration_ms or 0) > 0
                else ""
            )
            error_msg = (
                f"Stuck execution detected: workflow '{wf.name}' remained in '{exec_rec.raw_status or 'running'}' "
                f"state for {int(elapsed_sec)}s (threshold: {timeout_sec}s).{avg_note}"
            )
            exec_rec.error_message = error_msg

            wf.health_status = "DEGRADED" if wf.consecutive_failures < 2 else "FAILING"
            wf.consecutive_failures += 1
            wf.last_failed_at = current_time

            inc = Incident(
                agency_id=wf.agency_id,
                client_id=wf.client_id,
                workflow_id=wf.id,
                execution_id=exec_rec.external_execution_id or exec_rec.id,
                execution_record_id=exec_rec.id,
                error_category="TIMEOUT",
                error_message=error_msg,
                severity="HIGH",
                status="OPEN",
                first_detected_at=current_time,
                last_detected_at=current_time,
                occurrence_count=1,
            )
            db.add(inc)
            await db.flush()

            db.add(
                Notification(
                    agency_id=wf.agency_id,
                    type="CRITICAL_FAILURE",
                    title=f"Stuck Execution Alert: {wf.name}",
                    message=error_msg,
                    incident_id=inc.id,
                )
            )
            detected_incidents.append((inc, wf))

        await db.commit()

        for inc, wf in detected_incidents:
            queued = self._dispatch_diagnosis(inc.id)
            if not queued and inline_diagnosis_fallback:
                try:
                    await run_diagnosis_for_incident(db, inc, wf)
                    await db.commit()
                except Exception as exc:
                    logger.warning("Inline stuck diagnosis fallback failed for %s: %s", inc.id, exc)
            try:
                await dispatch_lifecycle_alerts(
                    db,
                    agency_id=wf.agency_id,
                    event_type="STUCK_EXECUTION",
                    severity="HIGH",
                    title=f"Stuck Execution Alert: {wf.name}",
                    message=inc.error_message[:260],
                    use_celery_queue=True,
                )
                await db.commit()
            except Exception as alert_exc:
                logger.warning("Stuck execution alert dispatch failed for %s: %s", inc.id, alert_exc)

        return {
            "checked_running_executions": len(rows),
            "abnormal_runs_detected": len(detected_incidents),
            "incident_ids": [inc.id for inc, _ in detected_incidents],
        }


n8n_sync_service = N8NSyncService()
