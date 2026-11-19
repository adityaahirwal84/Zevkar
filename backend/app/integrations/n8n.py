import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple
import httpx
from app.core.config import settings
from app.integrations.base import (
    BaseIntegrationAdapter,
    NormalizedError,
    ProviderCapabilities,
    ProviderCapability,
    WorkflowControlResult,
)
from app.core.security import sanitize_log_payload, validate_integration_url
from app.lib.classifier import classify_error

logger = logging.getLogger("n8n_integration")
_SECRET_TOKEN_RE = re.compile(
    r"(Bearer\s+[A-Za-z0-9\-._~+/]+=*|x-n8n-api-key[\"']?\s*[:=]\s*[\"']?[^\s\"',}]+|sk_[a-zA-Z0-9_]+|whsec_[a-zA-Z0-9_]+)",
    re.IGNORECASE,
)


def redact_sensitive_text(text: Optional[str]) -> Optional[str]:
    if not text:
        return text
    return _SECRET_TOKEN_RE.sub("[REDACTED_SECRET]", str(text))


def parse_utc_datetime(value: Optional[str]) -> Optional[datetime]:
    """Parses ISO-8601 timestamps from n8n into timezone-aware UTC datetimes."""
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        cleaned = str(value).strip()
        if cleaned.endswith("Z"):
            cleaned = cleaned[:-1] + "+00:00"
        dt = datetime.fromisoformat(cleaned)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def extract_n8n_error_details(raw_exec: Dict[str, Any]) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """Extracts structured error message and node payload from an n8n execution object."""
    data_block = raw_exec.get("data") if isinstance(raw_exec.get("data"), dict) else {}
    result_data = data_block.get("resultData") if isinstance(data_block.get("resultData"), dict) else {}
    err_obj = result_data.get("error") if isinstance(result_data.get("error"), dict) else None

    if err_obj:
        node_name = None
        if isinstance(err_obj.get("node"), dict):
            node_name = err_obj["node"].get("name")
        elif isinstance(result_data.get("lastNodeExecuted"), str):
            node_name = result_data.get("lastNodeExecuted")

        msg = err_obj.get("message") or err_obj.get("description") or "n8n execution failed"
        if node_name:
            msg = f"[{node_name}] {msg}"

        payload = {
            "node": node_name,
            "name": err_obj.get("name"),
            "httpCode": err_obj.get("httpCode"),
            "description": err_obj.get("description"),
            "context": err_obj.get("context"),
        }
        return str(msg), payload

    # Fallback if execution failed without detailed resultData.error
    raw_status = str(raw_exec.get("status") or "").lower()
    if raw_status in ("error", "crashed", "failed"):
        last_node = result_data.get("lastNodeExecuted")
        prefix = f"[{last_node}] " if last_node else ""
        return f"{prefix}n8n workflow execution ended with status '{raw_status}'.", {
            "node": last_node,
            "status": raw_status,
        }

    return None, None


def normalize_n8n_execution(raw_exec: Dict[str, Any]) -> Dict[str, Any]:
    """Normalizes raw n8n execution JSON into Zevkar Execution fields (all timestamps UTC)."""
    raw_status = str(raw_exec.get("status") or "").lower()
    finished = raw_exec.get("finished")

    if not raw_status:
        if finished is True:
            raw_status = "success"
        elif finished is False:
            raw_status = "running"

    if raw_status == "success":
        status = "SUCCESS"
    elif raw_status in ("error", "crashed", "failed"):
        status = "FAILED"
    elif raw_status in ("canceled", "cancelled"):
        status = "TIMED_OUT"
    elif raw_status in ("running", "waiting", "new"):
        status = "RUNNING"
    else:
        status = "SUCCESS" if finished else "RUNNING"

    started_at = parse_utc_datetime(raw_exec.get("startedAt")) or datetime.now(timezone.utc)
    finished_at = parse_utc_datetime(raw_exec.get("stoppedAt"))

    duration_ms = 0
    if finished_at and started_at:
        duration_ms = max(0, int((finished_at - started_at).total_seconds() * 1000))

    error_message, error_payload = extract_n8n_error_details(raw_exec)
    if status == "FAILED" and not error_message:
        error_message = "n8n execution failed without detailed error message."

    return {
        "external_execution_id": str(raw_exec.get("id") or ""),
        "external_workflow_id": str(raw_exec.get("workflowId") or ""),
        "status": status,
        "raw_status": raw_status or status.lower(),
        "started_at": started_at,
        "finished_at": finished_at,
        "duration_ms": duration_ms,
        "mode": raw_exec.get("mode"),
        "error_message": error_message,
        "error_payload": error_payload,
        "retry_of": raw_exec.get("retryOf"),
    }


