import asyncio
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional
from google import genai
from app.core.config import settings
from app.core.security import sanitize_log_payload
from app.lib.classifier import classify_error, is_financial_or_destructive
from app.schemas.pydantic_models import AIDiagnosisSchema

logger = logging.getLogger("gemini_engine")
_SENSITIVE_TEXT_RE = re.compile(
    r"(Bearer\s+[A-Za-z0-9\-._~+/]+=*|https?://[^\s@]+:[^\s@]+@[^\s]+|sk_[a-zA-Z0-9_]+|whsec_[a-zA-Z0-9_]+|api[_-]?key\s*[:=]\s*[^\s,;\"']+)",
    re.IGNORECASE,
)


def _redact_text(value: Optional[str]) -> str:
    if not value:
        return ""
    return _SENSITIVE_TEXT_RE.sub("[REDACTED]", str(value))


def build_deterministic_recommendation(
    error_category: str,
    workflow_name: str,
    error_message: str,
) -> Dict[str, Any]:
    """Deterministic strategy and risk recommendation grounded in error semantics."""
    is_sensitive = is_financial_or_destructive(workflow_name)
    cat = error_category.upper()

    if cat == "AUTH_FAILURE":
        return {
            "is_recoverable": True,
            "suggested_strategy": "MANUAL_RECOVERY",
            "recommendation_reason": "Authentication token or API key was rejected. Blind retry will keep failing until credentials are rotated.",
            "expected_risk_level": "HIGH",
            "required_user_action": "Rotate expired API key or refresh OAuth token in integration credentials, then approve manual retry.",
            "max_recommended_retries": 1,
        }
    if cat == "RATE_LIMIT":
        return {
            "is_recoverable": True,
            "suggested_strategy": "RETRY_EXPONENTIAL_BACKOFF",
            "recommendation_reason": "Upstream rate limit (HTTP 429) is transient and typically clears after exponential cooldown.",
            "expected_risk_level": "HIGH" if is_sensitive else "MEDIUM",
            "required_user_action": "Approve delayed retry with exponential backoff; verify no downstream duplicate writes occur.",
            "max_recommended_retries": 3,
        }
    if cat in ("SCHEMA_MISMATCH", "INVALID_PAYLOAD"):
        return {
            "is_recoverable": False,
            "suggested_strategy": "MARK_NON_RECOVERABLE",
            "recommendation_reason": "Payload structure or schema validation failed. Replaying the exact same payload will fail identically.",
            "expected_risk_level": "MEDIUM",
            "required_user_action": "Fix upstream payload mapping or webhook schema contract and mark this execution non-recoverable.",
            "max_recommended_retries": 0,
        }
    if cat == "DATABASE_FAILURE":
        return {
            "is_recoverable": True,
            "suggested_strategy": "ESCALATE_HUMAN" if is_sensitive else "MANUAL_RECOVERY",
            "recommendation_reason": "Database lock or constraint violation requires human inspection to avoid corrupting or duplicating records.",
            "expected_risk_level": "CRITICAL",
            "required_user_action": "Inspect DB lock/constraint state and confirm idempotency before approving recovery.",
            "max_recommended_retries": 1,
        }
    if cat in ("TIMEOUT", "NETWORK_FAILURE"):
        return {
            "is_recoverable": True,
            "suggested_strategy": "RETRY_AFTER_DELAY",
            "recommendation_reason": "Transient network or timeout error detected. A delayed retry after cooldown is appropriate once downstream health is confirmed.",
            "expected_risk_level": "HIGH" if is_sensitive else "MEDIUM",
            "required_user_action": "Verify remote API finished or rolled back cleanly so retrying does not duplicate external side effects.",
            "max_recommended_retries": 2,
        }
    return {
        "is_recoverable": True,
        "suggested_strategy": "ESCALATE_HUMAN" if is_sensitive else "MANUAL_RECOVERY",
        "recommendation_reason": f"Unhandled {cat} failure requires review before dispatching external re-execution.",
        "expected_risk_level": "CRITICAL" if is_sensitive else "HIGH",
        "required_user_action": "Inspect execution node payload and confirm safe to re-execute.",
        "max_recommended_retries": 1,
    }


