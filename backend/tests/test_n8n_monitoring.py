import asyncio
import base64
import json
import os
import logging
from pathlib import Path
from types import SimpleNamespace

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from pydantic import ValidationError

from app.core.config import settings
from app.core.credential_encryption import (
    CredentialEncryptionError,
    decrypt_credentials,
    encrypt_credentials,
)
from app.diagnosis.gemini_engine import GeminiDiagnosisEngine
from app.integrations.n8n_events import NormalizedN8NEvent
from app.models.entities import Base
from app.schemas.pydantic_models import IntegrationCreate
from app.workers.celery_app import (
    _is_retryable_n8n_status,
    celery_app,
    diagnose_incident_task,
    poll_pending_recoveries_task,
    sync_active_integrations_task,
)


def test_credential_encryption_is_authenticated_and_scoped(monkeypatch):
    key = base64.b64encode(os.urandom(32)).decode("ascii")
    monkeypatch.setattr(settings, "INTEGRATION_ENCRYPTION_KEYS", {"test-key": key})
    monkeypatch.setattr(settings, "INTEGRATION_ACTIVE_ENCRYPTION_KEY_ID", "test-key")
    integration_id = "integration-123"
    secret = "n8n-super-secret-api-key"

    key_id, ciphertext = encrypt_credentials(integration_id, {"api_key": secret})

    assert secret not in ciphertext
    assert decrypt_credentials(integration_id, key_id, ciphertext) == {"api_key": secret}
    with pytest.raises(CredentialEncryptionError):
        decrypt_credentials("another-integration", key_id, ciphertext)


def test_n8n_event_normalization_redacts_sensitive_values():
    event = NormalizedN8NEvent.from_payload(
        {
            "id": "execution-7",
            "workflowId": "workflow-2",
            "status": "error",
            "startedAt": "2026-03-10T12:00:00Z",
            "stoppedAt": "2026-03-10T12:00:01Z",
            "error": {
                "message": "Authorization: Bearer abc123 password=hunter2 user@example.com",
                "stack": "request failed",
            },
        }
    )

    assert event.status == "FAILED"
    assert event.external_execution_id == "execution-7"
    assert "abc123" not in event.error_message
    assert "hunter2" not in event.error_message
    assert "user@example.com" not in event.error_message
    assert event.idempotency_key("integration-1") == event.idempotency_key("integration-1")
    assert event.idempotency_key("integration-1") != event.idempotency_key("integration-2")


def test_n8n_event_rejects_missing_identifiers_and_unknown_status():
    with pytest.raises(ValueError, match="IDs"):
        NormalizedN8NEvent.from_payload({"status": "success"})
    with pytest.raises(ValueError, match="unsupported"):
        NormalizedN8NEvent.from_payload(
            {"id": "execution-1", "workflowId": "workflow-1", "status": "pending"}
        )


@pytest.mark.asyncio
async def test_diagnosis_falls_back_without_gemini_credentials():
    engine = GeminiDiagnosisEngine()
    engine.client = None

    diagnosis = await engine.diagnose_incident(
        workflow_name="nightly export",
        platform="n8n",
        client_name="customer",
        error_message="Request timed out after 10s; token=example-secret",
        execution_id="execution-3",
    )

    assert diagnosis["error_category"] == "TIMEOUT"
    assert diagnosis["is_ai_generated"] is False
    assert "example-secret" not in diagnosis["technical_explanation"]
    assert diagnosis["requires_human_approval"] is False


@pytest.mark.asyncio
async def test_gemini_retries_one_rate_limited_request_and_validates_json():
    engine = GeminiDiagnosisEngine()
    calls = 0
    valid_response = {
        "error_category": "API_ERROR",
        "severity": "HIGH",
        "root_cause": "Upstream rejected the request",
        "simple_explanation": "The upstream request failed.",
        "technical_explanation": "The provider returned an API error.",
        "probable_causes": ["The upstream API is unavailable."],
        "recommended_actions": ["Review provider status."],
        "suggested_recovery": "Require an operator to review the workflow.",
        "requires_human_approval": True,
        "confidence": 0.8,
    }

    async def generate_content(**_):
        nonlocal calls
        calls += 1
        if calls == 1:
            error = RuntimeError("rate limited")
            error.code = 429
            raise error
        return SimpleNamespace(text=json.dumps(valid_response))

    engine.client = SimpleNamespace(
        aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    )
    diagnosis = await engine.diagnose_incident(
        workflow_name="workflow",
        platform="n8n",
        client_name="client",
        error_message="Upstream returned 503",
        execution_id="execution-1",
    )

    assert calls == 2
    assert diagnosis["is_ai_generated"] is True
    assert diagnosis["error_category"] == "API_ERROR"


