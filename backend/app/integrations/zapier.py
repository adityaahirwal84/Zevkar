import logging
from typing import Any, Dict, List, Optional
import httpx
from app.core.security import sanitize_log_payload, validate_integration_url
from app.integrations.base import (
    BaseIntegrationAdapter,
    NormalizedError,
    ProviderCapabilities,
    ProviderCapability,
)

logger = logging.getLogger("zapier_integration")


class ZapierClient(BaseIntegrationAdapter):
    """
    Adapter for Zapier webhook-based monitoring.
    Standard Zapier accounts do not expose REST endpoints to list/pause/activate Zaps;
    all unsupported remote controls are explicitly declared unavailable.
    """

    platform_name = "Zapier"

    def __init__(
        self,
        webhook_secret: Optional[str] = None,
        catch_hook_url: Optional[str] = None,
        allow_private: Optional[bool] = None,
        transport: Optional[httpx.AsyncBaseTransport] = None,
        timeout_seconds: float = 10.0,
    ):
        self.webhook_secret = webhook_secret
        self.catch_hook_url = (
            validate_integration_url(catch_hook_url, allow_private=allow_private)
            if catch_hook_url
            else None
        )
        self._transport = transport
        self.timeout = timeout_seconds

    def get_capabilities(self) -> ProviderCapabilities:
        has_hook = bool(self.catch_hook_url)
        return ProviderCapabilities(
            platform="Zapier",
            adapter_mode="WEBHOOK_ONLY",
            list_workflows=ProviderCapability(
                supported=False,
                reason="Standard Zapier accounts do not expose a public REST endpoint to enumerate Zaps; workflows register via inbound webhook telemetry.",
            ),
            fetch_executions=ProviderCapability(
                supported=False,
                reason="Zapier task history is ingested via Zevkar webhook events rather than remote REST polling.",
            ),
            activate=ProviderCapability(
                supported=False,
                reason="Remote Zap activation requires Zapier Partner / Enterprise CLI API access.",
            ),
            deactivate=ProviderCapability(
                supported=False,
                reason="Remote Zap deactivation is unavailable via standard Zapier webhooks.",
            ),
            trigger=ProviderCapability(
                supported=has_hook,
                reason=(
                    "Triggers configured Zapier Catch Hook webhook URL."
                    if has_hook
                    else "Configure an authenticated Zapier Catch Hook URL on the integration to enable triggering."
                ),
                requires_approval=True,
            ),
            retry_execution=ProviderCapability(
                supported=False,
                reason="Direct Zapier execution replay is unsupported via REST; replay must occur in Zapier Task History.",
            ),
            pause=ProviderCapability(
                supported=False,
                reason="Zapier does not expose a public REST pause endpoint.",
            ),
            resume=ProviderCapability(
                supported=False,
                reason="Zapier does not expose a public REST resume endpoint.",
            ),
            update_settings=ProviderCapability(
                supported=False,
                reason="Zap step and connection configuration must be modified inside Zapier.",
            ),
            manage_schedule=ProviderCapability(
                supported=False,
                reason="Schedule by Zapier configuration is unavailable via public REST API.",
            ),
            webhook_ingest=ProviderCapability(
                supported=True,
                reason="Supports HMAC-signed inbound Zapier webhook failure and execution events.",
            ),
        )

    async def validate_credentials(self) -> Dict[str, Any]:
        return {
            "is_valid": True,
            "status_code": 200,
            "message": "Zapier webhook ingestion listener ready. Remote Zap control requires Zapier Partner API credentials.",
        }

    async def fetch_workflows(self) -> List[Dict[str, Any]]:
        return []

    async def fetch_executions(self, workflow_id: Optional[str] = None) -> List[Dict[str, Any]]:
        return []

    async def trigger_workflow(
        self, workflow_id: str, data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        if not self.catch_hook_url:
            raise NotImplementedError(
                "Zapier catch-hook URL is not configured; cannot trigger Zap remotely."
            )
        kwargs: Dict[str, Any] = {"timeout": self.timeout, "follow_redirects": False}
        if self._transport is not None:
            kwargs["transport"] = self._transport
        payload = {"workflow_id": workflow_id, **(data or {})}
        async with httpx.AsyncClient(**kwargs) as client:
            resp = await client.post(self.catch_hook_url, json=payload)
            if 300 <= resp.status_code < 400:
                raise ValueError("Zapier catch-hook redirect blocked by SSRF security policy.")
            resp.raise_for_status()
            body = resp.json() if resp.content and "json" in (resp.headers.get("content-type", "")) else {"status": "accepted"}
            return sanitize_log_payload(body)

    async def retry_execution(self, execution_id: str) -> Dict[str, Any]:
        raise NotImplementedError(
            "Zapier direct execution retry is unsupported via public REST API; replay inside Zapier Task History."
        )

    def normalize_error(self, raw_payload: Dict[str, Any]) -> NormalizedError:
        error_text = str(raw_payload.get("error") or raw_payload.get("message") or "Zapier step failure")
        lower = error_text.lower()
        if "rate limit" in lower or "throttled" in lower:
            return NormalizedError(
                category="RATE_LIMIT",
                severity="MEDIUM",
                raw_message=error_text,
                clean_summary="Zapier step encountered third-party rate limit.",
                suggested_action="Configure exponential delay step in Zapier.",
                requires_approval=False,
            )
        return NormalizedError(
            category="API_ERROR",
            severity="HIGH",
            raw_message=error_text,
            clean_summary=error_text[:120],
            suggested_action="Check Zap history error stack in Zapier dashboard.",
            requires_approval=True,
        )
