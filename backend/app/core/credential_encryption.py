import base64
import binascii
import json
import secrets
from typing import Any

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings


class CredentialEncryptionError(RuntimeError):
    pass


def _key_for(key_id: str) -> bytes:
    encoded = settings.INTEGRATION_ENCRYPTION_KEYS.get(key_id)
    if not encoded:
        raise CredentialEncryptionError("Integration encryption key is not configured")
    try:
        key = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as error:
        raise CredentialEncryptionError("Integration encryption key configuration is invalid") from error
    if len(key) != 32:
        raise CredentialEncryptionError("Integration encryption key must decode to 32 bytes")
    return key


def encrypt_credentials(integration_id: str, credentials: dict[str, Any]) -> tuple[str, str]:
    key_id = settings.INTEGRATION_ACTIVE_ENCRYPTION_KEY_ID
    key = _key_for(key_id)
    nonce = secrets.token_bytes(12)
    plaintext = json.dumps(credentials, separators=(",", ":"), sort_keys=True).encode("utf-8")
    ciphertext = AESGCM(key).encrypt(nonce, plaintext, integration_id.encode("utf-8"))
    return key_id, base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii")


def decrypt_credentials(integration_id: str, key_id: str, ciphertext: str) -> dict[str, Any]:
    key = _key_for(key_id)
    try:
        encrypted = base64.urlsafe_b64decode(ciphertext.encode("ascii"))
        if len(encrypted) < 12 + 16:
            raise ValueError("Encrypted credential payload is too short")
        plaintext = AESGCM(key).decrypt(encrypted[:12], encrypted[12:], integration_id.encode("utf-8"))
        decoded = json.loads(plaintext)
    except (binascii.Error, ValueError, UnicodeError, InvalidTag) as error:
        raise CredentialEncryptionError("Stored integration credentials failed authentication") from error
    if not isinstance(decoded, dict):
        raise CredentialEncryptionError("Stored integration credential payload is invalid")
    return decoded
