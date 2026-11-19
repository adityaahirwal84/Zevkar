from datetime import datetime, timedelta, timezone
import re
import secrets
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tenant_member, require_role
from app.core.database import get_db
from app.core.rate_limit import enforce_rate_limit
from app.core.security import encrypt_secret, validate_integration_url
from app.models.entities import (
    AgencyMember,
    AlertChannel,
    AlertDelivery,
    AuditLog,
    Client,
    Execution,
    Incident,
    RecoveryAttempt,
    RecoveryRequest,
    ReliabilityRule,
    SlaPolicy,
    Workflow,
)
from app.schemas.pydantic_models import (
    AlertChannelCreate,
    AlertChannelOut,
    AlertChannelUpdate,
    AlertDeliveryOut,
    ReliabilityRuleCreate,
    ReliabilityRuleOut,
    ReliabilityRuleUpdate,
    SlaPolicyOut,
    SlaPolicyUpdate,
)
from app.services.alert_delivery import (
    compute_sla_compliance_report,
    deliver_alert_for_channel,
    enqueue_channel_alert_delivery,
    evaluate_agency_guardrails,
    mask_alert_target,
)

router = APIRouter(tags=["SLA & Alert Routing"])

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _validate_channel_target(channel_type: str, target_url: str) -> str:
    cleaned = (target_url or "").strip()
    if channel_type == "EMAIL_DIGEST":
        if not _EMAIL_RE.match(cleaned):
            raise HTTPException(
                status_code=400,
                detail="Enter a valid recipient email address for EMAIL_DIGEST channels.",
            )
        return cleaned
    try:
        return validate_integration_url(cleaned)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


def _serialize_channel(ch: AlertChannel) -> AlertChannelOut:
    return AlertChannelOut(
        id=ch.id,
        agency_id=ch.agency_id,
        name=ch.name,
        channel_type=ch.channel_type,
        target_preview=ch.target_preview,
        has_target_url=bool(ch.encrypted_target_url),
        min_severity=ch.min_severity,
        is_enabled=ch.is_enabled,
        signing_secret_preview=ch.signing_secret_preview,
        last_tested_at=ch.last_tested_at,
        last_delivery_status=ch.last_delivery_status,
        last_error=ch.last_error,
        created_at=ch.created_at,
        updated_at=ch.updated_at,
    )


async def _get_or_create_sla_policy(db: AsyncSession, agency_id: str) -> SlaPolicy:
    res = await db.execute(select(SlaPolicy).where(SlaPolicy.agency_id == agency_id))
    policy = res.scalar_one_or_none()
    if policy:
        return policy
    policy = SlaPolicy(agency_id=agency_id)
    db.add(policy)
    await db.flush()
    return policy


