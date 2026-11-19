from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tenant_member, require_role
from app.core.database import get_db
from app.models.entities import AgencyMember, Execution, Workflow
from app.schemas.pydantic_models import ExecutionOut, WorkflowCreate
from app.services.n8n_sync import n8n_sync_service

router = APIRouter(prefix="/workflows", tags=["Workflows"])


class WorkflowOut(BaseModel):
    id: str
    agency_id: str
    client_id: Optional[str] = None
    integration_id: Optional[str] = None
    name: str
    platform: str
    external_workflow_id: Optional[str]
    is_active: bool
    health_status: str
    consecutive_failures: int
    avg_duration_ms: int = 0
    stuck_timeout_seconds: Optional[int] = None
    allow_long_running: bool = False
    last_execution_at: Optional[datetime] = None
    last_successful_at: Optional[datetime] = None
    last_failed_at: Optional[datetime] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class WorkflowTimeoutUpdate(BaseModel):
    stuck_timeout_seconds: Optional[int] = Field(default=None, ge=30, le=86400)
    allow_long_running: Optional[bool] = None


@router.get("", response_model=List[WorkflowOut])
async def list_workflows(
    member: AgencyMember = Depends(get_current_tenant_member),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Workflow)
        .where(Workflow.agency_id == member.agency_id)
        .order_by(Workflow.last_execution_at.desc().nullslast(), Workflow.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


@router.post("", response_model=WorkflowOut, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    payload: WorkflowCreate,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "DEVELOPER"])),
    db: AsyncSession = Depends(get_db),
):
    wf = Workflow(
        agency_id=member.agency_id,
        client_id=payload.client_id,
        integration_id=payload.integration_id,
        name=payload.name,
        platform=payload.platform,
        external_workflow_id=payload.external_workflow_id or f"wf_{int(datetime.now().timestamp())}",
        is_active=True,
        health_status="HEALTHY",
        consecutive_failures=0,
        stuck_timeout_seconds=payload.stuck_timeout_seconds,
        allow_long_running=payload.allow_long_running,
    )
    db.add(wf)
    await db.commit()
    await db.refresh(wf)
    return wf


@router.get("/executions/recent", response_model=List[ExecutionOut])
async def list_recent_executions(
    workflow_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Execution)
        .join(Workflow, Execution.workflow_id == Workflow.id)
        .where(Workflow.agency_id == member.agency_id)
    )
    if workflow_id:
        query = query.where(Execution.workflow_id == workflow_id)
    if status_filter:
        query = query.where(Execution.status == status_filter.upper())
    query = query.order_by(Execution.started_at.desc()).limit(limit)

    result = await db.execute(query)
    return result.scalars().all()


@router.post("/executions/detect-stuck")
async def trigger_stuck_execution_check(
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "DEVELOPER"])),
    db: AsyncSession = Depends(get_db),
):
    return await n8n_sync_service.detect_stuck_executions(
        db,
        agency_id=member.agency_id,
        inline_diagnosis_fallback=True,
    )


@router.get("/{workflow_id}")
async def get_workflow_detail(
    workflow_id: str,
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    wf_res = await db.execute(
        select(Workflow).where(Workflow.id == workflow_id, Workflow.agency_id == member.agency_id)
    )
    wf = wf_res.scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    execs = (
        await db.execute(
            select(Execution)
            .where(Execution.workflow_id == workflow_id)
            .order_by(Execution.started_at.desc())
            .limit(25)
        )
    ).scalars().all()
    return {
        "workflow": WorkflowOut.model_validate(wf),
        "recent_executions": [ExecutionOut.model_validate(e) for e in execs],
    }


@router.get("/{workflow_id}/executions", response_model=List[ExecutionOut])
async def get_workflow_executions(
    workflow_id: str,
    limit: int = Query(50, ge=1, le=200),
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    wf_res = await db.execute(
        select(Workflow).where(Workflow.id == workflow_id, Workflow.agency_id == member.agency_id)
    )
    if not wf_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Workflow not found")

    result = await db.execute(
        select(Execution)
        .where(Execution.workflow_id == workflow_id)
        .order_by(Execution.started_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


@router.patch("/{workflow_id}/timeout", response_model=WorkflowOut)
async def update_workflow_timeout(
    workflow_id: str,
    payload: WorkflowTimeoutUpdate,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "DEVELOPER"])),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(Workflow).where(Workflow.id == workflow_id, Workflow.agency_id == member.agency_id)
    )
    wf = res.scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if payload.stuck_timeout_seconds is not None:
        wf.stuck_timeout_seconds = payload.stuck_timeout_seconds
    if payload.allow_long_running is not None:
        wf.allow_long_running = payload.allow_long_running

    await db.commit()
    await db.refresh(wf)
    return wf


@router.delete("/{workflow_id}", status_code=status.HTTP_200_OK)
async def delete_workflow(
    workflow_id: str,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Workflow).where(Workflow.id == workflow_id, Workflow.agency_id == member.agency_id)
    )
    wf = result.scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    await db.delete(wf)
    await db.commit()
    return {"success": True, "id": workflow_id}
