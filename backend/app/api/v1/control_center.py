from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tenant_member, require_role
from app.core.database import get_db
from app.diagnosis.gemini_engine import gemini_engine
from app.integrations.registry import get_default_capabilities_for_platform
from app.models.entities import (
    AgencyMember,
    ControlActionRequest,
    ControlActivityLog,
    Execution,
    Incident,
    Integration,
    RecoveryRequest,
    Workflow,
)
from app.schemas.pydantic_models import (
    ControlActionCreate,
    ControlActionOut,
    ControlActionReject,
    ControlActivityLogOut,
    ControlAssistantQuery,
)
from app.services.control_engine import (
    ALLOWED_APPROVER_ROLES,
    ALLOWED_OPERATOR_ROLES,
    control_engine_service,
    normalize_workflow_control_status,
)

router = APIRouter(prefix="/control-center", tags=["Automation Control Center"])


def _serialize_workflow_for_control(
    wf: Workflow,
    integration: Optional[Integration],
    open_incidents_count: int = 0,
) -> Dict[str, Any]:
    caps = control_engine_service.resolve_capabilities_for_workflow(wf, integration)
    ctrl_status = normalize_workflow_control_status(wf)
    return {
        "id": wf.id,
        "agency_id": wf.agency_id,
        "client_id": wf.client_id,
        "integration_id": wf.integration_id,
        "integration_name": integration.name if integration else None,
        "integration_status": integration.status if integration else "UNLINKED",
        "platform": wf.platform,
        "external_workflow_id": wf.external_workflow_id,
        "name": wf.name,
        "is_active": wf.is_active,
        "control_status": ctrl_status,
        "health_status": wf.health_status,
        "consecutive_failures": wf.consecutive_failures,
        "avg_duration_ms": wf.avg_duration_ms,
        "last_execution_at": wf.last_execution_at,
        "last_successful_at": wf.last_successful_at,
        "last_failed_at": wf.last_failed_at,
        "next_scheduled_at": wf.next_scheduled_at,
        "schedule_config": wf.schedule_config,
        "provider_settings": wf.provider_settings,
        "open_incidents_count": open_incidents_count,
        "capabilities": caps.model_dump(),
        "created_at": wf.created_at,
    }


