from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import HTTPException

from app.api.v1 import recovery
from app.integrations.n8n import N8NClient
from app.models.entities import (
    AgencyMember,
    Execution,
    Incident,
    Integration,
    IntegrationCredential,
    RecoveryApproval,
    RecoveryAttempt,
    Workflow,
)
from app.workers import celery_app as celery_worker


class FakeResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value

    def one_or_none(self):
        return self.value


class FakeSession:
    def __init__(self, results):
        self.results = list(results)
        self.statements = []
        self.added = []
        self.commit = AsyncMock()
        self.refresh = AsyncMock()

    async def execute(self, statement):
        self.statements.append(statement)
        return self.results.pop(0)

    def add(self, value):
        self.added.append(value)
        if isinstance(value, RecoveryAttempt):
            value.id = "attempt-1"


def _recovery_context():
    incident = Incident(
        id="incident-1",
        agency_id="org-1",
        workflow_id="workflow-local-1",
        execution_id="execution-100",
        execution_record_id="execution-local-1",
        occurrence_count=1,
        status="RECOVERING",
    )
    approval = RecoveryApproval(
        id="approval-1",
        incident_id=incident.id,
        status="APPROVED",
        responded_by="approver-1",
        responded_at=datetime.now(timezone.utc),
        proposed_action="Retry failed n8n execution",
        risk_reason="Manual operator approval",
    )
    workflow = Workflow(
        id=incident.workflow_id,
        agency_id=incident.agency_id,
        integration_id="integration-1",
        external_workflow_id="workflow-100",
        platform="n8n",
        name="Approved workflow",
    )
    integration = Integration(
        id="integration-1",
        agency_id=incident.agency_id,
        platform="n8n",
        status="CONNECTED",
        instance_url="https://n8n.example.com",
        name="n8n",
    )
    execution = Execution(
        id=incident.execution_record_id,
        workflow_id=workflow.id,
        external_execution_id=incident.execution_id,
        status="FAILED",
    )
    credential = IntegrationCredential(
        id="credential-1",
        integration_id=integration.id,
        credential_type="API_KEY",
        encrypted_data="ciphertext",
        key_id="test-key",
    )
    member = AgencyMember(agency_id="org-1", user_id="operator-1", role="OWNER")
    return incident, approval, workflow, integration, execution, credential, member


@pytest.mark.asyncio
async def test_n8n_retry_uses_supported_endpoint_and_idempotency_header(monkeypatch):
    observed = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"id": "execution-101", "workflowId": "workflow-100"}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def post(self, url, **kwargs):
            observed["url"] = url
            observed.update(kwargs)
            return FakeResponse()

    client = N8NClient("https://n8n.example.com", "test-api-key")

    async def fake_client():
        return FakeClient()

    monkeypatch.setattr(client, "_client", fake_client)
    key = "a" * 64
    response = await client.retry_execution("execution-100", key, load_workflow=False)

    assert response["id"] == "execution-101"
    assert observed["url"].endswith("/executions/execution-100/retry")
    assert observed["headers"]["Idempotency-Key"] == key
    assert observed["json"] == {"loadWorkflow": False}


@pytest.mark.asyncio
async def test_recovery_requires_approved_human_decision(monkeypatch):
    incident, _, *_rest = _recovery_context()
    incident.status = "AWAITING_APPROVAL"
    db = FakeSession([FakeResult(incident), FakeResult(None)])
    dispatch = AsyncMock()
    monkeypatch.setattr(recovery, "N8NClient", lambda *_args, **_kwargs: SimpleNamespace(retry_execution=dispatch))

    with pytest.raises(HTTPException) as exc_info:
        await recovery.execute_recovery(
            recovery.RecoveryExecuteRequest(incident_id=incident.id),
            _rest[-1],
            db,
        )

    assert exc_info.value.status_code == 403
    dispatch.assert_not_awaited()
    assert not db.added
    assert db.statements[0]._for_update_arg is not None


