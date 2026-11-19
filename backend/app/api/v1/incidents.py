from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.entities import AIDiagnosis, AgencyMember, Incident, RecoveryRequest, Workflow
from app.api.deps import get_current_tenant_member, require_role
from app.schemas.pydantic_models import IncidentAssignRequest, IncidentOut, IncidentStatusUpdate
from app.services.n8n_sync import run_diagnosis_for_incident
from app.services.recovery_engine import recovery_engine_service

router = APIRouter(prefix="/incidents", tags=["Incidents"])


def _serialize_diagnosis(diag: Optional[AIDiagnosis]) -> Optional[Dict[str, Any]]:
    if not diag:
        return None
    return {
        "id": diag.id,
        "incident_id": diag.incident_id,
        "error_category": diag.error_category,
        "severity": diag.severity,
        "root_cause": diag.root_cause,
        "simple_explanation": diag.simple_explanation,
        "technical_explanation": diag.technical_explanation,
        "recommended_actions": diag.recommended_actions or [],
        "verified_facts": diag.verified_facts or [],
        "ai_hypotheses": diag.ai_hypotheses or [],
        "suggested_recovery": diag.suggested_recovery,
        "requires_human_approval": diag.requires_human_approval,
        "is_recoverable": diag.is_recoverable,
        "recommended_strategy": diag.recommended_strategy,
        "recommendation_reason": diag.recommendation_reason,
        "expected_risk_level": diag.expected_risk_level,
        "required_user_action": diag.required_user_action,
        "max_recommended_retries": diag.max_recommended_retries,
        "confidence": diag.confidence,
        "is_ai_generated": diag.is_ai_generated,
        "model_used": diag.model_used,
        "fallback_reason": diag.fallback_reason,
        "token_count": diag.token_count,
        "diagnosed_at": diag.diagnosed_at,
    }


def _latest_recovery_status(requests: List[RecoveryRequest]) -> Optional[str]:
    if not requests:
        return None
    ordered = sorted(requests, key=lambda r: r.created_at, reverse=True)
    return ordered[0].status


@router.get("", response_model=List[IncidentOut])
async def list_incidents(
    member: AgencyMember = Depends(get_current_tenant_member),
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Incident)
        .options(
            selectinload(Incident.workflow),
            selectinload(Incident.ai_diagnosis),
            selectinload(Incident.recovery_requests),
        )
        .where(Incident.agency_id == member.agency_id)
    )
    if status_filter:
        query = query.where(Incident.status == status_filter)
    query = query.order_by(Incident.last_detected_at.desc())

    incidents = (await db.execute(query)).scalars().all()
    out: List[Dict[str, Any]] = []
    for inc in incidents:
        out.append(
            {
                "id": inc.id,
                "agency_id": inc.agency_id,
                "client_id": inc.client_id,
                "workflow_id": inc.workflow_id,
                "workflow_name": inc.workflow.name if inc.workflow else None,
                "platform": inc.workflow.platform if inc.workflow else None,
                "execution_id": inc.execution_id,
                "execution_record_id": inc.execution_record_id,
                "error_category": inc.error_category,
                "error_message": inc.error_message,
                "severity": inc.severity,
                "status": inc.status,
                "diagnosis_status": "DIAGNOSED" if inc.ai_diagnosis else "PENDING",
                "recovery_status": _latest_recovery_status(inc.recovery_requests or []),
                "first_detected_at": inc.first_detected_at,
                "last_detected_at": inc.last_detected_at,
                "occurrence_count": inc.occurrence_count,
                "assigned_member_id": inc.assigned_member_id,
            }
        )
    return out


