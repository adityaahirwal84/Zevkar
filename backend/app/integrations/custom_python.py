import asyncio
import hashlib
import hmac
import json
import logging
from typing import Any, Callable, Dict, List, Optional
import httpx
from app.core.security import sanitize_log_payload, validate_integration_url
from app.integrations.base import (
    BaseIntegrationAdapter,
    NormalizedError,
    ProviderCapabilities,
    ProviderCapability,
    WorkflowControlResult,
)
from app.lib.classifier import classify_error

logger = logging.getLogger("custom_python_integration")


class CustomAutomationAdapter(BaseIntegrationAdapter):
    """
    Modular adapter for custom Python/FastAPI or Node.js automation services.
    Supports:
    - Webhook-only mode (when no HTTP control endpoint URL is configured)
    - Signed HTTP Control mode (SSRF-validated instance_url + HMAC-SHA256 signature + bearer auth)
    """

    def __init__(
        self,
        platform: str = "custom_python",
        instance_url: Optional[str] = None,
        api_key: Optional[str] = None,
        webhook_secret: Optional[str] = None,
        timeout_seconds: float = 12.0,
        max_retries: int = 2,
        allow_private: Optional[bool] = None,
        transport: Optional[httpx.AsyncBaseTransport] = None,
        sleep_fn: Optional[Callable[[float], Any]] = None,
    ):
        self.platform_name = platform or "custom_python"
        self.base_url = (
            validate_integration_url(instance_url, allow_private=allow_private).rstrip("/")
            if instance_url and instance_url.strip()
            else None
        )
        self.api_key = api_key or ""
        self.webhook_secret = webhook_secret or ""
        self.timeout = timeout_seconds
        self.max_retries = max_retries
        self._transport = transport
        self._sleep = sleep_fn or asyncio.sleep

    def get_capabilities(self) -> ProviderCapabilities:
        has_http = bool(self.base_url)
        no_url_reason = (
            "No signed HTTP control endpoint (instance_url) is configured; custom integration is in webhook-ingestion mode."
        )
        return ProviderCapabilities(
            platform=self.platform_name,
            adapter_mode="HTTP_CONTROL" if has_http else "WEBHOOK_ONLY",
            list_workflows=ProviderCapability(
                supported=has_http,
                reason="GET /workflows on custom control service" if has_http else no_url_reason,
            ),
            fetch_executions=ProviderCapability(
                supported=has_http,
                reason="GET /executions on custom control service" if has_http else no_url_reason,
            ),
            activate=ProviderCapability(
                supported=has_http,
                reason="POST /workflows/{id}/activate" if has_http else no_url_reason,
                requires_approval=False,
            ),
            deactivate=ProviderCapability(
                supported=has_http,
                reason="POST /workflows/{id}/deactivate" if has_http else no_url_reason,
                requires_approval=True,
            ),
            trigger=ProviderCapability(
                supported=has_http,
                reason="POST /workflows/{id}/trigger" if has_http else no_url_reason,
                requires_approval=False,
            ),
            retry_execution=ProviderCapability(
                supported=has_http,
                reason="POST /executions/{id}/retry" if has_http else no_url_reason,
                requires_approval=False,
            ),
            pause=ProviderCapability(
                supported=has_http,
                reason="POST /workflows/{id}/pause" if has_http else no_url_reason,
                requires_approval=True,
            ),
            resume=ProviderCapability(
                supported=has_http,
                reason="POST /workflows/{id}/resume" if has_http else no_url_reason,
                requires_approval=False,
            ),
            update_settings=ProviderCapability(
                supported=has_http,
                reason="PATCH /workflows/{id}/settings" if has_http else no_url_reason,
                requires_approval=True,
            ),
            manage_schedule=ProviderCapability(
                supported=has_http,
                reason="PUT /workflows/{id}/schedule" if has_http else no_url_reason,
                requires_approval=True,
            ),
            webhook_ingest=ProviderCapability(
                supported=True,
                reason="Accepts signed Zevkar telemetry webhooks from custom scripts/workers.",
            ),
        )

    def _build_headers(self, body_bytes: bytes = b"") -> Dict[str, str]:
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "Zevkar-Control/1.0",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        if self.webhook_secret:
            sig = hmac.new(self.webhook_secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()
            headers["X-Zevkar-Signature"] = f"sha256={sig}"
        return headers

    def _build_client(self) -> httpx.AsyncClient:
        kwargs: Dict[str, Any] = {"timeout": self.timeout, "follow_redirects": False}
        if self._transport is not None:
            kwargs["transport"] = self._transport
        return httpx.AsyncClient(**kwargs)

    async def _request(
        self,
        method: str,
        path: str,
        json_body: Optional[Dict[str, Any]] = None,
    ) -> httpx.Response:
        if not self.base_url:
            raise NotImplementedError(
                f"[{self.platform_name}] HTTP control URL is not configured on this integration."
            )
        url = f"{self.base_url}{path}"
        body_bytes = json.dumps(json_body or {}, separators=(",", ":"), sort_keys=True).encode("utf-8")
        headers = self._build_headers(body_bytes)
        last_exc: Optional[Exception] = None

        async with self._build_client() as client:
            for attempt in range(self.max_retries + 1):
                try:
                    resp = await client.request(
                        method,
                        url,
                        headers=headers,
                        content=body_bytes if json_body is not None else None,
                    )
                    if 300 <= resp.status_code < 400:
                        raise ValueError(
                            f"Custom automation endpoint redirect (HTTP {resp.status_code}) blocked by SSRF policy."
                        )
                    if resp.status_code in (429, 502, 503, 504) and attempt < self.max_retries:
                        await self._sleep(min(float(2 ** attempt), 10.0))
                        continue
                    resp.raise_for_status()
                    return resp
                except (httpx.TimeoutException, httpx.ConnectError) as exc:
                    last_exc = exc
                    if attempt < self.max_retries:
                        await self._sleep(min(float(2 ** attempt), 10.0))
                        continue
                    raise
        if last_exc:
            raise last_exc
        raise RuntimeError("Unexpected custom automation request termination")

    async def validate_credentials(self) -> Dict[str, Any]:
        if not self.base_url:
            return {
                "is_valid": True,
                "status_code": 200,
                "message": "Custom integration configured in webhook-ingestion mode (no HTTP control URL).",
            }
        try:
            await self._request("GET", "/health")
            return {
                "is_valid": True,
                "status_code": 200,
                "message": "Custom FastAPI/Python automation control endpoint verified.",
            }
        except httpx.HTTPStatusError as exc:
            return {
                "is_valid": False,
                "status_code": exc.response.status_code,
                "message": f"Custom endpoint returned HTTP {exc.response.status_code}.",
            }
        except Exception as exc:
            return {
                "is_valid": False,
                "status_code": 503,
                "message": f"Custom endpoint unreachable: {str(exc)}",
            }

    async def fetch_workflows(self) -> List[Dict[str, Any]]:
        if not self.base_url:
            return []
        resp = await self._request("GET", "/workflows")
        data = resp.json()
        return data.get("workflows", data if isinstance(data, list) else []) if isinstance(data, (dict, list)) else []

    async def get_workflow_details(self, workflow_id: str) -> Dict[str, Any]:
        resp = await self._request("GET", f"/workflows/{workflow_id}")
        data = resp.json()
        return data if isinstance(data, dict) else {}

    async def fetch_executions(self, workflow_id: Optional[str] = None) -> List[Dict[str, Any]]:
        if not self.base_url:
            return []
        path = f"/workflows/{workflow_id}/executions" if workflow_id else "/executions"
        resp = await self._request("GET", path)
        data = resp.json()
        return data.get("executions", data if isinstance(data, list) else []) if isinstance(data, (dict, list)) else []

    async def activate_workflow(self, workflow_id: str) -> WorkflowControlResult:
        resp = await self._request("POST", f"/workflows/{workflow_id}/activate", json_body={})
        body = sanitize_log_payload(resp.json() if resp.content else {"active": True})
        return WorkflowControlResult(
            success=True,
            action="ACTIVATE",
            status="SUCCESSFUL",
            external_workflow_id=workflow_id,
            normalized_status="ACTIVE",
            verified_remote_state={"active": True},
            sanitized_response=body if isinstance(body, dict) else {"raw": body},
        )

    async def deactivate_workflow(self, workflow_id: str) -> WorkflowControlResult:
        resp = await self._request("POST", f"/workflows/{workflow_id}/deactivate", json_body={})
        body = sanitize_log_payload(resp.json() if resp.content else {"active": False})
        return WorkflowControlResult(
            success=True,
            action="DEACTIVATE",
            status="SUCCESSFUL",
            external_workflow_id=workflow_id,
            normalized_status="INACTIVE",
            verified_remote_state={"active": False},
            sanitized_response=body if isinstance(body, dict) else {"raw": body},
        )

    async def pause_workflow(self, workflow_id: str) -> WorkflowControlResult:
        resp = await self._request("POST", f"/workflows/{workflow_id}/pause", json_body={})
        body = sanitize_log_payload(resp.json() if resp.content else {"paused": True})
        return WorkflowControlResult(
            success=True,
            action="PAUSE",
            status="SUCCESSFUL",
            external_workflow_id=workflow_id,
            normalized_status="PAUSED",
            verified_remote_state={"paused": True},
            sanitized_response=body if isinstance(body, dict) else {"raw": body},
        )

    async def resume_workflow(self, workflow_id: str) -> WorkflowControlResult:
        resp = await self._request("POST", f"/workflows/{workflow_id}/resume", json_body={})
        body = sanitize_log_payload(resp.json() if resp.content else {"paused": False, "active": True})
        return WorkflowControlResult(
            success=True,
            action="RESUME",
            status="SUCCESSFUL",
            external_workflow_id=workflow_id,
            normalized_status="ACTIVE",
            verified_remote_state={"paused": False, "active": True},
            sanitized_response=body if isinstance(body, dict) else {"raw": body},
        )

    async def trigger_workflow(
        self, workflow_id: str, data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        resp = await self._request("POST", f"/workflows/{workflow_id}/trigger", json_body=data or {})
        body = resp.json() if resp.content else {"status": "triggered"}
        return sanitize_log_payload(body)

    async def retry_execution(self, execution_id: str) -> Dict[str, Any]:
        resp = await self._request("POST", f"/executions/{execution_id}/retry", json_body={})
        body = resp.json() if resp.content else {"status": "retrying"}
        return sanitize_log_payload(body)

    async def update_workflow_settings(
        self, workflow_id: str, settings_patch: Dict[str, Any]
    ) -> WorkflowControlResult:
        resp = await self._request(
            "PATCH",
            f"/workflows/{workflow_id}/settings",
            json_body={"settings": settings_patch},
        )
        body = sanitize_log_payload(resp.json() if resp.content else {"settings": settings_patch})
        return WorkflowControlResult(
            success=True,
            action="UPDATE_SETTINGS",
            status="SUCCESSFUL",
            external_workflow_id=workflow_id,
            verified_remote_state={"settings": settings_patch},
            sanitized_response=body if isinstance(body, dict) else {"raw": body},
        )

    async def manage_schedule(
        self, workflow_id: str, schedule_config: Dict[str, Any]
    ) -> WorkflowControlResult:
        resp = await self._request(
            "PUT",
            f"/workflows/{workflow_id}/schedule",
            json_body=schedule_config,
        )
        body = sanitize_log_payload(resp.json() if resp.content else {"schedule": schedule_config})
        return WorkflowControlResult(
            success=True,
            action="MANAGE_SCHEDULE",
            status="SUCCESSFUL",
            external_workflow_id=workflow_id,
            verified_remote_state={"schedule": schedule_config},
            sanitized_response=body if isinstance(body, dict) else {"raw": body},
        )

    def normalize_error(self, raw_payload: Dict[str, Any]) -> NormalizedError:
        raw_message = str(raw_payload.get("error") or raw_payload.get("message") or "Custom script failure")
        classified = classify_error(raw_message)
        return NormalizedError(
            category=classified["category"],
            severity=classified["severity"],
            raw_message=raw_message,
            clean_summary=raw_message[:140],
            suggested_action=classified["suggested_action"],
            requires_approval=classified["requires_approval"],
        )