@router.get("/overview")
async def get_control_center_overview(
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    integrations = (
        await db.execute(
            select(Integration)
            .where(Integration.agency_id == member.agency_id)
            .order_by(Integration.created_at.desc())
        )
    ).scalars().all()
    workflows = (
        await db.execute(
            select(Workflow)
            .where(Workflow.agency_id == member.agency_id)
            .order_by(Workflow.last_execution_at.desc().nullslast(), Workflow.name.asc())
        )
    ).scalars().all()
    incidents = (
        await db.execute(
            select(Incident).where(
                Incident.agency_id == member.agency_id,
                Incident.status.notin_(("RESOLVED", "IGNORED", "DISMISSED")),
            )
        )
    ).scalars().all()
    pending_actions = (
        await db.execute(
            select(ControlActionRequest)
            .where(
                ControlActionRequest.agency_id == member.agency_id,
                ControlActionRequest.status == "AWAITING_APPROVAL",
            )
            .order_by(ControlActionRequest.created_at.desc())
        )
    ).scalars().all()

    integ_map = {i.id: i for i in integrations}
    inc_counts: Dict[str, int] = {}
    for inc in incidents:
        inc_counts[inc.workflow_id] = inc_counts.get(inc.workflow_id, 0) + 1

    wf_items = [
        _serialize_workflow_for_control(wf, integ_map.get(wf.integration_id), inc_counts.get(wf.id, 0))
        for wf in workflows
    ]

    status_counts = {"ACTIVE": 0, "INACTIVE": 0, "PAUSED": 0, "FAILED": 0, "UNKNOWN": 0}
    for item in wf_items:
        st = item["control_status"]
        status_counts[st] = status_counts.get(st, 0) + 1

    platforms_out = []
    for integ in integrations:
        caps = get_default_capabilities_for_platform(integ.platform, integ)
        platforms_out.append(
            {
                "id": integ.id,
                "name": integ.name,
                "platform": integ.platform,
                "status": integ.status,
                "last_synced_at": integ.last_synced_at,
                "last_sync_status": integ.last_sync_status,
                "workflow_count": sum(1 for wf in workflows if wf.integration_id == integ.id),
                "capabilities": caps.model_dump(),
            }
        )

    return {
        "agency_id": member.agency_id,
        "actor_role": member.role,
        "can_execute_controls": member.role in ALLOWED_OPERATOR_ROLES,
        "can_approve_controls": member.role in ALLOWED_APPROVER_ROLES,
        "summary": {
            "total_platforms": len(platforms_out),
            "total_workflows": len(wf_items),
            "awaiting_approvals": len(pending_actions),
            "open_incidents": len(incidents),
            "status_counts": status_counts,
        },
        "platforms": platforms_out,
        "workflows": wf_items,
    }


@router.get("/workflows")
async def list_control_workflows(
    platform: Optional[str] = None,
    status_filter: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = Query("last_execution", pattern="^(name|last_execution|failures|status)$"),
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    integrations = (
        await db.execute(select(Integration).where(Integration.agency_id == member.agency_id))
    ).scalars().all()
    integ_map = {i.id: i for i in integrations}

    workflows = (
        await db.execute(select(Workflow).where(Workflow.agency_id == member.agency_id))
    ).scalars().all()
    incidents = (
        await db.execute(
            select(Incident).where(
                Incident.agency_id == member.agency_id,
                Incident.status.notin_(("RESOLVED", "IGNORED", "DISMISSED")),
            )
        )
    ).scalars().all()
    inc_counts: Dict[str, int] = {}
    for inc in incidents:
        inc_counts[inc.workflow_id] = inc_counts.get(inc.workflow_id, 0) + 1

    items = [
        _serialize_workflow_for_control(wf, integ_map.get(wf.integration_id), inc_counts.get(wf.id, 0))
        for wf in workflows
    ]

    if platform:
        p_norm = platform.strip().lower()
        items = [i for i in items if i["platform"].lower() == p_norm]
    if status_filter:
        s_norm = status_filter.strip().upper()
        items = [i for i in items if i["control_status"] == s_norm]
    if search:
        q = search.strip().lower()
        items = [
            i for i in items
            if q in i["name"].lower()
            or q in i["platform"].lower()
            or q in (i["external_workflow_id"] or "").lower()
        ]

    if sort_by == "name":
        items.sort(key=lambda x: x["name"].lower())
    elif sort_by == "failures":
        items.sort(key=lambda x: x["consecutive_failures"], reverse=True)
    elif sort_by == "status":
        items.sort(key=lambda x: x["control_status"])
    else:
        items.sort(
            key=lambda x: x["last_execution_at"].timestamp() if x["last_execution_at"] else 0.0,
            reverse=True,
        )

    return items


@router.get("/workflows/{workflow_id}")
async def get_control_workflow_detail(
    workflow_id: str,
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    wf = (
        await db.execute(
            select(Workflow).where(Workflow.id == workflow_id, Workflow.agency_id == member.agency_id)
        )
    ).scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found.")

    integ = None
    if wf.integration_id:
        integ = (
            await db.execute(
                select(Integration).where(
                    Integration.id == wf.integration_id,
                    Integration.agency_id == member.agency_id,
                )
            )
        ).scalar_one_or_none()

    executions = (
        await db.execute(
            select(Execution)
            .where(Execution.workflow_id == wf.id)
            .order_by(Execution.started_at.desc())
            .limit(25)
        )
    ).scalars().all()
    incidents = (
        await db.execute(
            select(Incident)
            .where(Incident.workflow_id == wf.id, Incident.agency_id == member.agency_id)
            .order_by(Incident.last_detected_at.desc())
            .limit(15)
        )
    ).scalars().all()
    recoveries = (
        await db.execute(
            select(RecoveryRequest)
            .where(RecoveryRequest.workflow_id == wf.id, RecoveryRequest.agency_id == member.agency_id)
            .order_by(RecoveryRequest.created_at.desc())
            .limit(15)
        )
    ).scalars().all()
    action_requests = (
        await db.execute(
            select(ControlActionRequest)
            .where(ControlActionRequest.workflow_id == wf.id, ControlActionRequest.agency_id == member.agency_id)
            .order_by(ControlActionRequest.created_at.desc())
            .limit(20)
        )
    ).scalars().all()

    open_inc_count = sum(1 for i in incidents if i.status not in ("RESOLVED", "IGNORED", "DISMISSED"))
    return {
        "workflow": _serialize_workflow_for_control(wf, integ, open_inc_count),
        "executions": [
            {
                "id": e.id,
                "external_execution_id": e.external_execution_id,
                "status": e.status,
                "duration_ms": e.duration_ms,
                "started_at": e.started_at,
                "finished_at": e.finished_at,
                "error_message": e.error_message,
                "mode": e.mode,
            }
            for e in executions
        ],
        "incidents": [
            {
                "id": inc.id,
                "error_category": inc.error_category,
                "severity": inc.severity,
                "status": inc.status,
                "error_message": inc.error_message,
                "occurrence_count": inc.occurrence_count,
                "last_detected_at": inc.last_detected_at,
            }
            for inc in incidents
        ],
        "recoveries": [
            {
                "id": rec.id,
                "strategy": rec.strategy,
                "status": rec.status,
                "risk_level": rec.risk_level,
                "result_verified": rec.result_verified,
                "created_at": rec.created_at,
            }
            for rec in recoveries
        ],
        "control_actions": [ControlActionOut.model_validate(a).model_dump() for a in action_requests],
    }


@router.post("/actions", response_model=ControlActionOut)
async def create_control_action(
    payload: ControlActionCreate,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "DEVELOPER"])),
    db: AsyncSession = Depends(get_db),
):
    req_row = await control_engine_service.request_action(
        db,
        member=member,
        workflow_id=payload.workflow_id,
        action_type=payload.action_type,
        confirmed=payload.confirmed,
        target_execution_id=payload.target_execution_id,
        incident_id=payload.incident_id,
        payload=payload.payload,
        reason=payload.reason,
        idempotency_key=payload.idempotency_key,
        execute_inline=not payload.async_dispatch,
    )
    if payload.async_dispatch and req_row.status == "PENDING":
        try:
            from app.workers.celery_app import execute_control_action_task

            execute_control_action_task.delay(req_row.id, member.agency_id, member.user_id, member.role)
        except Exception:
            await control_engine_service.execute_action_request(
                db,
                agency_id=member.agency_id,
                request_id=req_row.id,
                actor_user_id=member.user_id,
                actor_role=member.role,
            )
            await db.commit()
            await db.refresh(req_row)
    return req_row


