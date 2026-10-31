"""Reuse unexpired OAuth grants for the lifetime of one intake sweep."""
from contextlib import asynccontextmanager
from contextvars import ContextVar
from time import monotonic

_tokens = ContextVar("zoho_sweep_tokens", default=None)


@asynccontextmanager
async def token_session():
    handle = _tokens.set({})
    try:
        yield
    finally:
        _tokens.reset(handle)


async def access_token(client, config):
    cache = _tokens.get()
    key = (config.accounts_origin, config.client_id, config.client_secret, config.refresh_token)
    now = monotonic()
    if cache is not None and key in cache:
        token, expires = cache[key]
        if now < expires:
            return token
    response = await client.post(
        config.accounts_origin + "/oauth/v2/token",
        data={"client_id": config.client_id, "client_secret": config.client_secret,
              "refresh_token": config.refresh_token, "grant_type": "refresh_token"},
    )
    payload = response.json()
    token = payload.get("access_token") if isinstance(payload, dict) else None
    if response.is_error or not isinstance(token, str) or not token:
        return None
    lifetime = str(payload.get("expires_in", ""))
    if cache is not None and lifetime.isdecimal():
        cache[key] = token, now + int(lifetime) - 60
    return token
