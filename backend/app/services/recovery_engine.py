import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.security import decrypt_secret
from app.integrations.n8n import N8NClient, normalize_n8n_execution
from app.lib.classifier import is_financial_or_destructive
from app.models.entities import (
    AIDiagnosis,
    AgencyMember,
    ApprovalRequest,
    AuditLog,
    Incident,
    Integration,
    Notification,
    RecoveryAttempt,
    RecoveryPolicy,
    RecoveryRequest,
    Workflow,
)

logger = logging.getLogger("recovery_engine")

SUPPORTED_STRATEGIES = (
    "RETRY_EXECUTION",
    "REEXECUTE_WORKFLOW",
    "RETRY_AFTER_DELAY",
    "RETRY_EXPONENTIAL_BACKOFF",
    "MANUAL_RECOVERY",
    "MARK_NON_RECOVERABLE",
    "ESCALATE_HUMAN",
)

RETRY_STRATEGIES = (
    "RETRY_EXECUTION",
    "REEXECUTE_WORKFLOW",
    "RETRY_AFTER_DELAY",
    "RETRY_EXPONENTIAL_BACKOFF",
)

ACTIVE_RECOVERY_STATUSES = (
    "PENDING_APPROVAL",
    "APPROVED",
    "SCHEDULED",
    "EXECUTING",
    "VERIFYING",
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def generate_request_idempotency_key(incident_id: str, strategy: str, occurrence_count: int) -> str:
    raw = f"req:{incident_id}:{strategy}:{occurrence_count}"
    return hashlib.sha256(raw.encode()).hexdigest()


def generate_recovery_idempotency_key(recovery_request_id: str, attempt_number: int) -> str:
    raw = f"attempt:{recovery_request_id}:{attempt_number}"
    return hashlib.sha256(raw.encode()).hexdigest()


def calculate_backoff_delay_seconds(
    strategy: str,
    attempt_number: int,
    base_delay_seconds: int,
    use_exponential_backoff: bool = True,
    custom_delay_seconds: Optional[int] = None,
) -> int:
    """Computes bounded retry delay in seconds for the given strategy and attempt."""
    base = max(0, int(custom_delay_seconds if custom_delay_seconds is not None else base_delay_seconds))
    if strategy == "RETRY_EXECUTION":
        return 0
    if strategy == "RETRY_AFTER_DELAY":
        return base
    if strategy == "RETRY_EXPONENTIAL_BACKOFF":
        effective_base = base if base > 0 else 30
        if not use_exponential_backoff:
            return effective_base
        exponent = max(0, int(attempt_number) - 1)
        return min(3600, effective_base * (2 ** exponent))
    return 0


def assess_recovery_risk(
    incident: Any,
    workflow: Optional[Any],
    diagnosis: Optional[Any],
    policy: Any,
    requested_strategy: str,
) -> Dict[str, Any]:
    """
    Evaluates recovery safety, recoverability, and human approval requirements.
    AI recommendations inform risk assessment but never bypass policy or safety gates.
    """
    wf_name = getattr(workflow, "name", "") or ""
    severity = str(getattr(incident, "severity", "MEDIUM") or "MEDIUM").upper()
    err_category = str(getattr(incident, "error_category", "") or "").upper()
    is_sensitive_wf = is_financial_or_destructive(wf_name)

    diag_recoverable = True if diagnosis is None else bool(getattr(diagnosis, "is_recoverable", True))
    diag_risk = str(getattr(diagnosis, "expected_risk_level", "HIGH") or "HIGH").upper() if diagnosis else "HIGH"
    diag_requires_approval = True if diagnosis is None else bool(getattr(diagnosis, "requires_human_approval", True))

    factors: List[str] = []
    if is_sensitive_wf:
        factors.append("Workflow name indicates financial, customer, auth, or mutating operations.")
    if err_category in ("AUTH_FAILURE", "DATABASE_FAILURE"):
        factors.append(f"Error category {err_category} poses credential or data-integrity risk.")
    if severity in ("HIGH", "CRITICAL"):
        factors.append(f"Incident severity is {severity}.")
    if not diag_recoverable:
        factors.append("Diagnosis flagged this failure as non-recoverable without upstream fix.")
    if getattr(policy, "approval_required", True):
        factors.append("Organization recovery policy requires human approval.")
    if not getattr(policy, "auto_recovery_enabled", False):
        factors.append("Organization auto-recovery is disabled.")

    is_recoverable = bool(diag_recoverable and requested_strategy != "MARK_NON_RECOVERABLE")

    # Determine effective risk level (strictly conservative maximum)
    risk_rank = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}
    computed_risk = "LOW"
    for candidate in (severity, diag_risk):
        if risk_rank.get(candidate, 0) > risk_rank.get(computed_risk, 0):
            computed_risk = candidate
    if is_sensitive_wf or err_category == "DATABASE_FAILURE":
        computed_risk = "CRITICAL" if computed_risk == "CRITICAL" else "HIGH"
    if err_category == "AUTH_FAILURE" and risk_rank.get(computed_risk, 0) < 3:
        computed_risk = "HIGH"

    requires_approval = bool(
        getattr(policy, "approval_required", True)
        or not getattr(policy, "auto_recovery_enabled", False)
        or is_sensitive_wf
        or diag_requires_approval
        or err_category in ("AUTH_FAILURE", "DATABASE_FAILURE")
        or computed_risk in ("HIGH", "CRITICAL")
        or requested_strategy in ("MANUAL_RECOVERY", "ESCALATE_HUMAN")
    )

    return {
        "risk_level": computed_risk,
        "is_recoverable": is_recoverable,
        "requires_approval": requires_approval,
        "is_sensitive_workflow": is_sensitive_wf,
        "factors": factors,
        "evaluated_strategy": requested_strategy,
    }


