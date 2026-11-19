import pytest
from app.integrations.n8n import N8NClient
from app.core.security import get_password_hash, verify_password, create_access_token, decode_access_token

def test_password_hashing():
    password = "SuperSecurePassword123!"
    hashed = get_password_hash(password)
    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword", hashed) is False

def test_jwt_token_flow():
    user_id = "user_test_uuid_456"
    token = create_access_token(user_id)
    payload = decode_access_token(token)
    assert payload is not None
    assert payload.get("sub") == user_id

def test_n8n_client_url_normalization():
    client1 = N8NClient("https://n8n.internal.agency", "test_key")
    assert client1.base_url == "https://n8n.internal.agency/api/v1"

    client2 = N8NClient("https://n8n.internal.agency/api/v1/", "test_key")
    assert client2.base_url == "https://n8n.internal.agency/api/v1"

@pytest.mark.asyncio
async def test_n8n_headers():
    client = N8NClient("https://n8n.internal.agency", "test_api_key_123")
    headers = client._get_headers()
    assert headers["X-N8N-API-KEY"] == "test_api_key_123"
    assert headers["Accept"] == "application/json"