@router.get("/sla/policy", response_model=SlaPolicyOut)
async def get_sla_policy(
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    policy = await _get_or_create_sla_policy(db, member.agency_id)
    await db.commit()
    await db.refresh(policy)
    return policy


@router.put("/sla/policy", response_model=SlaPolicyOut)
async def update_sla_policy(
    payload: SlaPolicyUpdate,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    policy = await _get_or_create_sla_policy(db, member.agency_id)
    if payload.target_success_rate_percent is not None:
        policy.target_success_rate_percent = round(payload.target_success_rate_percent, 1)
    if payload.target_mttr_minutes is not None:
        policy.target_mttr_minutes = payload.target_mttr_minutes
    if payload.max_open_critical_incidents is not None:
        policy.max_open_critical_incidents = payload.max_open_critical_incidents
    if payload.evaluation_window_hours is not None:
        policy.evaluation_window_hours = payload.evaluation_window_hours
    policy.updated_by_user_id = member.user_id

    db.add(
        AuditLog(
            agency_id=member.agency_id,
            user_id=member.user_id,
            action="SLA_POLICY_UPDATED",
            entity_type="SLA_POLICY",
            entity_id=policy.id,
            details={
                "targetSuccessRatePercent": policy.target_success_rate_percent,
                "targetMttrMinutes": policy.target_mttr_minutes,
                "maxOpenCriticalIncidents": policy.max_open_critical_incidents,
                "evaluationWindowHours": policy.evaluation_window_hours,
            },
        )
    )
    await db.commit()
    await db.refresh(policy)
    return policy


@router.get("/sla/report")
async def get_sla_report(
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    policy = await _get_or_create_sla_policy(db, member.agency_id)
    since = datetime.now(timezone.utc) - timedelta(hours=max(1, policy.evaluation_window_hours))

    wfs = (await db.execute(select(Workflow).where(Workflow.agency_id == member.agency_id))).scalars().all()
    clients = (await db.execute(select(Client).where(Client.agency_id == member.agency_id))).scalars().all()
    client_names = {c.id: c.name for c in clients}
    execs = (
        await db.execute(
            select(Execution)
            .join(Workflow, Execution.workflow_id == Workflow.id)
            .where(Workflow.agency_id == member.agency_id, Execution.started_at >= since)
        )
    ).scalars().all()
    incs = (await db.execute(select(Incident).where(Incident.agency_id == member.agency_id))).scalars().all()
    attempts = (
        await db.execute(
            select(RecoveryAttempt)
            .join(Incident, RecoveryAttempt.incident_id == Incident.id)
            .where(Incident.agency_id == member.agency_id)
        )
    ).scalars().all()
    reqs = (
        await db.execute(select(RecoveryRequest).where(RecoveryRequest.agency_id == member.agency_id))
    ).scalars().all()

    report = compute_sla_compliance_report(
        target_success_rate_percent=policy.target_success_rate_percent,
        target_mttr_minutes=policy.target_mttr_minutes,
        max_open_critical_incidents=policy.max_open_critical_incidents,
        workflows=wfs,
        executions=execs,
        incidents=incs,
        recovery_attempts=attempts,
        recovery_requests=reqs,
        client_names=client_names,
    )
    await db.commit()
    return report


@router.get("/alerts/channels", response_model=List[AlertChannelOut])
async def list_alert_channels(
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(AlertChannel)
            .where(AlertChannel.agency_id == member.agency_id)
            .order_by(AlertChannel.created_at.desc())
        )
    ).scalars().all()
    return [_serialize_channel(ch) for ch in rows]


@router.post("/alerts/channels", response_model=AlertChannelOut, status_code=status.HTTP_201_CREATED)
async def create_alert_channel(
    payload: AlertChannelCreate,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "MEMBER"])),
    db: AsyncSession = Depends(get_db),
):
    cleaned_target = _validate_channel_target(payload.channel_type, payload.target_url)
    signing_secret = secrets.token_hex(16)
    ch = AlertChannel(
        agency_id=member.agency_id,
        name=payload.name.strip(),
        channel_type=payload.channel_type,
        target_preview=mask_alert_target(payload.channel_type, cleaned_target),
        encrypted_target_url=encrypt_secret(cleaned_target),
        encrypted_signing_secret=encrypt_secret(signing_secret),
        signing_secret_preview=f"whsec_••••{signing_secret[-4:]}",
        min_severity=payload.min_severity,
        is_enabled=payload.is_enabled,
    )
    db.add(ch)
    await db.flush()
    db.add(
        AuditLog(
            agency_id=member.agency_id,
            user_id=member.user_id,
            action="ALERT_CHANNEL_CREATED",
            entity_type="ALERT_CHANNEL",
            entity_id=ch.id,
            details={"channelType": ch.channel_type, "name": ch.name},
        )
    )
    await db.commit()
    await db.refresh(ch)
    return _serialize_channel(ch)


@router.put("/alerts/channels/{channel_id}", response_model=AlertChannelOut)
async def update_alert_channel(
    channel_id: str,
    payload: AlertChannelUpdate,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "MEMBER"])),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(AlertChannel).where(AlertChannel.id == channel_id, AlertChannel.agency_id == member.agency_id)
    )
    ch = res.scalar_one_or_none()
    if not ch:
        raise HTTPException(status_code=404, detail="Alert channel not found")

    if payload.name is not None:
        ch.name = payload.name.strip()
    if payload.min_severity is not None:
        ch.min_severity = payload.min_severity
    if payload.is_enabled is not None:
        ch.is_enabled = payload.is_enabled
    if payload.target_url is not None:
        cleaned = _validate_channel_target(ch.channel_type, payload.target_url)
        ch.encrypted_target_url = encrypt_secret(cleaned)
        ch.target_preview = mask_alert_target(ch.channel_type, cleaned)

    db.add(
        AuditLog(
            agency_id=member.agency_id,
            user_id=member.user_id,
            action="ALERT_CHANNEL_UPDATED",
            entity_type="ALERT_CHANNEL",
            entity_id=ch.id,
            details={"name": ch.name, "isEnabled": ch.is_enabled, "minSeverity": ch.min_severity},
        )
    )
    await db.commit()
    await db.refresh(ch)
    return _serialize_channel(ch)


