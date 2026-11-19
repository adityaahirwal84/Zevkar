from typing import Any, Callable, Dict, Optional
from app.core.security import decrypt_secret
from app.integrations.base import BaseIntegrationAdapter, ProviderCapabilities
from app.integrations.custom_python import CustomAutomationAdapter
from app.integrations.make import MakeClient
from app.integrations.n8n import N8NClient
from app.integrations.zapier import ZapierClient
from app.models.entities import Integration

AdapterFactory = Callable[[Integration], BaseIntegrationAdapter]
_CUSTOM_REGISTRY: Dict[str, AdapterFactory] = {}


def register_provider_adapter(platform: str, factory: AdapterFactory) -> None:
    """Extension hook allowing new automation providers to register without modifying core engine code."""
    _CUSTOM_REGISTRY[platform.strip().lower()] = factory


def build_adapter_for_integration(integration: Integration) -> BaseIntegrationAdapter:
    """Resolves a connected Integration record into its concrete modular adapter."""
    platform_key = (integration.platform or "n8n").strip().lower()
    if platform_key in _CUSTOM_REGISTRY:
        return _CUSTOM_REGISTRY[platform_key](integration)

    decrypted_key = decrypt_secret(integration.encrypted_credentials) or ""
    decrypted_secret = decrypt_secret(integration.webhook_secret_encrypted) or ""

    if platform_key == "n8n":
        if not integration.instance_url or not decrypted_key:
            raise ValueError("n8n integration is missing instance_url or API key credentials.")
        return N8NClient(base_url=integration.instance_url, api_key=decrypted_key)

    if platform_key == "make":
        if not decrypted_key and not integration.instance_url:
            raise ValueError("Make.com integration is missing API token credentials.")
        return MakeClient(api_token=decrypted_key, instance_url=integration.instance_url)

    if platform_key == "zapier":
        return ZapierClient(
            webhook_secret=decrypted_secret or None,
            catch_hook_url=integration.instance_url or None,
        )

    if platform_key in ("custom_python", "custom_node", "custom", "fastapi"):
        return CustomAutomationAdapter(
            platform=integration.platform,
            instance_url=integration.instance_url,
            api_key=decrypted_key or None,
            webhook_secret=decrypted_secret or None,
        )

    # Unknown future provider -> fail-closed read-only/webhook adapter
    return CustomAutomationAdapter(
        platform=integration.platform,
        instance_url=None,
    )


def get_default_capabilities_for_platform(
    platform: str,
    integration: Optional[Integration] = None,
) -> ProviderCapabilities:
    """
    Returns declared provider capabilities safely even when an integration record
    has missing remote credentials (in which case remote mutations are disabled).
    """
    if integration is not None:
        try:
            return build_adapter_for_integration(integration).get_capabilities()
        except Exception as exc:
            caps = CustomAutomationAdapter(platform=platform, instance_url=None).get_capabilities()
            caps.platform = platform
            caps.adapter_mode = "MISCONFIGURED"
            caps.activate.reason = str(exc)
            caps.deactivate.reason = str(exc)
            caps.trigger.reason = str(exc)
            caps.retry_execution.reason = str(exc)
            return caps

    key = (platform or "unknown").strip().lower()
    if key == "n8n":
        # Create dummy valid structure safely only to inspect static capability schema
        dummy = N8NClient.__new__(N8NClient)
        dummy.platform_name = "n8n"
        return dummy.get_capabilities()
    if key == "make":
        dummy = MakeClient.__new__(MakeClient)
        dummy.platform_name = "Make"
        return dummy.get_capabilities()
    if key == "zapier":
        return ZapierClient(catch_hook_url=None).get_capabilities()
    return CustomAutomationAdapter(platform=platform, instance_url=None).get_capabilities()
