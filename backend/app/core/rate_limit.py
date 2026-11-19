from collections import defaultdict, deque
import threading
import time
from typing import Deque, Dict
from fastapi import HTTPException, Request, status

_LOCK = threading.Lock()
_REQUEST_BUCKETS: Dict[str, Deque[float]] = defaultdict(deque)


def reset_rate_limit_buckets() -> None:
    """Clears rate limit tracking buckets (intended for isolated test suites)."""
    with _LOCK:
        _REQUEST_BUCKETS.clear()


def enforce_rate_limit(
    request: Request,
    bucket: str,
    max_requests: int = 10,
    window_seconds: int = 60,
    identifier: str = "",
) -> None:
    """
    Sliding-window rate limiter keyed by endpoint bucket + client IP (+ optional identifier).
    Raises HTTP 429 when request count within window_seconds exceeds max_requests.
    """
    client_host = "unknown"
    if request.client and request.client.host:
        client_host = request.client.host
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_host = forwarded.split(",")[0].strip() or client_host

    key = f"{bucket}:{client_host}:{identifier.strip().lower()}" if identifier else f"{bucket}:{client_host}"
    now = time.monotonic()
    cutoff = now - window_seconds

    with _LOCK:
        q = _REQUEST_BUCKETS[key]
        while q and q[0] <= cutoff:
            q.popleft()
        if len(q) >= max_requests:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many authentication attempts. Please wait briefly before retrying.",
                headers={"Retry-After": str(window_seconds)},
            )
        q.append(now)