@router.delete("/alerts/channels/{channel_id}")
async def delete_alert_channel(
    channel_id: str,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(AlertChannel).where(AlertChannel.id == channel_id, AlertChannel.agency_id == member.agency_id)
    )
    ch = res.scalar_one_or_none()
    if not ch:
        raise HTTPException(status_code=404, detail="Alert channel not found")

    db.add(
        AuditLog(
            agency_id=member.agency_id,
            user_id=member.user_id,
            action="ALERT_CHANNEL_DELETED",
            entity_type="ALERT_CHANNEL",
            entity_id=ch.id,
            details={"name": ch.name, "channelType": ch.channel_type},
        )
    )
    await db.delete(ch)
    await db.commit()
    return {"success": True, "id": channel_id}


@router.post("/alerts/channels/{channel_id}/test")
async def test_alert_channel(
    channel_id: str,
    request: Request,
    async_dispatch: bool = Query(default=False),
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "MEMBER"])),
    db: AsyncSession = Depends(get_db),
):
    enforce_rate_limit(request, bucket="alerts:test", max_requests=15, window_seconds=60, identifier=member.agency_id)

    res = await db.execute(
        select(AlertChannel).where(AlertChannel.id == channel_id, AlertChannel.agency_id == member.agency_id)
    )
    ch = res.scalar_one_or_none()
    if not ch:
        raise HTTPException(status_code=404, detail="Alert channel not found")

    if async_dispatch:
        delivery = await enqueue_channel_alert_delivery(
            db,
            agency_id=member.agency_id,
            channel=ch,
            event_type="TEST_ALERT",
            severity="MEDIUM",
            title=f"Zevkar Alert Routing Verification ({ch.name})",
            message="Verified HMAC-SHA256 signed alert dispatch from Zevkar AI.",
        )
    else:
        delivery = await deliver_alert_for_channel(
            db,
            agency_id=member.agency_id,
            channel=ch,
            event_type="TEST_ALERT",
            severity="MEDIUM",
            title=f"Zevkar Alert Routing Verification ({ch.name})",
            message="Verified HMAC-SHA256 signed alert dispatch from Zevkar AI.",
        )

    db.add(
        AuditLog(
            agency_id=member.agency_id,
            user_id=member.user_id,
            action="ALERT_CHANNEL_TESTED",
            entity_type="ALERT_CHANNEL",
            entity_id=ch.id,
            details={"status": delivery.status, "httpStatus": delivery.http_status},
        )
    )
    await db.commit()
    await db.refresh(ch)
    await db.refresh(delivery)
    return {"channel": _serialize_channel(ch), "delivery": AlertDeliveryOut.model_validate(delivery)}


@router.get("/alerts/rules", response_model=List[ReliabilityRuleOut])
async def list_reliability_rules(
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(ReliabilityRule)
            .where(ReliabilityRule.agency_id == member.agency_id)
            .order_by(ReliabilityRule.created_at.desc())
        )
    ).scalars().all()
    return rows


@router.post("/alerts/rules", response_model=ReliabilityRuleOut, status_code=status.HTTP_201_CREATED)
async def create_reliability_rule(
    payload: ReliabilityRuleCreate,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "MEMBER"])),
    db: AsyncSession = Depends(get_db),
):
    owned_channels = (
        await db.execute(select(AlertChannel.id).where(AlertChannel.agency_id == member.agency_id))
    ).scalars().all()
    owned_set = set(owned_channels)
    valid_channel_ids = [cid for cid in payload.target_channel_ids if cid in owned_set]

    rule = ReliabilityRule(
        agency_id=member.agency_id,
        name=payload.name.strip(),
        condition_type=payload.condition_type,
        threshold_value=payload.threshold_value,
        severity=payload.severity,
        action_type=payload.action_type,
        target_channel_ids=valid_channel_ids,
        cooldown_minutes=payload.cooldown_minutes,
        is_enabled=payload.is_enabled,
    )
    db.add(rule)
    await db.flush()
    db.add(
        AuditLog(
            agency_id=member.agency_id,
            user_id=member.user_id,
            action="GUARDRAIL_RULE_CREATED",
            entity_type="RELIABILITY_RULE",
            entity_id=rule.id,
            details={"name": rule.name, "conditionType": rule.condition_type, "thresholdValue": rule.threshold_value},
        )
    )
    await db.commit()
    await db.refresh(rule)
    return rule


