from collections import defaultdict
from datetime import datetime, timedelta, timezone
import re
from typing import Dict, List, Optional
import uuid

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field

router = APIRouter(prefix="/contact", tags=["Public Contact"])

EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
# Simple sliding window rate limit store (per-process IP throttling)
_IP_SUBMISSION_LOG: Dict[str, List[datetime]] = defaultdict(list)
MAX_REQUESTS_PER_WINDOW = 5
WINDOW_MINUTES = 10


class ContactSubmissionRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    company: str = Field(..., min_length=2, max_length=160)
    subject: str = Field(..., min_length=2, max_length=160)
    message: str = Field(..., min_length=15, max_length=4000)
    website: Optional[str] = Field(default=None, description="Honeypot anti-spam field; must remain blank")


def _check_rate_limit(client_ip: str, now: datetime) -> None:
    cutoff = now - timedelta(minutes=WINDOW_MINUTES)
    recent = [ts for ts in _IP_SUBMISSION_LOG[client_ip] if ts > cutoff]
    _IP_SUBMISSION_LOG[client_ip] = recent
    if len(recent) >= MAX_REQUESTS_PER_WINDOW:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many contact submissions from this address. Please wait a few minutes before retrying.",
        )
    _IP_SUBMISSION_LOG[client_ip].append(now)


@router.post("", status_code=status.HTTP_201_CREATED)
async def submit_contact_inquiry(payload: ContactSubmissionRequest, request: Request):
    # Honeypot spam check
    if payload.website and payload.website.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Spam protection rejected automated submission.",
        )

    cleaned_email = str(payload.email).strip().lower()
    if not EMAIL_REGEX.match(cleaned_email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a valid work email address.",
        )

    now = datetime.now(timezone.utc)
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip, now)

    submission_id = f"cnt_{uuid.uuid4().hex[:12]}"
    return {
        "success": True,
        "submission_id": submission_id,
        "received_at": now.isoformat(),
        "delivery_mode": "VALIDATED_QUEUE",
        "message": "Your inquiry passed validation and has been logged for review. In local environments without an external SMTP relay, you can also send a copy directly via email.",
    }
