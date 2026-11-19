import asyncio
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
import hashlib
import hmac
import json
import logging
import re
import smtplib
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import decrypt_secret, validate_integration_url
from app.models.entities import (
    AlertChannel,
    AlertDelivery,
    AuditLog,
    Client,
    Execution,
    Incident,
    Notification,
    RecoveryAttempt,
    RecoveryRequest,
    ReliabilityRule,
    SlaPolicy,
    Workflow,
)

logger = logging.getLogger("alert_delivery")

_SEVERITY_RANK = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}
_RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}
_URL_SECRET_RE = re.compile(r"https?://[^\s'\"<>]+", re.IGNORECASE)


def severity_meets_minimum(actual: str, minimum: str) -> bool:
    return _SEVERITY_RANK.get((actual or "").upper(), 0) >= _SEVERITY_RANK.get((minimum or "").upper(), 0)


def sanitize_delivery_error(raw: Any) -> str:
    """Removes target URLs, webhook paths, and token query params from error messages."""
    text = str(raw or "Outbound delivery failed.")
    text = _URL_SECRET_RE.sub("[REDACTED_ENDPOINT]", text)
    if len(text) > 280:
        text = text[:277] + "..."
    return text


def mask_alert_target(channel_type: str, target: str) -> str:
    cleaned = (target or "").strip()
    if not cleaned:
        return ""
    if channel_type == "EMAIL_DIGEST":
        if "@" not in cleaned:
            return "••••"
        local, domain = cleaned.split("@", 1)
        prefix = local[:2] if len(local) >= 2 else local[:1]
        return f"{prefix}••••@{domain}"
    try:
        parsed = urlparse(cleaned)
        suffix = cleaned[-4:] if len(cleaned) > 6 else "••••"
        return f"{parsed.scheme}://{parsed.netloc}/••••{suffix}"
    except Exception:
        return "••••"


def compute_real_mttr_minutes(
    incidents: List[Any],
    recovery_attempts: List[Any],
    recovery_requests: Optional[List[Any]] = None,
) -> float:
    """Computes actual mean time to recovery in minutes from persisted recovery records."""
    durations_minutes: List[float] = []
    inc_by_id = {getattr(inc, "id", None): inc for inc in incidents if getattr(inc, "id", None)}

    for req in (recovery_requests or []):
        created_at = getattr(req, "created_at", None)
        completed_at = getattr(req, "completed_at", None)
        status = getattr(req, "status", "")
        if created_at and completed_at and status in ("VERIFIED_SUCCESS", "SUCCEEDED", "SUCCESS"):
            diff = (completed_at - created_at).total_seconds() / 60.0
            if diff >= 0:
                durations_minutes.append(diff)

    if not durations_minutes:
        for att in recovery_attempts:
            if getattr(att, "status", "") != "SUCCESS":
                continue
            end_ts = getattr(att, "verified_at", None) or getattr(att, "executed_at", None)
            inc = inc_by_id.get(getattr(att, "incident_id", None))
            start_ts = getattr(inc, "first_detected_at", None) if inc else None
            if start_ts and end_ts:
                diff = (end_ts - start_ts).total_seconds() / 60.0
                if diff >= 0:
                    durations_minutes.append(diff)

    if not durations_minutes:
        return 0.0
    return round(sum(durations_minutes) / len(durations_minutes), 1)


