"""Phase 8 Public Contact & Auth Flow Tests."""

from types import SimpleNamespace
import pytest
from fastapi import HTTPException

from app.api.v1 import contact as contact_api
from app.api.v1 import billing as billing_api


def _mock_request(ip: str = "127.0.0.99"):
    return SimpleNamespace(client=SimpleNamespace(host=ip))


@pytest.mark.asyncio
async def test_contact_submission_accepts_valid_payload_and_blocks_honeypot():
    contact_api._IP_SUBMISSION_LOG.clear()

    payload = contact_api.ContactSubmissionRequest(
        name="Aditya Test",
        email="operator@example.com",
        company="Ops Corp",
        subject="Building with AI Automation Doctor",
        message="Testing n8n execution sync and recovery approval workflow setup.",
        website="",
    )
    res = await contact_api.submit_contact_inquiry(payload, _mock_request())
    assert res["success"] is True
    assert res["submission_id"].startswith("cnt_")

    spam_payload = contact_api.ContactSubmissionRequest(
        name="Bot Sender",
        email="bot@example.com",
        company="Spam LLC",
        subject="General Questions",
        message="Automated spam inquiry payload attempting submission.",
        website="https://spam.invalid",
    )
    with pytest.raises(HTTPException) as exc:
        await contact_api.submit_contact_inquiry(spam_payload, _mock_request())
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_contact_rate_limiter_triggers_429_after_threshold():
    contact_api._IP_SUBMISSION_LOG.clear()
    req = _mock_request("10.10.10.42")
    payload = contact_api.ContactSubmissionRequest(
        name="Rate User",
        email="rate@example.com",
        company="Rate Co",
        subject="General Questions",
        message="Checking sliding window IP rate limiting protection on contact.",
        website="",
    )
    for _ in range(contact_api.MAX_REQUESTS_PER_WINDOW):
        await contact_api.submit_contact_inquiry(payload, req)

    with pytest.raises(HTTPException) as exc:
        await contact_api.submit_contact_inquiry(payload, req)
    assert exc.value.status_code == 429


@pytest.mark.asyncio
async def test_billing_plans_exposes_three_configurable_tiers():
    plans = await billing_api.get_plans()
    assert len(plans) == 3
    assert [p["id"] for p in plans] == ["starter", "professional", "business"]
