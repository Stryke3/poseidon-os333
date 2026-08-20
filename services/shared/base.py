# =============================================================================
# POSEIDON â€” Shared Service Base
# services/shared/base.py
# Imported by all microservices for consistent config, DB, Redis, logging
# =============================================================================

from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator
from urllib import error as urllib_error
from urllib import request as urllib_request
from urllib.parse import urlparse

import redis.asyncio as aioredis
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from psycopg_pool import AsyncConnectionPool

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("poseidon")

PLACEHOLDER_PREFIXES = (
    "CHANGE_ME",
    "replace_with_",
    "your_key_here",
)


def _is_placeholder(value: str) -> bool:
    stripped = value.strip()
    if not stripped:
        return True
    return any(stripped.startswith(prefix) for prefix in PLACEHOLDER_PREFIXES)


def _csv_env(name: str, default: str = "") -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

LOCAL_PROOF_MODE = os.getenv("LOCAL_PROOF_MODE", "").lower() == "true"
if LOCAL_PROOF_MODE:
    print("WARNING: LOCAL_PROOF_MODE=true; using local proof placeholder secrets. Real integrations remain disabled.")
    os.environ.setdefault("INTERNAL_API_KEY", "local-proof-internal-key")
    os.environ.setdefault("JWT_SECRET", "local-proof-jwt-secret")
    os.environ.setdefault("MINIO_SECRET_KEY", "local-proof-minio-secret")
    os.environ.setdefault("POSEIDON_API_KEY", "local-proof-poseidon-key")
    os.environ.setdefault("POSTGRES_PASSWORD", "local-proof-postgres-password")
    os.environ.setdefault("REDIS_PASSWORD", "local-proof-redis-password")