def _extract_verified_facts(
    workflow_name: str,
    platform: str,
    execution_id: str,
    safe_error: str,
    sanitized_meta: Optional[Dict[str, Any]],
    error_category: str,
) -> List[str]:
    facts = [
        f"Workflow '{workflow_name}' on {platform} reported execution failure ID '{execution_id}'.",
        f"Classified failure signature as {error_category}: {safe_error[:180]}",
    ]
    if isinstance(sanitized_meta, dict):
        if sanitized_meta.get("node"):
            facts.append(f"Observed failing execution node: '{sanitized_meta['node']}'.")
        if sanitized_meta.get("httpCode"):
            facts.append(f"Upstream API returned HTTP status code {sanitized_meta['httpCode']}.")
    return facts


class GeminiDiagnosisEngine:
    def __init__(self, model_name: Optional[str] = None):
        self.api_key = settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY")
        self.model_name = model_name or settings.GEMINI_MODEL or "gemini-4-hydrogen"
        self.client = None
        if self.api_key:
            try:
                self.client = genai.Client(
                    api_key=self.api_key,
                    http_options={"headers": {"User-Agent": "aistudio-build"}},
                )
            except Exception as e:
                logger.error("Failed to initialize Gemini client: %s", e)

    async def diagnose_incident(
        self,
        workflow_name: str,
        platform: str,
        client_name: str,
        error_message: str,
        execution_id: str,
        execution_metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Diagnoses automation incident and produces structured recovery recommendations
        using Gemini with strict AIDiagnosisSchema validation.
        Credentials and sensitive payload fields are stripped prior to prompt serialization.
        AI recommendations NEVER execute directly; sensitive flows always require human approval.
        """
        fallback_reason: Optional[str] = None
        safe_error = _redact_text(error_message)
        sanitized_meta = sanitize_log_payload(execution_metadata) if execution_metadata else None
        meta_snippet = ""
        if sanitized_meta:
            try:
                meta_snippet = _redact_text(json.dumps(sanitized_meta, default=str)[:800])
            except Exception:
                meta_snippet = _redact_text(str(sanitized_meta)[:800])

        is_sensitive_flow = is_financial_or_destructive(workflow_name)

        if self.client:
            try:
                prompt = f"""You are the Principal Reliability Architect for Zevkar, an AI-powered Automation Intelligence Platform.
Perform an in-depth root cause diagnosis and safe recovery recommendation for this workflow failure.
NEVER recommend bypassing human approval for financial, billing, CRM mutation, email broadcast, auth, or database failures.
Explicitly separate directly observed verified facts from inferred AI hypotheses.

Workflow Name: {workflow_name}
Platform: {platform}
Client Name: {client_name}
Execution ID: {execution_id}
Sanitized Error Message:
{safe_error}
Sanitized Execution Metadata:
{meta_snippet or "None"}

Return a strictly formatted JSON object matching this exact schema:
- error_category: One of [AUTH_FAILURE, API_ERROR, RATE_LIMIT, TIMEOUT, DATABASE_FAILURE, SCHEMA_MISMATCH, INVALID_PAYLOAD, NETWORK_FAILURE, LLM_FAILURE]
- severity: LOW | MEDIUM | HIGH | CRITICAL
- root_cause: Concise 1-2 sentence engineering diagnosis
- simple_explanation: High-level plain English summary suitable for non-technical client stakeholders
- technical_explanation: Deep-dive technical breakdown with HTTP semantics, n8n node context, or transaction insights
- recommended_actions: Array of 3-4 specific remediation steps
- verified_facts: Array of strictly observed facts directly evidenced in the execution error and metadata
- ai_hypotheses: Array of probable root-cause hypotheses or downstream assumptions requiring operator verification
- suggested_recovery: Safe recovery instructions
- requires_human_approval: boolean (MUST be true for financial, customer-facing, auth, database, or non-idempotent failures)
- is_recoverable: boolean (false if payload/schema permanently broken or non-retryable)
- suggested_strategy: One of [RETRY_EXECUTION, REEXECUTE_WORKFLOW, RETRY_AFTER_DELAY, RETRY_EXPONENTIAL_BACKOFF, MANUAL_RECOVERY, MARK_NON_RECOVERABLE, ESCALATE_HUMAN]
- recommendation_reason: Why this recovery strategy was chosen and what side-effect risks exist
- expected_risk_level: LOW | MEDIUM | HIGH | CRITICAL
- required_user_action: Specific operator verification step required before/after recovery
- max_recommended_retries: integer between 0 and 10 (0 if non-recoverable or manual-only)
- confidence: float between 0.0 and 1.0
"""

                def _call_sync():
                    return self.client.models.generate_content(
                        model=self.model_name,
                        contents=prompt,
                        config={"response_mime_type": "application/json"},
                    )

                response = await asyncio.wait_for(asyncio.to_thread(_call_sync), timeout=15.0)
                parsed = json.loads(response.text)
                validated = AIDiagnosisSchema(**parsed)

                enforced_approval = bool(
                    validated.requires_human_approval
                    or is_sensitive_flow
                    or validated.error_category in ("AUTH_FAILURE", "DATABASE_FAILURE")
                    or validated.expected_risk_level in ("HIGH", "CRITICAL")
                )

                usage_meta = getattr(response, "usage_metadata", None)
                total_tokens = int(getattr(usage_meta, "total_token_count", 0) or 0)

                result_dict = validated.model_dump()
                result_dict["requires_human_approval"] = enforced_approval
                if not result_dict["verified_facts"]:
                    result_dict["verified_facts"] = _extract_verified_facts(
                        workflow_name, platform, execution_id, safe_error, sanitized_meta, validated.error_category
                    )
                if not result_dict["ai_hypotheses"]:
                    result_dict["ai_hypotheses"] = [validated.root_cause]
                return {
                    **result_dict,
                    "is_ai_generated": True,
                    "model_used": self.model_name,
                    "fallback_reason": None,
                    "token_count": total_tokens,
                }
            except Exception as e:
                fallback_reason = _redact_text(str(e))
                logger.warning("Gemini diagnosis failed (%s), switching to deterministic fallback.", fallback_reason)
        else:
            fallback_reason = "GEMINI_API_KEY is not configured on the backend server."

        classified = classify_error(safe_error)
        rec = build_deterministic_recommendation(classified["category"], workflow_name, safe_error)
        requires_approval = bool(
            classified["requires_approval"] or is_sensitive_flow or rec["expected_risk_level"] in ("HIGH", "CRITICAL")
        )
        facts = _extract_verified_facts(
            workflow_name, platform, execution_id, safe_error, sanitized_meta, classified["category"]
        )
        hypotheses = [
            f"Rule-based classification infers {classified['category']} from error signature; verify upstream node state and payload contract.",
            rec["recommendation_reason"],
        ]

        fallback_data = AIDiagnosisSchema(
            error_category=classified["category"],
            severity=classified["severity"],
            root_cause=f"Deterministic pattern match detected {classified['category']} from execution error signature.",
            simple_explanation=f"The workflow stopped due to an error: {safe_error[:140]}",
            technical_explanation=safe_error,
            recommended_actions=[
                classified["suggested_action"],
                "Inspect execution node payload and credentials.",
                "Verify idempotency before re-running failed execution.",
            ],
            verified_facts=facts,
            ai_hypotheses=hypotheses,
            suggested_recovery=rec["required_user_action"],
            requires_human_approval=requires_approval,
            is_recoverable=rec["is_recoverable"],
            suggested_strategy=rec["suggested_strategy"],
            recommendation_reason=rec["recommendation_reason"],
            expected_risk_level=rec["expected_risk_level"],
            required_user_action=rec["required_user_action"],
            max_recommended_retries=rec["max_recommended_retries"],
            confidence=0.86,
        )

        return {
            **fallback_data.model_dump(),
            "is_ai_generated": False,
            "model_used": "deterministic-rules-engine-v1",
            "fallback_reason": fallback_reason,
            "token_count": 0,
        }

    async def answer_control_center_question(
        self,
        question: str,
        workflows_context: List[Dict[str, Any]],
        incidents_context: List[Dict[str, Any]],
        executions_context: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Answers natural-language Control Center management questions grounded strictly in
        sanitized tenant workflow/incident/execution telemetry.
        AI proposals NEVER bypass ControlEngine validation, confirmation, or approvals.
        """
        safe_question = _redact_text(question or "").strip()
        sanitized_wfs = sanitize_log_payload(workflows_context[:30])
        sanitized_incs = sanitize_log_payload(incidents_context[:20])
        sanitized_execs = sanitize_log_payload((executions_context or [])[:20])

        unhealthy_wfs = [
            w for w in sanitized_wfs
            if str(w.get("control_status", "")).upper() in ("FAILED", "UNKNOWN")
            or str(w.get("health_status", "")).upper() in ("FAILING", "DEGRADED")
            or int(w.get("consecutive_failures") or 0) > 0
        ]
        repeated_failure_wfs = sorted(
            [w for w in sanitized_wfs if int(w.get("consecutive_failures") or 0) >= 2],
            key=lambda w: int(w.get("consecutive_failures") or 0),
            reverse=True,
        )

        # Build safe deterministic fallback proposals based strictly on observed workflow capabilities
        deterministic_proposals: List[Dict[str, Any]] = []
        for wf in unhealthy_wfs[:4]:
            caps = wf.get("capabilities") or {}
            wf_id = str(wf.get("id") or "")
            wf_name = str(wf.get("name") or wf_id)
            platform = str(wf.get("platform") or "n8n")
            is_sensitive = is_financial_or_destructive(wf_name)
            retry_cap = caps.get("retry_execution") if isinstance(caps, dict) else {}
            trigger_cap = caps.get("trigger") if isinstance(caps, dict) else {}
            deact_cap = caps.get("deactivate") if isinstance(caps, dict) else {}

            if isinstance(retry_cap, dict) and retry_cap.get("supported"):
                deterministic_proposals.append({
                    "workflow_id": wf_id,
                    "workflow_name": wf_name,
                    "platform": platform,
                    "action_type": "RETRY_EXECUTION",
                    "supported": True,
                    "requires_approval": bool(is_sensitive or int(wf.get("consecutive_failures") or 0) >= 3),
                    "requires_confirmation": True,
                    "auto_executed": False,
                    "reason": f"Retry latest failed execution for '{wf_name}' after inspecting error cause.",
                    "impact_summary": "Replays the failed node graph once; verify downstream idempotency before confirming.",
                })
            elif isinstance(deact_cap, dict) and deact_cap.get("supported") and int(wf.get("consecutive_failures") or 0) >= 3:
                deterministic_proposals.append({
                    "workflow_id": wf_id,
                    "workflow_name": wf_name,
                    "platform": platform,
                    "action_type": "DEACTIVATE",
                    "supported": True,
                    "requires_approval": True,
                    "requires_confirmation": True,
                    "auto_executed": False,
                    "reason": f"Pause/deactivate '{wf_name}' temporarily to halt recurring failures.",
                    "impact_summary": "Stops scheduled/webhook triggers until root cause is fixed (requires Admin/Owner approval).",
                })
            elif isinstance(trigger_cap, dict) and trigger_cap.get("supported"):
                deterministic_proposals.append({
                    "workflow_id": wf_id,
                    "workflow_name": wf_name,
                    "platform": platform,
                    "action_type": "TRIGGER",
                    "supported": True,
                    "requires_approval": bool(is_sensitive),
                    "requires_confirmation": True,
                    "auto_executed": False,
                    "reason": f"Run diagnostic trigger verification on '{wf_name}'.",
                    "impact_summary": "Starts a fresh workflow run using provider API.",
                })

        fallback_reason: Optional[str] = None
        if self.client:
            try:
                prompt = f"""You are the Central Automation Control Assistant for Zevkar.
Answer the operator's question concisely and accurately using ONLY the sanitized telemetry below.
Rules:
1. Never invent workflows, errors, or executions not present in the context.
2. Never claim an unsupported provider action can run remotely.
3. Never auto-execute actions; every proposed_action MUST set auto_executed=false and requires_confirmation=true.
4. Explain side-effect risks clearly (especially retries on billing/CRM/email flows).

Operator Question: {safe_question}

Workflows Context:
{json.dumps(sanitized_wfs, default=str)[:4500]}

Open Incidents Context:
{json.dumps(sanitized_incs, default=str)[:3000]}

Recent Executions Context:
{json.dumps(sanitized_execs, default=str)[:2500]}

Return strict JSON with keys:
- answer: string (clear operational answer referencing exact workflow names, statuses, and counts)
- risk_notes: array of strings (side-effect/idempotency/prevention warnings)
- preventive_recommendations: array of strings (concrete steps to prevent recurrence)
- proposed_actions: array of objects with keys {{workflow_id, action_type, reason, impact_summary}}
"""

                def _call_sync():
                    return self.client.models.generate_content(
                        model=self.model_name,
                        contents=prompt,
                        config={"response_mime_type": "application/json"},
                    )

                response = await asyncio.wait_for(asyncio.to_thread(_call_sync), timeout=15.0)
                parsed = json.loads(response.text)
                wf_lookup = {str(w.get("id")): w for w in sanitized_wfs if w.get("id")}
                validated_proposals: List[Dict[str, Any]] = []
                for raw_prop in parsed.get("proposed_actions") or []:
                    if not isinstance(raw_prop, dict):
                        continue
                    wf_id = str(raw_prop.get("workflow_id") or "")
                    wf = wf_lookup.get(wf_id)
                    if not wf:
                        continue
                    action = str(raw_prop.get("action_type") or "").upper()
                    if action not in (
                        "ACTIVATE", "DEACTIVATE", "TRIGGER", "RETRY_EXECUTION",
                        "PAUSE", "RESUME", "UPDATE_SETTINGS", "MANAGE_SCHEDULE",
                    ):
                        continue
                    cap_key = action.lower()
                    caps = wf.get("capabilities") if isinstance(wf.get("capabilities"), dict) else {}
                    cap_info = caps.get(cap_key, {}) if isinstance(caps, dict) else {}
                    supported = bool(cap_info.get("supported", False))
                    requires_approval = bool(
                        cap_info.get("requires_approval", False)
                        or is_financial_or_destructive(str(wf.get("name") or ""))
                        or action in ("DEACTIVATE", "PAUSE", "UPDATE_SETTINGS", "MANAGE_SCHEDULE")
                    )
                    validated_proposals.append({
                        "workflow_id": wf_id,
                        "workflow_name": str(wf.get("name") or wf_id),
                        "platform": str(wf.get("platform") or "n8n"),
                        "action_type": action,
                        "supported": supported,
                        "capability_reason": str(cap_info.get("reason") or ""),
                        "requires_approval": requires_approval,
                        "requires_confirmation": True,
                        "auto_executed": False,
                        "reason": _redact_text(str(raw_prop.get("reason") or ""))[:300],
                        "impact_summary": _redact_text(str(raw_prop.get("impact_summary") or ""))[:300],
                    })

                return {
                    "answer": _redact_text(str(parsed.get("answer") or "Analysis complete.")),
                    "risk_notes": [str(x) for x in (parsed.get("risk_notes") or [])][:5],
                    "preventive_recommendations": [str(x) for x in (parsed.get("preventive_recommendations") or [])][:5],
                    "proposed_actions": validated_proposals or deterministic_proposals,
                    "unhealthy_count": len(unhealthy_wfs),
                    "repeated_failures_count": len(repeated_failure_wfs),
                    "is_ai_generated": True,
                    "model_used": self.model_name,
                    "fallback_reason": None,
                }
            except Exception as exc:
                fallback_reason = _redact_text(str(exc))
                logger.warning("Gemini control assistant failed (%s), using deterministic fallback.", fallback_reason)
        else:
            fallback_reason = "GEMINI_API_KEY is not configured on the backend server."

        q_lower = safe_question.lower()
        risk_notes = [
            "Retries and manual triggers execute real downstream API calls; confirm downstream webhooks or invoices are idempotent.",
            "Destructive or configuration-mutating actions require explicit confirmation and Admin/Owner approval.",
        ]
        preventive = [
            "Enable alert routing guardrails for consecutive failures (>= 3) and SLA latency breaches.",
            "Set explicit per-workflow stuck timeouts on long-running pipelines.",
        ]

        if "unhealthy" in q_lower or "failing" in q_lower or "broken" in q_lower:
            if not unhealthy_wfs:
                answer = f"All {len(sanitized_wfs)} monitored workflows are currently healthy with 0 failing or degraded states."
            else:
                names = ", ".join(f"{w.get('name')} ({w.get('platform')}: {w.get('health_status')})" for w in unhealthy_wfs[:6])
                answer = f"Detected {len(unhealthy_wfs)} unhealthy workflow(s): {names}."
        elif "repeat" in q_lower or "recurring" in q_lower or "often" in q_lower:
            if not repeated_failure_wfs:
                answer = "No workflows currently show repeated consecutive failures (>= 2 consecutive failures)."
            else:
                names = ", ".join(
                    f"{w.get('name')} ({w.get('consecutive_failures')} consecutive fails)"
                    for w in repeated_failure_wfs[:6]
                )
                answer = f"Workflows with repeated failures: {names}."
        elif "retry" in q_lower or "what happens" in q_lower or "impact" in q_lower:
            target = unhealthy_wfs[0] if unhealthy_wfs else (sanitized_wfs[0] if sanitized_wfs else None)
            if target:
                wf_name = target.get("name")
                sensitive = is_financial_or_destructive(str(wf_name or ""))
                answer = (
                    f"Retrying '{wf_name}' on {target.get('platform')} replays its failed execution node graph from the last failed state. "
                    + (
                        "Because this workflow touches financial or mutating operations, Admin/Owner approval and duplicate-check verification are required."
                        if sensitive
                        else "Verify upstream payload validity before confirming retry; execution results are verified via provider telemetry."
                    )
                )
            else:
                answer = "No workflow target is currently loaded in telemetry to evaluate retry impact."
        elif "prevent" in q_lower or "avoid" in q_lower or "fix" in q_lower:
            top_inc = sanitized_incs[0] if sanitized_incs else None
            if top_inc:
                answer = (
                    f"Top active incident on '{top_inc.get('workflow_name')}' is classified as {top_inc.get('error_category')}: "
                    f"{str(top_inc.get('error_message') or '')[:180]}. Add exponential backoff or schema validation before downstream writes."
                )
            else:
                answer = "No active failure incidents require immediate hardening; configure SLA error budgets and proactive webhook alerts."
        elif "why" in q_lower or "fail" in q_lower:
            if sanitized_incs:
                top_inc = sanitized_incs[0]
                answer = (
                    f"Latest incident on '{top_inc.get('workflow_name')}' ({top_inc.get('platform')}) failed with "
                    f"[{top_inc.get('error_category')}] {str(top_inc.get('error_message') or '')[:220]}"
                )
            elif unhealthy_wfs:
                w = unhealthy_wfs[0]
                answer = f"'{w.get('name')}' currently shows status {w.get('control_status')} ({w.get('consecutive_failures')} consecutive failures)."
            else:
                answer = "No recent execution failures recorded across connected platforms."
        else:
            answer = (
                f"Monitoring {len(sanitized_wfs)} workflows across connected platforms: "
                f"{len(unhealthy_wfs)} unhealthy, {len(sanitized_incs)} active incident(s). "
                "Review the staged control proposals below; none are executed automatically."
            )

        return {
            "answer": answer,
            "risk_notes": risk_notes,
            "preventive_recommendations": preventive,
            "proposed_actions": deterministic_proposals,
            "unhealthy_count": len(unhealthy_wfs),
            "repeated_failures_count": len(repeated_failure_wfs),
            "is_ai_generated": False,
            "model_used": "deterministic-control-advisor-v1",
            "fallback_reason": fallback_reason,
        }


gemini_engine = GeminiDiagnosisEngine()
