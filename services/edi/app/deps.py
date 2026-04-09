"""
EDI service authentication: Bearer JWT (same secret as Core) or X-Internal-API-Key.
"""
import os

import jwt
from fastapi import HTTPException, Request

INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "").strip()
JWT_SECRET = (os.getenv("JWT_SECRET") or os.getenv("SECRET_KEY") or "").strip()
JWT_ALGORITHMS = [os.getenv("JWT_ALGORITHM", "HS256")]


async def require_edi_caller(request: Request) -> dict:
    if INTERNAL_API_KEY:
        got = request.headers.get("X-Internal-API-Key", "").strip()
        if got == INTERNAL_API_KEY:
            return {"auth": "internal"}

    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer ") and JWT_SECRET:
        token = auth[7:].strip()
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=JWT_ALGORITHMS)
            return {"auth": "jwt", "claims": payload}
        except jwt.InvalidTokenError:
            pass

    raise HTTPException(status_code=401, detail="Unauthorized")
