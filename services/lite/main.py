"""
POSEIDON Lite Service — PDF Generation & OCR
Lightweight service for document processing: PDF generation and OCR parsing.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="Poseidon Lite — Document Processing",
    version="0.1.0",
    lifespan=lifespan,
)


class HealthResponse(BaseModel):
    status: str
    service: str


@app.get("/health", response_model=HealthResponse)
async def health() -> dict[str, Any]:
    return {"status": "ok", "service": "lite"}
