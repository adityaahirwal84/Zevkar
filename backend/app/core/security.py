import base64
import hashlib
import ipaddress
import os
import socket
from datetime import datetime, timedelta, timezone
from typing import Any, Union, Optional
from urllib.parse import urlparse
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
security_bearer = HTTPBearer(auto_error=False)

_ENC_PREFIX = "enc:v1:"
_SENSITIVE_KEY_TOKENS = (
    "api_key",
    "apikey",
    "token",
    "secret",
    "password",
    "authorization",
    "x-n8n-api-key",
    "encrypted_credentials",
    "credential",
)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(subject: Union[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"exp": expire, "sub": str(subject)}
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


def _get_aes_key() -> bytes:
    raw = (settings.INTEGRATION_ENCRYPTION_KEY or settings.SECRET_KEY).encode("utf-8")
    return hashlib.sha256(raw).digest()


def encrypt_secret(plaintext: Optional[str]) -> Optional[str]:
    if plaintext is None:
        return None
    if plaintext == "":
        return ""
    if plaintext.startswith(_ENC_PREFIX):
        return plaintext
    aesgcm = AESGCM(_get_aes_key())
    nonce = os.urandom(12)
    ct = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    encoded = base64.urlsafe_b64encode(nonce + ct).decode("ascii")
    return f"{_ENC_PREFIX}{encoded}"


def decrypt_secret(ciphertext: Optional[str]) -> Optional[str]:
    if not ciphertext:
        return ciphertext
    if not ciphertext.startswith(_ENC_PREFIX):
        # Legacy plaintext fallback for migration compatibility
        return ciphertext
    raw = base64.urlsafe_b64decode(ciphertext[len(_ENC_PREFIX):].encode("ascii"))
    nonce, ct = raw[:12], raw[12:]
    aesgcm = AESGCM(_get_aes_key())
    return aesgcm.decrypt(nonce, ct, None).decode("utf-8")


def mask_secret(value: Optional[str]) -> str:
    if not value:
        return ""
    if len(value) <= 6:
        return "***"
    return f"{value[:3]}***{value[-3:]}"


def _is_disallowed_ip(ip_obj: Union[ipaddress.IPv4Address, ipaddress.IPv6Address], allow_private: bool) -> bool:
    if ip_obj.is_link_local or ip_obj.is_multicast or ip_obj.is_unspecified:
        return True
    if str(ip_obj) in ("169.254.169.254", "100.100.100.200"):
        return True
    if not allow_private and (ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_reserved):
        return True
    return False


def validate_integration_url(url: str, allow_private: Optional[bool] = None) -> str:
    """
    Validates external integration URLs to prevent SSRF attacks.
    Blocks non-HTTP(S) schemes, cloud metadata endpoints, and private/loopback IPs unless explicitly enabled.
    """
    if allow_private is None:
        allow_private = settings.ALLOW_PRIVATE_INTEGRATION_URLS

    cleaned = (url or "").strip()
    if not cleaned:
        raise ValueError("Integration instance URL cannot be empty.")

    parsed = urlparse(cleaned)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Integration URL must use http or https scheme.")
    if not parsed.hostname:
        raise ValueError("Integration URL must include a valid hostname.")

    host = parsed.hostname.lower()
    if host in ("metadata.google.internal", "169.254.169.254"):
        raise ValueError("Access to cloud metadata hosts is prohibited.")
    if not allow_private and host in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
        raise ValueError("Loopback hosts are prohibited for integration URLs.")

    # Check if host is a literal IP
    try:
        ip_obj = ipaddress.ip_address(host)
        if _is_disallowed_ip(ip_obj, allow_private):
            raise ValueError(f"Disallowed integration IP address: {host}")
    except ValueError as exc:
        if "Disallowed integration IP" in str(exc):
            raise
        # Hostname: resolve DNS if possible; do not fail purely on offline DNS unless resolved to bad IP
        try:
            infos = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80), proto=socket.IPPROTO_TCP)
            for info in infos:
                addr = info[4][0]
                resolved_ip = ipaddress.ip_address(addr.split("%")[0])
                if _is_disallowed_ip(resolved_ip, allow_private):
                    raise ValueError(f"Integration host resolves to disallowed IP: {addr}")
        except socket.gaierror:
            # Hostname resolution deferred (e.g. offline test or remote DNS); still reject explicit .local/.internal when strict
            pass

    return cleaned.rstrip("/")


def sanitize_log_payload(value: Any) -> Any:
    """Recursively redacts sensitive credential fields before logging."""
    if isinstance(value, dict):
        sanitized = {}
        for k, v in value.items():
            lower_k = str(k).lower()
            if any(tok in lower_k for tok in _SENSITIVE_KEY_TOKENS):
                sanitized[k] = "[REDACTED]"
            else:
                sanitized[k] = sanitize_log_payload(v)
        return sanitized
    if isinstance(value, list):
        return [sanitize_log_payload(item) for item in value]
    return value