class RecoveryEngineService:
    """
    Production Intelligent Recovery Engine:
    Failed Execution -> Incident -> AI Diagnosis -> Recovery Recommendation
    -> Risk Assessment -> Human Approval -> Recovery Execution -> Result Verification -> History.
    """

    async def get_or_create_policy(self, db: AsyncSession, agency_id: str) -> RecoveryPolicy:
        res = await db.execute(select(RecoveryPolicy).where(RecoveryPolicy.agency_id == agency_id))
        policy = res.scalar_one_or_none()
        if policy:
            return policy
        policy = RecoveryPolicy(
            agency_id=agency_id,
            max_retry_attempts=3,
            retry_delay_seconds=60,
            use_exponential_backoff=True,
            cooldown_seconds=120,
            approval_required=True,
            auto_recovery_enabled=False,
            allowed_strategies=list(SUPPORTED_STRATEGIES),
        )
        db.add(policy)
        await db.flush()
        return policy

    async def update_policy(
        self,
        db: AsyncSession,
        agency_id: str,
        user_id: str,
        updates: Dict[str, Any],
        ip_address: Optional[str] = None,
    ) -> RecoveryPolicy:
        policy = await self.get_or_create_policy(db, agency_id)
        for field in (
            "max_retry_attempts",
            "retry_delay_seconds",
            "use_exponential_backoff",
            "cooldown_seconds",
            "approval_required",
            "auto_recovery_enabled",
            "allowed_strategies",
        ):
            if field in updates and updates[field] is not None:
                setattr(policy, field, updates[field])
        policy.updated_by_user_id = user_id
        policy.updated_at = utc_now()

        await self.create_audit_log(
            db,
            agency_id=agency_id,
            user_id=user_id,
            action="RECOVERY_POLICY_UPDATED",
            entity_type="RECOVERY_POLICY",
            entity_id=policy.id,
            details={
                "max_retry_attempts": policy.max_retry_attempts,
                "retry_delay_seconds": policy.retry_delay_seconds,
                "use_exponential_backoff": policy.use_exponential_backoff,
                "cooldown_seconds": policy.cooldown_seconds,
                "approval_required": policy.approval_required,
                "auto_recovery_enabled": policy.auto_recovery_enabled,
                "allowed_strategies": policy.allowed_strategies,
            },
            ip_address=ip_address,
        )
        return policy

    async def create_audit_log(
        self,
        db: AsyncSession,
        agency_id: str,
        user_id: Optional[str],
        action: str,
        entity_type: str,
        entity_id: str,
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
    ) -> AuditLog:
        entry = AuditLog(
            agency_id=agency_id,
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details or {},
            ip_address=ip_address,
            created_at=utc_now(),
        )
        db.add(entry)
        return entry

    async def create_deduplicated_notification(
        self,
        db: AsyncSession,
        agency_id: str,
        notif_type: str,
        title: str,
        message: str,
        incident_id: Optional[str] = None,
    ) -> Notification:
        recent_cutoff = utc_now() - timedelta(minutes=10)
        query = select(Notification).where(
            Notification.agency_id == agency_id,
            Notification.type == notif_type,
            Notification.title == title,
            Notification.is_read == False,
            Notification.created_at >= recent_cutoff,
        )
        if incident_id:
            query = query.where(Notification.incident_id == incident_id)
        existing = (await db.execute(query)).scalar_one_or_none()
        if existing:
            return existing

        notif = Notification(
            agency_id=agency_id,
            type=notif_type,
            title=title,
            message=message,
            incident_id=incident_id,
            is_read=False,
            created_at=utc_now(),
        )
        db.add(notif)
        return notif

    async def create_recovery_request(
        self,
        db: AsyncSession,
        agency_id: str,
        user_id: str,
        incident_id: str,
        strategy: str,
        delay_seconds: Optional[int] = None,
        reason: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> RecoveryRequest:
        if strategy not in SUPPORTED_STRATEGIES:
            raise HTTPException(status_code=400, detail=f"Unsupported recovery strategy: {strategy}")

        inc_res = await db.execute(
            select(Incident)
            .options(selectinload(Incident.ai_diagnosis), selectinload(Incident.workflow))
            .where(Incident.id == incident_id, Incident.agency_id == agency_id)
        )
        incident = inc_res.scalar_one_or_none()
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found in organization")

        policy = await self.get_or_create_policy(db, agency_id)
        allowed = policy.allowed_strategies or list(SUPPORTED_STRATEGIES)
        if strategy not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Strategy '{strategy}' is disabled by organization recovery policy.",
            )

        resolved_key = idempotency_key or generate_request_idempotency_key(
            incident.id, strategy, incident.occurrence_count
        )
        existing_by_key = (
            await db.execute(select(RecoveryRequest).where(RecoveryRequest.idempotency_key == resolved_key))
        ).scalar_one_or_none()
        if existing_by_key:
            if existing_by_key.agency_id != agency_id:
                raise HTTPException(status_code=403, detail="Cross-tenant idempotency conflict")
            return existing_by_key

        active_existing = (
            await db.execute(
                select(RecoveryRequest).where(
                    RecoveryRequest.incident_id == incident.id,
                    RecoveryRequest.agency_id == agency_id,
                    RecoveryRequest.status.in_(ACTIVE_RECOVERY_STATUSES),
                )
            )
        ).scalar_one_or_none()
        if active_existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Active recovery request ({active_existing.id}) already exists with status {active_existing.status}.",
            )

        wf = incident.workflow
        diagnosis = incident.ai_diagnosis

        if strategy in RETRY_STRATEGIES and diagnosis is not None and not diagnosis.is_recoverable:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot queue automated retry: AI diagnosis marked this incident non-recoverable.",
            )

        risk = assess_recovery_risk(incident, wf, diagnosis, policy, strategy)
        computed_delay = calculate_backoff_delay_seconds(
            strategy=strategy,
            attempt_number=1,
            base_delay_seconds=policy.retry_delay_seconds,
            use_exponential_backoff=policy.use_exponential_backoff,
            custom_delay_seconds=delay_seconds,
        )

        now_utc = utc_now()
        if strategy == "MARK_NON_RECOVERABLE":
            initial_status = "NON_RECOVERABLE"
            requires_approval = False
            incident.status = "IGNORED"
            completed_at = now_utc
            final_summary = reason or "Marked non-recoverable by operator."
        elif strategy == "ESCALATE_HUMAN":
            initial_status = "PENDING_APPROVAL"
            requires_approval = True
            incident.status = "APPROVAL_REQUIRED"
            completed_at = None
            final_summary = None
        elif risk["requires_approval"]:
            initial_status = "PENDING_APPROVAL"
            requires_approval = True
            incident.status = "APPROVAL_REQUIRED"
            completed_at = None
            final_summary = None
        else:
            initial_status = "SCHEDULED" if computed_delay > 0 else "APPROVED"
            requires_approval = False
            incident.status = "RECOVERING"
            completed_at = None
            final_summary = None

        rec_reason = (
            reason
            or (diagnosis.recommendation_reason if diagnosis and diagnosis.recommendation_reason else None)
            or f"Recovery strategy {strategy} requested for workflow '{wf.name if wf else incident.workflow_id}'."
        )
        required_action = (
            diagnosis.required_user_action
            if diagnosis and diagnosis.required_user_action
            else "Verify external side-effects before dispatching workflow retry."
        )

        rec_req = RecoveryRequest(
            agency_id=agency_id,
            incident_id=incident.id,
            workflow_id=incident.workflow_id,
            execution_record_id=incident.execution_record_id,
            external_execution_id=incident.execution_id,
            strategy=strategy,
            status=initial_status,
            is_recoverable=risk["is_recoverable"],
            risk_level=risk["risk_level"],
            risk_assessment=risk,
            recommended_reason=rec_reason,
            required_user_action=required_action,
            max_retry_attempts=policy.max_retry_attempts,
            retry_count=0,
            delay_seconds=computed_delay,
            next_retry_at=(now_utc + timedelta(seconds=computed_delay)) if computed_delay > 0 else None,
            requires_approval=requires_approval,
            requested_by_user_id=user_id,
            idempotency_key=resolved_key,
            result_verified=False,
            final_result_summary=final_summary,
            completed_at=completed_at,
        )
        db.add(rec_req)
        await db.flush()

        if requires_approval:
            approval = ApprovalRequest(
                incident_id=incident.id,
                recovery_request_id=rec_req.id,
                agency_id=agency_id,
                requested_by=user_id,
                proposed_action=f"{strategy} ({wf.name if wf else incident.workflow_id})",
                risk_reason=f"Risk {risk['risk_level']}: {'; '.join(risk['factors']) or rec_reason}",
                status="PENDING",
            )
            db.add(approval)
            await self.create_deduplicated_notification(
                db,
                agency_id=agency_id,
                notif_type="APPROVAL_REQUEST",
                title=f"Approval Needed: {wf.name if wf else 'Workflow Recovery'}",
                message=f"Strategy {strategy} flagged as {risk['risk_level']} risk. Human review required before execution.",
                incident_id=incident.id,
            )
            try:
                from app.services.alert_delivery import dispatch_lifecycle_alerts

                await dispatch_lifecycle_alerts(
                    db,
                    agency_id=agency_id,
                    event_type="RECOVERY_APPROVAL_REQUIRED",
                    severity=risk["risk_level"],
                    title=f"Approval Needed: {wf.name if wf else 'Workflow Recovery'}",
                    message=f"Strategy {strategy} flagged as {risk['risk_level']} risk. Human review required before execution.",
                )
            except Exception as alert_exc:
                logger.warning("Approval alert dispatch error: %s", alert_exc)

        await self.create_audit_log(
            db,
            agency_id=agency_id,
            user_id=user_id,
            action="RECOVERY_REQUESTED",
            entity_type="RECOVERY_REQUEST",
            entity_id=rec_req.id,
            details={
                "incident_id": incident.id,
                "strategy": strategy,
                "status": initial_status,
                "risk_level": risk["risk_level"],
                "requires_approval": requires_approval,
            },
            ip_address=ip_address,
        )
        return rec_req

    async def submit_approval_decision(
        self,
        db: AsyncSession,
        agency_id: str,
        approval_id: str,
        approver_user_id: str,
        approver_label: str,
        decision: str,
        reason: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        res = await db.execute(
            select(ApprovalRequest)
            .join(Incident, ApprovalRequest.incident_id == Incident.id)
            .where(ApprovalRequest.id == approval_id, Incident.agency_id == agency_id)
        )
        appr = res.scalar_one_or_none()
        if not appr:
            raise HTTPException(status_code=404, detail="Approval request not found")

        if appr.status != "PENDING":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Approval request has already been finalized with status '{appr.status}'.",
            )

        normalized = decision.strip().upper()
        if normalized not in ("APPROVE", "APPROVED", "REJECT", "REJECTED"):
            raise HTTPException(status_code=400, detail="Decision must be APPROVE or REJECT")

        is_approved = normalized in ("APPROVE", "APPROVED")
        now_utc = utc_now()
        appr.status = "APPROVED" if is_approved else "REJECTED"
        appr.agency_id = agency_id
        appr.approver_user_id = approver_user_id
        appr.responded_by = approver_label
        appr.responded_at = now_utc
        appr.rejection_reason = None if is_approved else (reason or "Rejected by operator.")

        inc = (await db.execute(select(Incident).where(Incident.id == appr.incident_id))).scalar_one_or_none()
        rec_req: Optional[RecoveryRequest] = None
        if appr.recovery_request_id:
            rec_req = (
                await db.execute(
                    select(RecoveryRequest).where(
                        RecoveryRequest.id == appr.recovery_request_id,
                        RecoveryRequest.agency_id == agency_id,
                    )
                )
            ).scalar_one_or_none()

        if is_approved:
            if inc:
                inc.status = "RECOVERING"
            if rec_req and rec_req.status == "PENDING_APPROVAL":
                rec_req.status = "SCHEDULED" if rec_req.delay_seconds > 0 else "APPROVED"
                if rec_req.delay_seconds > 0:
                    rec_req.next_retry_at = now_utc + timedelta(seconds=rec_req.delay_seconds)
            await self.create_deduplicated_notification(
                db,
                agency_id=agency_id,
                notif_type="RECOVERY_APPROVED",
                title="Recovery Request Approved",
                message=f"Operator {approver_label} approved recovery action '{appr.proposed_action}'.",
                incident_id=appr.incident_id,
            )
        else:
            if inc:
                inc.status = "INVESTIGATING"
            if rec_req and rec_req.status in ("PENDING_APPROVAL", "APPROVED", "SCHEDULED"):
                rec_req.status = "REJECTED"
                rec_req.last_error = appr.rejection_reason
                rec_req.final_result_summary = f"Rejected by {approver_label}: {appr.rejection_reason}"
                rec_req.completed_at = now_utc
            await self.create_deduplicated_notification(
                db,
                agency_id=agency_id,
                notif_type="RECOVERY_REJECTED",
                title="Recovery Request Rejected",
                message=f"Operator {approver_label} rejected '{appr.proposed_action}'. Reason: {appr.rejection_reason}",
                incident_id=appr.incident_id,
            )

        await self.create_audit_log(
            db,
            agency_id=agency_id,
            user_id=approver_user_id,
            action="APPROVAL_SUBMITTED",
            entity_type="APPROVAL_REQUEST",
            entity_id=appr.id,
            details={
                "decision": appr.status,
                "incident_id": appr.incident_id,
                "recovery_request_id": appr.recovery_request_id,
                "reason": appr.rejection_reason,
            },
            ip_address=ip_address,
        )

        return {
            "success": True,
            "approval_id": appr.id,
            "status": appr.status,
            "recovery_request_id": appr.recovery_request_id,
            "recovery_status": rec_req.status if rec_req else None,
        }

    async def cancel_recovery_request(
        self,
        db: AsyncSession,
        agency_id: str,
        request_id: str,
        user_id: str,
        reason: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> RecoveryRequest:
        rec_req = (
            await db.execute(
                select(RecoveryRequest).where(
                    RecoveryRequest.id == request_id,
                    RecoveryRequest.agency_id == agency_id,
                )
            )
        ).scalar_one_or_none()
        if not rec_req:
            raise HTTPException(status_code=404, detail="Recovery request not found")

        if rec_req.status in ("SUCCEEDED", "CANCELLED", "NON_RECOVERABLE"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot cancel recovery request in terminal status '{rec_req.status}'.",
            )
        if rec_req.status in ("EXECUTING", "VERIFYING"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot cancel recovery request while execution or verification is in progress.",
            )

        now_utc = utc_now()
        cancel_reason = reason or "Cancelled by operator."
        rec_req.status = "CANCELLED"
        rec_req.last_error = cancel_reason
        rec_req.final_result_summary = cancel_reason
        rec_req.completed_at = now_utc

        pending_approvals = (
            await db.execute(
                select(ApprovalRequest).where(
                    ApprovalRequest.recovery_request_id == rec_req.id,
                    ApprovalRequest.status == "PENDING",
                )
            )
        ).scalars().all()
        for appr in pending_approvals:
            appr.status = "CANCELLED"
            appr.approver_user_id = user_id
            appr.responded_at = now_utc
            appr.rejection_reason = cancel_reason

        inc = (await db.execute(select(Incident).where(Incident.id == rec_req.incident_id))).scalar_one_or_none()
        if inc and inc.status in ("APPROVAL_REQUIRED", "RECOVERING"):
            inc.status = "INVESTIGATING"

        await self.create_audit_log(
            db,
            agency_id=agency_id,
            user_id=user_id,
            action="RECOVERY_CANCELLED",
            entity_type="RECOVERY_REQUEST",
            entity_id=rec_req.id,
            details={"reason": cancel_reason, "incident_id": rec_req.incident_id},
            ip_address=ip_address,
        )
        return rec_req

    async def execute_and_verify_recovery(
        self,
        db: AsyncSession,
        agency_id: str,
        request_id: str,
        actor_user_id: str,
        n8n_client_factory: Optional[Callable[[str, str], N8NClient]] = None,
        verify_result: bool = True,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        rec_req = (
            await db.execute(
                select(RecoveryRequest).where(
                    RecoveryRequest.id == request_id,
                    RecoveryRequest.agency_id == agency_id,
                )
            )
        ).scalar_one_or_none()
        if not rec_req:
            raise HTTPException(status_code=404, detail="Recovery request not found")

        if rec_req.status in ("CANCELLED", "REJECTED", "SUCCEEDED", "NON_RECOVERABLE"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Recovery request cannot execute from terminal status '{rec_req.status}'.",
            )
        if rec_req.status in ("EXECUTING", "VERIFYING"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Recovery execution is already in progress for this request.",
            )
        if not rec_req.is_recoverable or rec_req.strategy == "MARK_NON_RECOVERABLE":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Incident is marked non-recoverable and cannot be retried.",
            )

        if rec_req.requires_approval:
            appr = (
                await db.execute(
                    select(ApprovalRequest).where(
                        ApprovalRequest.recovery_request_id == rec_req.id,
                        ApprovalRequest.status == "APPROVED",
                    )
                )
            ).scalar_one_or_none()
            if not appr:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Human approval is required before executing this recovery request.",
                )

        policy = await self.get_or_create_policy(db, agency_id)
        effective_max_retries = min(rec_req.max_retry_attempts, policy.max_retry_attempts)
        if rec_req.retry_count >= effective_max_retries:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Maximum retry attempts reached ({rec_req.retry_count}/{effective_max_retries}).",
            )

        now_utc = utc_now()
        cooldown_until = ensure_utc(rec_req.cooldown_until)
        if cooldown_until and cooldown_until > now_utc:
            remaining = int((cooldown_until - now_utc).total_seconds()) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Recovery cooldown active. Retry allowed in {remaining}s.",
            )

        next_attempt = rec_req.retry_count + 1
        attempt_idem_key = generate_recovery_idempotency_key(rec_req.id, next_attempt)
        existing_attempt = (
            await db.execute(select(RecoveryAttempt).where(RecoveryAttempt.idempotency_key == attempt_idem_key))
        ).scalar_one_or_none()
        if existing_attempt:
            return {
                "success": existing_attempt.status == "SUCCESS",
                "deduplicated": True,
                "recovery_request_id": rec_req.id,
                "status": rec_req.status,
                "attempt_id": existing_attempt.id,
                "verification_status": existing_attempt.verification_status,
                "result_verified": rec_req.result_verified,
            }

        incident = (
            await db.execute(
                select(Incident).where(Incident.id == rec_req.incident_id, Incident.agency_id == agency_id)
            )
        ).scalar_one_or_none()
        if not incident:
            raise HTTPException(status_code=404, detail="Linked incident not found")

        wf = (
            await db.execute(
                select(Workflow).where(Workflow.id == rec_req.workflow_id, Workflow.agency_id == agency_id)
            )
        ).scalar_one_or_none()
        if not wf:
            raise HTTPException(status_code=404, detail="Linked workflow not found in tenant")

        delay_applied = calculate_backoff_delay_seconds(
            strategy=rec_req.strategy,
            attempt_number=next_attempt,
            base_delay_seconds=policy.retry_delay_seconds,
            use_exponential_backoff=policy.use_exponential_backoff,
            custom_delay_seconds=rec_req.delay_seconds if next_attempt == 1 else None,
        )

        rec_req.status = "EXECUTING"
        incident.status = "RECOVERING"
        await self.create_audit_log(
            db,
            agency_id=agency_id,
            user_id=actor_user_id,
            action="RECOVERY_STARTED",
            entity_type="RECOVERY_REQUEST",
            entity_id=rec_req.id,
            details={
                "attempt_number": next_attempt,
                "strategy": rec_req.strategy,
                "delay_applied_seconds": delay_applied,
            },
            ip_address=ip_address,
        )
        await self.create_deduplicated_notification(
            db,
            agency_id=agency_id,
            notif_type="RECOVERY_STARTED",
            title=f"Recovery Started: {wf.name}",
            message=f"Executing attempt #{next_attempt} using strategy {rec_req.strategy}.",
            incident_id=incident.id,
        )

        # Verify platform and credentials honestly — NEVER fabricate success!
        if wf.platform.lower() != "n8n":
            attempt_status = "FAILED"
            verification_status = "VERIFIED_FAILED"
            error_detail = f"Automated remote retry is only supported for n8n workflows (got platform '{wf.platform}')."
            exec_response: Dict[str, Any] = {"error": error_detail}
            result_execution_id = None
        else:
            integ = None
            if wf.integration_id:
                integ = (
                    await db.execute(
                        select(Integration).where(
                            Integration.id == wf.integration_id,
                            Integration.agency_id == agency_id,
                        )
                    )
                ).scalar_one_or_none()
            api_key = decrypt_secret(integ.encrypted_credentials) if (integ and integ.encrypted_credentials) else None
            exec_id = rec_req.external_execution_id or incident.execution_id
            is_reexecute = rec_req.strategy == "REEXECUTE_WORKFLOW"
            missing_target = (not wf.external_workflow_id) if is_reexecute else (not exec_id)

            if not integ or not integ.instance_url or not api_key or missing_target:
                attempt_status = "FAILED"
                verification_status = "VERIFIED_FAILED"
                error_detail = (
                    "Missing verified n8n integration credentials or external workflow ID."
                    if is_reexecute
                    else "Missing verified n8n integration credentials or external execution ID."
                )
                exec_response = {"error": error_detail}
                result_execution_id = None
            else:
                client = (
                    n8n_client_factory(integ.instance_url, api_key)
                    if n8n_client_factory
                    else N8NClient(base_url=integ.instance_url, api_key=api_key)
                )
                try:
                    if is_reexecute:
                        exec_response = await client.trigger_workflow(wf.external_workflow_id)
                        raw_new_id = (
                            exec_response.get("id")
                            or exec_response.get("executionId")
                            or (exec_response.get("data") or {}).get("executionId")
                            or (exec_response.get("data") or {}).get("id")
                        )
                        result_execution_id = str(raw_new_id or "") or None
                    else:
                        exec_response = await client.retry_execution(exec_id)
                        result_execution_id = str(exec_response.get("id") or "") or None

                    if verify_result and result_execution_id:
                        rec_req.status = "VERIFYING"
                        verify_raw = await client.get_execution(result_execution_id, include_data=True)
                        normalized = normalize_n8n_execution(verify_raw)
                        exec_response = {"retry_response": exec_response, "verification": verify_raw}

                        if normalized["status"] == "SUCCESS":
                            attempt_status = "SUCCESS"
                            verification_status = "VERIFIED_SUCCESS"
                            error_detail = None
                        elif normalized["status"] == "RUNNING":
                            attempt_status = "PENDING"
                            verification_status = "UNVERIFIED"
                            error_detail = "Execution retry started in n8n and is still running."
                        else:
                            attempt_status = "FAILED"
                            verification_status = "VERIFIED_FAILED"
                            error_detail = normalized.get("error_message") or f"n8n verified execution status: {normalized['status']}"
                    else:
                        attempt_status = "PENDING"
                        verification_status = "UNVERIFIED"
                        error_detail = "Recovery dispatched without verified terminal execution ID."
                except Exception as exc:
                    attempt_status = "FAILED"
                    verification_status = "VERIFIED_FAILED"
                    error_detail = f"n8n recovery error: {str(exc)}"
                    exec_response = {"error": error_detail}
                    result_execution_id = None

        finished_at = utc_now()
        attempt = RecoveryAttempt(
            incident_id=incident.id,
            recovery_request_id=rec_req.id,
            workflow_id=wf.id,
            attempt_number=next_attempt,
            strategy=rec_req.strategy,
            action=rec_req.strategy,
            initiated_by=actor_user_id,
            status=attempt_status,
            delay_applied_seconds=delay_applied,
            idempotency_key=attempt_idem_key,
            execution_response=exec_response,
            verification_status=verification_status,
            verified_at=finished_at if verification_status.startswith("VERIFIED_") else None,
            executed_at=finished_at,
            details=error_detail or f"Attempt #{next_attempt} completed with verification {verification_status}.",
            result_execution_id=result_execution_id,
        )
        db.add(attempt)
        await db.flush()

        rec_req.retry_count = next_attempt
        rec_req.delay_seconds = delay_applied

        if verification_status == "VERIFIED_SUCCESS":
            rec_req.status = "SUCCEEDED"
            rec_req.result_verified = True
            rec_req.last_error = None
            rec_req.final_result_summary = f"Verified n8n execution {result_execution_id} succeeded on attempt #{next_attempt}."
            rec_req.completed_at = finished_at

            incident.status = "RESOLVED"
            wf.health_status = "HEALTHY"
            wf.consecutive_failures = 0
            wf.last_successful_at = finished_at

            await self.create_audit_log(
                db,
                agency_id=agency_id,
                user_id=actor_user_id,
                action="RETRY_ATTEMPTED",
                entity_type="RECOVERY_ATTEMPT",
                entity_id=attempt.id,
                details={"attempt_number": next_attempt, "result_execution_id": result_execution_id, "status": "SUCCESS"},
                ip_address=ip_address,
            )
            await self.create_audit_log(
                db,
                agency_id=agency_id,
                user_id=actor_user_id,
                action="RECOVERY_COMPLETED",
                entity_type="RECOVERY_REQUEST",
                entity_id=rec_req.id,
                details={"incident_id": incident.id, "result_execution_id": result_execution_id},
                ip_address=ip_address,
            )
            await self.create_deduplicated_notification(
                db,
                agency_id=agency_id,
                notif_type="RECOVERY_SUCCEEDED",
                title=f"Recovery Succeeded: {wf.name}",
                message=f"Verified execution {result_execution_id} completed successfully.",
                incident_id=incident.id,
            )
            try:
                from app.services.alert_delivery import dispatch_lifecycle_alerts

                await dispatch_lifecycle_alerts(
                    db,
                    agency_id=agency_id,
                    event_type="RECOVERY_SUCCEEDED",
                    severity="LOW",
                    title=f"Recovery Succeeded: {wf.name}",
                    message=f"Verified execution {result_execution_id} completed successfully on attempt #{next_attempt}.",
                )
            except Exception as alert_exc:
                logger.warning("Recovery success alert dispatch error: %s", alert_exc)
        elif verification_status == "UNVERIFIED":
            rec_req.status = "VERIFYING"
            rec_req.result_verified = False
            rec_req.last_error = None
            rec_req.final_result_summary = error_detail
            rec_req.verification_deadline_at = finished_at + timedelta(
                seconds=max(30, int(settings.RECOVERY_VERIFICATION_TIMEOUT_SECONDS))
            )
            await self.create_audit_log(
                db,
                agency_id=agency_id,
                user_id=actor_user_id,
                action="RETRY_ATTEMPTED",
                entity_type="RECOVERY_ATTEMPT",
                entity_id=attempt.id,
                details={"attempt_number": next_attempt, "result_execution_id": result_execution_id, "status": "UNVERIFIED"},
                ip_address=ip_address,
            )
        else:
            rec_req.status = "FAILED"
            rec_req.result_verified = False
            rec_req.last_error = error_detail
            rec_req.final_result_summary = error_detail
            rec_req.cooldown_until = finished_at + timedelta(seconds=max(0, policy.cooldown_seconds))
            if next_attempt < effective_max_retries:
                next_delay = calculate_backoff_delay_seconds(
                    rec_req.strategy,
                    next_attempt + 1,
                    policy.retry_delay_seconds,
                    policy.use_exponential_backoff,
                )
                rec_req.next_retry_at = finished_at + timedelta(seconds=max(next_delay, policy.cooldown_seconds))
            else:
                rec_req.completed_at = finished_at

            incident.status = "INVESTIGATING"
            await self.create_audit_log(
                db,
                agency_id=agency_id,
                user_id=actor_user_id,
                action="RETRY_ATTEMPTED",
                entity_type="RECOVERY_ATTEMPT",
                entity_id=attempt.id,
                details={"attempt_number": next_attempt, "status": "FAILED", "error": error_detail},
                ip_address=ip_address,
            )
            await self.create_audit_log(
                db,
                agency_id=agency_id,
                user_id=actor_user_id,
                action="RECOVERY_FAILED",
                entity_type="RECOVERY_REQUEST",
                entity_id=rec_req.id,
                details={"incident_id": incident.id, "error": error_detail},
                ip_address=ip_address,
            )
            await self.create_deduplicated_notification(
                db,
                agency_id=agency_id,
                notif_type="RECOVERY_FAILED",
                title=f"Recovery Failed: {wf.name}",
                message=f"Attempt #{next_attempt} did not succeed: {error_detail}",
                incident_id=incident.id,
            )
            try:
                from app.services.alert_delivery import dispatch_lifecycle_alerts

                await dispatch_lifecycle_alerts(
                    db,
                    agency_id=agency_id,
                    event_type="RECOVERY_FAILED",
                    severity=incident.severity or "HIGH",
                    title=f"Recovery Failed: {wf.name}",
                    message=f"Attempt #{next_attempt} did not succeed: {error_detail}",
                )
            except Exception as alert_exc:
                logger.warning("Recovery failure alert dispatch error: %s", alert_exc)

        return {
            "success": verification_status == "VERIFIED_SUCCESS",
            "recovery_request_id": rec_req.id,
            "incident_id": incident.id,
            "status": rec_req.status,
            "incident_status": incident.status,
            "attempt_id": attempt.id,
            "attempt_number": next_attempt,
            "verification_status": verification_status,
            "result_verified": rec_req.result_verified,
            "result_execution_id": result_execution_id,
            "details": attempt.details,
        }

    async def verify_pending_recovery(
        self,
        db: AsyncSession,
        agency_id: str,
        request_id: str,
        actor_user_id: str,
        n8n_client_factory: Optional[Callable[[str, str], N8NClient]] = None,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        rec_req = (
            await db.execute(
                select(RecoveryRequest)
                .options(selectinload(RecoveryRequest.attempts))
                .where(RecoveryRequest.id == request_id, RecoveryRequest.agency_id == agency_id)
            )
        ).scalar_one_or_none()
        if not rec_req:
            raise HTTPException(status_code=404, detail="Recovery request not found")
        if rec_req.status != "VERIFYING":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Recovery request is in status '{rec_req.status}', not 'VERIFYING'.",
            )

        attempts = sorted(rec_req.attempts, key=lambda a: a.attempt_number, reverse=True)
        latest_attempt = attempts[0] if attempts else None
        result_execution_id = latest_attempt.result_execution_id if latest_attempt else None

        incident = (
            await db.execute(select(Incident).where(Incident.id == rec_req.incident_id, Incident.agency_id == agency_id))
        ).scalar_one_or_none()
        wf = (
            await db.execute(select(Workflow).where(Workflow.id == rec_req.workflow_id, Workflow.agency_id == agency_id))
        ).scalar_one_or_none()
        policy = await self.get_or_create_policy(db, agency_id)
        now_utc = utc_now()
        deadline = ensure_utc(rec_req.verification_deadline_at)

        async def _mark_failed(err_msg: str) -> Dict[str, Any]:
            if latest_attempt:
                latest_attempt.status = "FAILED"
                latest_attempt.verification_status = "VERIFIED_FAILED"
                latest_attempt.verified_at = now_utc
                latest_attempt.details = err_msg
            rec_req.status = "FAILED"
            rec_req.result_verified = False
            rec_req.last_error = err_msg
            rec_req.final_result_summary = err_msg
            rec_req.cooldown_until = now_utc + timedelta(seconds=max(0, policy.cooldown_seconds))
            effective_max = min(rec_req.max_retry_attempts, policy.max_retry_attempts)
            if rec_req.retry_count < effective_max:
                next_delay = calculate_backoff_delay_seconds(
                    rec_req.strategy,
                    rec_req.retry_count + 1,
                    policy.retry_delay_seconds,
                    policy.use_exponential_backoff,
                )
                rec_req.next_retry_at = now_utc + timedelta(seconds=max(next_delay, policy.cooldown_seconds))
            else:
                rec_req.completed_at = now_utc
            if incident:
                incident.status = "INVESTIGATING"
            await self.create_audit_log(
                db,
                agency_id=agency_id,
                user_id=actor_user_id,
                action="RECOVERY_FAILED",
                entity_type="RECOVERY_REQUEST",
                entity_id=rec_req.id,
                details={"incident_id": rec_req.incident_id, "error": err_msg},
                ip_address=ip_address,
            )
            try:
                from app.services.alert_delivery import dispatch_lifecycle_alerts

                await dispatch_lifecycle_alerts(
                    db,
                    agency_id=agency_id,
                    event_type="RECOVERY_FAILED",
                    severity=(incident.severity if incident else "HIGH"),
                    title=f"Recovery Verification Failed: {wf.name if wf else rec_req.workflow_id}",
                    message=err_msg,
                )
            except Exception as alert_exc:
                logger.warning("Recovery verify failure alert error: %s", alert_exc)
            return {
                "success": False,
                "recovery_request_id": rec_req.id,
                "status": rec_req.status,
                "verification_status": "VERIFIED_FAILED",
                "result_verified": False,
                "details": err_msg,
            }

        if not result_execution_id:
            if deadline and now_utc >= deadline:
                return await _mark_failed("Recovery verification timed out without a tracked n8n execution ID.")
            return {
                "success": False,
                "recovery_request_id": rec_req.id,
                "status": rec_req.status,
                "verification_status": "UNVERIFIED",
                "result_verified": False,
                "details": "Waiting for n8n execution ID verification.",
            }

        integ = (
            await db.execute(
                select(Integration).where(
                    Integration.id == wf.integration_id,
                    Integration.agency_id == agency_id,
                )
            )
            if (wf and wf.integration_id)
            else None
        )
        integ_obj = integ.scalar_one_or_none() if integ else None
        api_key = decrypt_secret(integ_obj.encrypted_credentials) if (integ_obj and integ_obj.encrypted_credentials) else None
        if not integ_obj or not integ_obj.instance_url or not api_key:
            return await _mark_failed("Integration credentials unavailable to verify pending execution.")

        client = (
            n8n_client_factory(integ_obj.instance_url, api_key)
            if n8n_client_factory
            else N8NClient(base_url=integ_obj.instance_url, api_key=api_key)
        )
        try:
            verify_raw = await client.get_execution(result_execution_id, include_data=True)
            normalized = normalize_n8n_execution(verify_raw)
        except Exception as exc:
            if deadline and now_utc >= deadline:
                return await _mark_failed(f"Verification timed out after n8n lookup error: {exc}")
            return {
                "success": False,
                "recovery_request_id": rec_req.id,
                "status": rec_req.status,
                "verification_status": "UNVERIFIED",
                "result_verified": False,
                "details": f"Verification lookup pending: {exc}",
            }

        if normalized["status"] == "SUCCESS":
            if latest_attempt:
                latest_attempt.status = "SUCCESS"
                latest_attempt.verification_status = "VERIFIED_SUCCESS"
                latest_attempt.verified_at = now_utc
                latest_attempt.details = f"Verified execution {result_execution_id} succeeded."
                latest_attempt.execution_response = {"verification": verify_raw}
            rec_req.status = "SUCCEEDED"
            rec_req.result_verified = True
            rec_req.last_error = None
            rec_req.final_result_summary = f"Verified n8n execution {result_execution_id} succeeded."
            rec_req.completed_at = now_utc
            if incident:
                incident.status = "RESOLVED"
            if wf:
                wf.health_status = "HEALTHY"
                wf.consecutive_failures = 0
                wf.last_successful_at = now_utc
            await self.create_audit_log(
                db,
                agency_id=agency_id,
                user_id=actor_user_id,
                action="RECOVERY_COMPLETED",
                entity_type="RECOVERY_REQUEST",
                entity_id=rec_req.id,
                details={"incident_id": rec_req.incident_id, "result_execution_id": result_execution_id},
                ip_address=ip_address,
            )
            try:
                from app.services.alert_delivery import dispatch_lifecycle_alerts

                await dispatch_lifecycle_alerts(
                    db,
                    agency_id=agency_id,
                    event_type="RECOVERY_SUCCEEDED",
                    severity="LOW",
                    title=f"Recovery Succeeded: {wf.name if wf else rec_req.workflow_id}",
                    message=f"Verified execution {result_execution_id} completed successfully.",
                )
            except Exception as alert_exc:
                logger.warning("Recovery verify success alert error: %s", alert_exc)
            return {
                "success": True,
                "recovery_request_id": rec_req.id,
                "status": rec_req.status,
                "verification_status": "VERIFIED_SUCCESS",
                "result_verified": True,
                "result_execution_id": result_execution_id,
                "details": rec_req.final_result_summary,
            }

        if normalized["status"] == "RUNNING":
            if deadline and now_utc >= deadline:
                return await _mark_failed(
                    f"Recovery verification timed out waiting for execution {result_execution_id} to complete."
                )
            return {
                "success": False,
                "recovery_request_id": rec_req.id,
                "status": rec_req.status,
                "verification_status": "UNVERIFIED",
                "result_verified": False,
                "result_execution_id": result_execution_id,
                "details": "Execution retry is still running in n8n.",
            }

        err_msg = normalized.get("error_message") or f"n8n execution finished with status '{normalized['status']}'."
        return await _mark_failed(err_msg)

    async def process_scheduled_and_verifying_recoveries(
        self,
        db: AsyncSession,
        agency_id: Optional[str] = None,
        n8n_client_factory: Optional[Callable[[str, str], N8NClient]] = None,
    ) -> Dict[str, int]:
        now_utc = utc_now()
        scheduled_q = select(RecoveryRequest).where(RecoveryRequest.status == "SCHEDULED")
        verifying_q = select(RecoveryRequest).where(RecoveryRequest.status == "VERIFYING")
        if agency_id:
            scheduled_q = scheduled_q.where(RecoveryRequest.agency_id == agency_id)
            verifying_q = verifying_q.where(RecoveryRequest.agency_id == agency_id)

        scheduled_reqs = (await db.execute(scheduled_q)).scalars().all()
        verifying_reqs = (await db.execute(verifying_q)).scalars().all()

        scheduled_executed = 0
        verified_checked = 0
        errors = 0

        for req in scheduled_reqs:
            due_at = ensure_utc(req.next_retry_at)
            if due_at and due_at > now_utc:
                continue
            try:
                await self.execute_and_verify_recovery(
                    db,
                    agency_id=req.agency_id,
                    request_id=req.id,
                    actor_user_id="celery_worker",
                    n8n_client_factory=n8n_client_factory,
                    verify_result=True,
                )
                scheduled_executed += 1
            except Exception as exc:
                errors += 1
                logger.warning("Scheduled recovery execution skipped for %s: %s", req.id, exc)

        for req in verifying_reqs:
            try:
                await self.verify_pending_recovery(
                    db,
                    agency_id=req.agency_id,
                    request_id=req.id,
                    actor_user_id="celery_worker",
                    n8n_client_factory=n8n_client_factory,
                )
                verified_checked += 1
            except Exception as exc:
                errors += 1
                logger.warning("Pending recovery verification failed for %s: %s", req.id, exc)

        return {
            "scheduled_executed": scheduled_executed,
            "verified_checked": verified_checked,
            "errors": errors,
        }

    async def get_recovery_metrics(self, db: AsyncSession, agency_id: str) -> Dict[str, Any]:
        rows = (
            await db.execute(
                select(RecoveryRequest.status, func.count(RecoveryRequest.id))
                .where(RecoveryRequest.agency_id == agency_id)
                .group_by(RecoveryRequest.status)
            )
        ).all()
        counts = {status_val: int(cnt) for status_val, cnt in rows}
        total = sum(counts.values())
        pending_approvals = counts.get("PENDING_APPROVAL", 0)
        succeeded = counts.get("SUCCEEDED", 0)
        failed = counts.get("FAILED", 0)
        cancelled = counts.get("CANCELLED", 0)
        non_recoverable = counts.get("NON_RECOVERABLE", 0)
        rejected = counts.get("REJECTED", 0)
        in_progress = counts.get("APPROVED", 0) + counts.get("SCHEDULED", 0) + counts.get("EXECUTING", 0) + counts.get("VERIFYING", 0)

        completed_executions = succeeded + failed
        success_rate = round((succeeded / completed_executions) * 100.0, 1) if completed_executions > 0 else 0.0

        return {
            "total_requests": total,
            "pending_approvals": pending_approvals,
            "in_progress_recoveries": in_progress,
            "successful_recoveries": succeeded,
            "failed_recoveries": failed,
            "cancelled_recoveries": cancelled,
            "rejected_recoveries": rejected,
            "non_recoverable_count": non_recoverable,
            "recovery_success_rate": success_rate,
        }

    async def list_recovery_requests(
        self,
        db: AsyncSession,
        agency_id: str,
        status_filter: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        query = (
            select(RecoveryRequest)
            .options(
                selectinload(RecoveryRequest.incident),
                selectinload(RecoveryRequest.attempts),
                selectinload(RecoveryRequest.approvals),
            )
            .where(RecoveryRequest.agency_id == agency_id)
        )
        if status_filter:
            query = query.where(RecoveryRequest.status == status_filter)
        query = query.order_by(RecoveryRequest.created_at.desc()).limit(limit)
        requests = (await db.execute(query)).scalars().all()

        wf_ids = {r.workflow_id for r in requests}
        wf_map: Dict[str, Workflow] = {}
        if wf_ids:
            wfs = (await db.execute(select(Workflow).where(Workflow.id.in_(wf_ids)))).scalars().all()
            wf_map = {w.id: w for w in wfs}

        out: List[Dict[str, Any]] = []
        for req in requests:
            wf = wf_map.get(req.workflow_id)
            out.append(
                {
                    "id": req.id,
                    "agency_id": req.agency_id,
                    "incident_id": req.incident_id,
                    "workflow_id": req.workflow_id,
                    "workflow_name": wf.name if wf else "Workflow",
                    "platform": wf.platform if wf else "n8n",
                    "external_execution_id": req.external_execution_id,
                    "strategy": req.strategy,
                    "status": req.status,
                    "is_recoverable": req.is_recoverable,
                    "risk_level": req.risk_level,
                    "risk_assessment": req.risk_assessment,
                    "recommended_reason": req.recommended_reason,
                    "required_user_action": req.required_user_action,
                    "max_retry_attempts": req.max_retry_attempts,
                    "retry_count": req.retry_count,
                    "delay_seconds": req.delay_seconds,
                    "next_retry_at": req.next_retry_at,
                    "cooldown_until": req.cooldown_until,
                    "requires_approval": req.requires_approval,
                    "idempotency_key": req.idempotency_key,
                    "result_verified": req.result_verified,
                    "final_result_summary": req.final_result_summary,
                    "last_error": req.last_error,
                    "completed_at": req.completed_at,
                    "created_at": req.created_at,
                    "updated_at": req.updated_at,
                    "incident_error_category": req.incident.error_category if req.incident else None,
                    "incident_severity": req.incident.severity if req.incident else None,
                    "attempts_count": len(req.attempts),
                    "approvals_count": len(req.approvals),
                }
            )
        return out

    async def get_recovery_request_detail(
        self,
        db: AsyncSession,
        agency_id: str,
        request_id: str,
    ) -> Dict[str, Any]:
        req = (
            await db.execute(
                select(RecoveryRequest)
                .options(
                    selectinload(RecoveryRequest.attempts),
                    selectinload(RecoveryRequest.approvals),
                )
                .where(RecoveryRequest.id == request_id, RecoveryRequest.agency_id == agency_id)
            )
        ).scalar_one_or_none()
        if not req:
            raise HTTPException(status_code=404, detail="Recovery request not found")

        inc = (
            await db.execute(
                select(Incident)
                .options(selectinload(Incident.ai_diagnosis), selectinload(Incident.workflow))
                .where(Incident.id == req.incident_id, Incident.agency_id == agency_id)
            )
        ).scalar_one_or_none()
        policy = await self.get_or_create_policy(db, agency_id)

        audit_rows = (
            await db.execute(
                select(AuditLog)
                .where(AuditLog.agency_id == agency_id, AuditLog.entity_id == req.id)
                .order_by(AuditLog.created_at.desc())
                .limit(25)
            )
        ).scalars().all()

        return {
            "recovery_request": req,
            "incident": inc,
            "workflow": inc.workflow if inc else None,
            "ai_diagnosis": inc.ai_diagnosis if inc else None,
            "attempts": sorted(req.attempts, key=lambda a: a.attempt_number, reverse=True),
            "approvals": sorted(req.approvals, key=lambda a: a.created_at, reverse=True),
            "policy": policy,
            "audit_events": audit_rows,
        }


recovery_engine_service = RecoveryEngineService()
