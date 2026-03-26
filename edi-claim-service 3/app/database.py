"""
POSEIDON EDI Service — Database & Shared Utilities
"""
import os
import json
import logging
from datetime import date, datetime
from decimal import Decimal
from contextlib import asynccontextmanager
from typing import Optional

import asyncpg

log = logging.getLogger("edi")

DATABASE_URL = os.environ["DATABASE_URL"]

_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None or _pool._closed:
        _pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=2,
            max_size=10,
            command_timeout=30,
        )
    return _pool


async def close_pool():
    global _pool
    if _pool and not _pool._closed:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def get_db():
    pool = await get_pool()
    async with pool.acquire() as conn:
        yield conn


@asynccontextmanager
async def get_db_transaction():
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            yield conn


async def audit_log(
    conn: asyncpg.Connection,
    entity_type: str,
    entity_id: int,
    action: str,
    old_status: str = None,
    new_status: str = None,
    details: dict = None,
    performed_by: int = None,
):
    await conn.execute(
        """INSERT INTO edi_audit_log (entity_type, entity_id, action, old_status, new_status, details, performed_by)
           VALUES ($1, $2, $3, $4, $5, $6::JSONB, $7)""",
        entity_type, entity_id, action, old_status, new_status,
        json.dumps(details) if details else None, performed_by,
    )


class JSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, (date, datetime)):
            return o.isoformat()
        if isinstance(o, Decimal):
            return float(o)
        return super().default(o)


def to_json(obj) -> str:
    return json.dumps(obj, cls=JSONEncoder)


def clean_nones(obj):
    """Recursively strip None values from dicts for clean EDI payloads."""
    if isinstance(obj, dict):
        return {k: clean_nones(v) for k, v in obj.items() if v is not None}
    if isinstance(obj, list):
        return [clean_nones(i) for i in obj if i is not None]
    return obj
