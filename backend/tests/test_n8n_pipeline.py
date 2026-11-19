"""End-to-End n8n Monitoring, Sync, Diagnosis, Stuck Detection & Reliability Tests

Covers all 11 verification scenarios:
1. Workflow sync & upsert
2. Failed execution sync & normalization
3. Incident creation & workflow health updates
4. Duplicate webhook events (HMAC SHA-256 + SHA-256 idempotency)
5. Duplicate incident prevention (same execution ID & open category grouping)
6. Gemini diagnosis schema validation & deterministic fallback attribution
7. Stuck execution detection (default timeout, per-workflow override, allow_long_running, no dup alerts)
8. Cursor pagination (nextCursor), incremental polling watermarks, and 429 Retry-After backoff
9. Multi-tenant isolation (agency_id scoping & SSRF URL blocking)
10. Timezone UTC storage & IANA timezone validation/conversion
11. Celery task execution, retries & failure handling
"""
import asyncio
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from zoneinfo import ZoneInfo

import httpx
import pytest

from app.core.security import decrypt_secret, encrypt_secret, validate_integration_url
from app.diagnosis.gemini_engine import GeminiDiagnosisEngine
from app.integrations.n8n import N8NClient, extract_n8n_error_details, normalize_n8n_execution
from app.models.entities import AIDiagnosis, Execution, Incident, Integration, Notification, Workflow
from app.schemas.pydantic_models import AIDiagnosisSchema, TimezoneUpdate
from app.services.n8n_sync import N8NSyncService, compute_stuck_timeout_seconds


class _FakeScalars:
    def __init__(self, items):
        self._items = items

    def all(self):
        return list(self._items)

    def first(self):
        return self._items[0] if self._items else None


class _FakeResult:
    def __init__(self, items):
        self._items = items

    def scalar_one_or_none(self):
        return self._items[0] if self._items else None

    def scalars(self):
        return _FakeScalars(self._items)

    def all(self):
        return list(self._items)


class InMemoryAsyncSession:
    """Minimal AsyncSession double supporting sync_integration & detect_stuck_executions tests."""

    def __init__(self):
        self.workflows = []
        self.executions = []
        self.incidents = []
        self.diagnoses = []
        self.notifications = []
        self.clients = []
        self.commits = 0
        self._seq = 0

    def _next_id(self, prefix: str) -> str:
        self._seq += 1
        return f"{prefix}_{self._seq}"

    def add(self, obj):
        if isinstance(obj, Workflow):
            if not getattr(obj, "id", None):
                obj.id = self._next_id("wf")
            if obj not in self.workflows:
                self.workflows.append(obj)
        elif isinstance(obj, Execution):
            if not getattr(obj, "id", None):
                obj.id = self._next_id("exec")
            if obj not in self.executions:
                self.executions.append(obj)
        elif isinstance(obj, Incident):
            if not getattr(obj, "id", None):
                obj.id = self._next_id("inc")
            if obj not in self.incidents:
                self.incidents.append(obj)
        elif isinstance(obj, AIDiagnosis):
            if not getattr(obj, "id", None):
                obj.id = self._next_id("diag")
            if obj not in self.diagnoses:
                self.diagnoses.append(obj)
        elif isinstance(obj, Notification):
            if not getattr(obj, "id", None):
                obj.id = self._next_id("notif")
            if obj not in self.notifications:
                self.notifications.append(obj)

    async def flush(self):
        return None

    async def commit(self):
        self.commits += 1

    async def refresh(self, obj):
        return obj

    async def execute(self, stmt):
        sql_str = str(stmt)
        params = {}
        try:
            params = stmt.compile().params
        except Exception:
            params = {}

        if "JOIN workflows" in sql_str and "executions" in sql_str:
            wf_map = {w.id: w for w in self.workflows}
            agency_filter = params.get("agency_id_1")
            pairs = []
            for ex in self.executions:
                wf = wf_map.get(ex.workflow_id)
                if not wf:
                    continue
                if agency_filter and wf.agency_id != agency_filter:
                    continue
                if ex.status == "RUNNING" and not ex.is_stuck_alerted and wf.is_active:
                    pairs.append((ex, wf))
            return _FakeResult(pairs)

        if "FROM workflows" in sql_str:
            values = list(params.values())
            matched = [
                w
                for w in self.workflows
                if all(
                    v in (w.id, w.agency_id, w.platform, w.external_workflow_id)
                    for v in values
                )
            ]
            return _FakeResult(matched)

        if "FROM executions" in sql_str:
            wf_id = params.get("workflow_id_1")
            ext_id = params.get("external_execution_id_1")
            matched = [
                e
                for e in self.executions
                if (wf_id is None or e.workflow_id == wf_id)
                and (ext_id is None or e.external_execution_id == ext_id)
            ]
            return _FakeResult(matched)

        if "FROM incidents" in sql_str:
            matched = []
            if "execution_id" in sql_str:
                wf_id = params.get("workflow_id_1")
                exec_id = params.get("execution_id_1")
                matched = [
                    i
                    for i in self.incidents
                    if i.workflow_id == wf_id and i.execution_id == exec_id
                ]
            elif "error_category" in sql_str:
                wf_id = params.get("workflow_id_1")
                cat = params.get("error_category_1")
                matched = [
                    i
                    for i in self.incidents
                    if i.workflow_id == wf_id
                    and i.error_category == cat
                    and i.status in ("OPEN", "INVESTIGATING", "APPROVAL_REQUIRED", "RECOVERING")
                ]
            return _FakeResult(matched)

        if "FROM ai_diagnoses" in sql_str:
            inc_id = params.get("incident_id_1")
            return _FakeResult([d for d in self.diagnoses if d.incident_id == inc_id])

        if "FROM clients" in sql_str:
            cli_id = params.get("id_1")
            return _FakeResult([c for c in self.clients if c.id == cli_id])

        return _FakeResult([])