@router.put("/alerts/rules/{rule_id}", response_model=ReliabilityRuleOut)
async def update_reliability_rule(
    rule_id: str,
    payload: ReliabilityRuleUpdate,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "MEMBER"])),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(ReliabilityRule).where(ReliabilityRule.id == rule_id, ReliabilityRule.agency_id == member.agency_id)
    )
    rule = res.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Reliability rule not found")

    if payload.name is not None:
        rule.name = payload.name.strip()
    if payload.condition_type is not None:
        rule.condition_type = payload.condition_type
    if payload.threshold_value is not None:
        rule.threshold_value = payload.threshold_value
    if payload.severity is not None:
        rule.severity = payload.severity
    if payload.action_type is not None:
        rule.action_type = payload.action_type
    if payload.cooldown_minutes is not None:
        rule.cooldown_minutes = payload.cooldown_minutes
    if payload.is_enabled is not None:
        rule.is_enabled = payload.is_enabled
    if payload.target_channel_ids is not None:
        owned_channels = (
            await db.execute(select(AlertChannel.id).where(AlertChannel.agency_id == member.agency_id))
        ).scalars().all()
        owned_set = set(owned_channels)
        rule.target_channel_ids = [cid for cid in payload.target_channel_ids if cid in owned_set]

    db.add(
        AuditLog(
            agency_id=member.agency_id,
            user_id=member.user_id,
            action="GUARDRAIL_RULE_UPDATED",
            entity_type="RELIABILITY_RULE",
            entity_id=rule.id,
            details={"name": rule.name, "isEnabled": rule.is_enabled},
        )
    )
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/alerts/rules/{rule_id}")
async def delete_reliability_rule(
    rule_id: str,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(ReliabilityRule).where(ReliabilityRule.id == rule_id, ReliabilityRule.agency_id == member.agency_id)
    )
    rule = res.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Reliability rule not found")

    db.add(
        AuditLog(
            agency_id=member.agency_id,
            user_id=member.user_id,
            action="GUARDRAIL_RULE_DELETED",
            entity_type="RELIABILITY_RULE",
            entity_id=rule.id,
            details={"name": rule.name},
        )
    )
    await db.delete(rule)
    await db.commit()
    return {"success": True, "id": rule_id}


@router.post("/alerts/evaluate")
async def evaluate_guardrail_rules(
    request: Request,
    force: bool = False,
    async_dispatch: bool = Query(default=False),
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "MEMBER"])),
    db: AsyncSession = Depends(get_db),
):
    enforce_rate_limit(request, bucket="alerts:evaluate", max_requests=20, window_seconds=60, identifier=member.agency_id)

    result = await evaluate_agency_guardrails(
        db,
        agency_id=member.agency_id,
        actor_user_id=member.user_id,
        force=force,
        use_celery_queue=async_dispatch,
    )
    return {
        "evaluatedAt": result["evaluatedAt"],
        "slaReport": result["slaReport"],
        "rulesEvaluated": result["rulesEvaluated"],
        "triggeredCount": result["triggeredCount"],
        "triggeredRules": result["triggeredRules"],
        "deliveriesCreated": [AlertDeliveryOut.model_validate(d) for d in result["deliveries"]],
    }


@router.get("/alerts/deliveries", response_model=List[AlertDeliveryOut])
async def list_alert_deliveries(
    limit: int = Query(default=50, ge=1, le=100),
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(AlertDelivery)
            .where(AlertDelivery.agency_id == member.agency_id)
            .order_by(AlertDelivery.delivered_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    return rows
