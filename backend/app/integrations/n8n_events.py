import hashlib
import re
from datetime import datetime
from typing import Any, Literal, Optional, cast

from pydantic import BaseModel, ConfigDict


ExecutionStatus = Literal["SUCCESS", "FAILED", "RUNNING", "WAITING", "CANCELED"]

_SECRET_PATTERNS = (
    re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._~+/-]+=*"),
    re.compile(r"(?i)((?:api[_-]?key|token|password|secret|authorization)\s*[:=]\s*)[^\s,;]+"),
    re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
)


def sanitize_text(value: Optional[str], max_length: int = 8000) -> Optional[str]:
    if value is None:
        return None
    clean = value[:max_length]
    clean = _SECRET_PATTERNS[0].sub(r"\1[REDACTED]", clean)
    clean = _SECRET_PATTERNS[1].sub(r"\1[REDACTED]", clean)
    clean = _SECRET_PATTERNS[2].sub("[REDACTED_EMAIL]", clean)
    return clean


class NormalizedN8NEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_workflow_id: str
    workflow_name: Optional[str] = None
    external_execution_id: str
    status: ExecutionStatus
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    stack_trace: Optional[str] = None
    safe_payload: dict[str, Any]

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "NormalizedN8NEvent":
        execution = _mapping(payload.get("execution"))
        workflow = _mapping(payload.get("workflow"))
        execution_data = _mapping(execution.get("data") or payload.get("data"))
        result_data = _mapping(_mapping(execution_data.get("resultData")).get("error"))
        error = _mapping(execution.get("error")) or _mapping(payload.get("error")) or result_data

        workflow_id = (
            payload.get("workflowId")
            or payload.get("workflow_id")
            or workflow.get("id")
            or execution.get("workflowId")
        )
        execution_id = (
            payload.get("executionId")
            or payload.get("execution_id")
            or execution.get("id")
            or payload.get("id")
        )
        if not isinstance(workflow_id, (str, int)) or not isinstance(execution_id, (str, int)):
            raise ValueError("n8n event must include workflow and execution IDs")

        raw_status = (
            payload.get("status")
            or execution.get("status")
            or ("error" if error else None)
        )
        status = _normalize_status(raw_status)
        error_message = error.get("message") or payload.get("error_message")
        if isinstance(error_message, dict):
            error_message = error_message.get("message")
        if error_message is not None and not isinstance(error_message, str):
            error_message = str(error_message)
        if status == "FAILED" and not error_message:
            error_message = "n8n execution failed without an error message"

        started = payload.get("startedAt") or payload.get("started_at") or execution.get("startedAt")
        completed = (
            payload.get("stoppedAt")
            or payload.get("finishedAt")
            or payload.get("completed_at")
            or execution.get("stoppedAt")
        )
        safe_payload = {
            "workflow": {
                "id": str(workflow_id),
                "name": _safe_string(workflow.get("name") or payload.get("workflow_name")),
            },
            "execution": {
                "id": str(execution_id),
                "status": status,
                "started_at": _safe_string(started),
                "completed_at": _safe_string(completed),
                "error_message": sanitize_text(error_message),
                "stack_trace": sanitize_text(_error_stack(error), 12000),
            },
        }
        return cls(
            external_workflow_id=str(workflow_id),
            workflow_name=_safe_string(workflow.get("name") or payload.get("workflow_name")),
            external_execution_id=str(execution_id),
            status=status,
            started_at=started,
            completed_at=completed,
            error_message=sanitize_text(error_message),
            stack_trace=sanitize_text(_error_stack(error), 12000),
            safe_payload=safe_payload,
        )

    def idempotency_key(self, integration_id: str) -> str:
        stable_identity = "|".join(
            (
                integration_id,
                self.external_workflow_id,
                self.external_execution_id,
                self.status,
                self.completed_at.isoformat() if self.completed_at else "",
                self.started_at.isoformat() if self.started_at else "",
            )
        )
        return hashlib.sha256(stable_identity.encode("utf-8")).hexdigest()


def _mapping(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _safe_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    return sanitize_text(str(value), 500)


def _error_stack(error: dict[str, Any]) -> Optional[str]:
    stack = error.get("stackTrace") or error.get("stack") or error.get("stack_trace")
    return stack if isinstance(stack, str) else None


def _normalize_status(value: Any) -> ExecutionStatus:
    if not isinstance(value, str):
        raise ValueError("n8n event status is required")
    normalized = value.strip().upper()
    aliases = {
        "SUCCESS": "SUCCESS",
        "SUCCEEDED": "SUCCESS",
        "ERROR": "FAILED",
        "FAILED": "FAILED",
        "FAILURE": "FAILED",
        "RUNNING": "RUNNING",
        "WAITING": "WAITING",
        "CANCELED": "CANCELED",
        "CANCELLED": "CANCELED",
    }
    status = aliases.get(normalized)
    if status is None:
        raise ValueError("n8n event has an unsupported execution status")
    return cast(ExecutionStatus, status)