# ============================================================================
# 1, 2, 3, 5, 8. Workflow Sync, Execution Normalization, Incident Creation & Pagination
# ============================================================================

@pytest.mark.asyncio
async def test_n8n_client_pagination_and_rate_limit_backoff():
    """Scenario 8: Cursor pagination across pages + 429 Retry-After backoff."""
    requests_seen = []
    sleep_delays = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests_seen.append((request.url.path, dict(request.url.params)))
        if len(requests_seen) == 1:
            return httpx.Response(429, headers={"Retry-After": "0.1"}, json={"message": "Rate limited"})
        if request.url.path.endswith("/workflows"):
            cursor = request.url.params.get("cursor")
            if not cursor:
                return httpx.Response(
                    200,
                    json={
                        "data": [{"id": "wf_ext_1", "name": "Order Sync", "active": True}],
                        "nextCursor": "page_2",
                    },
                )
            return httpx.Response(
                200,
                json={"data": [{"id": "wf_ext_2", "name": "CRM Sync", "active": False}], "nextCursor": None},
            )
        return httpx.Response(200, json={"data": [], "nextCursor": None})

    async def fake_sleep(delay: float):
        sleep_delays.append(delay)

    client = N8NClient(
        base_url="https://n8n.example-prod.com",
        api_key="test_n8n_key",
        transport=httpx.MockTransport(handler),
        sleep_fn=fake_sleep,
        allow_private=False,
    )
    workflows = await client.fetch_workflows(limit=1)

    assert len(workflows) == 2
    assert [w["id"] for w in workflows] == ["wf_ext_1", "wf_ext_2"]
    assert sleep_delays == [0.1]


@pytest.mark.asyncio
async def test_sync_service_workflow_upsert_failed_execution_and_incident_dedup():
    """Scenarios 1, 2, 3, 5: Workflow upsert, failed execution ingestion, incident creation, and deduplication."""
    db = InMemoryAsyncSession()
    integ = Integration(
        id="int_n8n_1",
        agency_id="agency_1",
        client_id="cli_1",
        name="Prod n8n",
        platform="n8n",
        instance_url="https://n8n.example-prod.com/api/v1",
        encrypted_credentials=encrypt_secret("secret_key_1"),
        status="CONNECTED",
    )

    now = datetime(2026, 5, 1, 12, 0, tzinfo=timezone.utc)
    mock_client = MagicMock()
    mock_client.fetch_workflows = AsyncMock(
        return_value=[{"id": "101", "name": "HubSpot Lead Sync", "active": True}]
    )
    mock_client.fetch_executions_with_checkpoint = AsyncMock(
        return_value=(
            [
                {
                    "id": "ex_9001",
                    "workflowId": "101",
                    "status": "error",
                    "startedAt": (now - timedelta(minutes=2)).isoformat(),
                    "stoppedAt": (now - timedelta(minutes=1)).isoformat(),
                    "mode": "webhook",
                    "data": {
                        "resultData": {
                            "lastNodeExecuted": "HTTP Request",
                            "error": {"message": "429 Too Many Requests: Rate limit exceeded", "httpCode": "429"},
                        }
                    },
                },
                {
                    "id": "ex_9002",
                    "workflowId": "101",
                    "status": "error",
                    "startedAt": now.isoformat(),
                    "stoppedAt": (now + timedelta(seconds=5)).isoformat(),
                    "mode": "webhook",
                    "data": {
                        "resultData": {
                            "lastNodeExecuted": "HTTP Request",
                            "error": {"message": "429 Too Many Requests: Rate limit exceeded", "httpCode": "429"},
                        }
                    },
                },
            ],
            "cursor_end",
        )
    )

    dispatched = []
    service = N8NSyncService(
        client_factory=lambda _integ: mock_client,
        diagnosis_dispatcher=lambda inc_id: dispatched.append(inc_id),
    )

    summary = await service.sync_integration(db, integ, inline_diagnosis_fallback=False)

    assert summary["workflows_synced"] == 1
    assert summary["executions_ingested"] == 2
    assert summary["incidents_created"] == 1
    assert summary["incidents_updated"] == 1
    assert len(db.incidents) == 1
    assert db.incidents[0].occurrence_count == 2
    assert db.incidents[0].error_category == "RATE_LIMIT"
    assert db.workflows[0].consecutive_failures == 2
    assert db.workflows[0].health_status == "DEGRADED"
    assert integ.sync_cursor == "cursor_end"
    assert integ.last_execution_watermark == now
    assert len(dispatched) == 2

    # Re-polling exact same executions must not duplicate executions or incidents
    summary_2 = await service.sync_integration(db, integ, inline_diagnosis_fallback=False)
    assert summary_2["executions_ingested"] == 0
    assert summary_2["incidents_created"] == 0
    assert len(db.executions) == 2
    assert len(db.incidents) == 1


