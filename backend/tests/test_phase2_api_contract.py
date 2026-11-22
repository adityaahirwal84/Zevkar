from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from starlette.responses import Response

from app.api.v1.auth import logout
from app.api.deps import get_current_tenant_member
from app.api.v1.auth import _set_refresh_cookie
from app.main import app
from app.models.entities import AgencyMember, User


def test_health_endpoint_is_exposed():
    response = TestClient(app).get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_frontend_contract_routes_are_registered():
    routes = {
        (route.path, method)
        for route in app.routes
        if isinstance(route, APIRoute)
        for method in route.methods
    }
    expected_routes = {
        ("/api/v1/auth/signup", "POST"),
        ("/api/v1/auth/login", "POST"),
        ("/api/v1/auth/refresh", "POST"),
        ("/api/v1/auth/logout", "POST"),
        ("/api/v1/auth/me", "GET"),
        ("/api/v1/organizations", "GET"),
        ("/api/v1/clients", "GET"),
        ("/api/v1/clients", "POST"),
        ("/api/v1/clients", "GET"),
        ("/api/v1/clients", "POST"),
        ("/api/v1/workflows", "GET"),
        ("/api/v1/integrations", "GET"),
        ("/api/v1/integrations/test", "POST"),
        ("/api/v1/incidents", "GET"),
        ("/api/v1/diagnosis/analyze", "POST"),
        ("/api/v1/recovery/execute", "POST"),
        ("/api/v1/recovery/attempts", "GET"),
        ("/api/v1/approvals", "GET"),
        ("/api/v1/notifications/mark-read", "POST"),
        ("/api/v1/audit-logs", "GET"),
        ("/api/v1/billing/plans", "GET"),
        ("/api/v1/billing/usage", "GET"),
        ("/api/v1/analytics/overview", "GET"),
    }
    assert expected_routes <= routes


def test_refresh_cookie_is_http_only_scoped_and_secure_in_production(monkeypatch):
    from app.api.v1.auth import settings

    response = Response()
    _set_refresh_cookie(response, "opaque-refresh-value")
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "path=/api/v1/auth" in cookie
    assert "opaque-refresh-value" in cookie
    assert "samesite=lax" in cookie
    assert "secure" not in cookie

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    production_response = Response()
    _set_refresh_cookie(production_response, "opaque-refresh-value")
    assert "secure" in production_response.headers["set-cookie"].lower()


@pytest.mark.asyncio
async def test_logout_expires_refresh_cookie_and_preserves_auth_scope():
    response = Response()
    database = AsyncMock()
    user = User(id="user-id", email="test@example.com", name="Test User", hashed_password="hash")

    result = await logout(response=response, refresh_token=None, user=user, db=database)

    cookie = response.headers["set-cookie"].lower()
    assert result["success"] is True
    assert "refresh_token=" in cookie
    assert "max-age=0" in cookie
    assert "path=/api/v1/auth" in cookie
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    database.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_tenant_member_requires_membership_in_requested_organization():
    member = AgencyMember(agency_id="org-a", user_id="user-a", role="OWNER", status="ACTIVE")
    result = MagicMock()
    result.scalar_one_or_none.return_value = member
    database = AsyncMock()
    database.execute.return_value = result

    resolved = await get_current_tenant_member(
        user=User(id="user-a"),
        db=database,
        organization_id="org-a",
    )

    assert resolved is member
    database.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_tenant_member_rejects_an_organization_without_membership():
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    database = AsyncMock()
    database.execute.return_value = result

    with pytest.raises(HTTPException) as exc_info:
        await get_current_tenant_member(
            user=User(id="user-a"),
            db=database,
            organization_id="org-b",
        )

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_tenant_member_requires_selection_for_multiple_organizations():
    result = MagicMock()
    result.scalars.return_value.all.return_value = [
        AgencyMember(agency_id="org-a", user_id="user-a", role="OWNER", status="ACTIVE"),
        AgencyMember(agency_id="org-b", user_id="user-a", role="ADMIN", status="ACTIVE"),
    ]
    database = AsyncMock()
    database.execute.return_value = result

    with pytest.raises(HTTPException) as exc_info:
        await get_current_tenant_member(user=User(id="user-a"), db=database, organization_id=None)

    assert exc_info.value.status_code == 400
