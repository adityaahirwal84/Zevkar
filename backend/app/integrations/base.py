from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class NormalizedError(BaseModel):
    category: str
    severity: str
    raw_message: str
    clean_summary: str
    suggested_action: str
    requires_approval: bool


class ProviderCapability(BaseModel):
    supported: bool = False
    reason: str = ""
    requires_approval: bool = False


class ProviderCapabilities(BaseModel):
    platform: str
    adapter_mode: str = "READ_ONLY"  # FULL_REST, PARTIAL_REST, WEBHOOK_ONLY, HTTP_CONTROL
    list_workflows: ProviderCapability = Field(default_factory=ProviderCapability)
    fetch_executions: ProviderCapability = Field(default_factory=ProviderCapability)
    activate: ProviderCapability = Field(default_factory=ProviderCapability)
    deactivate: ProviderCapability = Field(default_factory=ProviderCapability)
    trigger: ProviderCapability = Field(default_factory=ProviderCapability)
    retry_execution: ProviderCapability = Field(default_factory=ProviderCapability)
    pause: ProviderCapability = Field(default_factory=ProviderCapability)
    resume: ProviderCapability = Field(default_factory=ProviderCapability)
    update_settings: ProviderCapability = Field(default_factory=ProviderCapability)
    manage_schedule: ProviderCapability = Field(default_factory=ProviderCapability)
    webhook_ingest: ProviderCapability = Field(default_factory=ProviderCapability)


class WorkflowControlResult(BaseModel):
    success: bool
    action: str
    status: str  # SUCCESSFUL, FAILED, UNSUPPORTED
    external_workflow_id: Optional[str] = None
    external_execution_id: Optional[str] = None
    normalized_status: Optional[str] = None  # ACTIVE, INACTIVE, PAUSED, FAILED, UNKNOWN
    verified_remote_state: Optional[Dict[str, Any]] = None
    sanitized_response: Dict[str, Any] = Field(default_factory=dict)
    error_message: Optional[str] = None


class UnsupportedControlActionError(NotImplementedError):
    """Raised explicitly when an automation provider does not support a control action."""

    def __init__(self, platform: str, action: str, reason: str):
        self.platform = platform
        self.action = action
        self.reason = reason
        super().__init__(f"[{platform}] Action '{action}' is unavailable: {reason}")


class BaseIntegrationAdapter(ABC):
    """
    Modular abstract interface for automation platform adapters.
    Guarantees explicit capability declaration and safe error semantics across
    n8n, Make.com, Zapier, custom Python/FastAPI automations, and future providers.
    """

    platform_name: str = "unknown"

    @abstractmethod
    def get_capabilities(self) -> ProviderCapabilities:
        """Declare exact supported vs unsupported operations for this provider."""
        pass

    @abstractmethod
    async def validate_credentials(self) -> Dict[str, Any]:
        """Verify API key, base URL, and reachability."""
        pass

    @abstractmethod
    async def fetch_workflows(self) -> List[Dict[str, Any]]:
        """Fetch list of monitored workflows from remote provider."""
        pass

    @abstractmethod
    async def fetch_executions(self, workflow_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Fetch execution records and error logs."""
        pass

    @abstractmethod
    async def retry_execution(self, execution_id: str) -> Dict[str, Any]:
        """Trigger execution retry where supported by the provider API."""
        pass

    @abstractmethod
    def normalize_error(self, raw_payload: Dict[str, Any]) -> NormalizedError:
        """Parse provider-specific error into unified failure schema."""
        pass

    async def get_workflow_details(self, workflow_id: str) -> Dict[str, Any]:
        raise UnsupportedControlActionError(
            self.platform_name,
            "get_workflow_details",
            "Remote single-workflow inspection is not supported by this adapter.",
        )

    async def activate_workflow(self, workflow_id: str) -> WorkflowControlResult:
        cap = self.get_capabilities().activate
        raise UnsupportedControlActionError(
            self.platform_name,
            "ACTIVATE",
            cap.reason or "Workflow activation is not supported by this provider.",
        )

    async def deactivate_workflow(self, workflow_id: str) -> WorkflowControlResult:
        cap = self.get_capabilities().deactivate
        raise UnsupportedControlActionError(
            self.platform_name,
            "DEACTIVATE",
            cap.reason or "Workflow deactivation is not supported by this provider.",
        )

    async def trigger_workflow(
        self, workflow_id: str, data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        cap = self.get_capabilities().trigger
        raise UnsupportedControlActionError(
            self.platform_name,
            "TRIGGER",
            cap.reason or "Manual workflow execution trigger is not supported by this provider.",
        )

    async def pause_workflow(self, workflow_id: str) -> WorkflowControlResult:
        cap = self.get_capabilities().pause
        raise UnsupportedControlActionError(
            self.platform_name,
            "PAUSE",
            cap.reason or "Pause is not supported by this provider.",
        )

    async def resume_workflow(self, workflow_id: str) -> WorkflowControlResult:
        cap = self.get_capabilities().resume
        raise UnsupportedControlActionError(
            self.platform_name,
            "RESUME",
            cap.reason or "Resume is not supported by this provider.",
        )

    async def update_workflow_settings(
        self, workflow_id: str, settings_patch: Dict[str, Any]
    ) -> WorkflowControlResult:
        cap = self.get_capabilities().update_settings
        raise UnsupportedControlActionError(
            self.platform_name,
            "UPDATE_SETTINGS",
            cap.reason or "Remote workflow settings update is not supported by this provider.",
        )

    async def manage_schedule(
        self, workflow_id: str, schedule_config: Dict[str, Any]
    ) -> WorkflowControlResult:
        cap = self.get_capabilities().manage_schedule
        raise UnsupportedControlActionError(
            self.platform_name,
            "MANAGE_SCHEDULE",
            cap.reason or "Remote schedule management is not supported by this provider.",
        )
