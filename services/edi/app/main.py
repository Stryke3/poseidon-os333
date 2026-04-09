"""
POSEIDON EDI Service — Main Application
Port 8006 | Bidirectional EDI Pipeline

Outbound: 837P claim submission via Availity SFTP or Stedi API
Inbound:  835 ERA remittance parsing, auto-posting, denial classification

Submission modes (set via SUBMISSION_METHOD env var):
  availity_sftp  — Generate raw X12, upload to files.availity.com/SendFiles (DEFAULT)
  stedi_api      — POST JSON to Stedi Healthcare API (handles X12 + routing)

Routes:
  /api/v1/claims/*      — 837P submission, validation, status, batch
  /api/v1/remittance/*   — 835 upload, parsing, auto-posting, denial worklist
  /api/v1/sftp/*         — SFTP mailbox management (list, download 835s)
  /health                — Service health check
"""
import os
import logging
from contextlib import asynccontextmanager

import uuid

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.database import get_pool, close_pool
from app.deps import require_edi_caller
from app.routers import claims_837p, remittance_835
from app.clients.stedi import stedi_client
from app.clients.availity_sftp import availity_sftp

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)
log = logging.getLogger("edi")

SERVICE_PORT = int(os.getenv("SERVICE_PORT", "8006"))
DRY_RUN = os.getenv("EDI_DRY_RUN", "false").lower() == "true"
SUBMISSION_METHOD = os.getenv("SUBMISSION_METHOD", "availity_sftp")  # availity_sftp or stedi_api
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")
ENVIRONMENT = os.getenv("ENVIRONMENT", os.getenv("NODE_ENV", "development")).lower()


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def _validate_startup_secrets() -> None:
    _required_env("DATABASE_URL")

    if ENVIRONMENT == "production" and DRY_RUN:
        raise RuntimeError("EDI_DRY_RUN cannot be enabled in production.")

    if SUBMISSION_METHOD not in {"availity_sftp", "stedi_api"}:
        raise RuntimeError("SUBMISSION_METHOD must be either 'availity_sftp' or 'stedi_api'.")

    if SUBMISSION_METHOD == "availity_sftp":
        _required_env("AVAILITY_SFTP_USER")
        _required_env("AVAILITY_SFTP_PASS")
    elif SUBMISSION_METHOD == "stedi_api":
        _required_env("STEDI_API_KEY")


_validate_startup_secrets()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: init DB pool. Shutdown: close pool."""
    log.info(f"EDI Service starting on port {SERVICE_PORT}")
    log.info(f"  Submission method: {SUBMISSION_METHOD}")
    log.info(f"  Dry run: {DRY_RUN}")

    pool = await get_pool()
    log.info(f"  Database pool: {pool.get_size()} connections")

    # Set config on claims router
    claims_837p.DRY_RUN = DRY_RUN
    claims_837p.SUBMISSION_METHOD = SUBMISSION_METHOD

    if DRY_RUN:
        log.warning("*** DRY RUN MODE — claims will NOT be submitted to clearinghouse ***")

    yield

    await close_pool()
    log.info("EDI Service shutdown complete")


app = FastAPI(
    title="POSEIDON EDI Service",
    description="Bidirectional EDI: 837P claim submission + 835 ERA remittance processing",
    version="2.0.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def edi_correlation_middleware(request: Request, call_next):
    cid = (request.headers.get("X-Correlation-ID") or "").strip() or str(uuid.uuid4())
    request.state.correlation_id = cid
    response = await call_next(request)
    response.headers["X-Correlation-ID"] = cid
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(claims_837p.router)
app.include_router(remittance_835.router)


# --- SFTP MAILBOX ROUTES ---

sftp_router = APIRouter(
    prefix="/api/v1/sftp",
    tags=["SFTP Mailbox"],
    dependencies=[Depends(require_edi_caller)],
)


@sftp_router.get("/mailbox")
async def list_sftp_mailbox():
    """List all files in Availity SFTP mailbox."""
    files = await availity_sftp.list_mailbox()
    return {"host": availity_sftp.host, "files": files}


@sftp_router.post("/poll-835")
async def poll_835_files():
    """Download new 835 ERA files from Availity SFTP mailbox."""
    from app.parsers.era_835 import parse_835_x12
    from app.database import get_db_transaction, audit_log, to_json

    era_files = await availity_sftp.download_new_835s()
    if not era_files:
        return {"message": "No new 835 files found", "files_processed": 0}

    results = []
    for ef in era_files:
        try:
            parsed = parse_835_x12(ef["content"])
            results.append({
                "filename": ef["filename"],
                "claims": parsed["summary"]["total_claims"],
                "paid": parsed["summary"]["total_paid"],
                "denials": parsed["summary"]["total_denied"],
                "status": "parsed",
            })
        except Exception as e:
            results.append({
                "filename": ef["filename"],
                "status": "error",
                "error": str(e)[:200],
            })

    return {
        "files_processed": len(era_files),
        "results": results,
    }


@sftp_router.post("/poll-acks")
async def poll_acknowledgment_files():
    """Download 999/277 acknowledgment files from Availity SFTP mailbox."""
    ack_files = await availity_sftp.download_acknowledgments()
    return {
        "files_found": len(ack_files),
        "files": [{"filename": f["filename"], "size": f["size"]} for f in ack_files],
    }


app.include_router(sftp_router)


# --- HEALTH CHECK ---

@app.get("/health")
async def health():
    """Health check for Docker/nginx/load balancer."""
    from app.database import get_pool as _get_pool

    db_ok = False
    sftp_ok = False
    stedi_ok = False

    try:
        pool = await _get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        db_ok = True
    except Exception as e:
        log.error(f"DB health check failed: {e}")

    if SUBMISSION_METHOD == "availity_sftp":
        try:
            sftp_ok = await availity_sftp.health_check()
        except Exception:
            pass
    else:
        try:
            stedi_ok = await stedi_client.health_check()
        except Exception:
            pass

    status = "ok" if db_ok else "degraded"
    return {
        "status": status,
        "service": "edi",
        "version": "2.0.0",
        "dry_run": DRY_RUN,
        "submission_method": SUBMISSION_METHOD,
        "database": "connected" if db_ok else "disconnected",
        "availity_sftp": "connected" if sftp_ok else ("not_configured" if not os.getenv("AVAILITY_SFTP_USER") else "disconnected") if SUBMISSION_METHOD == "availity_sftp" else "n/a",
        "stedi": "connected" if stedi_ok else ("not_configured" if not os.getenv("STEDI_API_KEY") else "disconnected") if SUBMISSION_METHOD == "stedi_api" else "n/a",
    }


@app.get("/")
async def root():
    return {
        "service": "POSEIDON EDI Service",
        "version": "2.0.0",
        "submission_method": SUBMISSION_METHOD,
        "endpoints": {
            "837P_claims": "/api/v1/claims/",
            "835_remittance": "/api/v1/remittance/",
            "sftp_mailbox": "/api/v1/sftp/",
            "health": "/health",
            "docs": "/docs",
        },
    }
