from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_role
from app.core.database import get_db
from app.models.entities import AgencyMember, Incident, Workflow
from app.services.n8n_sync import run_diagnosis_for_incident

router = APIRouter(prefix="/diagnosis", tags=["Diagnosis"])


class AnalyzeRequest(BaseModel):
    incident_id: str


@router.post("/analyze")
async def analyze_incident(
    payload: AnalyzeRequest,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "DEVELOPER"])),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Incident).where(
            Incident.id == payload.incident_id,
            Incident.agency_id == member.agency_id,
        )
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    wf_res = await db.execute(select(Workflow).where(Workflow.id == incident.workflow_id))
    wf = wf_res.scalar_one_or_none()

    diag_record = await run_diagnosis_for_incident(db, incident, wf)
    await db.commit()
    await db.refresh(diag_record)

    return {
        "id": diag_record.id,
        "incident_id": incident.id,
        "error_category": diag_record.error_category,
        "severity": diag_record.severity,
        "root_cause": diag_record.root_cause,
        "simple_explanation": diag_record.simple_explanation,
        "technical_explanation": diag_record.technical_explanation,
        "recommended_actions": diag_record.recommended_actions,
        "verified_facts": diag_record.verified_facts or [],
        "ai_hypotheses": diag_record.ai_hypotheses or [],
        "suggested_recovery": diag_record.suggested_recovery,
        "requires_human_approval": diag_record.requires_human_approval,
        "is_recoverable": diag_record.is_recoverable,
        "recommended_strategy": diag_record.recommended_strategy,
        "recommendation_reason": diag_record.recommendation_reason,
        "expected_risk_level": diag_record.expected_risk_level,
        "required_user_action": diag_record.required_user_action,
        "max_recommended_retries": diag_record.max_recommended_retries,
        "confidence": diag_record.confidence,
        "is_ai_generated": diag_record.is_ai_generated,
        "model_used": diag_record.model_used,
        "fallback_reason": diag_record.fallback_reason,
        "token_count": diag_record.token_count,
        "diagnosed_at": diag_record.diagnosed_at,
        "persisted": True,
    }
