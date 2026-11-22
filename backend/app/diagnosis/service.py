from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.diagnosis.gemini_engine import gemini_engine
from app.models.entities import (
    AIDiagnosis,
    Incident,
    RecoveryApproval,
)


async def diagnose_and_persist(
    db: AsyncSession,
    incident: Incident,
    requested_by: str | None = None,
) -> AIDiagnosis:
    workflow = incident.workflow
    execution = incident.execution
    client = incident.client
    execution_metadata = {}
    safe_payload = {}
    if execution is not None:
        execution_metadata = {
            "status": execution.status,
            "duration_ms": execution.duration_ms,
            "started_at": execution.started_at.isoformat() if execution.started_at else None,
            "completed_at": execution.completed_at.isoformat() if execution.completed_at else None,
        }
        safe_payload = execution.error_payload or {}

    diagnosis = await gemini_engine.diagnose_incident(
        workflow_name=workflow.name if workflow else "Automation Workflow",
        platform=workflow.platform if workflow else "unknown",
        client_name=client.name if client else "Organization",
        error_message=incident.error_message,
        execution_id=incident.execution_id or "unknown",
        stack_trace=execution.stack_trace if execution else None,
        execution_metadata=execution_metadata,
        safe_payload=safe_payload,
    )
    record = AIDiagnosis(
        incident_id=incident.id,
        error_category=diagnosis["error_category"],
        severity=diagnosis["severity"],
        root_cause=diagnosis["root_cause"],
        simple_explanation=diagnosis["simple_explanation"],
        technical_explanation=diagnosis["technical_explanation"],
        probable_causes=diagnosis.get("probable_causes", []),
        recommended_actions=diagnosis["recommended_actions"],
        suggested_recovery=diagnosis["suggested_recovery"],
        requires_human_approval=diagnosis["requires_human_approval"],
        confidence=diagnosis["confidence"],
        is_ai_generated=diagnosis.get("is_ai_generated", False),
        token_count=0,
    )
    db.add(record)
    if record.requires_human_approval:
        pending = await db.execute(
            select(RecoveryApproval.id).where(
                RecoveryApproval.incident_id == incident.id,
                RecoveryApproval.status == "PENDING",
            )
        )
        if pending.scalar_one_or_none() is None:
            db.add(
                RecoveryApproval(
                    incident_id=incident.id,
                    requested_by=requested_by,
                    proposed_action=record.suggested_recovery,
                    risk_reason=record.root_cause,
                    status="PENDING",
                )
            )
        incident.status = "AWAITING_APPROVAL"
    elif incident.status not in {"RESOLVED", "IGNORED", "DISMISSED"}:
        incident.status = "INVESTIGATING"

    await db.flush()
    return record