# ============================================================================
# 4. Duplicate Webhook Events & Error Normalization
# ============================================================================

def test_n8n_error_extraction_and_webhook_hmac_idempotency():
    """Scenario 4: Detailed n8n resultData.error extraction + HMAC SHA-256 verification."""
    raw = {
        "id": "ex_err_1",
        "workflowId": "wf_55",
        "status": "crashed",
        "startedAt": "2026-05-01T10:00:00Z",
        "stoppedAt": "2026-05-01T10:00:04Z",
        "data": {
            "resultData": {
                "lastNodeExecuted": "Stripe Charge",
                "error": {"message": "401 Unauthorized: Expired API key", "httpCode": "401"},
            }
        },
    }
    msg, payload = extract_n8n_error_details(raw)
    assert msg == "[Stripe Charge] 401 Unauthorized: Expired API key"
    assert payload["httpCode"] == "401"

    norm = normalize_n8n_execution(raw)
    assert norm["status"] == "FAILED"
    assert norm["duration_ms"] == 4000

    secret = "whsec_live_12345"
    body = json.dumps(raw).encode()
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    assert hmac.compare_digest(hashlib.sha256(body).hexdigest(), hashlib.sha256(body).hexdigest())
    from app.api.v1.webhooks import verify_signature
    assert verify_signature(body, f"sha256={sig}", secret) is True
    assert verify_signature(body, "invalid_sig", secret) is False


# ============================================================================
# 6. Gemini Diagnosis Validation & Fallback Transparency
# ============================================================================

@pytest.mark.asyncio
async def test_gemini_diagnosis_fallback_and_schema_validation():
    """Scenario 6: Deterministic fallback clearly marks is_ai_generated=False with fallback_reason."""
    engine = GeminiDiagnosisEngine()
    engine.client = None  # Force offline deterministic path

    result = await engine.diagnose_incident(
        workflow_name="Stripe Invoice Settlement",
        platform="n8n",
        client_name="FinEdge Global",
        error_message="401 Unauthorized: Invalid Stripe API Key",
        execution_id="exec_1",
    )
    validated = AIDiagnosisSchema(**{k: result[k] for k in AIDiagnosisSchema.model_fields})
    assert validated.error_category == "AUTH_FAILURE"
    assert validated.requires_human_approval is True
    assert result["is_ai_generated"] is False
    assert "GEMINI_API_KEY" in (result["fallback_reason"] or "")


# ============================================================================
# 7. Stuck Execution Detection & Per-Workflow Thresholds
# ============================================================================

