"""
POSEIDON EDI Service — Main Application
Port 8006 | Bidirectional EDI Pipeline

Outbound: 837P claim submission via Stedi API
Inbound:  835 ERA remittance parsing, auto-posting, denial classification

Routes:
  /api/v1/claims/*      — 837P submission, validation, status, batch
  /api/v1/remittance/*   — 835 upload, parsing, auto-posting, denial worklist
  /health                — Service health check
"""
import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import get_pool, close_pool
from app.routers import claims_837p, remittance_835
from app.clients.stedi import stedi_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)
log = logging.getLogger("edi")

SERVICE_PORT = int(os.getenv("SERVICE_PORT", "8006"))
DRY_RUN = os.getenv("EDI_DRY_RUN", "false").lower() == "true"
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: init DB pool. Shutdown: close pool."""
    log.info(f"EDI Service starting on port {SERVICE_PORT} (dry_run={DRY_RUN})")
    pool = await get_pool()
    log.info(f"Database pool initialized ({pool.get_size()} connections)")

    # Set dry_run flag on claims router
    claims_837p.DRY_RUN = DRY_RUN
    if DRY_RUN:
        log.warning("*** DRY RUN MODE — claims will NOT be submitted to clearinghouse ***")

    yield

    await close_pool()
    log.info("EDI Service shutdown complete")


app = FastAPI(
    title="POSEIDON EDI Service",
    description="Bidirectional EDI: 837P claim submission + 835 ERA remittance processing",
    version="1.0.0",
    lifespan=lifespan,
)

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


@app.get("/health")
async def health():
    """Health check for Docker/nginx/load balancer."""
    from app.database import get_pool as _get_pool

    db_ok = False
    stedi_ok = False

    try:
        pool = await _get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        db_ok = True
    except Exception as e:
        log.error(f"DB health check failed: {e}")

    try:
        stedi_ok = await stedi_client.health_check()
    except Exception:
        pass

    status = "ok" if db_ok else "degraded"
    return {
        "status": status,
        "service": "edi",
        "version": "1.0.0",
        "dry_run": DRY_RUN,
        "database": "connected" if db_ok else "disconnected",
        "stedi": "connected" if stedi_ok else "not_configured" if not os.getenv("STEDI_API_KEY") else "disconnected",
    }


@app.get("/")
async def root():
    return {
        "service": "POSEIDON EDI Service",
        "version": "1.0.0",
        "endpoints": {
            "837P_claims": "/api/v1/claims/",
            "835_remittance": "/api/v1/remittance/",
            "health": "/health",
            "docs": "/docs",
        },
    }