class Settings:
    environment: str = os.getenv("ENVIRONMENT", "production")
    app_env: str = environment.lower()
    is_production: bool = app_env == "production"
    secret_key: str = os.getenv("JWT_SECRET", os.getenv("SECRET_KEY", ""))
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    jwt_expiry_hours: int = int(os.getenv("JWT_EXPIRY_HOURS", "8"))

    # Database
    database_url: str = os.getenv("POSEIDON_DATABASE_URL", os.getenv("DATABASE_URL", ""))
    db_host: str = os.getenv("POSTGRES_HOST", "localhost")
    db_port: int = int(os.getenv("POSTGRES_PORT", "5432"))
    db_name: str = os.getenv("POSTGRES_DB", "poseidon_db")
    db_user: str = os.getenv("POSTGRES_USER", "poseidon")
    db_password: str = os.getenv("POSTGRES_PASSWORD", "")
    db_pool_size: int = int(os.getenv("DB_POOL_SIZE", "10"))
    db_max_overflow: int = int(os.getenv("DB_MAX_OVERFLOW", "20"))

    # Redis
    redis_url_value: str = os.getenv("REDIS_URL", "")
    redis_host: str = os.getenv("REDIS_HOST", "localhost")
    redis_port: int = int(os.getenv("REDIS_PORT", "6379"))
    redis_password: str = os.getenv("REDIS_PASSWORD", "")

    # API keys / internal service auth
    poseidon_api_key: str = os.getenv("POSEIDON_API_KEY", "")
    internal_api_key: str = os.getenv("INTERNAL_API_KEY", "")

    # MinIO
    minio_endpoint: str = os.getenv("MINIO_ENDPOINT", "localhost:9000")
    minio_access_key: str = os.getenv("MINIO_ACCESS_KEY", "poseidon")
    minio_secret_key: str = os.getenv("MINIO_SECRET_KEY", "")
    minio_secure: bool = os.getenv("MINIO_SECURE", "false").lower() == "true"
    # Prefer MINIO_BUCKET; MINIO_BUCKET_DOCUMENTS is a common alternate env name in multi-bucket setups.
    minio_bucket: str = (
        os.getenv("MINIO_BUCKET", "").strip()
        or os.getenv("MINIO_BUCKET_DOCUMENTS", "").strip()
        or "poseidon-docs"
    )

    # Service URLs
    core_url: str = os.getenv("CORE_API_URL", "http://localhost:8001")
    trident_url: str = os.getenv("TRIDENT_API_URL", "http://localhost:8002")
    intake_url: str = os.getenv("INTAKE_API_URL", "http://localhost:8003")
    ml_url: str = os.getenv("ML_API_URL", "http://localhost:8004")
    edi_api_url: str = os.getenv("EDI_API_URL", "http://localhost:8006").strip()

    # Operational
    phi_in_logs: bool = os.getenv("PHI_IN_LOGS", "false").lower() == "true"
    denial_threshold: float = float(os.getenv("DENIAL_THRESHOLD", "0.65"))
    write_off_threshold: float = float(os.getenv("WRITE_OFF_DOLLAR_THRESHOLD", "50.0"))
    # Fax/OCR: if parsed confidence is below this (0â€“1), do not auto-create patient; intake_incomplete + review queue.
    intake_ocr_confidence_threshold: float = float(os.getenv("INTAKE_OCR_CONFIDENCE_THRESHOLD", "0.55"))
    # Billing: require orders.billing_ready_at before 837 submit-from-order / raw submit with order_id (set false only for break-glass).
    billing_claim_require_billing_ready: bool = os.getenv("BILLING_CLAIM_REQUIRE_BILLING_READY", "true").lower() == "true"
    # Block a second successful claim_submissions row per order (error status allows retry until DB unique index catches dup success).
    billing_claim_block_duplicate_submission: bool = os.getenv("BILLING_CLAIM_BLOCK_DUPLICATE_SUBMISSION", "true").lower() == "true"
    appeal_window_days: int = int(os.getenv("APPEAL_WINDOW_DAYS", "60"))
    min_training_records: int = int(os.getenv("MIN_TRAINING_RECORDS", "25"))
    trident_learning_mode: str = os.getenv("TRIDENT_LEARNING_MODE", "continuous").lower()
    trident_learning_interval_minutes: int = int(os.getenv("TRIDENT_LEARNING_INTERVAL_MINUTES", "15"))
    trident_learning_lookback_days: int = int(os.getenv("TRIDENT_LEARNING_LOOKBACK_DAYS", "365"))
    trident_learning_auto_retrain: bool = os.getenv("TRIDENT_LEARNING_AUTO_RETRAIN", "true").lower() == "true"

    # Availity (eligibility / coverage APIs)
    availity_base_url: str = os.getenv("AVAILITY_BASE_URL", "")
    availity_client_id: str = os.getenv("AVAILITY_CLIENT_ID", "")
    availity_client_secret: str = os.getenv("AVAILITY_CLIENT_SECRET", "")
    availity_token_url: str = os.getenv("AVAILITY_TOKEN_URL", "")
    availity_eligibility_url: str = os.getenv("AVAILITY_ELIGIBILITY_URL", "")
    availity_sender_id: str = os.getenv("AVAILITY_SENDER_ID", "POSEIDON")
    availity_receiver_id: str = os.getenv("AVAILITY_RECEIVER_ID", "AVAILITY")
    availity_default_provider_npi: str = os.getenv("AVAILITY_DEFAULT_PROVIDER_NPI", "")

    # Availity Billing (837 claim submission, 835 ERA)
    availity_claims_url: str = os.getenv("AVAILITY_CLAIMS_URL", "")
    availity_claim_status_url: str = os.getenv("AVAILITY_CLAIM_STATUS_URL", "")
    availity_billing_tin: str = os.getenv("AVAILITY_BILLING_TIN", "")  # EIN for 1000A

    # Dropbox Sign / workflow automation
    dropbox_sign_request_url: str = os.getenv("DROPBOX_SIGN_REQUEST_URL", "")
    dropbox_sign_api_key: str = os.getenv("DROPBOX_SIGN_API_KEY", "")
    dropbox_sign_webhook_secret: str = os.getenv("DROPBOX_SIGN_WEBHOOK_SECRET", "")
    storage_path: str = os.getenv("STORAGE_PATH", "/data")

    # Communications / integrations
    smtp_host: str = os.getenv("SMTP_HOST", "")
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_user: str = os.getenv("SMTP_USER", "")
    smtp_password: str = os.getenv("SMTP_PASSWORD", "")
    email_from_address: str = os.getenv("EMAIL_FROM_ADDRESS", "")
    google_client_id: str = os.getenv("GOOGLE_CLIENT_ID", "")
    google_client_secret: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    google_refresh_token: str = os.getenv("GOOGLE_REFRESH_TOKEN", "")
    google_calendar_id: str = os.getenv("GOOGLE_CALENDAR_ID", "")
    cors_origins: list[str] = _csv_env(
        "CORS_ALLOW_ORIGINS",
        "https://dashboard.strykefox.com,https://www.strykefox.com,https://strykefox.com",
    )
    trusted_hosts: list[str] = _csv_env(
        "TRUSTED_HOSTS",
        "dashboard.strykefox.com,app.strykefox.com,api.strykefox.com,"
        "trident.strykefox.com,intake.strykefox.com,ml.strykefox.com,"
        "*.up.railway.app,localhost,127.0.0.1,core,trident,intake,ml,edi,availity,poseidon_core,poseidon_trident,"
        "poseidon_intake,poseidon_ml,poseidon_edi",
    )
    expose_docs: bool = os.getenv("EXPOSE_API_DOCS", "false").lower() == "true"

    @property
    def db_dsn(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"host={self.db_host} port={self.db_port} "
            f"dbname={self.db_name} user={self.db_user} "
            f"password={self.db_password} sslmode=require"
        )

    @property
    def redis_url(self) -> str:
        if self.redis_url_value:
            return self.redis_url_value
        if not self.redis_password:
            return f"redis://{self.redis_host}:{self.redis_port}/0"
        return f"redis://:{self.redis_password}@{self.redis_host}:{self.redis_port}/0"

    def validate(self) -> None:
        # Hard-required: service cannot function at all without these.
        hard_required: dict[str, str] = {
            "JWT_SECRET": self.secret_key,
            "POSEIDON_API_KEY": self.poseidon_api_key,
            "INTERNAL_API_KEY": self.internal_api_key,
            "MINIO_SECRET_KEY": self.minio_secret_key,
        }
        # Managed providers (e.g. Render) supply full URLs; discrete passwords only needed otherwise.
        if not self.database_url or _is_placeholder(self.database_url):
            hard_required["POSTGRES_PASSWORD"] = self.db_password
        hard_invalid = [name for name, value in hard_required.items() if _is_placeholder(value)]
        if hard_invalid and self.is_production:
            joined = ", ".join(sorted(hard_invalid))
            raise RuntimeError(f"Missing required production secrets: {joined}")

        if self.is_production:
            if any(origin in {"http://localhost", "http://127.0.0.1"} for origin in self.cors_origins):
                raise RuntimeError(
                    "CORS_ALLOW_ORIGINS contains localhost in production. "
                    "Only deployed origins are permitted."
                )
            if self.smtp_host and (
                _is_placeholder(self.smtp_user)
                or _is_placeholder(self.smtp_password)
                or _is_placeholder(self.email_from_address)
            ):
                raise RuntimeError(
                    "SMTP_HOST is configured but SMTP credentials are incomplete: "
                    "SMTP_USER, SMTP_PASSWORD, EMAIL_FROM_ADDRESS required."
                )
            if any(
                not _is_placeholder(value)
                for value in (
                    self.google_client_id,
                    self.google_client_secret,
                    self.google_refresh_token,
                )
            ):
                if _is_placeholder(self.google_client_id) or _is_placeholder(self.google_client_secret) or _is_placeholder(self.google_refresh_token):
                    raise RuntimeError(
                        "Google integration is partially configured. "
                        "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN are all required."
                    )