@router.get("/actions", response_model=List[ControlActionOut])
async def list_control_actions(
    status_filter: Optional[str] = None,
    workflow_id: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    query = select(ControlActionRequest).where(ControlActionRequest.agency_id == member.agency_id)
    if status_filter:
        query = query.where(ControlActionRequest.status == status_filter.strip().upper())
    if workflow_id:
        query = query.where(ControlActionRequest.workflow_id == workflow_id)
    query = query.order_by(ControlActionRequest.created_at.desc()).limit(limit)
    return (await db.execute(query)).scalars().all()


@router.post("/actions/{action_id}/approve", response_model=ControlActionOut)
async def approve_control_action(
    action_id: str,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    return await control_engine_service.approve_action_request(
        db,
        member=member,
        request_id=action_id,
        execute_now=True,
    )


@router.post("/actions/{action_id}/reject", response_model=ControlActionOut)
async def reject_control_action(
    action_id: str,
    payload: ControlActionReject,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    return await control_engine_service.reject_action_request(
        db,
        member=member,
        request_id=action_id,
        rejection_reason=payload.rejection_reason,
    )


@router.post("/actions/{action_id}/cancel", response_model=ControlActionOut)
async def cancel_control_action(
    action_id: str,
    payload: ControlActionReject,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "DEVELOPER"])),
    db: AsyncSession = Depends(get_db),
):
    return await control_engine_service.cancel_action_request(
        db,
        member=member,
        request_id=action_id,
        reason=payload.rejection_reason,
    )


@router.get("/activity", response_model=List[ControlActivityLogOut])
async def list_control_activity(
    workflow_id: Optional[str] = None,
    limit: int = Query(100, ge=1, le=300),
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    query = select(ControlActivityLog).where(ControlActivityLog.agency_id == member.agency_id)
    if workflow_id:
        query = query.where(ControlActivityLog.workflow_id == workflow_id)
    query = query.order_by(ControlActivityLog.created_at.desc()).limit(limit)
    return (await db.execute(query)).scalars().all()


@router.post("/assistant/query")
async def query_control_assistant(
    payload: ControlAssistantQuery,
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    integrations = (
        await db.execute(select(Integration).where(Integration.agency_id == member.agency_id))
    ).scalars().all()
    integ_map = {i.id: i for i in integrations}

    wf_query = select(Workflow).where(Workflow.agency_id == member.agency_id)
    if payload.workflow_id:
        wf_query = wf_query.where(Workflow.id == payload.workflow_id)
    workflows = (await db.execute(wf_query.limit(40))).scalars().all()

    wf_contexts = [
        _serialize_workflow_for_control(wf, integ_map.get(wf.integration_id))
        for wf in workflows
    ]

    incidents = (
        await db.execute(
            select(Incident)
            .where(
                Incident.agency_id == member.agency_id,
                Incident.status.notin_(("RESOLVED", "IGNORED", "DISMISSED")),
            )
            .order_by(Incident.last_detected_at.desc())
            .limit(20)
        )
    ).scalars().all()
    wf_name_map = {w.id: w.name for w in workflows}
    wf_plat_map = {w.id: w.platform for w in workflows}
    inc_contexts = [
        {
            "id": inc.id,
            "workflow_id": inc.workflow_id,
            "workflow_name": wf_name_map.get(inc.workflow_id, inc.workflow_id),
            "platform": wf_plat_map.get(inc.workflow_id, "n8n"),
            "error_category": inc.error_category,
            "severity": inc.severity,
            "status": inc.status,
            "error_message": inc.error_message,
            "occurrence_count": inc.occurrence_count,
        }
        for inc in incidents
    ]

    execs = (
        await db.execute(
            select(Execution)
            .join(Workflow, Execution.workflow_id == Workflow.id)
            .where(Workflow.agency_id == member.agency_id)
            .order_by(Execution.started_at.desc())
            .limit(20)
        )
    ).scalars().all()
    exec_contexts = [
        {
            "id": e.id,
            "workflow_id": e.workflow_id,
            "external_execution_id": e.external_execution_id,
            "status": e.status,
            "error_message": e.error_message,
            "started_at": e.started_at.isoformat() if e.started_at else None,
        }
        for e in execs
    ]

    result = await gemini_engine.answer_control_center_question(
        question=payload.question,
        workflows_context=wf_contexts,
        incidents_context=inc_contexts,
        executions_context=exec_contexts,
    )
    return result