def compute_sla_compliance_report(
    *,
    target_success_rate_percent: float,
    target_mttr_minutes: int,
    max_open_critical_incidents: int,
    workflows: List[Any],
    executions: List[Any],
    incidents: List[Any],
    recovery_attempts: Optional[List[Any]] = None,
    recovery_requests: Optional[List[Any]] = None,
    client_names: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    finished = [e for e in executions if e.status in ("SUCCESS", "FAILED", "TIMED_OUT")]
    succeeded = sum(1 for e in finished if e.status == "SUCCESS")
    current_success = round((succeeded / len(finished)) * 100.0, 1) if finished else 100.0
    current_mttr = compute_real_mttr_minutes(
        incidents,
        recovery_attempts or [],
        recovery_requests=recovery_requests,
    )

    active_incidents = [i for i in incidents if i.status not in ("RESOLVED", "IGNORED", "DISMISSED")]
    active_critical = sum(1 for i in active_incidents if i.severity == "CRITICAL")

    breaching_workflows = []
    for wf in workflows:
        consec = int(getattr(wf, "consecutive_failures", 0) or 0)
        health = getattr(wf, "health_status", "HEALTHY")
        if health != "HEALTHY" or consec >= 2:
            breaching_workflows.append(
                {
                    "workflowId": wf.id,
                    "workflowName": wf.name,
                    "clientName": (client_names or {}).get(getattr(wf, "client_id", ""), "Workspace"),
                    "healthStatus": health,
                    "consecutiveFailures": consec,
                    "reason": (
                        f"{consec} consecutive failures detected"
                        if consec >= 2
                        else f"Workflow status marked {health}"
                    ),
                }
            )

    allowed_budget = max(0.1, 100.0 - float(target_success_rate_percent))
    actual_failure_rate = max(0.0, 100.0 - current_success)
    error_budget_remaining = max(0.0, min(100.0, round((1.0 - (actual_failure_rate / allowed_budget)) * 100.0, 1)))

    is_breaching = (
        current_success < target_success_rate_percent
        or active_critical > max_open_critical_incidents
        or (current_mttr > 0 and current_mttr > target_mttr_minutes)
    )
    is_at_risk = (
        not is_breaching
        and (
            len(breaching_workflows) > 0
            or error_budget_remaining < 40.0
            or (max_open_critical_incidents > 0 and active_critical == max_open_critical_incidents)
        )
    )

    return {
        "targetSuccessRatePercent": float(target_success_rate_percent),
        "currentSuccessRatePercent": current_success,
        "targetMttrMinutes": int(target_mttr_minutes),
        "currentMttrMinutes": current_mttr,
        "errorBudgetRemainingPercent": error_budget_remaining,
        "totalWorkflows": len(workflows),
        "healthyWorkflows": max(0, len(workflows) - len(breaching_workflows)),
        "breachingWorkflows": breaching_workflows,
        "activeCriticalIncidents": active_critical,
        "status": "BREACHING" if is_breaching else ("AT_RISK" if is_at_risk else "COMPLIANT"),
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
    }


def format_provider_payload(
    *,
    channel_type: str,
    base_payload: Dict[str, Any],
    severity: str,
    title: str,
    message: str,
    dedup_key: Optional[str] = None,
) -> Dict[str, Any]:
    if channel_type == "SLACK":
        return {
            "text": f"[{severity}] {title}\n{message}",
            "blocks": [
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": f"*[{severity}] {title}*\n{message}"},
                }
            ],
        }
    if channel_type == "DISCORD":
        return {"content": f"**[{severity}] {title}**\n{message}"}
    if channel_type == "PAGERDUTY":
        pd_severity_map = {"CRITICAL": "critical", "HIGH": "error", "MEDIUM": "warning", "LOW": "info"}
        return {
            "event_action": "trigger",
            "dedup_key": dedup_key or base_payload.get("deliveryId"),
            "payload": {
                "summary": f"[{severity}] {title}",
                "source": "zevkar-ai",
                "severity": pd_severity_map.get(severity.upper(), "error"),
                "timestamp": base_payload["timestamp"],
                "custom_details": {
                    "message": message,
                    "eventType": base_payload["eventType"],
                    "agencyId": base_payload["agencyId"],
                    "ruleId": base_payload.get("ruleId"),
                },
            },
        }
    return base_payload