settings = Settings()
settings.validate()


# ---------------------------------------------------------------------------
# State container â€” attached to app.state
# ---------------------------------------------------------------------------

class AppState:
    db_pool: AsyncConnectionPool | None = None
    redis: aioredis.Redis | None = None
    redis_available: bool = False


def _redis_host_for_log(redis_url: str) -> str:
    try:
        parsed = urlparse(redis_url)
        return parsed.hostname or settings.redis_host or "unknown"
    except Exception:
        return settings.redis_host or "unknown"


async def _connect_redis_with_timeout(timeout: float = 5) -> aioredis.Redis | None:
    async def connect_and_ping() -> aioredis.Redis:
        client = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
        await client.ping()
        return client

    try:
        return await asyncio.wait_for(connect_and_ping(), timeout=timeout)
    except Exception as exc:
        logger.warning(
            "Redis unavailable; starting in degraded cache mode. host=%s error=%s",
            _redis_host_for_log(settings.redis_url),
            exc,
        )
        return None


async def _check_dependencies(request: Request, include_minio: bool = True) -> dict[str, str]:
    db_pool = getattr(request.app.state, "db_pool", None)
    redis = getattr(request.app.state, "redis", None)
    redis_available = bool(getattr(request.app.state, "redis_available", False))

    db_status = "up"
    redis_status = "up" if redis is not None and redis_available else "down"
    minio_status = "ok"

    if db_pool is None:
        db_status = "down"
    else:
        try:
            async with db_pool.connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("SELECT 1")
                    await cur.fetchone()
        except Exception as exc:
            logger.exception("Database readiness check failed: %s", exc)
            db_status = "down"

    if redis is not None and redis_available:
        try:
            await asyncio.wait_for(redis.ping(), timeout=2)
        except Exception as exc:
            logger.warning(
                "Redis readiness check failed; reporting degraded cache mode. host=%s error=%s",
                _redis_host_for_log(settings.redis_url),
                exc,
            )
            redis_status = "down"

    if include_minio:
        minio_scheme = "https" if settings.minio_secure else "http"
        minio_url = f"{minio_scheme}://{settings.minio_endpoint}/minio/health/live"
        try:
            with urllib_request.urlopen(minio_url, timeout=5) as response:
                if response.status >= 400:
                    minio_status = "error"
        except (urllib_error.URLError, TimeoutError, ValueError) as exc:
            logger.exception("MinIO readiness check failed for %s: %s", minio_url, exc)
            minio_status = "error"

    return {"postgres": db_status, "redis": redis_status, "minio": minio_status}


