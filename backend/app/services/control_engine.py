import hashlib
import logging
import threading
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Any, Callable, Deque, Dict, List, Optional, Tuple

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import sanitize_log_payload
from app.diagnosis.gemini_engine import _redact_text
from app.integrations.base import (
    BaseIntegrationAdapter,
    ProviderCapabilities,
    UnsupportedControlActionError,
    WorkflowControlResult,
)
from app.integrations.registry import build_adapter_for_integration, get_default_capabilities_for_platform
from app.lib.classifier import is_financial_or_destructive
from app.models.entities import (
    AgencyMember,
    AuditLog,
    ControlActionRequest,
    ControlActivityLog,
    Execution,
    Incident,
    Integration,
    Workflow,
)

logger = logging.getLogger("control_engine")

VALID_CONTROL_ACTIONS = (
    "ACTIVATE",
    "DEACTIVATE",
    "TRIGGER",
    "RETRY_EXECUTION",
    "PAUSE",
    "RESUME",
    "UPDATE_SETTINGS",
    "MANAGE_SCHEDULE",
)
HIGH_RISK_CONTROL_ACTIONS = ("DEACTIVATE", "PAUSE", "UPDATE_SETTINGS", "MANAGE_SCHEDULE")
ACTION_TO_CAPABILITY_KEY = {
    "ACTIVATE": "activate",
    "DEACTIVATE": "deactivate",
    "TRIGGER": "trigger",
    "RETRY_EXECUTION": "retry_execution",
    "PAUSE": "pause",
    "RESUME": "resume",
    "UPDATE_SETTINGS": "update_settings",
    "MANAGE_SCHEDULE": "manage_schedule",
}
ALLOWED_OPERATOR_ROLES = ("OWNER", "ADMIN", "DEVELOPER")
ALLOWED_APPROVER_ROLES = ("OWNER", "ADMIN")

_ACTION_LIMIT_LOCK = threading.Lock()
_ACTION_BUCKETS: Dict[str, Deque[float]] = defaultdict(deque)


def reset_control_rate_limits() -> None:
    with _ACTION_LIMIT_LOCK:
        _ACTION_BUCKETS.clear()


def enforce_control_action_rate_limit(
    agency_id: str,
    max_actions: int = 30,
    window_seconds: int = 60,
) -> None:
    now = time.monotonic()
    cutoff = now - window_seconds
    with _ACTION_LIMIT_LOCK:
        q = _ACTION_BUCKETS[agency_id]
        while q and q[0] <= cutoff:
            q.popleft()
        if len(q) >= max_actions:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Control action rate limit exceeded for this workspace. Please wait before dispatching more actions.",
                headers={"Retry-After": str(window_seconds)},
            )
        q.append(now)


def normalize_workflow_control_status(wf: Workflow) -> str:
    raw = (getattr(wf, "control_status", None) or "").upper()
    if raw in ("ACTIVE", "INACTIVE", "PAUSED", "FAILED", "UNKNOWN"):
        if not wf.is_active and raw == "ACTIVE":
            return "INACTIVE"
        if wf.health_status == "FAILING" and raw == "ACTIVE":
            return "FAILED"
        return raw
    if not wf.is_active:
        return "INACTIVE"
    if wf.health_status == "FAILING":
        return "FAILED"
    return "ACTIVE"


def _clean_json_payload(data: Any) -> Any:
    sanitized = sanitize_log_payload(data)
    if isinstance(sanitized, dict):
        return {k: _clean_json_payload(v) for k, v in sanitized.items()}
    if isinstance(sanitized, list):
        return [_clean_json_payload(item) for item in sanitized]
    if isinstance(sanitized, str):
        return _redact_text(sanitized)
    return sanitized


