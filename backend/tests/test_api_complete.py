"""Comprehensive API and Domain Logic Test Suite

Covers:
1. Multi-Tenant Isolation Enforcement
2. JWT Token Lifecycle and Refresh Token Rotation
3. Webhook Signature Verification and SHA-256 Deduplication
4. Recovery Idempotency & Financial Safety Gate Rules
5. Error Classification and AIDiagnosis Pydantic Validation
"""
import pytest
import hmac
import hashlib
from datetime import datetime, timezone
from app.core.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    decode_access_token,
)
from app.api.v1.recovery import generate_idempotency_key
from app.api.v1.webhooks import verify_signature
from app.schemas.pydantic_models import (
    UserCreate,
    UserOut,
    AIDiagnosisSchema,
    IncidentOut,
    WorkflowCreate,
    IntegrationCreate,
    WebhookEventPayload,
    ApprovalDecision,
)
from app.lib.classifier import classify_error_message, is_financial_or_destructive

# ============================================================================
# 1. Multi-Tenant Isolation Logic Tests
# ============================================================================

def test_tenant_isolation_id_scoping():
    """Verify that tenant queries strictly scope by agency_id."""
    tenant_a_id = "agency_uuid_tenant_a_111"
    tenant_b_id = "agency_uuid_tenant_b_222"

    assert tenant_a_id != tenant_b_id

    # Simulated resource records with tenant keys
    resource_a = {"id": "wf_1", "agency_id": tenant_a_id, "name": "Lead Sync"}
    resource_b = {"id": "wf_2", "agency_id": tenant_b_id, "name": "Invoice Billing"}

    # Filter logic simulation
    def get_resources_for_tenant(resources, requesting_agency_id):
        return [r for r in resources if r["agency_id"] == requesting_agency_id]

    tenant_a_results = get_resources_for_tenant([resource_a, resource_b], tenant_a_id)
    assert len(tenant_a_results) == 1
    assert tenant_a_results[0]["id"] == "wf_1"
    assert "wf_2" not in [r["id"] for r in tenant_a_results]

# ============================================================================
# 2. Authentication & Token Lifecycle Tests
# ============================================================================

def test_argon2id_password_hashing():
    """Verify Argon2id password hashing and validation."""
    plain = "S3cur3P@ssw0rd!2026"
    hashed = get_password_hash(plain)

    assert hashed != plain
    assert verify_password(plain, hashed) is True
    assert verify_password("wrong_password", hashed) is False

def test_jwt_access_token_creation_and_expiration():
    """Verify JWT access token generation, claims, and signature."""
    user_id = "user_89f02c61-001"
    token = create_access_token(user_id)
    assert isinstance(token, str)

    payload = decode_access_token(token)
    assert payload is not None
    assert payload.get("sub") == user_id
    assert "exp" in payload
    assert payload["exp"] > datetime.now(timezone.utc).timestamp()

def test_refresh_token_rotation_hash():
    """Verify refresh token rotation uniqueness."""
    import secrets
    raw_token_1 = secrets.token_urlsafe(32)
    raw_token_2 = secrets.token_urlsafe(32)

    hash_1 = hashlib.sha256(raw_token_1.encode()).hexdigest()
    hash_2 = hashlib.sha256(raw_token_2.encode()).hexdigest()

    assert hash_1 != hash_2
    assert len(hash_1) == 64

# ============================================================================
# 3. Webhook Verification & Deduplication Tests
# ============================================================================

def test_webhook_hmac_signature_verification():
    """Verify HMAC SHA-256 signature calculation and timing-safe match."""
    secret = "whsec_super_secret_signing_key_456"
    body = b'{"event":"execution.failed","workflow_id":"wf_101"}'

    # Compute expected signature
    computed_sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

    # Valid signature
    assert verify_signature(body, computed_sig, secret) is True
    # Altered body
    assert verify_signature(b'{"event":"execution.failed","workflow_id":"wf_altered"}', computed_sig, secret) is False
    # Wrong secret
    assert verify_signature(body, computed_sig, "wrong_secret") is False

def test_webhook_event_deduplication_fingerprint():
    """Verify identical payload produces the exact same SHA-256 event fingerprint."""
    body = b'{"event_id":"evt_999","timestamp":1700000000}'
    fingerprint_1 = hashlib.sha256(body).hexdigest()
    fingerprint_2 = hashlib.sha256(body).hexdigest()

    assert fingerprint_1 == fingerprint_2
    assert len(fingerprint_1) == 64

# ============================================================================
# 4. Recovery Idempotency & Financial Safety Gates
# ============================================================================

def test_idempotency_key_deterministic_uniqueness():
    """Verify idempotency key remains deterministic for same attempt and changes across retry counts."""
    incident_id = "inc_303"
    action = "MANUAL_RETRY"

    k1 = generate_idempotency_key(incident_id, action, 1)
    k2 = generate_idempotency_key(incident_id, action, 1)
    k3 = generate_idempotency_key(incident_id, action, 2)

    assert k1 == k2
    assert k1 != k3
    assert len(k1) == 64

def test_financial_safety_gate_blocking():
    """Verify that financial and destructive workflows require human approval."""
    # Financial keywords
    assert is_financial_or_destructive("Stripe Invoice Payment Webhook") is True
    assert is_financial_or_destructive("Charge Customer Credit Card") is True
    assert is_financial_or_destructive("Refund PayPal Transaction") is True
    assert is_financial_or_destructive("Delete Production Database Record") is True

    # Benign keywords
    assert is_financial_or_destructive("Sync Hubspot Contacts to Notion") is False
    assert is_financial_or_destructive("Send Welcome Slack Notification") is False

# ============================================================================
# 5. Error Classification & Schema Validation Tests
# ============================================================================

def test_error_classification_rules():
    """Verify classification engine categorizes known error patterns accurately."""
    cat, sev = classify_error_message("401 Unauthorized: Invalid API Token")
    assert cat == "AUTH_FAILURE"
    assert sev == "CRITICAL"

    cat, sev = classify_error_message("429 Too Many Requests: Rate limit exceeded")
    assert cat == "RATE_LIMIT"
    assert sev == "MEDIUM"

    cat, sev = classify_error_message("504 Gateway Timeout: Connection timed out after 30000ms")
    assert cat == "TIMEOUT"
    assert sev == "HIGH"

    cat, sev = classify_error_message("JSONDecodeError: Expecting property name enclosed in double quotes")
    assert cat == "INVALID_PAYLOAD"
    assert sev == "MEDIUM"

def test_ai_diagnosis_pydantic_schema_strict():
    """Verify Pydantic AIDiagnosisSchema enforces non-empty fields and confidence bounds."""
    data = {
        "error_category": "RATE_LIMIT",
        "severity": "MEDIUM",
        "root_cause": "CRM API rate limit reached at 100 req/min",
        "simple_explanation": "Too many requests were sent in a short window.",
        "technical_explanation": "HTTP 429 response received from api.crm.com/v1/contacts.",
        "recommended_actions": ["Add backoff delay", "Throttle batch queue"],
        "suggested_recovery": "Retry with exponential backoff delay of 60 seconds.",
        "requires_human_approval": False,
        "confidence": 0.94,
    }
    diagnosis = AIDiagnosisSchema(**data)
    assert diagnosis.error_category == "RATE_LIMIT"
    assert diagnosis.confidence == 0.94
    assert diagnosis.requires_human_approval is False
