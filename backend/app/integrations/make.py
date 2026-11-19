import asyncio
import logging
import re
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

logger = logging.getLogger("make_integration")
_ZONE_RE = re.compile(r"^[a-z0-9-]+$", re.IGNORECASE)


class MakeClient(BaseIntegrationAdapter):
    """
    Adapter for Make.com (formerly Integromat) API v2.
    Supports scenario discovery, execution logs, start/stop/run scenario control,
    SSRF/redirect validation, and normalized error handling.
    """

    platform_name = "Make"

    def __init__(
        self,
        api_token: str,
        zone: str = "eu1",
        instance_url: Optional[str] = None,
        timeout_seconds: float = 15.0,
        max_retries: int = 2,
        allow_private: Optional[bool] = None,
        transport: Optional[httpx.AsyncBaseTransport] = None,
        sleep_fn: Optional[Callable[[float], Any]] = None,
    ):
        clean_zone = (zone or "eu1").strip().lower()
        if not _ZONE_RE.match(clean_zone):
            raise ValueError("Invalid Make.com zone identifier.")
        raw_base = instance_url.strip() if instance_url else f"https://{clean_zone}.make.com/api/v2"
        validated = validate_integration_url(raw_base, allow_private=allow_private).rstrip("/")
        if not validated.endswith("/api/v2"):
            validated = f"{validated}/api/v2"
        self.base_url = validated
        self.api_token = api_token
        self.timeout = timeout_seconds
        self.max_retries = max_retries
        self._transport = transport
        self._sleep = sleep_fn or asyncio.sleep

    def get_capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            platform="Make",
            adapter_mode="PARTIAL_REST",
            list_workflows=ProviderCapability(supported=True, reason="Make v2 GET /scenarios"),
            fetch_executions=ProviderCapability(supported=True, reason="Make v2 GET /scenarios/{id}/logs"),
            activate=ProviderCapability(supported=True, reason="Make v2 POST /scenarios/{id}/start", requires_approval=False),
            deactivate=ProviderCapability(supported=True, reason="Make v2 POST /scenarios/{id}/stop", requires_approval=True),
            trigger=ProviderCapability(supported=True, reason="Make v2 POST /scenarios/{id}/run", requires_approval=False),
            retry_execution=ProviderCapability(
                supported=False,
                reason="Make.com API v2 triggers a new scenario execution rather than replaying a historical execution ID.",
            ),
            pause=ProviderCapability(
                supported=False,
                reason="Make.com scenarios use active/stopped scheduling rather than a separate pause state; use Deactivate.",
            ),
            resume=ProviderCapability(
                supported=False,
                reason="Use Activate to start a stopped Make.com scenario.",
            ),
            update_settings=ProviderCapability(
                supported=False,
                reason="Scenario blueprint and connection settings editing must be performed in the Make.com editor.",
            ),
            manage_schedule=ProviderCapability(
                supported=False,
                reason="Scenario interval and cron scheduling requires Make v2 team-scoped scheduling payloads.",
            ),
            webhook_ingest=ProviderCapability(supported=True, reason="Supports Zevkar signed webhook event ingestion"),
        )

    def _get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Token {self.api_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "Zevkar/1.0",
        }

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
        url = f"{self.base_url}{path}"
        last_exc: Optional[Exception] = None
        async with self._build_client() as client:
            for attempt in range(self.max_retries + 1):
                try:
                    resp = await client.request(method, url, headers=self._get_headers(), json=json_body)
                    if 300 <= resp.status_code < 400:
                        raise ValueError(
                            f"Make.com redirect (HTTP {resp.status_code}) blocked by SSRF security policy."
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
        raise RuntimeError("Unexpected Make.com request termination")

    async def validate_credentials(self) -> Dict[str, Any]:
        try:
            await self._request("GET", "/users/me")
            return {"is_valid": True, "status_code": 200, "message": "Make.com credentials verified."}
        except httpx.HTTPStatusError as exc:
            return {
                "is_valid": False,
                "status_code": exc.response.status_code,
                "message": "Make.com authentication failed.",
            }
        except Exception as e:
            return {"is_valid": False, "status_code": 503, "message": f"Connection error: {str(e)}"}

    async def fetch_workflows(self) -> List[Dict[str, Any]]:
        resp = await self._request("GET", "/scenarios")
        data = resp.json()
        return data.get("scenarios", []) if isinstance(data, dict) else []

    async def get_workflow_details(self, workflow_id: str) -> Dict[str, Any]:
        resp = await self._request("GET", f"/scenarios/{workflow_id}")
        data = resp.json()
        return data.get("scenario", data) if isinstance(data, dict) else {}

    async def fetch_executions(self, workflow_id: Optional[str] = None) -> List[Dict[str, Any]]:
        path = f"/scenarios/{workflow_id}/logs" if workflow_id else "/logs"
        resp = await self._request("GET", path)
        data = resp.json()
        return data.get("scenarioLogs", []) if isinstance(data, dict) else []

    async def activate_workflow(self, workflow_id: str) -> WorkflowControlResult:
        resp = await self._request("POST", f"/scenarios/{workflow_id}/start", json_body={})
        body = sanitize_log_payload(resp.json() if resp.content else {})
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
        resp = await self._request("POST", f"/scenarios/{workflow_id}/stop", json_body={})
        body = sanitize_log_payload(resp.json() if resp.content else {})
        return WorkflowControlResult(
            success=True,
            action="DEACTIVATE",
            status="SUCCESSFUL",
            external_workflow_id=workflow_id,
            normalized_status="INACTIVE",
            verified_remote_state={"active": False},
            sanitized_response=body if isinstance(body, dict) else {"raw": body},
        )

    async def trigger_workflow(
        self, workflow_id: str, data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        resp = await self._request("POST", f"/scenarios/{workflow_id}/run", json_body=data or {})
        return resp.json() if resp.content else {"status": "triggered"}

    async def retry_execution(self, execution_id: str) -> Dict[str, Any]:
        raise NotImplementedError(
            "Make.com API v2 triggers scenarios rather than replaying historical execution IDs; use trigger_workflow instead."
        )

    def normalize_error(self, raw_payload: Dict[str, Any]) -> NormalizedError:
        msg = str(raw_payload.get("message") or raw_payload.get("detail") or "Unknown Make error")
        lower = msg.lower()
        if "401" in lower or "token" in lower:
            return NormalizedError(
                category="AUTH_FAILURE",
                severity="HIGH",
                raw_message=msg,
                clean_summary="Make.com app connection credentials expired or invalid.",
                suggested_action="Re-authenticate connection in Make scenario connections panel.",
                requires_approval=True,
            )
        elif "rate" in lower or "429" in lower:
            return NormalizedError(
                category="RATE_LIMIT",
                severity="MEDIUM",
                raw_message=msg,
                clean_summary="Operation limit or third-party rate limit reached.",
                suggested_action="Throttle execution frequency or increase quota.",
                requires_approval=False,
            )
        return NormalizedError(
            category="API_ERROR",
            severity="HIGH",
            raw_message=msg,
            clean_summary=msg[:120],
            suggested_action="Check execution logs in Make dashboard.",
            requires_approval=True,
        )