@pytest.mark.asyncio
async def test_recovery_does_not_disclose_incident_from_another_organization(monkeypatch):
    db = FakeSession([FakeResult(None)])
    dispatch = AsyncMock()
    monkeypatch.setattr(recovery, "N8NClient", lambda *_args, **_kwargs: SimpleNamespace(retry_execution=dispatch))

    with pytest.raises(HTTPException) as exc_info:
        await recovery.execute_recovery(
            recovery.RecoveryExecuteRequest(incident_id="foreign-incident"),
            AgencyMember(agency_id="org-1", user_id="operator-1", role="OWNER"),
            db,
        )

    assert exc_info.value.status_code == 404
    dispatch.assert_not_awaited()


@pytest.mark.asyncio
async def test_recovery_dispatches_once_and_records_pending_provider_execution(monkeypatch):
    incident, approval, workflow, integration, execution, credential, member = _recovery_context()
    db = FakeSession([
        FakeResult(incident),
        FakeResult(approval),
        FakeResult(None),
        FakeResult((workflow, integration)),
        FakeResult(execution),
        FakeResult(credential),
    ])
    dispatched = []

    class FakeN8NClient:
        def __init__(self, instance_url, api_key):
            assert instance_url == integration.instance_url
            assert api_key == "decrypted-test-key"

        async def retry_execution(self, execution_id, idempotency_key, load_workflow):
            dispatched.append((execution_id, idempotency_key, load_workflow))
            return {
                "id": "execution-101",
                "workflowId": workflow.external_workflow_id,
                "retryOf": execution.external_execution_id,
                "status": "new",
                "mode": "retry",
            }

    monkeypatch.setattr(recovery, "N8NClient", FakeN8NClient)
    monkeypatch.setattr(
        recovery,
        "decrypt_credentials",
        lambda *_args: {"api_key": "decrypted-test-key"},
    )

    response = await recovery.execute_recovery(
        recovery.RecoveryExecuteRequest(incident_id=incident.id),
        member,
        db,
    )

    attempt = db.added[0]
    assert response["status"] == "PENDING"
    assert response["success"] is False
    assert response["result_execution_id"] == "execution-101"
    assert len(dispatched) == 1
    assert dispatched[0][0] == execution.external_execution_id
    assert dispatched[0][2] is False
    assert attempt.status == "PENDING"
    assert attempt.execution_response["retryOf"] == execution.external_execution_id
    assert db.commit.await_count == 2


@pytest.mark.asyncio
async def test_duplicate_recovery_request_returns_existing_attempt_without_dispatch(monkeypatch):
    incident, approval, *_rest = _recovery_context()
    attempt = RecoveryAttempt(
        id="attempt-existing",
        incident_id=incident.id,
        workflow_id=incident.workflow_id,
        action="MANUAL_RETRY",
        initiated_by="operator-1",
        status="PENDING",
        idempotency_key=recovery.generate_idempotency_key(
            incident.id,
            "MANUAL_RETRY",
            incident.occurrence_count,
            approval.id,
        ),
    )
    db = FakeSession([FakeResult(incident), FakeResult(approval), FakeResult(attempt)])
    dispatch = AsyncMock()
    monkeypatch.setattr(recovery, "N8NClient", lambda *_args, **_kwargs: SimpleNamespace(retry_execution=dispatch))

    response = await recovery.execute_recovery(
        recovery.RecoveryExecuteRequest(incident_id=incident.id),
        _rest[-1],
        db,
    )

    assert response["attempt_id"] == attempt.id
    assert response["duplicate"] is True
    assert len(db.statements) == 3
    dispatch.assert_not_awaited()


@pytest.mark.asyncio
async def test_provider_rejection_is_persisted_as_failed_attempt(monkeypatch):
    incident, approval, workflow, integration, execution, credential, member = _recovery_context()
    db = FakeSession([
        FakeResult(incident),
        FakeResult(approval),
        FakeResult(None),
        FakeResult((workflow, integration)),
        FakeResult(execution),
        FakeResult(credential),
    ])

    class FakeN8NClient:
        def __init__(self, *_args, **_kwargs):
            pass

        async def retry_execution(self, *_args, **_kwargs):
            request = httpx.Request("POST", "https://n8n.example.com/api/v1/executions/100/retry")
            response = httpx.Response(403, request=request)
            raise httpx.HTTPStatusError("provider rejected request", request=request, response=response)

    monkeypatch.setattr(recovery, "N8NClient", FakeN8NClient)
    monkeypatch.setattr(
        recovery,
        "decrypt_credentials",
        lambda *_args: {"api_key": "decrypted-test-key"},
    )

    with pytest.raises(HTTPException) as exc_info:
        await recovery.execute_recovery(
            recovery.RecoveryExecuteRequest(incident_id=incident.id),
            member,
            db,
        )

    assert exc_info.value.status_code == 502
    assert db.added[0].status == "FAILED"
    assert db.added[0].execution_response == {"http_status": 403}
    assert incident.status == "INVESTIGATING"
    assert db.commit.await_count == 2


