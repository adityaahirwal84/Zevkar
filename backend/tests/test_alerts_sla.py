"""Phase 10 & 11 SLA Compliance, Alert Delivery, Security, RBAC, Cross-Tenant & Invitation Tests."""

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock
import httpx
import pytest
from fastapi import HTTPException

from app.api.v1.alerts_sla import (
    _validate_channel_target,
    delete_alert_channel,
    delete_reliability_rule,
    update_alert_channel,
    update_reliability_rule,
)
from app.api.v1 import orgs as orgs_api
from app.core.security import decrypt_secret, encrypt_secret
from app.schemas.pydantic_models import (
    AlertChannelCreate,
    InviteAcceptRequest,
    ReliabilityRuleCreate,
    ReliabilityRuleUpdate,
    SlaPolicyUpdate,
)
from app.services.alert_delivery import (
    compute_real_mttr_minutes,
    compute_sla_compliance_report,
    format_provider_payload,
    mask_alert_target,
    sanitize_delivery_error,
    send_signed_http_alert,
    severity_meets_minimum,
)


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


def test_alert_channel_masking_encryption_and_ssrf_validation():
    raw_url = "https://hooks.slack.com/services/T000/B000/SECRET9988"
    encrypted = encrypt_secret(raw_url)
    assert encrypted and encrypted.startswith("enc:v1:")
    assert raw_url not in encrypted
    assert decrypt_secret(encrypted) == raw_url

    masked_slack = mask_alert_target("SLACK", raw_url)
    assert masked_slack == "https://hooks.slack.com/••••9988"
    assert "SECRET" not in masked_slack

    masked_email = mask_alert_target("EMAIL_DIGEST", "oncall@zevkar.ai")
    assert masked_email == "on••••@zevkar.ai"

    # Blocks private loopback & cloud metadata SSRF endpoints
    with pytest.raises(HTTPException) as exc:
        _validate_channel_target("CUSTOM_WEBHOOK", "http://127.0.0.1:8080/internal")
    assert exc.value.status_code == 400

    with pytest.raises(HTTPException) as exc_meta:
        _validate_channel_target("CUSTOM_WEBHOOK", "http://169.254.169.254/latest/meta-data")
    assert exc_meta.value.status_code == 400

    # Validates email digest addresses
    assert _validate_channel_target("EMAIL_DIGEST", "ops@northstar.io") == "ops@northstar.io"
    with pytest.raises(HTTPException):
        _validate_channel_target("EMAIL_DIGEST", "not-an-email")

    sanitized = sanitize_delivery_error("Connection failed to https://hooks.slack.com/services/SECRET_TOKEN")
    assert "SECRET_TOKEN" not in sanitized
    assert "[REDACTED_ENDPOINT]" in sanitized


def test_sla_compliance_and_real_mttr_calculation():
    t0 = datetime(2026, 11, 18, 10, 0, tzinfo=timezone.utc)
    t1 = t0 + timedelta(minutes=8)
    workflows = [
        SimpleNamespace(id="wf_1", name="Invoice Sync", client_id="c1", health_status="FAILING", consecutive_failures=3),
        SimpleNamespace(id="wf_2", name="Lead Sync", client_id="c1", health_status="HEALTHY", consecutive_failures=0),
    ]
    executions = [
        SimpleNamespace(status="FAILED"),
        SimpleNamespace(status="SUCCESS"),
    ]
    incidents = [
        SimpleNamespace(id="inc_1", status="OPEN", severity="CRITICAL", first_detected_at=t0),
    ]
    attempts = [
        SimpleNamespace(incident_id="inc_1", status="SUCCESS", verified_at=t1, executed_at=t1),
    ]
    assert compute_real_mttr_minutes(incidents, attempts) == 8.0
    assert compute_real_mttr_minutes(incidents, []) == 0.0

    report = compute_sla_compliance_report(
        target_success_rate_percent=99.0,
        target_mttr_minutes=15,
        max_open_critical_incidents=1,
        workflows=workflows,
        executions=executions,
        incidents=incidents,
        recovery_attempts=attempts,
        client_names={"c1": "Northstar"},
    )
    assert report["currentSuccessRatePercent"] == 50.0
    assert report["currentMttrMinutes"] == 8.0
    assert report["status"] == "BREACHING"
    assert len(report["breachingWorkflows"]) == 1
    assert report["breachingWorkflows"][0]["clientName"] == "Northstar"
    assert report["errorBudgetRemainingPercent"] == 0.0


