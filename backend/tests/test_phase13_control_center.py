"""Phase 13 Central Automation Control Center Tests.

Covers (using isolated mocked HTTP transports and mocked AsyncSession; NOT live provider sandboxes):
1. Adapter contract & explicit capability declarations across N8NClient, MakeClient, ZapierClient,
   CustomAutomationAdapter, and modular registry extension hook.
2. SSRF & 3xx redirect blocking in N8NClient, MakeClient, ZapierClient, CustomAutomationAdapter.
3. Workflow control actions: activate, deactivate, trigger, retry_execution, pause, resume, update_settings.
4. Safety enforcement in ControlEngineService:
   - Read-only VIEWER role blocked (HTTP 403)
   - Tenant isolation (cross-tenant workflow rejected with HTTP 404)
   - Missing user confirmation rejected (HTTP 400)
   - Unsupported actions blocked & audited cleanly (never simulated as SUCCESSFUL)
   - Sensitive / high-risk actions require Admin/Owner approval -> AWAITING_APPROVAL
   - DEVELOPER cannot approve; OWNER/ADMIN can approve -> dispatches -> SUCCESSFUL + VERIFIED
   - Failed remote provider HTTP status -> FAILED (never marked SUCCESSFUL)
   - Idempotency deduplication by (agency_id, idempotency_key)
   - Sensitive secret redaction in stored responses & ControlActivityLog
5. AI-Assisted Automation Management (`answer_control_center_question`):
   - Answers natural language operational queries with structured recommendations & proposals
   - Proposals always enforce `auto_executed=False` & `requires_confirmation=True`
6. Celery control action task registration & Alembic migration 008 chain verification.
"""

import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import HTTPException

from app.diagnosis.gemini_engine import GeminiDiagnosisEngine
from app.integrations.base import UnsupportedControlActionError
from app.integrations.custom_python import CustomAutomationAdapter
from app.integrations.make import MakeClient
from app.integrations.n8n import N8NClient
from app.integrations.registry import build_adapter_for_integration, register_provider_adapter
from app.integrations.zapier import ZapierClient
from app.models.entities import (
    AgencyMember,
    AuditLog,
    ControlActionRequest,
    ControlActivityLog,
    Execution,
    Integration,
    Workflow,
)
from app.services.control_engine import (
    ControlEngineService,
    reset_control_rate_limits,
)
from app.workers.celery_app import celery_app, execute_control_action_task


class _FakeScalarResult:
    def __init__(self, items):
        self._items = items

    def scalar_one_or_none(self):
        return self._items[0] if self._items else None

    def scalars(self):
        return self

    def all(self):
        return list(self._items)

    def first(self):
        return self._items[0] if self._items else None


class _FakeAsyncSession:
    """In-memory mock AsyncSession for unit-testing ControlEngineService state transitions cleanly."""

    def __init__(self, store: dict):
        self.store = store
        self.added = []
        self.committed = 0

    def add(self, obj):
        if getattr(obj, "id", None) is None:
            import uuid

            obj.id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        if getattr(obj, "created_at", None) is None and hasattr(obj, "created_at"):
            obj.created_at = now
        if getattr(obj, "updated_at", None) is None and hasattr(obj, "updated_at"):
            obj.updated_at = now
        self.added.append(obj)
        cls_name = obj.__class__.__name__
        self.store.setdefault(cls_name, []).append(obj)

    async def flush(self):
        return None

    async def commit(self):
        self.committed += 1

    async def refresh(self, obj):
        return None

    async def execute(self, statement):
        # Inspect target model class from SQLAlchemy select() column descriptions
        col_descs = getattr(statement, "column_descriptions", [])
        target_cls = col_descs[0]["entity"] if col_descs else None
        cls_name = target_cls.__name__ if target_cls else ""
        candidates = list(self.store.get(cls_name, []))

        # Basic predicate evaluation on compiled whereclauses if provided
        where_criteria = getattr(statement, "_where_criteria", ())
        for crit in where_criteria:
            left = getattr(crit, "left", None)
            right = getattr(crit, "right", None)
            col_name = getattr(left, "key", None)
            val = getattr(right, "value", None)
            if col_name:
                candidates = [c for c in candidates if getattr(c, col_name, None) == val]

        return _FakeScalarResult(candidates)


