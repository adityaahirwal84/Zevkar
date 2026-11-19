"""Phase 9 Onboarding, Rate Limiting, Tenant Isolation, and RBAC Tests."""

from datetime import datetime, timezone
from types import SimpleNamespace
import pytest
from fastapi import HTTPException

from app.core.rate_limit import enforce_rate_limit, reset_rate_limit_buckets
from app.schemas.pydantic_models import (
    ClientCreate,
    IntegrationOut,
    NotificationPreferencesUpdate,
    OnboardingProgressUpdate,
    UserOut,
)
from app.api.v1 import orgs as orgs_api


def _mock_request(ip: str = "198.51.100.22"):
    return SimpleNamespace(client=SimpleNamespace(host=ip), headers={})


def test_auth_rate_limiter_triggers_429_and_respects_buckets():
    reset_rate_limit_buckets()
    req = _mock_request("198.51.100.77")
    for _ in range(3):
        enforce_rate_limit(req, bucket="auth:login", max_requests=3, window_seconds=60, identifier="u@x.io")

    with pytest.raises(HTTPException) as exc:
        enforce_rate_limit(req, bucket="auth:login", max_requests=3, window_seconds=60, identifier="u@x.io")
    assert exc.value.status_code == 429

    # Distinct bucket should still pass
    enforce_rate_limit(req, bucket="auth:signup", max_requests=3, window_seconds=60, identifier="u@x.io")


def test_onboarding_progress_schema_bounds():
    valid = OnboardingProgressUpdate(current_step=4, data={"platform": "n8n"}, completed=False)
    assert valid.current_step == 4

    with pytest.raises(Exception):
        OnboardingProgressUpdate(current_step=0)
    with pytest.raises(Exception):
        OnboardingProgressUpdate(current_step=9)


def test_client_and_notification_preference_validation():
    client = ClientCreate(
        name="Northstar Ops",
        company_name="Northstar Automation LLC",
        contact_email="ops@northstar.io",
    )
    assert client.name == "Northstar Ops"

    prefs = NotificationPreferencesUpdate(
        preferences=[
            {"channel": "IN_APP", "min_severity": "MEDIUM", "is_enabled": True},
            {"channel": "EMAIL", "min_severity": "CRITICAL", "is_enabled": False},
        ]
    )
    assert len(prefs.preferences) == 2

    with pytest.raises(Exception):
        NotificationPreferencesUpdate(
            preferences=[{"channel": "SMS", "min_severity": "HIGH", "is_enabled": True}]
        )


def test_integration_out_never_exposes_credentials():
    fields = set(IntegrationOut.model_fields.keys())
    assert "api_key" not in fields
    assert "encrypted_credentials" not in fields
    assert "webhook_secret_encrypted" not in fields


def test_user_out_exposes_is_verified():
    u = UserOut(
        id="u1",
        email="ops@zevkar.ai",
        name="Operator",
        is_active=True,
        is_verified=False,
        timezone="UTC",
        created_at=datetime.now(timezone.utc),
    )
    assert u.is_verified is False


@pytest.mark.asyncio
async def test_cross_tenant_org_update_blocked_with_403():
    member = SimpleNamespace(agency_id="agency_a", user_id="usr_1", role="OWNER", status="ACTIVE")
    payload = orgs_api.OrgUpdate(name="Hijack Attempt")

    with pytest.raises(HTTPException) as exc:
        await orgs_api.update_organization("agency_b", payload, member=member, db=None)  # type: ignore[arg-type]
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_cross_tenant_members_listing_blocked_with_403():
    member = SimpleNamespace(agency_id="agency_a", user_id="usr_1", role="VIEWER", status="ACTIVE")

    with pytest.raises(HTTPException) as exc:
        await orgs_api.list_organization_members("agency_b", member=member, db=None)  # type: ignore[arg-type]
    assert exc.value.status_code == 403