def test_phase11_schemas_and_provider_payload_formats():
    policy = SlaPolicyUpdate(target_success_rate_percent=99.5, target_mttr_minutes=10)
    assert policy.target_success_rate_percent == 99.5

    with pytest.raises(Exception):
        SlaPolicyUpdate(target_success_rate_percent=120.0)

    channel = AlertChannelCreate(
        name="PagerDuty Escalation",
        channel_type="PAGERDUTY",
        target_url="https://events.pagerduty.com/v2/enqueue",
        min_severity="CRITICAL",
    )
    assert channel.channel_type == "PAGERDUTY"

    rule = ReliabilityRuleCreate(
        name="Consecutive Failures",
        condition_type="CONSECUTIVE_FAILURES",
        threshold_value=3,
        severity="HIGH",
        action_type="NOTIFY_CHANNELS",
    )
    assert rule.threshold_value == 3

    rule_update = ReliabilityRuleUpdate(condition_type="SLA_BREACH", threshold_value=98.5, is_enabled=False)
    assert rule_update.condition_type == "SLA_BREACH"
    assert rule_update.is_enabled is False

    base_payload = {
        "source": "zevkar-ai",
        "version": "1.1",
        "deliveryId": "deliv_1",
        "eventType": "SLA_BREACH",
        "agencyId": "ag_1",
        "severity": "CRITICAL",
        "title": "SLA Breach",
        "message": "Workflow failing",
        "ruleId": "rule_1",
        "timestamp": "2026-11-18T12:00:00Z",
    }
    pd_payload = format_provider_payload(
        channel_type="PAGERDUTY",
        base_payload=base_payload,
        severity="CRITICAL",
        title="SLA Breach",
        message="Workflow failing",
    )
    assert pd_payload["event_action"] == "trigger"
    assert pd_payload["payload"]["severity"] == "critical"

    assert severity_meets_minimum("CRITICAL", "HIGH") is True
    assert severity_meets_minimum("LOW", "HIGH") is False


@pytest.mark.asyncio
async def test_signed_http_alert_retries_hmac_and_blocks_redirects():
    attempts_seen = {"count": 0}
    captured_headers = {}
    captured_body = ""

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal captured_body
        attempts_seen["count"] += 1
        captured_headers.update(dict(request.headers))
        captured_body = request.content.decode("utf-8")
        if attempts_seen["count"] == 1:
            return httpx.Response(503, text="Temporary Unavailable")
        return httpx.Response(200, json={"ok": True})

    secret = "whsec_test_secret_123456"
    payload = {
        "source": "zevkar-ai",
        "version": "1.1",
        "deliveryId": "deliv_retry_1",
        "eventType": "TEST_ALERT",
        "agencyId": "ag_1",
        "severity": "HIGH",
        "title": "Test Alert",
        "message": "Verification",
        "timestamp": "2026-11-18T12:00:00Z",
    }
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        status_val, http_code, attempts, summary = await send_signed_http_alert(
            channel_type="CUSTOM_WEBHOOK",
            target_url="https://93.184.216.34/hooks/zevkar",
            signing_secret=secret,
            payload=payload,
            event_type="TEST_ALERT",
            severity="HIGH",
            title="Test Alert",
            message="Verification",
            delivery_id="deliv_retry_1",
            max_attempts=3,
            http_client=client,
        )

    assert status_val == "DELIVERED"
    assert http_code == 200
    assert attempts == 2
    assert "HTTP 200" in summary

    expected_sig = "sha256=" + hmac.new(secret.encode(), captured_body.encode(), hashlib.sha256).hexdigest()
    assert captured_headers.get("x-zevkar-signature") == expected_sig
    assert captured_headers.get("x-zevkar-delivery-id") == "deliv_retry_1"

    # SSRF redirect protection blocks 302 responses
    def redirect_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"Location": "http://169.254.169.254/latest/meta-data"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(redirect_handler)) as redirect_client:
        r_status, r_code, _, r_summary = await send_signed_http_alert(
            channel_type="CUSTOM_WEBHOOK",
            target_url="https://93.184.216.34/redirect",
            signing_secret=secret,
            payload=payload,
            event_type="TEST_ALERT",
            severity="HIGH",
            title="Test Alert",
            message="Verification",
            delivery_id="deliv_redirect_1",
            max_attempts=2,
            http_client=redirect_client,
        )
    assert r_status == "FAILED"
    assert r_code == 302
    assert "SSRF" in r_summary


