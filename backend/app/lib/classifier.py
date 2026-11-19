from typing import Dict, Any, Tuple

_FINANCIAL_OR_DESTRUCTIVE_KEYWORDS = (
    "stripe",
    "invoice",
    "payment",
    "billing",
    "charge",
    "credit card",
    "refund",
    "paypal",
    "payout",
    "ledger",
    "delete",
    "drop",
    "truncate",
    "purge",
    "destroy",
    "transfer",
    "wire",
)


def is_financial_or_destructive(workflow_name: str) -> bool:
    lower = (workflow_name or "").lower()
    return any(kw in lower for kw in _FINANCIAL_OR_DESTRUCTIVE_KEYWORDS)


def classify_error(error_message: str) -> Dict[str, Any]:
    msg = (error_message or "").lower()

    if "401" in msg or "unauthorized" in msg or "token" in msg or "forbidden" in msg or "403" in msg or "api key" in msg:
        return {
            "category": "AUTH_FAILURE",
            "severity": "CRITICAL" if "401" in msg or "unauthorized" in msg else "HIGH",
            "suggested_action": "Refresh credentials or update OAuth scope before re-running.",
            "requires_approval": True,
        }
    elif "429" in msg or "rate limit" in msg or "too many requests" in msg or "quota" in msg:
        return {
            "category": "RATE_LIMIT",
            "severity": "MEDIUM",
            "suggested_action": "Apply exponential backoff and retry after rate limit resets.",
            "requires_approval": False,
        }
    elif "deadlock" in msg or "connection refused" in msg or "database" in msg or "postgres" in msg:
        return {
            "category": "DATABASE_FAILURE",
            "severity": "CRITICAL",
            "suggested_action": "Inspect database connection pool and kill blocking transaction locks.",
            "requires_approval": True,
        }
    elif "timeout" in msg or "timed out" in msg or "504" in msg or "stuck" in msg:
        return {
            "category": "TIMEOUT",
            "severity": "HIGH",
            "suggested_action": "Increase HTTP request timeout or verify upstream endpoint latency.",
            "requires_approval": False,
        }
    elif "jsondecodeerror" in msg or "invalid json" in msg or "expecting property name" in msg:
        return {
            "category": "INVALID_PAYLOAD",
            "severity": "MEDIUM",
            "suggested_action": "Inspect upstream JSON payload serialization before downstream node execution.",
            "requires_approval": True,
        }
    elif "schema" in msg or "validation" in msg or "bad request" in msg or "400" in msg:
        return {
            "category": "SCHEMA_MISMATCH",
            "severity": "HIGH",
            "suggested_action": "Verify upstream payload schema against target webhook data contract.",
            "requires_approval": True,
        }

    return {
        "category": "API_ERROR",
        "severity": "HIGH",
        "suggested_action": "Review execution error log and inspect target service health status.",
        "requires_approval": True,
    }


def classify_error_message(error_message: str) -> Tuple[str, str]:
    result = classify_error(error_message)
    return result["category"], result["severity"]