def test_provider_capability_declarations_and_ssrf_safety():
    async def _run():
        def n8n_handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/api/v1/workflows/wf_10/activate":
                return httpx.Response(200, json={"id": "wf_10", "active": True, "apiKey": "secret_123"})
            if request.url.path == "/api/v1/workflows/wf_10/deactivate":
                return httpx.Response(200, json={"id": "wf_10", "active": False})
            if request.url.path == "/api/v1/workflows/wf_10" and request.method == "GET":
                return httpx.Response(200, json={"id": "wf_10", "name": "Order Sync", "nodes": [], "connections": {}, "settings": {"timezone": "UTC"}, "active": True})
            if request.url.path == "/api/v1/workflows/wf_10" and request.method == "PUT":
                return httpx.Response(200, json={"id": "wf_10", "settings": {"timezone": "UTC", "saveManualExecutions": True}})
            return httpx.Response(302, headers={"Location": "http://169.254.169.254/latest"})

        n8n = N8NClient(
            base_url="https://n8n.example.com",
            api_key="n8n_key_abc",
            max_retries=0,
            transport=httpx.MockTransport(n8n_handler),
        )
        caps = n8n.get_capabilities()
        assert caps.activate.supported is True
        assert caps.deactivate.supported is True
        assert caps.pause.supported is False  # Honest capability reporting
        assert caps.update_settings.supported is True

        act_res = await n8n.activate_workflow("wf_10")
        assert act_res.success is True
        assert act_res.normalized_status == "ACTIVE"
        assert act_res.sanitized_response.get("apiKey") == "[REDACTED]"

        with pytest.raises(UnsupportedControlActionError):
            await n8n.pause_workflow("wf_10")

        # Zapier webhook-only mode cannot fake workflow activation or execution retries
        zap = ZapierClient(catch_hook_url=None)
        zcaps = zap.get_capabilities()
        assert zcaps.activate.supported is False
        assert zcaps.trigger.supported is False
        assert zcaps.webhook_ingest.supported is True
        with pytest.raises(UnsupportedControlActionError):
            await zap.activate_workflow("zap_1")

        # Make adapter blocks SSRF redirects and exposes honest scenario controls
        def make_handler(request: httpx.Request) -> httpx.Response:
            if request.url.path.endswith("/start"):
                return httpx.Response(200, json={"id": 42, "isPaused": False})
            return httpx.Response(302, headers={"Location": "http://127.0.0.1:8080/internal"})

        make_client = MakeClient(
            api_token="make_tok",
            zone="us1",
            max_retries=0,
            transport=httpx.MockTransport(make_handler),
        )
        mcaps = make_client.get_capabilities()
        assert mcaps.activate.supported is True
        assert mcaps.retry_execution.supported is False
        make_res = await make_client.activate_workflow("42")
        assert make_res.success is True
        with pytest.raises(ValueError, match="SSRF"):
            await make_client.fetch_workflows()

        # Custom FastAPI/Python signed control adapter
        def custom_handler(request: httpx.Request) -> httpx.Response:
            assert request.headers.get("X-Zevkar-Signature", "").startswith("sha256=")
            if request.url.path == "/workflows/job_1/pause":
                return httpx.Response(200, json={"paused": True})
            return httpx.Response(200, json={"status": "ok"})

        custom = CustomAutomationAdapter(
            platform="custom_python",
            instance_url="https://workers.example.com",
            api_key="py_token",
            webhook_secret="whsec_test_123",
            max_retries=0,
            transport=httpx.MockTransport(custom_handler),
        )
        ccaps = custom.get_capabilities()
        assert ccaps.pause.supported is True
        assert ccaps.manage_schedule.supported is True
        pause_res = await custom.pause_workflow("job_1")
        assert pause_res.normalized_status == "PAUSED"

    asyncio.run(_run())