@pytest.mark.asyncio
async def test_cross_tenant_isolation_and_invitation_guards():
    tenant_a_member = SimpleNamespace(agency_id="agency_a", user_id="usr_a", role="OWNER", status="ACTIVE")
    mock_db = AsyncMock()
    mock_db.execute.return_value = _ScalarResult(None)

    with pytest.raises(HTTPException) as exc_ch:
        await update_alert_channel("ch_of_agency_b", SlaPolicyUpdate(), member=tenant_a_member, db=mock_db)  # type: ignore[arg-type]
    assert exc_ch.value.status_code == 404

    with pytest.raises(HTTPException) as exc_del_ch:
        await delete_alert_channel("ch_of_agency_b", member=tenant_a_member, db=mock_db)
    assert exc_del_ch.value.status_code == 404

    with pytest.raises(HTTPException) as exc_rule:
        await update_reliability_rule("rule_of_agency_b", ReliabilityRuleUpdate(is_enabled=False), member=tenant_a_member, db=mock_db)
    assert exc_rule.value.status_code == 404

    with pytest.raises(HTTPException) as exc_del_rule:
        await delete_reliability_rule("rule_of_agency_b", member=tenant_a_member, db=mock_db)
    assert exc_del_rule.value.status_code == 404

    # ADMIN cannot invite OWNER (privilege escalation prevention)
    admin_member = SimpleNamespace(agency_id="agency_a", user_id="usr_admin", role="ADMIN", status="ACTIVE")
    with pytest.raises(HTTPException) as exc_priv:
        await orgs_api._invite_member_for_agency(
            mock_db,
            "agency_a",
            admin_member,  # type: ignore[arg-type]
            orgs_api.MemberInvite(email="escalate@zevkar.ai", role="OWNER"),
        )
    assert exc_priv.value.status_code == 403

    # Duplicate accepted invite returns 409; revoked returns 410; expired returns 410
    dummy_req = SimpleNamespace(client=SimpleNamespace(host="198.51.100.10"), headers={})
    db_accepted = AsyncMock()
    db_accepted.execute.return_value = _ScalarResult(
        SimpleNamespace(
            id="inv_1",
            agency_id="agency_a",
            email="u@zevkar.ai",
            role="MEMBER",
            status="ACCEPTED",
            expires_at=datetime.now(timezone.utc) + timedelta(days=2),
        )
    )
    with pytest.raises(HTTPException) as exc_dup:
        await orgs_api.accept_invitation("tok_acc", dummy_req, payload=InviteAcceptRequest(name="User", password="Password123"), user=None, db=db_accepted)
    assert exc_dup.value.status_code == 409

    db_revoked = AsyncMock()
    db_revoked.execute.return_value = _ScalarResult(
        SimpleNamespace(
            id="inv_2",
            agency_id="agency_a",
            email="u@zevkar.ai",
            role="MEMBER",
            status="REVOKED",
            expires_at=datetime.now(timezone.utc) + timedelta(days=2),
        )
    )
    with pytest.raises(HTTPException) as exc_rev:
        await orgs_api.accept_invitation("tok_rev", dummy_req, payload=None, user=None, db=db_revoked)
    assert exc_rev.value.status_code == 410

    db_expired = AsyncMock()
    db_expired.execute.return_value = _ScalarResult(
        SimpleNamespace(
            id="inv_3",
            agency_id="agency_a",
            email="u@zevkar.ai",
            role="MEMBER",
            status="PENDING",
            expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
    )
    with pytest.raises(HTTPException) as exc_exp:
        await orgs_api.accept_invitation("tok_exp", dummy_req, payload=None, user=None, db=db_expired)
    assert exc_exp.value.status_code == 410