class N8NClient(BaseIntegrationAdapter):
    """
    Production client adapter for official n8n instance REST APIs.
    Supports SSRF validation, cursor pagination, rate-limit backoff, workflow & execution sync,
    control actions (activate/deactivate/trigger/retry/settings), and explicit capability reporting.
    """

    platform_name = "n8n"

    def get_capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            platform="n8n",
            adapter_mode="FULL_REST",
            list_workflows=ProviderCapability(supported=True, reason="n8n REST v1 GET /workflows"),
            fetch_executions=ProviderCapability(supported=True, reason="n8n REST v1 GET /executions"),
            activate=ProviderCapability(supported=True, reason="n8n REST v1 POST /workflows/{id}/activate", requires_approval=False),
            deactivate=ProviderCapability(supported=True, reason="n8n REST v1 POST /workflows/{id}/deactivate", requires_approval=True),
            trigger=ProviderCapability(supported=True, reason="n8n REST v1 POST /workflows/{id}/run", requires_approval=False),
            retry_execution=ProviderCapability(supported=True, reason="n8n REST v1 POST /executions/{id}/retry", requires_approval=False),
            pause=ProviderCapability(
                supported=False,
                reason="n8n uses active/inactive states rather than a separate pause endpoint; use Deactivate.",
            ),
            resume=ProviderCapability(
                supported=False,
                reason="Use Activate on deactivated n8n workflows.",
            ),
            update_settings=ProviderCapability(
                supported=True,
                reason="n8n REST v1 PUT /workflows/{id} settings merge",
                requires_approval=True,
            ),
            manage_schedule=ProviderCapability(
                supported=False,
                reason="n8n schedule triggers live inside workflow trigger nodes rather than a standalone schedule REST resource.",
            ),
            webhook_ingest=ProviderCapability(supported=True, reason="HMAC-signed Zevkar webhook ingestion"),
        )

    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout_seconds: float = 15.0,
        max_retries: Optional[int] = None,
        allow_private: Optional[bool] = None,
        transport: Optional[httpx.AsyncBaseTransport] = None,
        sleep_fn: Optional[Callable[[float], Any]] = None,
    ):
        validated_url = validate_integration_url(base_url, allow_private=allow_private)
        clean_url = validated_url.rstrip("/")
        if not clean_url.endswith("/api/v1"):
            clean_url = f"{clean_url}/api/v1"
        self.base_url = clean_url
        self.api_key = api_key
        self.timeout = timeout_seconds
        self.max_retries = max_retries if max_retries is not None else settings.N8N_MAX_RETRIES
        self._transport = transport
        self._sleep = sleep_fn or asyncio.sleep

    def _get_headers(self) -> Dict[str, str]:
        return {
            "X-N8N-API-KEY": self.api_key,
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "Zevkar/1.0",
        }

    def _build_client(self) -> httpx.AsyncClient:
        kwargs: Dict[str, Any] = {"timeout": self.timeout, "follow_redirects": False}
        if self._transport is not None:
            kwargs["transport"] = self._transport
        return httpx.AsyncClient(**kwargs)

    async def _request_with_retry(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        json_body: Optional[Dict[str, Any]] = None,
    ) -> httpx.Response:
        url = f"{self.base_url}{path}"
        last_exc: Optional[Exception] = None

        async with self._build_client() as client:
            for attempt in range(self.max_retries + 1):
                try:
                    resp = await client.request(
                        method,
                        url,
                        headers=self._get_headers(),
                        params=params,
                        json=json_body,
                    )

                    if 300 <= resp.status_code < 400:
                        raise ValueError(
                            f"n8n endpoint redirect (HTTP {resp.status_code}) blocked by SSRF security policy."
                        )

                    if resp.status_code == 429 or resp.status_code in (502, 503, 504):
                        if attempt < self.max_retries:
                            retry_after_hdr = resp.headers.get("Retry-After")
                            try:
                                delay = float(retry_after_hdr) if retry_after_hdr else float(2 ** attempt)
                            except ValueError:
                                delay = float(2 ** attempt)
                            delay = min(max(delay, 0.05), 30.0)
                            logger.warning(
                                "n8n API returned HTTP %s on %s; backing off %.2fs (attempt %d/%d)",
                                resp.status_code,
                                path,
                                delay,
                                attempt + 1,
                                self.max_retries,
                            )
                            await self._sleep(delay)
                            continue

                    resp.raise_for_status()
                    return resp
                except (httpx.TimeoutException, httpx.ConnectError) as exc:
                    last_exc = exc
                    if attempt < self.max_retries:
                        delay = min(float(2 ** attempt), 15.0)
                        logger.warning(
                            "n8n transient network error on %s; retrying in %.2fs (attempt %d/%d)",
                            path,
                            delay,
                            attempt + 1,
                            self.max_retries,
                        )
                        await self._sleep(delay)
                        continue
                    raise
                except httpx.HTTPStatusError as exc:
                    last_exc = exc
                    raise

        if last_exc:
            raise last_exc
        raise RuntimeError("Unexpected n8n request loop termination")

    async def validate_credentials(self) -> Dict[str, Any]:
        """Validates API key and instance reachability by probing /workflows."""
        try:
            await self._request_with_retry("GET", "/workflows", params={"limit": 1})
            return {
                "is_valid": True,
                "status_code": 200,
                "message": "Connection and API key verified successfully.",
            }
        except httpx.HTTPStatusError as exc:
            code = exc.response.status_code
            if code in (401, 403):
                return {
                    "is_valid": False,
                    "status_code": code,
                    "message": "Authentication failed. Check your n8n API key permissions.",
                }
            return {
                "is_valid": False,
                "status_code": code,
                "message": f"Unexpected response from n8n (HTTP {code}).",
            }
        except httpx.ConnectError:
            return {"is_valid": False, "status_code": 503, "message": "Failed to connect to n8n host URL."}
        except httpx.TimeoutException:
            return {"is_valid": False, "status_code": 504, "message": "Connection to n8n instance timed out."}
        except Exception as e:
            return {"is_valid": False, "status_code": 500, "message": f"Internal connection error: {str(e)}"}

    async def fetch_workflows(
        self,
        active_only: bool = False,
        limit: int = 100,
        max_pages: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Fetches all workflows across cursor-paginated n8n API responses."""
        all_workflows: List[Dict[str, Any]] = []
        cursor: Optional[str] = None
        seen_cursors = set()
        pages_limit = max_pages if max_pages is not None else settings.N8N_MAX_SYNC_PAGES

        for _ in range(pages_limit):
            params: Dict[str, Any] = {"limit": limit}
            if active_only:
                params["active"] = "true"
            if cursor:
                params["cursor"] = cursor

            resp = await self._request_with_retry("GET", "/workflows", params=params)
            body = resp.json()
            batch = body.get("data", []) if isinstance(body, dict) else []
            if not isinstance(batch, list):
                break
            all_workflows.extend(batch)

            next_cursor = body.get("nextCursor") if isinstance(body, dict) else None
            if not next_cursor or next_cursor in seen_cursors:
                break
            seen_cursors.add(next_cursor)
            cursor = next_cursor

        return all_workflows

    async def fetch_executions(
        self,
        workflow_id: Optional[str] = None,
        limit: int = 100,
        include_data: bool = True,
        since_started_at: Optional[datetime] = None,
        start_cursor: Optional[str] = None,
        max_pages: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Fetches execution history across paginated n8n responses.
        Stops early once all executions in a page predate `since_started_at` watermark.
        """
        executions, _ = await self.fetch_executions_with_checkpoint(
            workflow_id=workflow_id,
            limit=limit,
            include_data=include_data,
            since_started_at=since_started_at,
            start_cursor=start_cursor,
            max_pages=max_pages,
        )
        return executions

    async def fetch_executions_with_checkpoint(
        self,
        workflow_id: Optional[str] = None,
        limit: int = 100,
        include_data: bool = True,
        since_started_at: Optional[datetime] = None,
        start_cursor: Optional[str] = None,
        max_pages: Optional[int] = None,
    ) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        """
        Cursor-paginated execution fetcher returning (executions, latest_next_cursor).
        Handles incremental watermarks without missing out-of-order or in-flight executions.
        """
        collected: List[Dict[str, Any]] = []
        cursor = start_cursor
        seen_cursors = set()
        pages_limit = max_pages if max_pages is not None else settings.N8N_MAX_SYNC_PAGES
        last_cursor: Optional[str] = None

        for _ in range(pages_limit):
            params: Dict[str, Any] = {
                "limit": limit,
                "includeData": "true" if include_data else "false",
            }
            if workflow_id:
                params["workflowId"] = workflow_id
            if cursor:
                params["cursor"] = cursor

            resp = await self._request_with_retry("GET", "/executions", params=params)
            body = resp.json()
            batch = body.get("data", []) if isinstance(body, dict) else []
            if not isinstance(batch, list) or len(batch) == 0:
                break

            reached_watermark = False
            for item in batch:
                started = parse_utc_datetime(item.get("startedAt"))
                if since_started_at and started and started < since_started_at:
                    reached_watermark = True
                    continue
                collected.append(item)

            next_cursor = body.get("nextCursor") if isinstance(body, dict) else None
            last_cursor = next_cursor
            if reached_watermark or not next_cursor or next_cursor in seen_cursors:
                break
            seen_cursors.add(next_cursor)
            cursor = next_cursor

        return collected, last_cursor

    async def get_execution(self, execution_id: str, include_data: bool = True) -> Dict[str, Any]:
        params = {"includeData": "true" if include_data else "false"}
        resp = await self._request_with_retry("GET", f"/executions/{execution_id}", params=params)
        return resp.json()

    async def retry_execution(self, execution_id: str, load_workflow: bool = True) -> Dict[str, Any]:
        """Safely triggers an execution retry on n8n (supported on n8n v1+)."""
        payload = {"loadWorkflow": load_workflow}
        resp = await self._request_with_retry("POST", f"/executions/{execution_id}/retry", json_body=payload)
        return resp.json()

    async def get_workflow_details(self, workflow_id: str) -> Dict[str, Any]:
        """Fetches single workflow definition and active/schedule metadata from n8n."""
        resp = await self._request_with_retry("GET", f"/workflows/{workflow_id}")
        data = resp.json()
        return data if isinstance(data, dict) else {}

    async def activate_workflow(self, workflow_id: str) -> WorkflowControlResult:
        """Activates an n8n workflow and verifies remote `active` state."""
        resp = await self._request_with_retry("POST", f"/workflows/{workflow_id}/activate", json_body={})
        raw_body = resp.json() if resp.content else {}
        if isinstance(raw_body, dict) and "active" in raw_body and not bool(raw_body.get("active")):
            raise ValueError("n8n responded to activate call but reported active=false.")
        return WorkflowControlResult(
            success=True,
            action="ACTIVATE",
            status="SUCCESSFUL",
            external_workflow_id=workflow_id,
            normalized_status="ACTIVE",
            verified_remote_state={"active": True},
            sanitized_response=sanitize_log_payload(raw_body) if isinstance(raw_body, dict) else {"raw": raw_body},
        )

    async def deactivate_workflow(self, workflow_id: str) -> WorkflowControlResult:
        """Deactivates an n8n workflow and verifies remote `active` state."""
        resp = await self._request_with_retry("POST", f"/workflows/{workflow_id}/deactivate", json_body={})
        raw_body = resp.json() if resp.content else {}
        if isinstance(raw_body, dict) and "active" in raw_body and bool(raw_body.get("active")):
            raise ValueError("n8n responded to deactivate call but reported active=true.")
        return WorkflowControlResult(
            success=True,
            action="DEACTIVATE",
            status="SUCCESSFUL",
            external_workflow_id=workflow_id,
            normalized_status="INACTIVE",
            verified_remote_state={"active": False},
            sanitized_response=sanitize_log_payload(raw_body) if isinstance(raw_body, dict) else {"raw": raw_body},
        )

    async def update_workflow_settings(
        self, workflow_id: str, settings_patch: Dict[str, Any]
    ) -> WorkflowControlResult:
        """Safely merges supported workflow settings via GET + PUT /workflows/{id}."""
        if not isinstance(settings_patch, dict) or not settings_patch:
            raise ValueError("settings_patch must be a non-empty JSON object.")
        current = await self.get_workflow_details(workflow_id)
        if not isinstance(current, dict) or not current.get("name"):
            raise ValueError("Remote n8n workflow definition missing required metadata for safe update.")
        merged_settings = dict(current.get("settings") or {})
        merged_settings.update(settings_patch)
        put_payload = {
            "name": current["name"],
            "nodes": current.get("nodes") or [],
            "connections": current.get("connections") or {},
            "settings": merged_settings,
        }
        resp = await self._request_with_retry("PUT", f"/workflows/{workflow_id}", json_body=put_payload)
        raw_body = resp.json() if resp.content else {}
        return WorkflowControlResult(
            success=True,
            action="UPDATE_SETTINGS",
            status="SUCCESSFUL",
            external_workflow_id=workflow_id,
            normalized_status="ACTIVE" if current.get("active", True) else "INACTIVE",
            verified_remote_state={"settings": merged_settings},
            sanitized_response=sanitize_log_payload(raw_body) if isinstance(raw_body, dict) else {"raw": raw_body},
        )

    async def trigger_workflow(self, workflow_id: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Re-executes an eligible n8n workflow via POST /workflows/{id}/run."""
        payload = data or {}
        resp = await self._request_with_retry("POST", f"/workflows/{workflow_id}/run", json_body=payload)
        return resp.json()

    def normalize_error(self, raw_payload: Dict[str, Any]) -> NormalizedError:
        msg, _ = extract_n8n_error_details(raw_payload)
        raw_message = msg or str(raw_payload.get("error") or raw_payload.get("message") or "n8n workflow execution failed")
        classified = classify_error(raw_message)
        return NormalizedError(
            category=classified["category"],
            severity=classified["severity"],
            raw_message=raw_message,
            clean_summary=raw_message[:140],
            suggested_action=classified["suggested_action"],
            requires_approval=classified["requires_approval"],
        )
