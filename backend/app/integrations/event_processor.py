from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.n8n_events import NormalizedN8NEvent
from app.lib.classifier import classify_error
from app.models.entities import Execution, Incident, Integration, Workflow, generate_uuid


def _utc_datetime(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


async def process_n8n_event(
    db: AsyncSession,
    integration: Integration,
    event: NormalizedN8NEvent,
) -> tuple[Execution, Optional[Incident]]:
    workflow_result = await db.execute(
        select(Workflow).where(
            Workflow.integration_id == integration.id,
            Workflow.agency_id == integration.agency_id,
            Workflow.external_workflow_id == event.external_workflow_id,
        ).with_for_update()
    )
    workflow = workflow_result.scalar_one_or_none()
    if workflow is None:
        raise LookupError("Workflow is not synchronized for this n8n integration")

    started_at = _utc_datetime(event.started_at) or datetime.now(timezone.utc)
    completed_at = _utc_datetime(event.completed_at)
    duration_ms = (
        max(0, int((completed_at - started_at).total_seconds() * 1000))
        if completed_at is not None
        else 0
    )
    execution_result = await db.execute(
        select(Execution).where(
            Execution.workflow_id == workflow.id,
            Execution.external_execution_id == event.external_execution_id,
        )
    )
    existing_execution = execution_result.scalar_one_or_none()
    previous_status = existing_execution.status if existing_execution else None
    execution_values = {
        "id": existing_execution.id if existing_execution else generate_uuid(),
        "workflow_id": workflow.id,
        "external_execution_id": event.external_execution_id,
        "status": event.status,
        "duration_ms": duration_ms,
        "started_at": started_at,
        "completed_at": completed_at,
        "error_message": event.error_message,
        "stack_trace": event.stack_trace,
        "error_payload": event.safe_payload,
    }
    if db.get_bind().dialect.name == "postgresql":
        statement = (
            pg_insert(Execution)
            .values(**execution_values)
            .on_conflict_do_update(
                index_elements=[Execution.workflow_id, Execution.external_execution_id],
                index_where=Execution.external_execution_id.is_not(None),
                set_={key: value for key, value in execution_values.items() if key not in {"id", "workflow_id", "external_execution_id"}},
            )
            .returning(Execution.id)
        )
        execution_id = (await db.execute(statement)).scalar_one()
        execution = await db.get(Execution, execution_id, populate_existing=True)
        if execution is None:
            raise RuntimeError("Execution upsert did not return a persisted record")
    else:
        execution = existing_execution
        if execution is None:
            execution = Execution(**execution_values)
            db.add(execution)
        else:
            execution.status = event.status
            execution.duration_ms = duration_ms
            execution.started_at = started_at
            execution.completed_at = completed_at
            execution.error_message = event.error_message
            execution.stack_trace = event.stack_trace
            execution.error_payload = event.safe_payload

    workflow.last_execution_at = completed_at or started_at
    incident: Optional[Incident] = None
    if event.status == "SUCCESS":
        workflow.consecutive_failures = 0
        workflow.health_status = "HEALTHY"
        workflow.last_successful_at = completed_at or started_at
    elif event.status == "FAILED":
        if previous_status != "FAILED":
            workflow.consecutive_failures += 1
        workflow.health_status = "FAILING" if workflow.consecutive_failures >= 3 else "DEGRADED"
        workflow.last_failed_at = completed_at or started_at
        classified = classify_error(event.error_message or "n8n execution failed")
        await db.flush()
        incident_result = await db.execute(
            select(Incident).where(Incident.execution_record_id == execution.id)
        )
        incident = incident_result.scalar_one_or_none()
        incident_values = {
            "agency_id": integration.agency_id,
            "client_id": workflow.client_id,
            "workflow_id": workflow.id,
            "execution_id": event.external_execution_id,
            "execution_record_id": execution.id,
            "error_category": classified["category"],
            "error_message": event.error_message or "n8n execution failed",
            "severity": classified["severity"],
            "status": "AWAITING_APPROVAL" if classified["requires_approval"] else "OPEN",
            "occurrence_count": 1,
            "first_detected_at": completed_at or started_at,
            "last_detected_at": completed_at or started_at,
        }
        if incident is None and db.get_bind().dialect.name == "postgresql":
            statement = (
                pg_insert(Incident)
                .values(**incident_values)
                .on_conflict_do_update(
                    index_elements=[Incident.execution_record_id],
                    set_={
                        "error_category": incident_values["error_category"],
                        "error_message": incident_values["error_message"],
                        "severity": incident_values["severity"],
                        "last_detected_at": incident_values["last_detected_at"],
                    },
                )
                .returning(Incident.id)
            )
            incident_id = (await db.execute(statement)).scalar_one()
            incident = await db.get(Incident, incident_id, populate_existing=True)
            if incident is None:
                raise RuntimeError("Incident upsert did not return a persisted record")
        elif incident is None:
            incident = Incident(
                **incident_values,
            )
            db.add(incident)
        else:
            incident.error_category = classified["category"]
            incident.error_message = event.error_message or "n8n execution failed"
            incident.severity = classified["severity"]
            incident.last_detected_at = completed_at or started_at

    await db.flush()
    return execution, incident