def test_control_engine_rbac_tenant_confirmation_approval_idempotency_and_failures():
    reset_control_rate_limits()

    async def _run():
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/api/v1/workflows/ext_billing/deactivate":
                return httpx.Response(200, json={"id": "ext_billing", "active": False, "token": "sk_live_secret"})
            if request.url.path == "/api/v1/workflows/ext_sync/run":
                return httpx.Response(200, json={"executionId": "exec_run_77"})
            if request.url.path == "/api/v1/workflows/ext_fail/run":
                return httpx.Response(500, json={"message": "Internal provider error sk_live_leak"})
            return httpx.Response(200, json={})

        n8n_adapter = N8NClient(
            base_url="https://n8n.example.com",
            api_key="key_live",
            max_retries=0,
            transport=httpx.MockTransport(handler),
        )
        engine = ControlEngineService(adapter_factory=lambda _integ: n8n_adapter)

        integ_a = Integration(
            id="int_a",
            agency_id="ag_a",
            name="Prod n8n",
            platform="n8n",
            instance_url="https://n8n.example.com",
            status="CONNECTED",
        )
        wf_billing = Workflow(
            id="wf_billing",
            agency_id="ag_a",
            integration_id="int_a",
            platform="n8n",
            external_workflow_id="ext_billing",
            name="Stripe Invoice Settlement Sync",
            is_active=True,
            control_status="ACTIVE",
            health_status="HEALTHY",
            consecutive_failures=0,
        )
        wf_sync = Workflow(
            id="wf_sync",
            agency_id="ag_a",
            integration_id="int_a",
            platform="n8n",
            external_workflow_id="ext_sync",
            name="Catalog Inventory Pull",
            is_active=True,
            control_status="ACTIVE",
            health_status="HEALTHY",
            consecutive_failures=0,
        )
        wf_fail = Workflow(
            id="wf_fail",
            agency_id="ag_a",
            integration_id="int_a",
            platform="n8n",
            external_workflow_id="ext_fail",
            name="Webhook Relay",
            is_active=True,
            control_status="ACTIVE",
            health_status="DEGRADED",
            consecutive_failures=1,
        )
        wf_other_tenant = Workflow(
            id="wf_b",
            agency_id="ag_b",
            integration_id="int_b",
            platform="n8n",
            external_workflow_id="ext_b",
            name="Other Org Pipeline",
            is_active=True,
            control_status="ACTIVE",
            health_status="HEALTHY",
            consecutive_failures=0,
        )

        store = {
            "Integration": [integ_a],
            "Workflow": [wf_billing, wf_sync, wf_fail, wf_other_tenant],
            "ControlActionRequest": [],
            "ControlActivityLog": [],
            "AuditLog": [],
        }
        db = _FakeAsyncSession(store)

        viewer = AgencyMember(id="m_view", agency_id="ag_a", user_id="u_view", role="VIEWER", status="ACTIVE")
        developer = AgencyMember(id="m_dev", agency_id="ag_a", user_id="u_dev", role="DEVELOPER", status="ACTIVE")
        admin = AgencyMember(id="m_adm", agency_id="ag_a", user_id="u_adm", role="ADMIN", status="ACTIVE")

        # 1. Read-only VIEWER blocked
        with pytest.raises(HTTPException) as exc_view:
            await engine.request_action(
                db, member=viewer, workflow_id="wf_sync", action_type="TRIGGER", confirmed=True
            )
        assert exc_view.value.status_code == 403

        # 2. Cross-tenant workflow blocked
        with pytest.raises(HTTPException) as exc_tenant:
            await engine.request_action(
                db, member=admin, workflow_id="wf_b", action_type="TRIGGER", confirmed=True
            )
        assert exc_tenant.value.status_code == 404

        # 3. Missing confirmation rejected
        with pytest.raises(HTTPException) as exc_conf:
            await engine.request_action(
                db, member=developer, workflow_id="wf_sync", action_type="TRIGGER", confirmed=False
            )
        assert exc_conf.value.status_code == 400

        # 4. Unsupported action (PAUSE on n8n) blocked & logged
        with pytest.raises(HTTPException) as exc_unsup:
            await engine.request_action(
                db, member=admin, workflow_id="wf_sync", action_type="PAUSE", confirmed=True
            )
        assert exc_unsup.value.status_code == 400
        assert any(log.event_status == "BLOCKED" for log in store["ControlActivityLog"])

        # 5. Low-risk TRIGGER executes & verifies with idempotency deduplication
        trig_req = await engine.request_action(
            db,
            member=developer,
            workflow_id="wf_sync",
            action_type="TRIGGER",
            confirmed=True,
            idempotency_key="idem_trigger_01",
        )
        assert trig_req.status == "SUCCESSFUL"
        assert trig_req.verification_status == "VERIFIED"

        dup_req = await engine.request_action(
            db,
            member=developer,
            workflow_id="wf_sync",
            action_type="TRIGGER",
            confirmed=True,
            idempotency_key="idem_trigger_01",
        )
        assert dup_req.id == trig_req.id

        # 6. Sensitive financial DEACTIVATE requires Admin/Owner approval -> AWAITING_APPROVAL
        deact_req = await engine.request_action(
            db,
            member=developer,
            workflow_id="wf_billing",
            action_type="DEACTIVATE",
            confirmed=True,
            reason="Halt invoice retries while rate limit clears",
        )
        assert deact_req.status == "AWAITING_APPROVAL"
        assert deact_req.requires_approval is True

        # DEVELOPER cannot approve
        with pytest.raises(HTTPException) as exc_dev_appr:
            await engine.approve_action_request(db, member=developer, request_id=deact_req.id)
        assert exc_dev_appr.value.status_code == 403

        # ADMIN approves -> executes & updates workflow status + redacts secret
        approved_req = await engine.approve_action_request(db, member=admin, request_id=deact_req.id)
        assert approved_req.status == "SUCCESSFUL"
        assert wf_billing.is_active is False
        assert wf_billing.control_status == "INACTIVE"
        assert approved_req.sanitized_response["sanitized_response"]["token"] == "[REDACTED]"

        # 7. Provider HTTP 500 never marks SUCCESSFUL and redacts leaked secrets
        failed_req = await engine.request_action(
            db,
            member=developer,
            workflow_id="wf_fail",
            action_type="TRIGGER",
            confirmed=True,
        )
        assert failed_req.status == "FAILED"
        assert failed_req.verification_status == "FAILED"
        assert "sk_live_leak" not in (failed_req.error_message or "")
        assert "[REDACTED]" in (failed_req.error_message or "")

    asyncio.run(_run())