def sign_webhook_payload(signing_secret: str, raw_body: str) -> str:
    digest = hmac.new(
        signing_secret.encode("utf-8"),
        raw_body.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"sha256={digest}"


async def send_signed_http_alert(
    *,
    channel_type: str,
    target_url: str,
    signing_secret: str,
    payload: Dict[str, Any],
    event_type: str,
    severity: str,
    title: str,
    message: str,
    delivery_id: str,
    max_attempts: Optional[int] = None,
    timeout_seconds: Optional[float] = None,
    http_client: Optional[httpx.AsyncClient] = None,
) -> Tuple[str, Optional[int], int, str]:
    """
    Executes SSRF-validated outbound alert HTTP dispatch with redirect protection,
    HMAC-SHA256 signing, sanitized errors, and exponential retry on transient failures.
    Returns (status, http_status, attempt_count, summary).
    """
    try:
        validated_url = validate_integration_url(target_url)
    except ValueError as exc:
        return "FAILED", 400, 1, f"Blocked by SSRF security policy: {sanitize_delivery_error(exc)}"

    outgoing = format_provider_payload(
        channel_type=channel_type,
        base_payload=payload,
        severity=severity,
        title=title,
        message=message,
        dedup_key=delivery_id,
    )
    raw_body = json.dumps(outgoing, separators=(",", ":"), sort_keys=True)
    sig_header = sign_webhook_payload(signing_secret, raw_body)
    timestamp = payload.get("timestamp") or datetime.now(timezone.utc).isoformat()
    headers = {
        "Content-Type": "application/json",
        "X-Zevkar-Signature": sig_header,
        "X-Zevkar-Event": event_type,
        "X-Zevkar-Delivery-Id": delivery_id,
        "X-Zevkar-Timestamp": str(timestamp),
        "User-Agent": "Zevkar-Alert-Dispatcher/1.1",
    }

    attempts_limit = max(1, int(max_attempts or settings.ALERT_DELIVERY_MAX_RETRIES or 3))
    timeout = float(timeout_seconds or settings.ALERT_DELIVERY_TIMEOUT_SECONDS or 5.0)
    last_http_status: Optional[int] = None
    last_summary = "Webhook delivery failed."

    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(timeout=timeout, follow_redirects=False)
    try:
        for attempt in range(1, attempts_limit + 1):
            try:
                resp = await client.post(validated_url, content=raw_body, headers=headers)
                last_http_status = resp.status_code

                if 300 <= resp.status_code < 400:
                    return (
                        "FAILED",
                        resp.status_code,
                        attempt,
                        f"Redirect responses (HTTP {resp.status_code}) blocked by SSRF security policy.",
                    )

                if 200 <= resp.status_code < 300:
                    return (
                        "DELIVERED",
                        resp.status_code,
                        attempt,
                        f"HTTP {resp.status_code} accepted by remote {channel_type} endpoint.",
                    )

                last_summary = f"Remote endpoint returned HTTP {resp.status_code}."
                if resp.status_code not in _RETRYABLE_STATUS_CODES or attempt >= attempts_limit:
                    return "FAILED", resp.status_code, attempt, last_summary

            except (httpx.TimeoutException, httpx.ConnectError, httpx.RemoteProtocolError) as exc:
                last_http_status = 504 if isinstance(exc, httpx.TimeoutException) else 502
                last_summary = f"Transient transport failure: {sanitize_delivery_error(exc)}"
                if attempt >= attempts_limit:
                    return "FAILED", last_http_status, attempt, last_summary
            except Exception as exc:
                return "FAILED", 502, attempt, f"Outbound dispatch error: {sanitize_delivery_error(exc)}"

            await asyncio.sleep(min(2.0, 0.25 * (2 ** (attempt - 1))))
    finally:
        if owns_client:
            await client.aclose()

    return "FAILED", last_http_status, attempts_limit, last_summary


async def deliver_alert_for_channel(
    db: AsyncSession,
    *,
    agency_id: str,
    channel: AlertChannel,
    event_type: str,
    severity: str,
    title: str,
    message: str,
    rule_id: Optional[str] = None,
    rule_name: Optional[str] = None,
    dispatched_via: str = "SYNC",
    existing_delivery: Optional[AlertDelivery] = None,
    http_client: Optional[httpx.AsyncClient] = None,
) -> AlertDelivery:
    target_url = decrypt_secret(channel.encrypted_target_url) or ""
    signing_secret = decrypt_secret(channel.encrypted_signing_secret) or "zevkar_ephemeral"
    now_dt = datetime.now(timezone.utc)

    delivery = existing_delivery or AlertDelivery(
        agency_id=agency_id,
        channel_id=channel.id,
        channel_name=channel.name,
        channel_type=channel.channel_type,
        rule_id=rule_id,
        rule_name=rule_name,
        event_type=event_type,
        severity=severity,
        title=title,
        message=message,
        status="QUEUED",
        attempt_count=0,
        dispatched_via=dispatched_via,
        response_summary="Initializing outbound delivery.",
        delivered_at=now_dt,
    )
    if existing_delivery is None:
        db.add(delivery)
        await db.flush()

    payload = {
        "source": "zevkar-ai",
        "version": "1.1",
        "deliveryId": delivery.id,
        "eventType": event_type,
        "agencyId": agency_id,
        "severity": severity,
        "title": title,
        "message": message,
        "ruleId": rule_id,
        "timestamp": now_dt.isoformat(),
    }
    raw_base = json.dumps(payload, separators=(",", ":"), sort_keys=True)
    sig_preview = sign_webhook_payload(signing_secret, raw_base)[:22] + "..."

    if channel.channel_type == "EMAIL_DIGEST":
        if not settings.SMTP_HOST or not settings.SMTP_FROM_EMAIL:
            delivery_status = "SKIPPED_UNCONFIGURED"
            http_status = None
            attempts = 1
            summary = "SMTP_HOST / SMTP_FROM_EMAIL not configured for external email digest delivery."
        else:
            recipient = target_url
            delivery_status, http_status, attempts, summary = await send_smtp_alert_email(
                recipient=recipient,
                subject=f"[Zevkar {severity}] {title}",
                body_text=f"Event: {event_type}\nSeverity: {severity}\n\n{message}\n\nDelivery ID: {delivery.id}",
            )
    elif not target_url:
        delivery_status = "FAILED"
        http_status = 400
        attempts = 1
        summary = "Alert channel has no encrypted webhook target configured."
    else:
        delivery_status, http_status, attempts, summary = await send_signed_http_alert(
            channel_type=channel.channel_type,
            target_url=target_url,
            signing_secret=signing_secret,
            payload=payload,
            event_type=event_type,
            severity=severity,
            title=title,
            message=message,
            delivery_id=delivery.id,
            http_client=http_client,
        )

    finished_dt = datetime.now(timezone.utc)
    channel.last_tested_at = finished_dt
    channel.last_delivery_status = delivery_status
    channel.last_error = summary if delivery_status in ("FAILED", "SKIPPED_UNCONFIGURED") else None

    delivery.status = delivery_status
    delivery.http_status = http_status
    delivery.attempt_count = attempts
    delivery.dispatched_via = dispatched_via
    delivery.signature_header = sig_preview
    delivery.response_summary = summary
    delivery.delivered_at = finished_dt
    await db.flush()
    return delivery


def _send_smtp_sync(recipient: str, subject: str, body_text: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM_EMAIL
    msg["To"] = recipient
    msg.set_content(body_text)

    with smtplib.SMTP(settings.SMTP_HOST, int(settings.SMTP_PORT or 587), timeout=10) as smtp:
        if settings.SMTP_USE_TLS:
            smtp.starttls()
        if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
            smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        smtp.send_message(msg)


async def send_smtp_alert_email(
    *,
    recipient: str,
    subject: str,
    body_text: str,
) -> Tuple[str, Optional[int], int, str]:
    try:
        await asyncio.to_thread(_send_smtp_sync, recipient, subject, body_text)
        return "DELIVERED", 250, 1, "SMTP relay accepted email digest delivery."
    except Exception as exc:
        return "FAILED", 502, 1, f"SMTP dispatch error: {sanitize_delivery_error(exc)}"


async def dispatch_lifecycle_alerts(
    db: AsyncSession,
    *,
    agency_id: str,
    event_type: str,
    severity: str,
    title: str,
    message: str,
    cooldown_seconds: int = 300,
    use_celery_queue: bool = True,
) -> List[AlertDelivery]:
    """
    Routes incident & recovery lifecycle events to enabled tenant AlertChannels
    respecting severity thresholds, cooldown deduplication, and tenant isolation.
    """
    channels = (
        await db.execute(
            select(AlertChannel).where(
                AlertChannel.agency_id == agency_id,
                AlertChannel.is_enabled == True,  # noqa: E712
            )
        )
    ).scalars().all()
    if not channels:
        return []

    cutoff = datetime.now(timezone.utc) - timedelta(seconds=max(0, cooldown_seconds))
    deliveries: List[AlertDelivery] = []

    for ch in channels:
        if not severity_meets_minimum(severity, ch.min_severity):
            continue

        if cooldown_seconds > 0:
            recent = (
                await db.execute(
                    select(AlertDelivery).where(
                        AlertDelivery.agency_id == agency_id,
                        AlertDelivery.channel_id == ch.id,
                        AlertDelivery.event_type == event_type,
                        AlertDelivery.title == title,
                        AlertDelivery.delivered_at >= cutoff,
                    )
                )
            ).scalars().first()
            if recent:
                continue

        if use_celery_queue:
            delivery = await enqueue_channel_alert_delivery(
                db,
                agency_id=agency_id,
                channel=ch,
                event_type=event_type,
                severity=severity,
                title=title,
                message=message,
            )
        else:
            delivery = await deliver_alert_for_channel(
                db,
                agency_id=agency_id,
                channel=ch,
                event_type=event_type,
                severity=severity,
                title=title,
                message=message,
            )
        deliveries.append(delivery)

    return deliveries


async def enqueue_channel_alert_delivery(
    db: AsyncSession,
    *,
    agency_id: str,
    channel: AlertChannel,
    event_type: str,
    severity: str,
    title: str,
    message: str,
    rule_id: Optional[str] = None,
    rule_name: Optional[str] = None,
) -> AlertDelivery:
    """
    Queues an alert delivery onto Celery when the broker is reachable, or falls back cleanly
    to direct async delivery when running without a live worker/broker.
    """
    now_dt = datetime.now(timezone.utc)
    delivery = AlertDelivery(
        agency_id=agency_id,
        channel_id=channel.id,
        channel_name=channel.name,
        channel_type=channel.channel_type,
        rule_id=rule_id,
        rule_name=rule_name,
        event_type=event_type,
        severity=severity,
        title=title,
        message=message,
        status="QUEUED",
        attempt_count=0,
        dispatched_via="CELERY",
        response_summary="Queued for asynchronous Celery alert delivery.",
        delivered_at=now_dt,
    )
    db.add(delivery)
    await db.flush()

    try:
        from app.workers.celery_app import dispatch_alert_delivery_task

        dispatch_alert_delivery_task.delay(delivery.id, agency_id)
        return delivery
    except Exception as exc:
        logger.info("Celery broker unavailable (%s); dispatching delivery %s inline.", type(exc).__name__, delivery.id)
        return await deliver_alert_for_channel(
            db,
            agency_id=agency_id,
            channel=channel,
            event_type=event_type,
            severity=severity,
            title=title,
            message=message,
            rule_id=rule_id,
            rule_name=rule_name,
            dispatched_via="SYNC",
            existing_delivery=delivery,
        )


async def evaluate_agency_guardrails(
    db: AsyncSession,
    *,
    agency_id: str,
    actor_user_id: Optional[str] = None,
    force: bool = False,
    use_celery_queue: bool = False,
) -> Dict[str, Any]:
    res = await db.execute(select(SlaPolicy).where(SlaPolicy.agency_id == agency_id))
    policy = res.scalar_one_or_none()
    if not policy:
        policy = SlaPolicy(agency_id=agency_id)
        db.add(policy)
        await db.flush()

    now_dt = datetime.now(timezone.utc)
    since = now_dt - timedelta(hours=max(1, policy.evaluation_window_hours))

    wfs = (await db.execute(select(Workflow).where(Workflow.agency_id == agency_id))).scalars().all()
    clients = (await db.execute(select(Client).where(Client.agency_id == agency_id))).scalars().all()
    client_names = {c.id: c.name for c in clients}
    execs = (
        await db.execute(
            select(Execution)
            .join(Workflow, Execution.workflow_id == Workflow.id)
            .where(Workflow.agency_id == agency_id, Execution.started_at >= since)
        )
    ).scalars().all()
    incs = (await db.execute(select(Incident).where(Incident.agency_id == agency_id))).scalars().all()
    attempts = (
        await db.execute(
            select(RecoveryAttempt)
            .join(Incident, RecoveryAttempt.incident_id == Incident.id)
            .where(Incident.agency_id == agency_id)
        )
    ).scalars().all()
    reqs = (await db.execute(select(RecoveryRequest).where(RecoveryRequest.agency_id == agency_id))).scalars().all()
    rules = (
        await db.execute(
            select(ReliabilityRule).where(ReliabilityRule.agency_id == agency_id, ReliabilityRule.is_enabled == True)
        )
    ).scalars().all()
    channels = (
        await db.execute(
            select(AlertChannel).where(AlertChannel.agency_id == agency_id, AlertChannel.is_enabled == True)
        )
    ).scalars().all()

    sla_report = compute_sla_compliance_report(
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

    active_incs = [i for i in incs if i.status not in ("RESOLVED", "IGNORED", "DISMISSED")]
    triggered_summary: List[Dict[str, Any]] = []
    deliveries_created: List[AlertDelivery] = []

    for rule in rules:
        if not force and rule.last_triggered_at:
            elapsed = (now_dt - rule.last_triggered_at).total_seconds()
            if elapsed < max(1, rule.cooldown_minutes) * 60:
                continue

        matched_title = None
        matched_msg = None

        if rule.condition_type == "CONSECUTIVE_FAILURES":
            failing = [w for w in wfs if (w.consecutive_failures or 0) >= max(1, int(rule.threshold_value))]
            if failing:
                matched_title = f"Guardrail '{rule.name}' triggered"
                matched_msg = f"{len(failing)} workflow(s) crossed {int(rule.threshold_value)} consecutive failures."
        elif rule.condition_type == "FAILURE_RATE_SPIKE":
            failure_rate = round(100.0 - sla_report["currentSuccessRatePercent"], 1)
            if execs and failure_rate >= rule.threshold_value:
                matched_title = f"Failure rate spike ({failure_rate}%)"
                matched_msg = f"Failure rate {failure_rate}% exceeds guardrail threshold {rule.threshold_value}%."
        elif rule.condition_type == "CRITICAL_INCIDENT_OPEN":
            old_crit = [
                i
                for i in active_incs
                if i.severity in ("CRITICAL", "HIGH")
                and (now_dt - i.first_detected_at).total_seconds() >= max(0, rule.threshold_value) * 60
            ]
            if old_crit:
                matched_title = f"{len(old_crit)} high-severity incident(s) breached triage window"
                matched_msg = f"Incidents open past {int(rule.threshold_value)} minutes."
        elif rule.condition_type == "SLA_BREACH":
            if sla_report["status"] == "BREACHING" or sla_report["currentSuccessRatePercent"] < rule.threshold_value:
                matched_title = f"SLA breach ({sla_report['currentSuccessRatePercent']}%)"
                matched_msg = f"Workspace reliability below threshold ({sla_report['status']})."

        if not matched_title or not matched_msg:
            continue

        rule.last_triggered_at = now_dt
        rule.trigger_count = (rule.trigger_count or 0) + 1
        triggered_summary.append(
            {
                "ruleId": rule.id,
                "ruleName": rule.name,
                "conditionType": rule.condition_type,
                "severity": rule.severity,
                "title": matched_title,
                "message": matched_msg,
            }
        )

        db.add(
            Notification(
                agency_id=agency_id,
                type="CRITICAL_FAILURE",
                title=matched_title,
                message=matched_msg,
            )
        )

        target_ids = set(rule.target_channel_ids or [])
        target_channels = [c for c in channels if (not target_ids or c.id in target_ids)]
        for ch in target_channels:
            if not severity_meets_minimum(rule.severity, ch.min_severity):
                continue
            if use_celery_queue:
                delivery = await enqueue_channel_alert_delivery(
                    db,
                    agency_id=agency_id,
                    channel=ch,
                    event_type="SLA_BREACH" if rule.condition_type == "SLA_BREACH" else "RULE_TRIGGERED",
                    severity=rule.severity,
                    title=matched_title,
                    message=matched_msg,
                    rule_id=rule.id,
                    rule_name=rule.name,
                )
            else:
                delivery = await deliver_alert_for_channel(
                    db,
                    agency_id=agency_id,
                    channel=ch,
                    event_type="SLA_BREACH" if rule.condition_type == "SLA_BREACH" else "RULE_TRIGGERED",
                    severity=rule.severity,
                    title=matched_title,
                    message=matched_msg,
                    rule_id=rule.id,
                    rule_name=rule.name,
                )
            deliveries_created.append(delivery)

    db.add(
        AuditLog(
            agency_id=agency_id,
            user_id=actor_user_id,
            action="GUARDRAILS_EVALUATED",
            entity_type="SLA_POLICY",
            entity_id=policy.id,
            details={
                "rulesEvaluated": len(rules),
                "triggeredCount": len(triggered_summary),
                "alertsDispatched": len(deliveries_created),
            },
        )
    )
    await db.commit()
    for d in deliveries_created:
        await db.refresh(d)

    return {
        "evaluatedAt": now_dt.isoformat(),
        "slaReport": sla_report,
        "rulesEvaluated": len(rules),
        "triggeredCount": len(triggered_summary),
        "triggeredRules": triggered_summary,
        "deliveries": deliveries_created,
    }
