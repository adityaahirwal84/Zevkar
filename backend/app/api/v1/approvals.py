from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tenant_member, require_role
from app.core.database import get_db
from app.models.entities import AgencyMember, Incident, RecoveryApproval, RecoveryRequest, User
from app.services.recovery_engine import recovery_engine_service

router = APIRouter(prefix="/approvals", tags=["Approvals"])


class ApprovalResponse(BaseModel):
    decision: str  # APPROVE/APPROVED or REJECT/REJECTED
    rejection_reason: Optional[str] = None
    reason: Optional[str] = None


class ApprovalCancelBody(BaseModel):
    reason: Optional[str] = "Cancelled by operator."


@router.get("")
async def list_approvals(
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RecoveryApproval)
        .join(Incident, RecoveryApproval.incident_id == Incident.id)
        .where(Incident.agency_id == member.agency_id)
        .order_by(RecoveryApproval.created_at.desc())
    )
    approvals = result.scalars().all()

    rec_ids = {a.recovery_request_id for a in approvals if a.recovery_request_id}
    rec_map = {}
    if rec_ids:
        recs = (await db.execute(select(RecoveryRequest).where(RecoveryRequest.id.in_(rec_ids)))).scalars().all()
        rec_map = {r.id: r for r in recs}

    enriched = []
    for appr in approvals:
        linked = rec_map.get(appr.recovery_request_id) if appr.recovery_request_id else None
        enriched.append(
            {
                "id": appr.id,
                "incident_id": appr.incident_id,
                "recovery_request_id": appr.recovery_request_id,
                "agency_id": appr.agency_id or member.agency_id,
                "requested_by": appr.requested_by,
                "proposed_action": appr.proposed_action,
                "risk_reason": appr.risk_reason,
                "status": appr.status,
                "created_at": appr.created_at,
                "approver_user_id": appr.approver_user_id,
                "responded_by": appr.responded_by,
                "responded_at": appr.responded_at,
                "rejection_reason": appr.rejection_reason,
                "strategy": linked.strategy if linked else None,
                "risk_level": linked.risk_level if linked else None,
                "recovery_status": linked.status if linked else None,
            }
        )
    return enriched


@router.post("/{approval_id}/respond")
async def respond_to_approval(
    approval_id: str,
    payload: ApprovalResponse,
    request: Request,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    user = (await db.execute(select(User).where(User.id == member.user_id))).scalar_one_or_none()
    approver_label = user.email if user else member.user_id
    ip = request.client.host if request.client else None

    result = await recovery_engine_service.submit_approval_decision(
        db,
        agency_id=member.agency_id,
        approval_id=approval_id,
        approver_user_id=member.user_id,
        approver_label=approver_label,
        decision=payload.decision,
        reason=payload.rejection_reason or payload.reason,
        ip_address=ip,
    )
    await db.commit()
    return result


@router.post("/{approval_id}/cancel")
async def cancel_approval(
    approval_id: str,
    payload: ApprovalCancelBody,
    request: Request,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "DEVELOPER"])),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(RecoveryApproval)
        .join(Incident, RecoveryApproval.incident_id == Incident.id)
        .where(RecoveryApproval.id == approval_id, Incident.agency_id == member.agency_id)
    )
    appr = res.scalar_one_or_none()
    if not appr:
        raise HTTPException(status_code=404, detail="Approval request not found")

    ip = request.client.host if request.client else None
    if appr.recovery_request_id:
        req = await recovery_engine_service.cancel_recovery_request(
            db,
            agency_id=member.agency_id,
            request_id=appr.recovery_request_id,
            user_id=member.user_id,
            reason=payload.reason,
            ip_address=ip,
        )
        await db.commit()
        return {"success": True, "approval_id": appr.id, "status": "CANCELLED", "recovery_status": req.status}

    if appr.status != "PENDING":
        raise HTTPException(status_code=409, detail=f"Cannot cancel approval in status '{appr.status}'")

    from datetime import datetime, timezone

    appr.status = "CANCELLED"
    appr.approver_user_id = member.user_id
    appr.responded_at = datetime.now(timezone.utc)
    appr.rejection_reason = payload.reason
    await db.commit()
    return {"success": True, "approval_id": appr.id, "status": "CANCELLED"}