@pytest.mark.asyncio
async def test_network_timeout_is_not_reported_as_success_or_resent(monkeypatch):
    incident, approval, workflow, integration, execution, credential, member = _recovery_context()
    db = FakeSession([
        FakeResult(incident),
        FakeResult(approval),
        FakeResult(None),
        FakeResult((workflow, integration)),
        FakeResult(execution),
        FakeResult(credential),
    ])

    class FakeN8NClient:
        def __init__(self, *_args, **_kwargs):
            pass

        async def retry_execution(self, *_args, **_kwargs):
            raise httpx.ReadTimeout("provider response timed out")

    monkeypatch.setattr(recovery, "N8NClient", FakeN8NClient)
    monkeypatch.setattr(
        recovery,
        "decrypt_credentials",
        lambda *_args: {"api_key": "decrypted-test-key"},
    )

    response = await recovery.execute_recovery(
        recovery.RecoveryExecuteRequest(incident_id=incident.id),
        member,
        db,
    )

    assert response["status"] == "UNKNOWN"
    assert response["success"] is False
    assert db.added[0].result_execution_id is None
    assert "not automatically resubmitted" in db.added[0].details


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("provider_status", "expected_attempt_status", "expected_incident_status"),
    [
        ("success", "SUCCESS", "RESOLVED"),
        ("error", "FAILED", "INVESTIGATING"),
    ],
)
async def test_recovery_final_status_comes_from_polled_provider_execution(
    monkeypatch,
    provider_status,
    expected_attempt_status,
    expected_incident_status,
):
    incident, _, workflow, integration, *_rest = _recovery_context()
    incident.workflow = workflow
    credential = IntegrationCredential(
        id="credential-1",
        integration_id=integration.id,
        credential_type="API_KEY",
        encrypted_data="ciphertext",
        key_id="test-key",
    )
    integration.credentials = [credential]
    attempt = RecoveryAttempt(
        id="attempt-1",
        incident_id=incident.id,
        workflow_id=workflow.id,
        action="MANUAL_RETRY",
        initiated_by="operator-1",
        status="PENDING",
        idempotency_key="a" * 64,
        result_execution_id="execution-101",
        incident=incident,
    )

    class SessionContext:
        def __init__(self):
            self.session = FakeSession([FakeResult(attempt), FakeResult(integration)])

        async def __aenter__(self):
            return self.session

        async def __aexit__(self, *_):
            return None

    class FakeN8NClient:
        def __init__(self, *_args, **_kwargs):
            pass

        async def get_execution(self, execution_id):
            assert execution_id == "execution-101"
            return {
                "id": "execution-101",
                "workflowId": workflow.external_workflow_id,
                "retryOf": incident.execution_id,
                "status": provider_status,
                "startedAt": "2026-11-10T12:00:00Z",
                "stoppedAt": "2026-11-10T12:00:05Z",
            }

    session_context = SessionContext()
    process_event = AsyncMock(return_value=(SimpleNamespace(id="execution-local-101"), None))
    monkeypatch.setattr(celery_worker, "AsyncSessionLocal", lambda: session_context)
    monkeypatch.setattr(celery_worker, "N8NClient", FakeN8NClient)
    monkeypatch.setattr(
        celery_worker,
        "decrypt_credentials",
        lambda *_args: {"api_key": "decrypted-test-key"},
    )
    monkeypatch.setattr(celery_worker, "process_n8n_event", process_event)

    outcome = await celery_worker._poll_recovery_attempt(attempt.id)

    assert outcome == expected_attempt_status
    assert attempt.status == expected_attempt_status
    assert incident.status == expected_incident_status
    assert attempt.executed_at is not None
    assert attempt.execution_response["status"] == provider_status
    process_event.assert_awaited_once()