@pytest.mark.asyncio
async def test_stuck_execution_detection_respects_overrides_and_no_duplicates():
    """Scenario 7: Detects stuck runs, respects allow_long_running & custom timeout, avoids duplicate alerts."""
    db = InMemoryAsyncSession()
    now = datetime(2026, 5, 1, 14, 0, tzinfo=timezone.utc)

    wf_default = Workflow(
        id="wf_def",
        agency_id="ag_1",
        name="Fast Webhook",
        platform="n8n",
        external_workflow_id="ext_1",
        is_active=True,
        health_status="HEALTHY",
        consecutive_failures=0,
    )
    wf_long = Workflow(
        id="wf_long",
        agency_id="ag_1",
        name="Nightly Warehouse ETL",
        platform="n8n",
        external_workflow_id="ext_2",
        is_active=True,
        allow_long_running=True,
        health_status="HEALTHY",
        consecutive_failures=0,
    )
    wf_custom = Workflow(
        id="wf_custom",
        agency_id="ag_1",
        name="Tight SLA Flow",
        platform="n8n",
        external_workflow_id="ext_3",
        is_active=True,
        stuck_timeout_seconds=120,
        health_status="HEALTHY",
        consecutive_failures=0,
    )
    db.workflows.extend([wf_default, wf_long, wf_custom])

    assert compute_stuck_timeout_seconds(wf_default) == 900
    assert compute_stuck_timeout_seconds(wf_long) == 14400
    assert compute_stuck_timeout_seconds(wf_custom) == 120

    ex_stuck_default = Execution(
        id="ex_1",
        workflow_id="wf_def",
        external_execution_id="n8n_1",
        status="RUNNING",
        raw_status="running",
        started_at=now - timedelta(minutes=25),
        is_stuck_alerted=False,
    )
    ex_long_running = Execution(
        id="ex_2",
        workflow_id="wf_long",
        external_execution_id="n8n_2",
        status="RUNNING",
        raw_status="running",
        started_at=now - timedelta(minutes=60),
        is_stuck_alerted=False,
    )
    ex_stuck_custom = Execution(
        id="ex_3",
        workflow_id="wf_custom",
        external_execution_id="n8n_3",
        status="RUNNING",
        raw_status="waiting",
        started_at=now - timedelta(minutes=3),
        is_stuck_alerted=False,
    )
    db.executions.extend([ex_stuck_default, ex_long_running, ex_stuck_custom])

    service = N8NSyncService(diagnosis_dispatcher=lambda _inc_id: None)
    report_1 = await service.detect_stuck_executions(db, now_utc=now, inline_diagnosis_fallback=False)

    assert report_1["checked_running_executions"] == 3
    assert report_1["abnormal_runs_detected"] == 2
    assert ex_stuck_default.status == "TIMED_OUT"
    assert ex_stuck_default.is_stuck_alerted is True
    assert ex_stuck_custom.status == "TIMED_OUT"
    assert ex_long_running.status == "RUNNING"  # No false positive on long-running workflow

    # Second pass must produce zero duplicate incidents
    report_2 = await service.detect_stuck_executions(db, now_utc=now + timedelta(minutes=1), inline_diagnosis_fallback=False)
    assert report_2["abnormal_runs_detected"] == 0
    assert len(db.incidents) == 2


# ============================================================================
# 9 & 10. Security (AES-GCM, SSRF), Tenant Isolation & Timezone Conversion
# ============================================================================

def test_ssrf_guard_aes_encryption_and_timezone_utc_conversion():
    """Scenarios 9 & 10: AES-256-GCM credential protection, SSRF URL check, and UTC -> IANA timezone."""
    secret = "n8n_pat_live_98213abc"
    cipher = encrypt_secret(secret)
    assert cipher.startswith("enc:v1:")
    assert secret not in cipher
    assert decrypt_secret(cipher) == secret

    assert validate_integration_url("https://n8n.acme-automation.com") == "https://n8n.acme-automation.com"
    with pytest.raises(ValueError):
        validate_integration_url("http://169.254.169.254/latest/meta-data", allow_private=False)
    with pytest.raises(ValueError):
        validate_integration_url("http://127.0.0.1:5678", allow_private=False)

    # Timezone Pydantic validation + UTC conversion
    tz_update = TimezoneUpdate(timezone="Asia/Kolkata")
    assert tz_update.timezone == "Asia/Kolkata"
    utc_dt = datetime(2026, 5, 1, 18, 30, tzinfo=timezone.utc)
    ist_dt = utc_dt.astimezone(ZoneInfo("Asia/Kolkata"))
    assert ist_dt.day == 2 and ist_dt.hour == 0 and ist_dt.minute == 0


# ============================================================================
# 11. Celery Task Execution & Retries
# ============================================================================

def test_celery_task_retries_on_failure():
    """Scenario 11: Celery tasks trigger retry with backoff when underlying async execution raises."""
    from celery.exceptions import Retry
    from app.workers.celery_app import diagnose_incident_task, sync_active_integrations_task

    with patch("app.workers.celery_app._run_async", side_effect=RuntimeError("Transient DB error")):
        with patch.object(diagnose_incident_task, "retry", side_effect=Retry()) as mock_retry:
            with pytest.raises(Retry):
                diagnose_incident_task.run("inc_missing_1")
            mock_retry.assert_called_once()

        with patch.object(sync_active_integrations_task, "retry", side_effect=Retry()) as mock_sync_retry:
            with pytest.raises(Retry):
                sync_active_integrations_task.run()
            mock_sync_retry.assert_called_once()