@router.get("/{incident_id}")
async def get_incident_detail(
    incident_id: str,
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Incident)
        .options(
            selectinload(Incident.workflow),
            selectinload(Incident.ai_diagnosis),
            selectinload(Incident.recovery_attempts),
            selectinload(Incident.recovery_requests),
        )
        .where(Incident.id == incident_id, Incident.agency_id == member.agency_id)
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    sorted_requests = sorted(incident.recovery_requests or [], key=lambda r: r.created_at, reverse=True)
    sorted_attempts = sorted(incident.recovery_attempts or [], key=lambda a: a.executed_at, reverse=True)

    return {
        "id": incident.id,
        "agency_id": incident.agency_id,
        "client_id": incident.client_id,
        "workflow_id": incident.workflow_id,
        "workflow_name": incident.workflow.name if incident.workflow else None,
        "platform": incident.workflow.platform if incident.workflow else None,
        "workflow_health_status": incident.workflow.health_status if incident.workflow else None,
        "execution_id": incident.execution_id,
        "execution_record_id": incident.execution_record_id,
        "error_category": incident.error_category,
        "error_message": incident.error_message,
        "severity": incident.severity,
        "status": incident.status,
        "diagnosis_status": "DIAGNOSED" if incident.ai_diagnosis else "PENDING",
        "recovery_status": sorted_requests[0].status if sorted_requests else None,
        "assigned_member_id": incident.assigned_member_id,
        "first_detected_at": incident.first_detected_at,
        "last_detected_at": incident.last_detected_at,
        "occurrence_count": incident.occurrence_count,
        "ai_diagnosis": _serialize_diagnosis(incident.ai_diagnosis),
        "recovery_requests": [
            {
                "id": req.id,
                "strategy": req.strategy,
                "status": req.status,
                "risk_level": req.risk_level,
                "requires_approval": req.requires_approval,
                "retry_count": req.retry_count,
                "max_retry_attempts": req.max_retry_attempts,
                "result_verified": req.result_verified,
                "final_result_summary": req.final_result_summary,
                "last_error": req.last_error,
                "verification_deadline_at": req.verification_deadline_at,
                "created_at": req.created_at,
                "completed_at": req.completed_at,
            }
            for req in sorted_requests
        ],
        "recovery_attempts": sorted_attempts,
    }


@router.get("/{incident_id}/diagnosis")
async def get_incident_diagnosis(
    incident_id: str,
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Incident)
        .options(selectinload(Incident.ai_diagnosis))
        .where(Incident.id == incident_id, Incident.agency_id == member.agency_id)
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    if not incident.ai_diagnosis:
        return {"incident_id": incident_id, "diagnosis_status": "PENDING", "diagnosis": None}
    return {
        "incident_id": incident_id,
        "diagnosis_status": "DIAGNOSED",
        **_serialize_diagnosis(incident.ai_diagnosis),
    }


@router.post("/{incident_id}/diagnose")
async def trigger_incident_diagnosis(
    incident_id: str,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "DEVELOPER"])),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Incident).where(Incident.id == incident_id, Incident.agency_id == member.agency_id)
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    wf = (await db.execute(select(Workflow).where(Workflow.id == incident.workflow_id))).scalar_one_or_none()
    diag_record = await run_diagnosis_for_incident(db, incident, wf)
    await db.commit()
    await db.refresh(diag_record)
    return {**_serialize_diagnosis(diag_record), "persisted": True}


@router.put("/{incident_id}/status")
async def update_incident_status(
    incident_id: str,
    payload: IncidentStatusUpdate,
    request: Request,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "DEVELOPER"])),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Incident).where(Incident.id == incident_id, Incident.agency_id == member.agency_id)
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    previous_status = incident.status
    incident.status = payload.status
    await recovery_engine_service.create_audit_log(
        db,
        agency_id=member.agency_id,
        user_id=member.user_id,
        action="INCIDENT_STATUS_UPDATED",
        entity_type="INCIDENT",
        entity_id=incident.id,
        details={"from": previous_status, "to": payload.status},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"success": True, "id": incident.id, "status": incident.status}


@router.post("/{incident_id}/assign")
async def assign_incident(
    incident_id: str,
    payload: IncidentAssignRequest,
    request: Request,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "DEVELOPER"])),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Incident).where(Incident.id == incident_id, Incident.agency_id == member.agency_id)
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    target_user_id = payload.user_id or member.user_id
    assignee = (
        await db.execute(
            select(AgencyMember).where(
                AgencyMember.agency_id == member.agency_id,
                AgencyMember.user_id == target_user_id,
            )
        )
    ).scalar_one_or_none()
    if not assignee:
        raise HTTPException(status_code=404, detail="Assignee is not a member of this organization")

    incident.assigned_member_id = assignee.id
    await recovery_engine_service.create_audit_log(
        db,
        agency_id=member.agency_id,
        user_id=member.user_id,
        action="INCIDENT_ASSIGNED",
        entity_type="INCIDENT",
        entity_id=incident.id,
        details={"assigned_member_id": assignee.id, "assigned_user_id": assignee.user_id},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"success": True, "id": incident.id, "assigned_member_id": assignee.id}


@router.post("/{incident_id}/dismiss")
async def dismiss_incident(
    incident_id: str,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "DEVELOPER"])),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Incident).where(Incident.id == incident_id, Incident.agency_id == member.agency_id)
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    incident.status = "DISMISSED"
    await db.commit()
    return {"success": True, "id": incident_id, "status": "DISMISSED"}
