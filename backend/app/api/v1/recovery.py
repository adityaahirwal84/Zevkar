import hashlib
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tenant_member, require_role
from app.core.database import get_db
from app.models.entities import AgencyMember, Incident, RecoveryAttempt
from app.schemas.pydantic_models import (
    RecoveryAttemptOut,
    RecoveryCancelRequest,
    RecoveryExecuteRequest,
    RecoveryPolicyOut,
    RecoveryPolicyUpdate,
    RecoveryRequestCreate,
)
from app.services.recovery_engine import recovery_engine_service

router = APIRouter(prefix="/recovery", tags=["Recovery Engine"])


def generate_idempotency_key(incident_id: str, action: str, occurrence: int) -> str:
    raw = f"{incident_id}:{action}:{occurrence}"
    return hashlib.sha256(raw.encode()).hexdigest()


@router.get("/policies", response_model=RecoveryPolicyOut)
async def get_recovery_policy(
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    policy = await recovery_engine_service.get_or_create_policy(db, member.agency_id)
    await db.commit()
    await db.refresh(policy)
    return policy


@router.put("/policies", response_model=RecoveryPolicyOut)
async def update_recovery_policy(
    payload: RecoveryPolicyUpdate,
    request: Request,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    ip = request.client.host if request.client else None
    policy = await recovery_engine_service.update_policy(
        db,
        agency_id=member.agency_id,
        user_id=member.user_id,
        updates=payload.model_dump(),
        ip_address=ip,
    )
    await db.commit()
    await db.refresh(policy)
    return policy


@router.get("/metrics")
async def get_recovery_metrics(
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    return await recovery_engine_service.get_recovery_metrics(db, member.agency_id)


@router.get("/requests")
async def list_recovery_requests(
    status_filter: Optional[str] = None,
    limit: int = 50,
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    return await recovery_engine_service.list_recovery_requests(
        db, agency_id=member.agency_id, status_filter=status_filter, limit=limit
    )


@router.post("/requests", status_code=status.HTTP_201_CREATED)
async def create_recovery_request(
    payload: RecoveryRequestCreate,
    request: Request,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "DEVELOPER"])),
    db: AsyncSession = Depends(get_db),
):
    ip = request.client.host if request.client else None
    req = await recovery_engine_service.create_recovery_request(
        db,
        agency_id=member.agency_id,
        user_id=member.user_id,
        incident_id=payload.incident_id,
        strategy=payload.strategy,
        delay_seconds=payload.delay_seconds,
        reason=payload.reason,
        idempotency_key=payload.idempotency_key,
        ip_address=ip,
    )
    await db.commit()
    await db.refresh(req)
    return req


@router.get("/requests/{request_id}")
async def get_recovery_request_detail(
    request_id: str,
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    return await recovery_engine_service.get_recovery_request_detail(db, member.agency_id, request_id)


@router.post("/requests/{request_id}/execute")
async def execute_recovery_request(
    request_id: str,
    request: Request,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "DEVELOPER"])),
    db: AsyncSession = Depends(get_db),
):
    ip = request.client.host if request.client else None
    result = await recovery_engine_service.execute_and_verify_recovery(
        db,
        agency_id=member.agency_id,
        request_id=request_id,
        actor_user_id=member.user_id,
        verify_result=True,
        ip_address=ip,
    )
    await db.commit()
    return result


@router.post("/requests/{request_id}/verify")
async def verify_recovery_request(
    request_id: str,
    request: Request,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "DEVELOPER"])),
    db: AsyncSession = Depends(get_db),
):
    ip = request.client.host if request.client else None
    result = await recovery_engine_service.verify_pending_recovery(
        db,
        agency_id=member.agency_id,
        request_id=request_id,
        actor_user_id=member.user_id,
        ip_address=ip,
    )
    await db.commit()
    return result


@router.post("/requests/{request_id}/cancel")
async def cancel_recovery_request(
    request_id: str,
    payload: RecoveryCancelRequest,
    request: Request,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "DEVELOPER"])),
    db: AsyncSession = Depends(get_db),
):
    ip = request.client.host if request.client else None
    req = await recovery_engine_service.cancel_recovery_request(
        db,
        agency_id=member.agency_id,
        request_id=request_id,
        user_id=member.user_id,
        reason=payload.reason,
        ip_address=ip,
    )
    await db.commit()
    await db.refresh(req)
    return {"success": True, "id": req.id, "status": req.status}


@router.get("/attempts", response_model=List[RecoveryAttemptOut])
async def list_recovery_attempts(
    limit: int = 50,
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(RecoveryAttempt)
        .join(Incident, RecoveryAttempt.incident_id == Incident.id)
        .where(Incident.agency_id == member.agency_id)
        .order_by(RecoveryAttempt.executed_at.desc())
        .limit(limit)
    )
    return res.scalars().all()


@router.post("/execute")
async def execute_recovery(
    payload: RecoveryExecuteRequest,
    request: Request,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "DEVELOPER"])),
    db: AsyncSession = Depends(get_db),
):
    """
    Executes a recovery workflow safely via RecoveryEngineService.
    Accepts either `recovery_request_id` or `incident_id` (creating a policy-governed request if needed).
    Never bypasses human approval or fabricates recovery success.
    """
    ip = request.client.host if request.client else None
    request_id = payload.recovery_request_id

    if not request_id:
        if not payload.incident_id:
            raise HTTPException(status_code=400, detail="Either recovery_request_id or incident_id is required")

        strategy_map = {
            "MANUAL_RETRY": "RETRY_EXECUTION",
            "RETRY_EXECUTION": "RETRY_EXECUTION",
            "REEXECUTE_WORKFLOW": "REEXECUTE_WORKFLOW",
            "RETRY_AFTER_DELAY": "RETRY_AFTER_DELAY",
            "RETRY_EXPONENTIAL_BACKOFF": "RETRY_EXPONENTIAL_BACKOFF",
            "MANUAL_RECOVERY": "MANUAL_RECOVERY",
            "MARK_NON_RECOVERABLE": "MARK_NON_RECOVERABLE",
            "ESCALATE_HUMAN": "ESCALATE_HUMAN",
        }
        strategy = strategy_map.get(payload.action.upper(), "RETRY_EXECUTION")
        try:
            req = await recovery_engine_service.create_recovery_request(
                db,
                agency_id=member.agency_id,
                user_id=member.user_id,
                incident_id=payload.incident_id,
                strategy=strategy,
                ip_address=ip,
            )
            request_id = req.id
        except HTTPException as exc:
            if exc.status_code == status.HTTP_409_CONFLICT:
                from app.models.entities import RecoveryRequest as RecoveryRequestModel

                existing = (
                    await db.execute(
                        select(RecoveryRequestModel)
                        .where(
                            RecoveryRequestModel.incident_id == payload.incident_id,
                            RecoveryRequestModel.agency_id == member.agency_id,
                        )
                        .order_by(RecoveryRequestModel.created_at.desc())
                    )
                ).scalars().first()
                if not existing:
                    raise
                request_id = existing.id
            else:
                raise

    result = await recovery_engine_service.execute_and_verify_recovery(
        db,
        agency_id=member.agency_id,
        request_id=request_id,
        actor_user_id=member.user_id,
        verify_result=payload.verify_result,
        ip_address=ip,
    )
    await db.commit()
    return result