@pytest.mark.asyncio
async def test_gemini_failure_logs_sanitized_details_after_final_retry(caplog):
    engine = GeminiDiagnosisEngine()
    secret = "test-gemini-secret-value"
    engine.api_key = secret
    calls = 0

    class ProviderServerError(RuntimeError):
        status_code = 503

    async def generate_content(**_):
        nonlocal calls
        calls += 1
        raise ProviderServerError(
            f"upstream unavailable; Authorization: Bearer {secret}; api_key={secret}"
        )

    engine.client = SimpleNamespace(
        aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    )
    with caplog.at_level(logging.ERROR, logger="gemini_engine"):
        result = await engine.diagnose_incident(
            workflow_name="private-workflow-name",
            platform="n8n",
            client_name="private-client-name",
            error_message="Synthetic Gemini server failure",
            execution_id="private-execution-id",
            safe_payload={"private_payload_value": "must-not-be-logged"},
        )

    assert calls == 2
    assert result["is_ai_generated"] is False
    assert "ProviderServerError" in caplog.text
    assert "http_status=503" in caplog.text
    assert "upstream unavailable" in caplog.text
    assert "[REDACTED]" in caplog.text
    for sensitive_value in (
        secret,
        "private-workflow-name",
        "private-client-name",
        "private-execution-id",
        "must-not-be-logged",
    ):
        assert sensitive_value not in caplog.text


@pytest.mark.asyncio
async def test_gemini_timeout_uses_single_async_request_and_falls_back():
    engine = GeminiDiagnosisEngine()
    calls = 0

    async def generate_content(**_):
        nonlocal calls
        calls += 1
        raise TimeoutError("Gemini request timed out")

    engine.client = SimpleNamespace(
        aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    )
    diagnosis = await engine.diagnose_incident(
        workflow_name="workflow",
        platform="n8n",
        client_name="client",
        error_message="Synthetic diagnosis timeout",
        execution_id="execution-timeout",
    )

    assert calls == 1
    assert diagnosis["is_ai_generated"] is False
    assert diagnosis["error_category"] == "TIMEOUT"


@pytest.mark.asyncio
async def test_gemini_retries_serially_and_falls_back_on_invalid_response():
    engine = GeminiDiagnosisEngine()
    calls = 0
    active_requests = 0
    max_active_requests = 0

    async def generate_content(**_):
        nonlocal calls, active_requests, max_active_requests
        calls += 1
        active_requests += 1
        max_active_requests = max(max_active_requests, active_requests)
        try:
            await asyncio.sleep(0)
            if calls == 1:
                error = RuntimeError("temporary server failure")
                error.code = 503
                raise error
            return SimpleNamespace(text='{"unexpected":"schema"}')
        finally:
            active_requests -= 1

    engine.client = SimpleNamespace(
        aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    )
    diagnosis = await engine.diagnose_incident(
        workflow_name="workflow",
        platform="n8n",
        client_name="client",
        error_message="Synthetic schema validation failure",
        execution_id="execution-validation",
    )

    assert calls == 2
    assert max_active_requests == 1
    assert diagnosis["is_ai_generated"] is False
    assert diagnosis["error_category"] == "SCHEMA_MISMATCH"


def test_gemini_client_uses_configured_sdk_timeout(monkeypatch):
    captured = {}

    class FakeClient:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-only-key")
    monkeypatch.setattr(settings, "GEMINI_REQUEST_TIMEOUT_SECONDS", 37.5)
    monkeypatch.setattr("app.diagnosis.gemini_engine.genai.Client", FakeClient)

    GeminiDiagnosisEngine()

    assert captured["http_options"]["timeout"] == 37_500


def test_integration_request_requires_an_api_key():
    with pytest.raises(ValidationError):
        IntegrationCreate(
            name="Production n8n",
            instance_url="https://n8n.example.com",
        )


def test_phase_four_migration_is_additive_and_registered():
    backend_dir = Path(__file__).resolve().parents[1]
    scripts = ScriptDirectory.from_config(Config(str(backend_dir / "alembic.ini")))
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


def test_legacy_unique_constraints_match_database_without_unique_indexes():
    expected = {
        "agencies": ("slug", "agencies_slug_key", "ix_agencies_slug"),
        "invitations": ("token", "invitations_token_key", "ix_invitations_token"),
        "refresh_tokens": (
            "token_hash",
            "refresh_tokens_token_hash_key",
            "ix_refresh_tokens_token_hash",
        ),
        "subscription_plans": (
            "tier_code",
            "subscription_plans_tier_code_key",
            "ix_subscription_plans_tier_code",
        ),
        "users": ("email", "users_email_key", "ix_users_email"),
    }

    for table_name, (column, constraint_name, index_name) in expected.items():
        table = Base.metadata.tables[table_name]
        assert any(
            constraint.name == constraint_name and column in {item.name for item in constraint.columns}
            for constraint in table.constraints
        )
        index = next(index for index in table.indexes if index.name == index_name)
        assert index.unique is False


def test_monitoring_models_and_celery_tasks_are_registered():
    assert {
        "integrations",
        "integration_credentials",
        "workflows",
        "executions",
        "incidents",
        "webhook_events",
        "ai_diagnoses",
    } <= set(Base.metadata.tables)
    assert sync_active_integrations_task.name in celery_app.tasks
    assert diagnose_incident_task.name in celery_app.tasks
    assert poll_pending_recoveries_task.name in celery_app.tasks
    assert (
        celery_app.conf.beat_schedule["sync-active-integrations-every-5-minutes"]["task"]
        == sync_active_integrations_task.name
    )
    assert (
        celery_app.conf.beat_schedule["poll-pending-recoveries-every-minute"]["task"]
        == poll_pending_recoveries_task.name
    )


def test_n8n_sync_retries_only_rate_limits_and_server_errors():
    assert _is_retryable_n8n_status(429)
    assert _is_retryable_n8n_status(503)
    assert not _is_retryable_n8n_status(401)
    assert not _is_retryable_n8n_status(404)
