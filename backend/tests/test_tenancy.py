import pytest
from app.schemas.pydantic_models import UserCreate, UserOut, AIDiagnosisSchema, IncidentOut
from app.api.v1.recovery import generate_idempotency_key

def test_idempotency_key_consistency():
    key1 = generate_idempotency_key("inc_101", "MANUAL_RETRY", 1)
    key2 = generate_idempotency_key("inc_101", "MANUAL_RETRY", 1)
    key3 = generate_idempotency_key("inc_101", "MANUAL_RETRY", 2)
    
    assert key1 == key2
    assert key1 != key3
    assert len(key1) == 64 # SHA-256 hex length

def test_ai_diagnosis_schema_validation():
    valid_data = {
        "error_category": "AUTH_FAILURE",
        "severity": "HIGH",
        "root_cause": "Expired Stripe API key in client vault",
        "simple_explanation": "Payment automation failed due to invalid credentials.",
        "technical_explanation": "HTTP 401 Unauthorized returned by Stripe balance transactions endpoint.",
        "recommended_actions": ["Rotate secret key", "Check webhook endpoint"],
        "suggested_recovery": "Execute manual retry after key rotation.",
        "requires_human_approval": True,
        "confidence": 0.96,
    }
    schema = AIDiagnosisSchema(**valid_data)
    assert schema.error_category == "AUTH_FAILURE"
    assert schema.requires_human_approval is True
    assert schema.confidence == 0.96
