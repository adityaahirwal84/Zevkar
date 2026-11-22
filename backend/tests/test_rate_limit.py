import pytest
from fastapi import HTTPException, Request

from app.core.config import settings
from app.core.rate_limit import _client_address, enforce_rate_limit


def _request(peer: str, forwarded_for: str | None = None) -> Request:
    headers = []
    if forwarded_for:
        headers.append((b"x-forwarded-for", forwarded_for.encode("ascii")))
    return Request(
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": "/",
            "raw_path": b"/",
            "query_string": b"",
            "headers": headers,
            "client": (peer, 12345),
            "server": ("testserver", 80),
        }
    )


def test_forwarded_address_is_used_only_for_configured_proxy(monkeypatch):
    monkeypatch.setattr(settings, "TRUSTED_PROXY_IPS", ["10.0.0.0/8"])

    assert _client_address(_request("198.51.100.10", "203.0.113.20")) == "198.51.100.10"
    assert _client_address(_request("10.0.0.2", "203.0.113.20, 10.0.0.1")) == "203.0.113.20"


def test_invalid_forwarded_address_falls_back_to_peer(monkeypatch):
    monkeypatch.setattr(settings, "TRUSTED_PROXY_IPS", ["10.0.0.0/8"])
    assert _client_address(_request("10.0.0.2", "spoofed, 10.0.0.1")) == "10.0.0.2"


@pytest.mark.asyncio
async def test_rate_limit_returns_429_and_closes_redis(monkeypatch):
    class FakeRedis:
        def __init__(self):
            self.count = 0
            self.closed = False

        async def eval(self, *_):
            self.count += 1
            return self.count

        async def aclose(self):
            self.closed = True

    redis = FakeRedis()
    monkeypatch.setattr("app.core.rate_limit.Redis.from_url", lambda *_args, **_kwargs: redis)
    request = _request("192.0.2.10")

    await enforce_rate_limit(request, "test", 1, 60)
    with pytest.raises(HTTPException) as error:
        await enforce_rate_limit(request, "test", 1, 60)

    assert error.value.status_code == 429
    assert error.value.headers["Retry-After"] == "60"
    assert redis.closed


@pytest.mark.asyncio
async def test_rate_limit_fails_closed_when_redis_is_unavailable(monkeypatch):
    class FailedRedis:
        async def eval(self, *_):
            raise ConnectionError("unavailable")

        async def aclose(self):
            pass

    monkeypatch.setattr("app.core.rate_limit.Redis.from_url", lambda *_args, **_kwargs: FailedRedis())

    with pytest.raises(HTTPException) as error:
        await enforce_rate_limit(_request("192.0.2.10"), "test", 1, 60)

    assert error.value.status_code == 503
