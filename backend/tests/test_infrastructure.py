import base64
import os
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient
from pydantic import ValidationError
from starlette.responses import Response

from app.api.v1.auth import _set_refresh_cookie
from app.core.config import Settings
from app.core.config import settings
from app.main import app
from app.models.entities import Base
from app.workers.celery_app import celery_app, runtime_probe_task


def test_production_settings_reject_development_secret():
    with pytest.raises(ValidationError, match="Production requires"):
        Settings(
            ENVIRONMENT="production",
            DATABASE_URL="postgresql+asyncpg://user:password@db.example:5432/automation_doctor",
            BACKEND_CORS_ORIGINS=["https://app.example"],
        )


def test_production_settings_accept_explicit_secret_and_origin():
    encryption_key = base64.b64encode(os.urandom(32)).decode("ascii")
    production = Settings(
        ENVIRONMENT="production",
        SECRET_KEY="random-production-secret-value-at-least-32-characters",
        DATABASE_URL="postgresql+asyncpg://user:password@db.example:5432/automation_doctor",
        BACKEND_CORS_ORIGINS=["https://app.example"],
        TRUSTED_PROXY_IPS=["127.0.0.1/32"],
        INTEGRATION_ENCRYPTION_KEYS={"production-key": encryption_key},
        INTEGRATION_ACTIVE_ENCRYPTION_KEY_ID="production-key",
    )
    assert production.ENVIRONMENT == "production"
    assert production.BACKEND_CORS_ORIGINS == ["https://app.example"]
    assert production.ACCESS_TOKEN_EXPIRE_MINUTES == 15


def test_production_settings_reject_legacy_shared_webhook_secret():
    encryption_key = base64.b64encode(os.urandom(32)).decode("ascii")
    with pytest.raises(ValidationError, match="WEBHOOK_SECRET is not supported"):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="random-production-secret-value-at-least-32-characters",
            DATABASE_URL="postgresql+asyncpg://user:password@db.example:5432/automation_doctor",
            BACKEND_CORS_ORIGINS=["https://app.example"],
            TRUSTED_PROXY_IPS=["127.0.0.1/32"],
            INTEGRATION_ENCRYPTION_KEYS={"production-key": encryption_key},
            INTEGRATION_ACTIVE_ENCRYPTION_KEY_ID="production-key",
            WEBHOOK_SECRET="legacy-global-key",
        )


def test_production_settings_reject_long_lived_access_tokens():
    encryption_key = base64.b64encode(os.urandom(32)).decode("ascii")
    with pytest.raises(ValidationError, match="within 15 minutes"):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="random-production-secret-value-at-least-32-characters",
            DATABASE_URL="postgresql+asyncpg://user:password@db.example:5432/automation_doctor",
            BACKEND_CORS_ORIGINS=["https://app.example"],
            TRUSTED_PROXY_IPS=["127.0.0.1/32"],
            INTEGRATION_ENCRYPTION_KEYS={"production-key": encryption_key},
            INTEGRATION_ACTIVE_ENCRYPTION_KEY_ID="production-key",
            ACCESS_TOKEN_EXPIRE_MINUTES=60,
        )


def test_settings_reject_unrestricted_trusted_proxy_network():
    with pytest.raises(ValidationError, match="unrestricted IP range"):
        Settings(TRUSTED_PROXY_IPS=["0.0.0.0/0"])


def test_refresh_cookie_has_production_security_attributes(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    response = Response()

    _set_refresh_cookie(response, "test-only-refresh-token")

    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "secure" in cookie
    assert "samesite=lax" in cookie
    assert "path=/api/v1/auth" in cookie


def test_migration_chain_includes_additive_monitoring_revision():
    backend_dir = Path(__file__).resolve().parents[1]
    config = Config(str(backend_dir / "alembic.ini"))
    scripts = ScriptDirectory.from_config(config)
    revisions = list(scripts.walk_revisions())

    assert scripts.get_heads() == ["006_legacy_webhook_idempotency"]
    assert {script.revision for script in revisions} >= {
        "001_initial_schema",
        "002_complete_schema",
        "003_fix_runtime_compatibility",
        "004_align_orm_schema",
        "005_n8n_monitoring",
        "006_legacy_webhook_idempotency",
    }


def test_celery_runtime_probe_is_registered_with_retry_support():
    assert runtime_probe_task.name in celery_app.tasks
    assert runtime_probe_task.max_retries == 3
    assert celery_app.conf.broker_connection_retry_on_startup is True
    assert celery_app.conf.task_acks_late is True


def test_orm_fields_required_by_forward_migration_are_present():
    assert {"avg_duration_ms", "last_execution_at", "last_successful_at", "last_failed_at"} <= set(
        Base.metadata.tables["workflows"].columns.keys()
    )
    assert {"workflow_id", "initiated_by", "executed_at", "details", "result_execution_id"} <= set(
        Base.metadata.tables["recovery_attempts"].columns.keys()
    )
    assert "webhook_events" in Base.metadata.tables


def test_legacy_webhook_listener_is_retired():
    response = TestClient(app).post(
        "/api/v1/webhooks/listener",
        json={"workflow_id": "workflow-id", "error": "failed"},
    )
    assert response.status_code == 410