# ---------------------------------------------------------------------------
# Lifespan context (replaces on_startup/on_shutdown)
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Boot: connect DB + Redis. Shutdown: close connections."""
    state = AppState()

    if LOCAL_PROOF_MODE:
        logger.warning("LOCAL_PROOF_MODE=true; skipping PostgreSQL and Redis startup connections.")
        app.state.db_pool = None
        app.state.redis = None
        app.state.redis_available = False
        yield
        logger.warning("LOCAL_PROOF_MODE=true; no external connections to close.")
        return

    # DB pool
    state.db_pool = AsyncConnectionPool(
        conninfo=settings.db_dsn,
        min_size=2,
        max_size=settings.db_pool_size,
        kwargs={"autocommit": True},
        open=False,
        # Railway (and most cloud proxies) silently drop idle TCP sessions.
        # Without these settings the pool hands out dead connections after an
        # idle period and every endpoint 500s until a manual redeploy.
        check=AsyncConnectionPool.check_connection,  # validate on checkout
        max_idle=300,        # recycle connections idle > 5 min
        max_lifetime=1800,   # hard-recycle connections older than 30 min
        reconnect_timeout=120,
    )
    await state.db_pool.open()
    logger.info("PostgreSQL pool open")

    # Redis is cache-only. A dead cache must never prevent API startup.
    state.redis = await _connect_redis_with_timeout(timeout=5)
    state.redis_available = state.redis is not None
    if state.redis_available:
        logger.info("Redis connected")

    app.state.db_pool = state.db_pool
    app.state.redis = state.redis
    app.state.redis_available = state.redis_available

    # Per-service background tasks (e.g. Trident's continuous learning loop).
    # Services register coroutine functions taking `app` on
    # `app.service_background_tasks` at import time; they are started here so
    # they run under the app's lifespan and get cancelled cleanly on shutdown.
    bg_tasks: list[asyncio.Task] = []
    for hook in getattr(app, "service_background_tasks", []):
        bg_tasks.append(asyncio.create_task(hook(app)))
    if bg_tasks:
        logger.info("Started %d service background task(s)", len(bg_tasks))

    yield

    # Teardown
    for task in bg_tasks:
        task.cancel()
    if bg_tasks:
        await asyncio.gather(*bg_tasks, return_exceptions=True)
    await state.db_pool.close()
    if state.redis is not None:
        await state.redis.aclose()
    logger.info("Connections closed")


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def create_app(
    title: str,
    version: str = "1.0.0",
    description: str = "",
) -> FastAPI:
    app = FastAPI(
        title=title,
        version=version,
        description=description,
        lifespan=lifespan,
        docs_url="/docs" if (not settings.is_production or settings.expose_docs) else None,
        redoc_url=None,
    )

    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=settings.trusted_hosts or ["*"],
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "X-Internal-API-Key",
            "X-Requested-With",
            "X-Correlation-ID",
            "Idempotency-Key",
        ],
    )

    @app.middleware("http")
    async def correlation_id_middleware(request: Request, call_next):
        cid = (request.headers.get("X-Correlation-ID") or "").strip() or str(uuid.uuid4())
        request.state.correlation_id = cid
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = cid
        return response

    # Request timing middleware
    @app.middleware("http")
    async def add_timing(request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000
        response.headers["X-Response-Time-Ms"] = f"{duration_ms:.1f}"
        return response

    # Global exception handler â€” no stack traces to client
    @app.exception_handler(Exception)
    async def global_error_handler(request: Request, exc: Exception):
        logger.exception("Unhandled exception: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": "Internal server error",
                "detail": str(exc)[:200] if not settings.is_production else "unexpected_error",
            },
        )

    @app.exception_handler(HTTPException)
    async def http_error_handler(request: Request, exc):
        detail = exc.detail if isinstance(exc.detail, str) else "Request failed"
        extra = None if isinstance(exc.detail, str) else exc.detail
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": detail, "detail": extra} if extra else {"error": detail},
        )

    @app.get("/health", include_in_schema=False)
    async def health(request: Request):
        checks = await _check_dependencies(request, include_minio=False)
        postgres_up = checks["postgres"] == "up"
        redis_up = checks["redis"] == "up"
        return JSONResponse(
            status_code=status.HTTP_200_OK if postgres_up else status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "ok" if postgres_up and redis_up else "degraded",
                "postgres": checks["postgres"],
                "redis": checks["redis"],
            },
        )

    @app.get("/live", include_in_schema=False)
    async def live():
        return {"status": "alive", "service": title}

    @app.get("/ready", include_in_schema=False)
    async def ready(request: Request):
        checks = await _check_dependencies(request)
        is_ready = checks["postgres"] == "up"
        return JSONResponse(
            status_code=status.HTTP_200_OK if is_ready else status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "ready" if is_ready and checks["redis"] == "up" else "degraded",
                "service": title,
                "checks": checks,
            },
        )

    return app


# ---------------------------------------------------------------------------
# DB helper
# ---------------------------------------------------------------------------

async def get_db(request: Request) -> AsyncGenerator[Any, None]:
    async with request.app.state.db_pool.connection() as conn:
        yield conn


# ---------------------------------------------------------------------------
# Redis helper
# ---------------------------------------------------------------------------

def get_redis(request: Request) -> aioredis.Redis | None:
    return request.app.state.redis


async def cache_get(state: Any, key: str) -> str | None:
    redis = getattr(state, "redis", None)
    if redis is None:
        return None
    try:
        return await redis.get(key)
    except Exception as exc:
        logger.warning("Redis cache get skipped after error. key=%s error=%s", key, exc)
        return None


async def cache_set(state: Any, key: str, value: str, ttl: int | None = None) -> None:
    redis = getattr(state, "redis", None)
    if redis is None:
        return
    try:
        if ttl is None:
            await redis.set(key, value)
        else:
            await redis.set(key, value, ex=ttl)
    except Exception as exc:
        logger.warning("Redis cache set skipped after error. key=%s error=%s", key, exc)


async def cache_delete(state: Any, *keys: str) -> None:
    redis = getattr(state, "redis", None)
    if redis is None or not keys:
        return
    try:
        await redis.delete(*keys)
    except Exception as exc:
        logger.warning("Redis cache delete skipped after error. keys=%s error=%s", ",".join(keys), exc)


async def cache_publish(state: Any, channel: str, message: str) -> None:
    redis = getattr(state, "redis", None)
    if redis is None:
        return
    try:
        await redis.publish(channel, message)
    except Exception as exc:
        logger.warning("Redis cache publish skipped after error. channel=%s error=%s", channel, exc)


async def cache_rpush(state: Any, key: str, value: str) -> None:
    redis = getattr(state, "redis", None)
    if redis is None:
        return
    try:
        await redis.rpush(key, value)
    except Exception as exc:
        logger.warning("Redis cache queue push skipped after error. key=%s error=%s", key, exc)