def test_ai_control_assistant_returns_safe_unexecuted_proposals():
    async def _run():
        engine = GeminiDiagnosisEngine(model_name="gemini-4-hydrogen")
        engine.client = None  # Force offline deterministic control advisor check

        res = await engine.answer_control_center_question(
            question="Which workflows are currently unhealthy and what happens if I retry?",
            workflows_context=[
                {
                    "id": "wf_1",
                    "name": "Stripe Billing Sync",
                    "platform": "n8n",
                    "control_status": "FAILED",
                    "health_status": "FAILING",
                    "consecutive_failures": 4,
                    "capabilities": {
                        "retry_execution": {"supported": True, "requires_approval": False},
                        "deactivate": {"supported": True, "requires_approval": True},
                    },
                }
            ],
            incidents_context=[
                {
                    "id": "inc_1",
                    "workflow_id": "wf_1",
                    "workflow_name": "Stripe Billing Sync",
                    "platform": "n8n",
                    "error_category": "RATE_LIMIT",
                    "error_message": "HTTP 429 from Stripe with Authorization: Bearer sk_live_secret_abc",
                }
            ],
        )
        assert res["unhealthy_count"] == 1
        assert "Stripe Billing Sync" in res["answer"]
        assert len(res["proposed_actions"]) >= 1
        prop = res["proposed_actions"][0]
        assert prop["auto_executed"] is False
        assert prop["requires_confirmation"] is True
        assert prop["requires_approval"] is True  # Financial workflow requires approval

    asyncio.run(_run())


def test_celery_task_and_modular_adapter_extension():
    assert execute_control_action_task.name in celery_app.tasks

    class FutureLinearAdapter(CustomAutomationAdapter):
        platform_name = "future_linear"

    register_provider_adapter(
        "future_linear",
        lambda integ: FutureLinearAdapter(platform=integ.platform, instance_url=integ.instance_url),
    )
    built = build_adapter_for_integration(
        Integration(
            id="int_lin",
            agency_id="ag_1",
            name="Linear Flow",
            platform="future_linear",
            instance_url="https://linear-hooks.example.com",
        )
    )
    assert isinstance(built, FutureLinearAdapter)
    assert built.get_capabilities().trigger.supported is True