class ControlEngineService:
    """
    Centralized Control Engine coordinating:
    - Tenant & RBAC enforcement
    - Explicit provider capability checks (never simulating unsupported actions)
    - Explicit user confirmation & Admin/Owner approvals for sensitive actions
    - Idempotency & per-agency rate limiting
    - Provider dispatch with response verification & credential redaction
    - Immutable ControlActivityLog + AuditLog trails
    """

    def __init__(
        self,
        adapter_factory: Optional[Callable[[Integration], BaseIntegrationAdapter]] = None,
    ):
        self._adapter_factory = adapter_factory

    def _resolve_adapter(self, integration: Optional[Integration], platform: str) -> Tuple[Optional[BaseIntegrationAdapter], ProviderCapabilities]:
        if integration is None:
            return None, get_default_capabilities_for_platform(platform, None)
        if self._adapter_factory:
            adapter = self._adapter_factory(integration)
            return adapter, adapter.get_capabilities()
        try:
            adapter = build_adapter_for_integration(integration)
            return adapter, adapter.get_capabilities()
        except Exception:
            return None, get_default_capabilities_for_platform(platform, integration)

    def resolve_capabilities_for_workflow(
        self,
        wf: Workflow,
        integration: Optional[Integration],
    ) -> ProviderCapabilities:
        _, caps = self._resolve_adapter(integration, wf.platform)
        if integration is None:
            # No attached integration record -> remote mutations cannot execute safely
            msg = "Workflow has no active Integration connection configured; connect an integration to enable remote actions."
            for key in ACTION_TO_CAPABILITY_KEY.values():
                cap = getattr(caps, key)
                cap.supported = False
                cap.reason = msg
            caps.adapter_mode = "UNLINKED"
        return caps

    def _assess_risk_and_approval(
        self,
        wf: Workflow,
        action_type: str,
        capabilities: ProviderCapabilities,
        incident: Optional[Incident] = None,
    ) -> Tuple[str, bool, List[str]]:
        factors: List[str] = []
        is_sensitive = is_financial_or_destructive(wf.name)
        cap_key = ACTION_TO_CAPABILITY_KEY[action_type]
        cap = getattr(capabilities, cap_key)

        if is_sensitive:
            factors.append("Workflow name indicates financial, billing, auth, or destructive side effects.")
        if action_type in HIGH_RISK_CONTROL_ACTIONS:
            factors.append(f"Action '{action_type}' mutates workflow availability or runtime configuration.")
        if cap.requires_approval:
            factors.append(f"Provider capability policy flags '{action_type}' on {wf.platform} for approval.")
        if incident and incident.severity in ("HIGH", "CRITICAL"):
            factors.append(f"Associated incident severity is {incident.severity}.")

        requires_approval = bool(
            is_sensitive
            or action_type in HIGH_RISK_CONTROL_ACTIONS
            or cap.requires_approval
            or (incident and incident.severity == "CRITICAL")
        )
        if is_sensitive or (incident and incident.severity == "CRITICAL"):
            risk_level = "CRITICAL"
        elif action_type in HIGH_RISK_CONTROL_ACTIONS or cap.requires_approval:
            risk_level = "HIGH"
        else:
            risk_level = "MEDIUM"
        return risk_level, requires_approval, factors

    async def _append_activity(
        self,
        db: AsyncSession,
        *,
        agency_id: str,
        workflow: Optional[Workflow],
        platform: str,
        actor_user_id: Optional[str],
        actor_role: Optional[str],
        action_type: str,
        event_status: str,
        summary: str,
        action_request_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> ControlActivityLog:
        cleaned_details = _clean_json_payload(details or {})
        entry = ControlActivityLog(
            agency_id=agency_id,
            action_request_id=action_request_id,
            workflow_id=workflow.id if workflow else None,
            workflow_name=workflow.name if workflow else None,
            platform=platform,
            actor_user_id=actor_user_id,
            actor_role=actor_role,
            action_type=action_type,
            event_status=event_status,
            summary=_redact_text(summary)[:1000],
            redacted_details=cleaned_details,
        )
        db.add(entry)
        db.add(
            AuditLog(
                agency_id=agency_id,
                user_id=actor_user_id,
                action=f"CONTROL_{action_type}_{event_status}",
                entity_type="ControlActionRequest" if action_request_id else "Workflow",
                entity_id=action_request_id or (workflow.id if workflow else agency_id),
                details={
                    "workflow_name": workflow.name if workflow else None,
                    "platform": platform,
                    "summary": _redact_text(summary)[:300],
                    **(cleaned_details if isinstance(cleaned_details, dict) else {}),
                },
            )
        )
        await db.flush()
        return entry

    async def request_action(
        self,
        db: AsyncSession,
        *,
        member: AgencyMember,
        workflow_id: str,
        action_type: str,
        confirmed: bool,
        target_execution_id: Optional[str] = None,
        incident_id: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
        reason: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        execute_inline: bool = True,
    ) -> ControlActionRequest:
        normalized_action = (action_type or "").strip().upper()
        if normalized_action not in VALID_CONTROL_ACTIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported control action '{action_type}'. Allowed: {', '.join(VALID_CONTROL_ACTIONS)}",
            )

        if member.role not in ALLOWED_OPERATOR_ROLES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{member.role}' has read-only Control Center permissions and cannot dispatch actions.",
            )

        if not confirmed:
            raise HTTPException(
                status_code=400,
                detail="Explicit operator confirmation (`confirmed=true`) is required before requesting control actions.",
            )

        enforce_control_action_rate_limit(member.agency_id)

        wf = (
            await db.execute(
                select(Workflow).where(Workflow.id == workflow_id, Workflow.agency_id == member.agency_id)
            )
        ).scalar_one_or_none()
        if not wf:
            raise HTTPException(status_code=404, detail="Workflow not found in this organization.")

        # Idempotency check (tenant-scoped)
        clean_idem = (idempotency_key or "").strip()[:64]
        if clean_idem:
            existing_req = (
                await db.execute(
                    select(ControlActionRequest).where(
                        ControlActionRequest.agency_id == member.agency_id,
                        ControlActionRequest.idempotency_key == clean_idem,
                    )
                )
            ).scalar_one_or_none()
            if existing_req:
                return existing_req
        else:
            raw_seed = f"{member.agency_id}:{wf.id}:{normalized_action}:{target_execution_id or ''}:{uuid.uuid4()}"
            clean_idem = hashlib.sha256(raw_seed.encode("utf-8")).hexdigest()[:48]

        integration: Optional[Integration] = None
        if wf.integration_id:
            integration = (
                await db.execute(
                    select(Integration).where(
                        Integration.id == wf.integration_id,
                        Integration.agency_id == member.agency_id,
                    )
                )
            ).scalar_one_or_none()

        incident: Optional[Incident] = None
        if incident_id:
            incident = (
                await db.execute(
                    select(Incident).where(
                        Incident.id == incident_id,
                        Incident.agency_id == member.agency_id,
                    )
                )
            ).scalar_one_or_none()
            if not incident:
                raise HTTPException(status_code=404, detail="Linked incident not found in this organization.")

        adapter, caps = self._resolve_adapter(integration, wf.platform)
        if integration is None:
            caps = self.resolve_capabilities_for_workflow(wf, None)

        cap_key = ACTION_TO_CAPABILITY_KEY[normalized_action]
        capability = getattr(caps, cap_key)
        if not capability.supported or adapter is None:
            await self._append_activity(
                db,
                agency_id=member.agency_id,
                workflow=wf,
                platform=wf.platform,
                actor_user_id=member.user_id,
                actor_role=member.role,
                action_type=normalized_action,
                event_status="BLOCKED",
                summary=f"Blocked unsupported action {normalized_action}: {capability.reason}",
                details={"reason": capability.reason},
            )
            await db.commit()
            raise HTTPException(
                status_code=400,
                detail=f"Action '{normalized_action}' is unavailable for {wf.platform}: {capability.reason}",
            )

        # Workflow / Execution state validation
        current_ctrl_status = normalize_workflow_control_status(wf)
        if normalized_action == "ACTIVATE" and current_ctrl_status == "ACTIVE" and wf.is_active:
            raise HTTPException(status_code=409, detail="Workflow is already ACTIVE.")
        if normalized_action == "DEACTIVATE" and current_ctrl_status == "INACTIVE" and not wf.is_active:
            raise HTTPException(status_code=409, detail="Workflow is already INACTIVE.")
        if normalized_action == "PAUSE" and current_ctrl_status == "PAUSED":
            raise HTTPException(status_code=409, detail="Workflow is already PAUSED.")
        if normalized_action == "RESUME" and current_ctrl_status == "ACTIVE":
            raise HTTPException(status_code=409, detail="Workflow is already ACTIVE.")

        resolved_exec_id = target_execution_id
        if normalized_action == "RETRY_EXECUTION":
            if not resolved_exec_id:
                latest_failed = (
                    await db.execute(
                        select(Execution)
                        .where(
                            Execution.workflow_id == wf.id,
                            Execution.status.in_(("FAILED", "TIMED_OUT")),
                        )
                        .order_by(Execution.started_at.desc())
                        .limit(1)
                    )
                ).scalar_one_or_none()
                if latest_failed:
                    resolved_exec_id = latest_failed.external_execution_id or latest_failed.id
            if not resolved_exec_id:
                raise HTTPException(
                    status_code=400,
                    detail="RETRY_EXECUTION requires a target failed execution ID, and no failed execution exists for this workflow.",
                )

        if normalized_action == "UPDATE_SETTINGS" and (not payload or not isinstance(payload, dict)):
            raise HTTPException(status_code=400, detail="UPDATE_SETTINGS requires a non-empty settings payload.")
        if normalized_action == "MANAGE_SCHEDULE" and (not payload or not isinstance(payload, dict)):
            raise HTTPException(status_code=400, detail="MANAGE_SCHEDULE requires a schedule configuration payload.")

        risk_level, requires_approval, risk_factors = self._assess_risk_and_approval(
            wf, normalized_action, caps, incident
        )

        # Owners/Admins must still explicitly approve high-risk actions via the approval queue unless explicitly approved via /approve
        initial_status = "AWAITING_APPROVAL" if requires_approval else "PENDING"
        sanitized_payload = _clean_json_payload(payload or {})

        req_row = ControlActionRequest(
            agency_id=member.agency_id,
            workflow_id=wf.id,
            integration_id=integration.id if integration else None,
            incident_id=incident.id if incident else None,
            platform=wf.platform,
            action_type=normalized_action,
            target_execution_id=resolved_exec_id,
            payload=sanitized_payload,
            status=initial_status,
            risk_level=risk_level,
            requires_approval=requires_approval,
            confirmed_by_user=True,
            idempotency_key=clean_idem,
            reason=_redact_text(reason)[:1000] if reason else None,
            requested_by_user_id=member.user_id,
        )
        db.add(req_row)
        await db.flush()

        await self._append_activity(
            db,
            agency_id=member.agency_id,
            workflow=wf,
            platform=wf.platform,
            actor_user_id=member.user_id,
            actor_role=member.role,
            action_type=normalized_action,
            event_status="AWAITING_APPROVAL" if requires_approval else "REQUESTED",
            action_request_id=req_row.id,
            summary=(
                f"{normalized_action} queued for Admin/Owner approval ({risk_level} risk)."
                if requires_approval
                else f"{normalized_action} confirmed and queued for dispatch."
            ),
            details={"risk_factors": risk_factors, "target_execution_id": resolved_exec_id},
        )

        if not requires_approval and execute_inline:
            await self.execute_action_request(
                db,
                agency_id=member.agency_id,
                request_id=req_row.id,
                actor_user_id=member.user_id,
                actor_role=member.role,
            )

        await db.commit()
        await db.refresh(req_row)
        return req_row

    async def approve_action_request(
        self,
        db: AsyncSession,
        *,
        member: AgencyMember,
        request_id: str,
        execute_now: bool = True,
    ) -> ControlActionRequest:
        if member.role not in ALLOWED_APPROVER_ROLES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only workspace OWNER or ADMIN can approve sensitive control actions.",
            )

        req_row = (
            await db.execute(
                select(ControlActionRequest).where(
                    ControlActionRequest.id == request_id,
                    ControlActionRequest.agency_id == member.agency_id,
                )
            )
        ).scalar_one_or_none()
        if not req_row:
            raise HTTPException(status_code=404, detail="Control action request not found.")
        if req_row.status != "AWAITING_APPROVAL":
            raise HTTPException(
                status_code=409,
                detail=f"Cannot approve control action in status '{req_row.status}'.",
            )

        now_utc = datetime.now(timezone.utc)
        req_row.approved_by_user_id = member.user_id
        req_row.approved_at = now_utc
        req_row.status = "PENDING"
        await db.flush()

        wf = (
            await db.execute(select(Workflow).where(Workflow.id == req_row.workflow_id))
        ).scalar_one_or_none()

        await self._append_activity(
            db,
            agency_id=member.agency_id,
            workflow=wf,
            platform=req_row.platform,
            actor_user_id=member.user_id,
            actor_role=member.role,
            action_type=req_row.action_type,
            event_status="APPROVED",
            action_request_id=req_row.id,
            summary=f"Control action {req_row.action_type} approved by {member.role}.",
        )

        if execute_now:
            await self.execute_action_request(
                db,
                agency_id=member.agency_id,
                request_id=req_row.id,
                actor_user_id=member.user_id,
                actor_role=member.role,
            )

        await db.commit()
        await db.refresh(req_row)
        return req_row

    async def reject_action_request(
        self,
        db: AsyncSession,
        *,
        member: AgencyMember,
        request_id: str,
        rejection_reason: Optional[str] = None,
    ) -> ControlActionRequest:
        if member.role not in ALLOWED_APPROVER_ROLES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only workspace OWNER or ADMIN can reject pending control actions.",
            )

        req_row = (
            await db.execute(
                select(ControlActionRequest).where(
                    ControlActionRequest.id == request_id,
                    ControlActionRequest.agency_id == member.agency_id,
                )
            )
        ).scalar_one_or_none()
        if not req_row:
            raise HTTPException(status_code=404, detail="Control action request not found.")
        if req_row.status != "AWAITING_APPROVAL":
            raise HTTPException(
                status_code=409,
                detail=f"Cannot reject control action in status '{req_row.status}'.",
            )

        now_utc = datetime.now(timezone.utc)
        req_row.status = "CANCELLED"
        req_row.rejected_by_user_id = member.user_id
        req_row.rejection_reason = _redact_text(rejection_reason or "Rejected by approver.")[:500]
        req_row.rejected_at = now_utc
        req_row.completed_at = now_utc
        await db.flush()

        wf = (
            await db.execute(select(Workflow).where(Workflow.id == req_row.workflow_id))
        ).scalar_one_or_none()

        await self._append_activity(
            db,
            agency_id=member.agency_id,
            workflow=wf,
            platform=req_row.platform,
            actor_user_id=member.user_id,
            actor_role=member.role,
            action_type=req_row.action_type,
            event_status="REJECTED",
            action_request_id=req_row.id,
            summary=f"Control action {req_row.action_type} rejected: {req_row.rejection_reason}",
        )

        await db.commit()
        await db.refresh(req_row)
        return req_row

    async def cancel_action_request(
        self,
        db: AsyncSession,
        *,
        member: AgencyMember,
        request_id: str,
        reason: Optional[str] = None,
    ) -> ControlActionRequest:
        if member.role not in ALLOWED_OPERATOR_ROLES:
            raise HTTPException(status_code=403, detail="Insufficient role permissions.")
        req_row = (
            await db.execute(
                select(ControlActionRequest).where(
                    ControlActionRequest.id == request_id,
                    ControlActionRequest.agency_id == member.agency_id,
                )
            )
        ).scalar_one_or_none()
        if not req_row:
            raise HTTPException(status_code=404, detail="Control action request not found.")
        if req_row.status not in ("PENDING", "AWAITING_APPROVAL"):
            raise HTTPException(
                status_code=409,
                detail=f"Cannot cancel control action already in status '{req_row.status}'.",
            )

        now_utc = datetime.now(timezone.utc)
        req_row.status = "CANCELLED"
        req_row.rejection_reason = _redact_text(reason or "Cancelled by operator.")[:500]
        req_row.completed_at = now_utc
        await db.flush()

        wf = (
            await db.execute(select(Workflow).where(Workflow.id == req_row.workflow_id))
        ).scalar_one_or_none()
        await self._append_activity(
            db,
            agency_id=member.agency_id,
            workflow=wf,
            platform=req_row.platform,
            actor_user_id=member.user_id,
            actor_role=member.role,
            action_type=req_row.action_type,
            event_status="CANCELLED",
            action_request_id=req_row.id,
            summary=f"Control action {req_row.action_type} cancelled: {req_row.rejection_reason}",
        )
        await db.commit()
        await db.refresh(req_row)
        return req_row

    async def execute_action_request(
        self,
        db: AsyncSession,
        *,
        agency_id: str,
        request_id: str,
        actor_user_id: Optional[str] = None,
        actor_role: Optional[str] = None,
    ) -> ControlActionRequest:
        req_row = (
            await db.execute(
                select(ControlActionRequest).where(
                    ControlActionRequest.id == request_id,
                    ControlActionRequest.agency_id == agency_id,
                )
            )
        ).scalar_one_or_none()
        if not req_row:
            raise HTTPException(status_code=404, detail="Control action request not found.")

        if req_row.requires_approval and not req_row.approved_by_user_id:
            raise HTTPException(
                status_code=403,
                detail="This control action requires Admin/Owner approval before execution.",
            )
        if req_row.status == "SUCCESSFUL":
            return req_row
        if req_row.status not in ("PENDING", "RUNNING"):
            raise HTTPException(
                status_code=409,
                detail=f"Control action cannot execute in status '{req_row.status}'.",
            )

        wf = (
            await db.execute(
                select(Workflow).where(
                    Workflow.id == req_row.workflow_id,
                    Workflow.agency_id == agency_id,
                )
            )
        ).scalar_one_or_none()
        if not wf:
            req_row.status = "FAILED"
            req_row.verification_status = "FAILED"
            req_row.error_message = "Target workflow no longer exists."
            req_row.completed_at = datetime.now(timezone.utc)
            await db.flush()
            return req_row

        integration: Optional[Integration] = None
        if req_row.integration_id or wf.integration_id:
            integ_id = req_row.integration_id or wf.integration_id
            integration = (
                await db.execute(
                    select(Integration).where(
                        Integration.id == integ_id,
                        Integration.agency_id == agency_id,
                    )
                )
            ).scalar_one_or_none()

        adapter, caps = self._resolve_adapter(integration, wf.platform)
        if adapter is None or integration is None:
            req_row.status = "FAILED"
            req_row.verification_status = "FAILED"
            req_row.error_message = "No active integration adapter available to dispatch provider command."
            req_row.completed_at = datetime.now(timezone.utc)
            await self._append_activity(
                db,
                agency_id=agency_id,
                workflow=wf,
                platform=wf.platform,
                actor_user_id=actor_user_id,
                actor_role=actor_role,
                action_type=req_row.action_type,
                event_status="FAILED",
                action_request_id=req_row.id,
                summary=req_row.error_message,
            )
            await db.flush()
            return req_row

        now_utc = datetime.now(timezone.utc)
        req_row.status = "RUNNING"
        req_row.executed_by_user_id = actor_user_id or req_row.requested_by_user_id
        req_row.executed_at = now_utc
        await db.flush()

        ext_wf_id = wf.external_workflow_id
        action = req_row.action_type
        payload = req_row.payload if isinstance(req_row.payload, dict) else {}

        try:
            result: Optional[WorkflowControlResult] = None
            raw_resp: Dict[str, Any] = {}

            if action == "ACTIVATE":
                result = await adapter.activate_workflow(ext_wf_id)
                wf.is_active = True
                wf.control_status = "ACTIVE" if wf.health_status != "FAILING" else "FAILED"
            elif action == "DEACTIVATE":
                result = await adapter.deactivate_workflow(ext_wf_id)
                wf.is_active = False
                wf.control_status = "INACTIVE"
            elif action == "PAUSE":
                result = await adapter.pause_workflow(ext_wf_id)
                wf.is_active = False
                wf.control_status = "PAUSED"
            elif action == "RESUME":
                result = await adapter.resume_workflow(ext_wf_id)
                wf.is_active = True
                wf.control_status = "ACTIVE" if wf.health_status != "FAILING" else "FAILED"
            elif action == "TRIGGER":
                raw_resp = await adapter.trigger_workflow(ext_wf_id, payload or None)
                ext_exec = None
                if isinstance(raw_resp, dict):
                    ext_exec = raw_resp.get("executionId") or raw_resp.get("id") or (
                        raw_resp.get("data", {}).get("executionId")
                        if isinstance(raw_resp.get("data"), dict)
                        else None
                    )
                wf.last_execution_at = now_utc
                result = WorkflowControlResult(
                    success=True,
                    action="TRIGGER",
                    status="SUCCESSFUL",
                    external_workflow_id=ext_wf_id,
                    external_execution_id=str(ext_exec) if ext_exec else None,
                    sanitized_response=_clean_json_payload(raw_resp),
                )
            elif action == "RETRY_EXECUTION":
                raw_resp = await adapter.retry_execution(req_row.target_execution_id or "")
                ext_exec = None
                if isinstance(raw_resp, dict):
                    ext_exec = raw_resp.get("id") or (
                        raw_resp.get("data", {}).get("id") if isinstance(raw_resp.get("data"), dict) else None
                    )
                wf.last_execution_at = now_utc
                result = WorkflowControlResult(
                    success=True,
                    action="RETRY_EXECUTION",
                    status="SUCCESSFUL",
                    external_workflow_id=ext_wf_id,
                    external_execution_id=str(ext_exec) if ext_exec else req_row.target_execution_id,
                    sanitized_response=_clean_json_payload(raw_resp),
                )
            elif action == "UPDATE_SETTINGS":
                result = await adapter.update_workflow_settings(ext_wf_id, payload)
                existing_settings = dict(wf.provider_settings or {})
                existing_settings.update(payload)
                wf.provider_settings = existing_settings
            elif action == "MANAGE_SCHEDULE":
                result = await adapter.manage_schedule(ext_wf_id, payload)
                wf.schedule_config = payload

            if result is None or not result.success:
                raise ValueError((result.error_message if result else None) or "Provider did not confirm control action success.")

            wf.capabilities = caps.model_dump()
            req_row.status = "SUCCESSFUL"
            req_row.verification_status = "VERIFIED"
            req_row.sanitized_response = _clean_json_payload(result.model_dump())
            req_row.error_message = None
            req_row.completed_at = datetime.now(timezone.utc)

            await self._append_activity(
                db,
                agency_id=agency_id,
                workflow=wf,
                platform=wf.platform,
                actor_user_id=actor_user_id,
                actor_role=actor_role,
                action_type=action,
                event_status="SUCCESSFUL",
                action_request_id=req_row.id,
                summary=f"{action} succeeded on {wf.platform} for '{wf.name}'.",
                details={"external_execution_id": result.external_execution_id},
            )
            await db.flush()
            return req_row

        except (UnsupportedControlActionError, NotImplementedError) as unsup_exc:
            req_row.status = "FAILED"
            req_row.verification_status = "FAILED"
            req_row.error_message = _redact_text(str(unsup_exc))[:1000]
            req_row.completed_at = datetime.now(timezone.utc)
            await self._append_activity(
                db,
                agency_id=agency_id,
                workflow=wf,
                platform=wf.platform,
                actor_user_id=actor_user_id,
                actor_role=actor_role,
                action_type=action,
                event_status="BLOCKED",
                action_request_id=req_row.id,
                summary=req_row.error_message,
            )
            await db.flush()
            return req_row
        except httpx.HTTPStatusError as http_exc:
            code = http_exc.response.status_code
            snippet = _redact_text(http_exc.response.text[:300]) if http_exc.response is not None else ""
            req_row.status = "FAILED"
            req_row.verification_status = "FAILED"
            req_row.error_message = f"Provider HTTP {code}: {snippet}".strip()
            req_row.completed_at = datetime.now(timezone.utc)
            await self._append_activity(
                db,
                agency_id=agency_id,
                workflow=wf,
                platform=wf.platform,
                actor_user_id=actor_user_id,
                actor_role=actor_role,
                action_type=action,
                event_status="FAILED",
                action_request_id=req_row.id,
                summary=f"{action} failed with provider HTTP {code}.",
                details={"error": req_row.error_message},
            )
            await db.flush()
            return req_row
        except Exception as exc:
            req_row.status = "FAILED"
            req_row.verification_status = "FAILED"
            req_row.error_message = _redact_text(str(exc))[:1000]
            req_row.completed_at = datetime.now(timezone.utc)
            await self._append_activity(
                db,
                agency_id=agency_id,
                workflow=wf,
                platform=wf.platform,
                actor_user_id=actor_user_id,
                actor_role=actor_role,
                action_type=action,
                event_status="FAILED",
                action_request_id=req_row.id,
                summary=f"{action} execution failed: {req_row.error_message}",
            )
            await db.flush()
            return req_row


control_engine_service = ControlEngineService()
