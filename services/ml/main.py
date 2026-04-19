# =============================================================================
# POSEIDON ML Service — Port 8004
# Training pipeline, model retraining, denial pattern analysis
# Consumes from Redis queues, trains on data drop folder contents
# =============================================================================

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from fastapi import HTTPException, Request
from pydantic import BaseModel
from psycopg.rows import dict_row  # type: ignore[import-untyped]
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
from sklearn.feature_extraction import DictVectorizer
from sklearn.metrics import accuracy_score, mean_absolute_error
from sklearn.model_selection import train_test_split

# Shared module: Docker has /app/shared; local uses repo/services/shared
_shared_dir = Path("/app/shared") if Path("/app/shared").exists() else (Path(__file__).resolve().parent.parent / "shared")
sys.path.insert(0, str(_shared_dir))
from base import create_app, get_redis, logger, settings

# ---------------------------------------------------------------------------
app = create_app(
    title="POSEIDON ML Service",
    version="2.0.0",
    description="Denial pattern ML, training pipeline, reimbursement optimization",
)

MODELS_DIR = Path("/app/models")
DATA_DIR = Path("/app/data")
MODELS_DIR.mkdir(exist_ok=True)
BASELINE_CLASSIFIER_PATH = MODELS_DIR / "denial_classifier.joblib"
BASELINE_REGRESSOR_PATH = MODELS_DIR / "reimbursement_regressor.joblib"
ORG_OVERLAY_DIR = MODELS_DIR / "org_overlays"
ORG_OVERLAY_DIR.mkdir(exist_ok=True)


def sql(query: str) -> str:
    return re.sub(r"\$\d+", "%s", query)


async def fetch_one(conn, query: str, *params):
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(sql(query), params)
        return await cur.fetchone()


async def fetch_all(conn, query: str, *params):
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(sql(query), params)
        return await cur.fetchall()


async def exec_write(conn, query: str, *params) -> int:
    async with conn.cursor() as cur:
        await cur.execute(sql(query), params)
        return cur.rowcount


def _serialize(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _serialize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_serialize(v) for v in value]
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            return str(value)
    return value

# ---------------------------------------------------------------------------
# In-memory training store (persisted to disk)
# ---------------------------------------------------------------------------

class TrainingStore:
    def __init__(self):
        self.records: list[dict] = []
        self.store_path = MODELS_DIR / "training_records.json"
        self._load()

    def _load(self):
        if self.store_path.exists():
            try:
                self.records = json.loads(self.store_path.read_text())
                logger.info("Loaded %d training records", len(self.records))
            except Exception as e:
                logger.warning("Could not load training records: %s", e)
                self.records = []

    def add(self, record: dict):
        record["ingested_at"] = datetime.now(timezone.utc).isoformat()
        self.records.append(record)
        self._persist()

    def _persist(self):
        try:
            self.store_path.write_text(json.dumps(self.records, indent=2))
        except Exception as e:
            logger.error("Failed to persist training records: %s", e)

    @property
    def count(self) -> int:
        return len(self.records)

    def denial_records(self) -> list[dict]:
        return [r for r in self.records if r.get("was_denied")]

    def paid_records(self) -> list[dict]:
        return [r for r in self.records if not r.get("was_denied")]


store = TrainingStore()


# ---------------------------------------------------------------------------
# Denial Pattern Analyzer
# ---------------------------------------------------------------------------

class DenialPatternAnalyzer:

    def analyze(self, records: list[dict]) -> dict:
        if not records:
            return {"error": "No records to analyze"}

        carc_counter: Counter = Counter()
        payer_denial: dict[str, list] = defaultdict(list)
        hcpcs_denial: dict[str, int] = defaultdict(int)
        hcpcs_total: dict[str, int] = defaultdict(int)
        category_counter: Counter = Counter()

        for r in records:
            payer = r.get("payer_id", "UNKNOWN")
            denied = r.get("was_denied", False)

            for code in r.get("hcpcs_codes", []):
                hcpcs_total[code] += 1
                if denied:
                    hcpcs_denial[code] += 1

            if denied:
                carc = r.get("carc_code")
                if carc:
                    carc_counter[carc] += 1
                cat = r.get("denial_category")
                if cat:
                    category_counter[cat] += 1
                payer_denial[payer].append(1)
            else:
                payer_denial[payer].append(0)

        # Payer denial rates
        payer_rates = {
            payer: {
                "denial_rate": round(sum(vals) / len(vals), 4),
                "total_claims": len(vals),
            }
            for payer, vals in payer_denial.items()
        }

        # HCPCS denial rates
        hcpcs_rates = {
            code: {
                "denial_rate": round(hcpcs_denial[code] / hcpcs_total[code], 4),
                "denied": hcpcs_denial[code],
                "total": hcpcs_total[code],
            }
            for code in hcpcs_total
            if hcpcs_total[code] >= 3  # min sample size
        }

        overall_denial_rate = len([r for r in records if r.get("was_denied")]) / len(records)

        return {
            "total_records": len(records),
            "overall_denial_rate": round(overall_denial_rate, 4),
            "overall_denial_rate_pct": f"{overall_denial_rate * 100:.1f}%",
            "vs_industry_baseline": f"{(0.45 - overall_denial_rate) * 100:+.1f}pp vs 45% industry",
            "top_carc_codes": dict(carc_counter.most_common(10)),
            "denial_by_category": dict(category_counter.most_common()),
            "denial_by_payer": dict(sorted(payer_rates.items(), key=lambda x: x[1]["denial_rate"], reverse=True)),
            "denial_by_hcpcs": dict(sorted(hcpcs_rates.items(), key=lambda x: x[1]["denial_rate"], reverse=True)[:20]),
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
        }

    def compute_diagnosis_weights(self, records: list[dict]) -> dict[str, float]:
        """Compute updated ICD-10 → denial risk weights from training data."""
        dx_denial: dict[str, list] = defaultdict(list)

        for r in records:
            denied = r.get("was_denied", False)
            for dx in r.get("diagnosis_codes", []):
                dx_denial[dx].append(1 if denied else 0)

        weights = {}
        for dx, outcomes in dx_denial.items():
            if len(outcomes) >= 5:  # min sample
                denial_rate = sum(outcomes) / len(outcomes)
                # Invert: high denial rate → low medical necessity score
                weights[dx] = round(1.0 - denial_rate, 4)

        return weights

    def expected_reimbursement(self, hcpcs: str, payer_id: str) -> dict:
        """Estimate expected reimbursement from historical records."""
        paid = [
            r.get("paid_amount", 0)
            for r in store.paid_records()
            if hcpcs in r.get("hcpcs_codes", []) and r.get("payer_id") == payer_id
        ]
        if not paid:
            return {"hcpcs": hcpcs, "payer_id": payer_id, "estimated": None, "sample_size": 0}

        return {
            "hcpcs": hcpcs,
            "payer_id": payer_id,
            "estimated_reimbursement": round(np.mean(paid), 2),
            "min": round(min(paid), 2),
            "max": round(max(paid), 2),
            "percentile_25": round(float(np.percentile(paid, 25)), 2),
            "percentile_75": round(float(np.percentile(paid, 75)), 2),
            "sample_size": len(paid),
        }


analyzer = DenialPatternAnalyzer()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class TrainingBatch(BaseModel):
    records: list[dict]
    source: str = "manual"  # manual | eob_import | google_sheets | csv


class ReimbursementQuery(BaseModel):
    hcpcs: str
    payer_id: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.post("/train/batch")
async def train_batch(payload: TrainingBatch):
    """Ingest a batch of labeled outcome records for ML training."""
    added = 0
    for rec in payload.records:
        store.add({**rec, "source": payload.source})
        added += 1

    return {
        "added": added,
        "total_records": store.count,
        "source": payload.source,
        "ready_for_analysis": store.count >= int(os.getenv("MIN_TRAINING_RECORDS", "100")),
    }


@app.get("/patterns")
async def get_patterns():
    """Full denial pattern analysis across all training data."""
    if store.count < 10:
        return {"warning": f"Only {store.count} records — need at least 10 for meaningful analysis"}
    return analyzer.analyze(store.records)


@app.get("/patterns/payer/{payer_id}")
async def get_payer_patterns(payer_id: str):
    """Denial patterns filtered to a specific payer."""
    records = [r for r in store.records if r.get("payer_id") == payer_id.upper()]
    if not records:
        raise HTTPException(status_code=404, detail=f"No records for payer {payer_id}")
    return {**analyzer.analyze(records), "payer_filter": payer_id}


@app.get("/patterns/hcpcs/{hcpcs}")
async def get_hcpcs_patterns(hcpcs: str):
    """Denial patterns for a specific HCPCS code."""
    records = [r for r in store.records if hcpcs.upper() in r.get("hcpcs_codes", [])]
    if not records:
        raise HTTPException(status_code=404, detail=f"No records for HCPCS {hcpcs}")
    return {**analyzer.analyze(records), "hcpcs_filter": hcpcs}


@app.post("/reimbursement/estimate")
async def estimate_reimbursement(query: ReimbursementQuery):
    return analyzer.expected_reimbursement(query.hcpcs.upper(), query.payer_id.upper())


@app.post("/weights/recompute")
async def recompute_weights():
    """Recompute diagnosis → medical necessity weights from training data."""
    if store.count < 50:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient training data ({store.count} records, need 50+)",
        )
    weights = analyzer.compute_diagnosis_weights(store.records)
    weights_path = MODELS_DIR / "diagnosis_weights.json"
    weights_path.write_text(json.dumps(weights, indent=2))
    return {
        "weights_computed": len(weights),
        "saved_to": str(weights_path),
        "sample": dict(list(weights.items())[:5]),
    }


@app.get("/status")
async def ml_status():
    return {
        "training_records": store.count,
        "denial_records": len(store.denial_records()),
        "paid_records": len(store.paid_records()),
        "models_dir": str(MODELS_DIR),
        "min_records_required": int(os.getenv("MIN_TRAINING_RECORDS", "100")),
        "ready": store.count >= 100,
        "data_dir_contents": {
            folder: len(list((DATA_DIR / folder).glob("*"))) if (DATA_DIR / folder).exists() else 0
            for folder in ["eobs", "denials", "appeals", "spreadsheets", "training", "processed"]
        },
    }


@app.get("/training/export")
async def export_training_data():
    """Export all training records for external analysis."""
    return {
        "count": store.count,
        "records": store.records,
        "exported_at": datetime.now(timezone.utc).isoformat(),
    }


# Background task: consume Redis training queue
@app.on_event("startup")
async def start_queue_consumer():
    asyncio.create_task(_consume_training_queue())


async def _consume_training_queue():
    await asyncio.sleep(3)  # let startup settle
    import os

    import httpx
    import redis.asyncio as aioredis

    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    trident_url = (
        os.getenv("TRIDENT_SERVICE_URL") or os.getenv("TRIDENT_API_URL") or "http://trident:8002"
    ).rstrip("/")
    auto_retrain = os.getenv("TRIDENT_RETRAIN_AFTER_DENIAL_IMPORT", "false").lower() == "true"
    logger.info("ML queue consumer started")
    while True:
        try:
            item = await r.blpop(["trident:training_queue", "intake:eob_processed", "intake:denial_file_uploaded"], timeout=5)
            if item:
                _, payload = item
                data = json.loads(payload)
                logger.info("ML queue item keys=%s", list(data.keys()))
                po = data.get("persisted_to_payment_outcomes") or {}
                inserted = po.get("inserted") if isinstance(po, dict) else None
                if inserted and auto_retrain:
                    try:
                        async with httpx.AsyncClient(timeout=600.0) as client:
                            resp = await client.post(f"{trident_url}/api/v1/trident/retrain")
                            logger.info("Trident retrain after denial import: status=%s", resp.status_code)
                    except Exception as exc:
                        logger.warning("Trident retrain trigger failed: %s", exc)
        except Exception as e:
            logger.warning("Queue consumer error: %s", e)
        await asyncio.sleep(0.1)


# ---------------------------------------------------------------------------
# Canonical /api/v1 ML compatibility layer
# ---------------------------------------------------------------------------

class OutcomePayload(BaseModel):
    org_id: str | None = None
    order_id: str | None = None
    claim_number: str | None = None
    payer_id: str
    payer_name: str | None = None
    hcpcs_code: str
    icd10_code: str | None = None
    diagnosis_codes: str | None = None
    billed_amount: float | None = None
    paid_amount: float | None = None
    is_denial: bool = False
    denial_reason: str | None = None
    carc_code: str | None = None
    rarc_code: str | None = None
    date_of_service: str | None = None


class PredictionPayload(BaseModel):
    payer_id: str
    hcpcs_code: str
    icd10_code: str | None = None
    billed_amount: float | None = None
    date_of_service: str | None = None
    patient_age_bucket: str = "adult"
    org_id: str | None = None


def _feature_from_row(row: dict[str, Any]) -> dict[str, Any]:
    dos = row.get("date_of_service")
    if isinstance(dos, str) and dos:
        try:
            dos_dt = datetime.fromisoformat(dos)
        except ValueError:
            dos_dt = datetime.now(timezone.utc)
    elif hasattr(dos, "year"):
        dos_dt = datetime.combine(dos, datetime.min.time(), tzinfo=timezone.utc)
    else:
        dos_dt = datetime.now(timezone.utc)
    return {
        "payer_id": row.get("payer_id") or "unknown",
        "hcpcs_code": row.get("hcpcs_code") or "unknown",
        "icd10_code": row.get("icd10_code") or "unknown",
        "billed_amount": float(row.get("billed_amount") or 0),
        "day_of_week": dos_dt.weekday(),
        "month": dos_dt.month,
        "patient_age_bucket": row.get("patient_age_bucket") or "adult",
    }


def _load_artifact(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return joblib.load(path)


async def _train_artifacts(conn, trigger_type: str = "manual") -> dict[str, Any]:
    rows = [dict(row) for row in await fetch_all(
        conn,
        """
        SELECT org_id, payer_id, hcpcs_code, icd10_code, billed_amount, paid_amount, is_denial, date_of_service
        FROM payment_outcomes
        WHERE payer_id IS NOT NULL AND hcpcs_code IS NOT NULL
        """
    )]
    if len(rows) < 10:
        await exec_write(
            conn,
            """
            INSERT INTO trident_training_ledger (training_run_id, trigger_type, records_ingested, records_labeled, status, completed_at)
            VALUES ($1,$2,$3,$4,'insufficient_data',NOW())
            """,
            str(uuid.uuid4()),
            trigger_type,
            len(rows),
            len(rows),
        )
        return {"status": "insufficient_data", "records": len(rows)}

    features = [_feature_from_row(row) for row in rows]
    vec = DictVectorizer(sparse=False)
    x = vec.fit_transform(features)
    y_denial = np.array([1 if row.get("is_denial") else 0 for row in rows])
    y_paid = np.array([float(row.get("paid_amount") or 0) for row in rows])

    if len(set(y_denial.tolist())) < 2:
        denial_model = None
        denial_accuracy = 1.0
    else:
        x_train, x_test, y_train, y_test = train_test_split(x, y_denial, test_size=0.25, random_state=42)
        denial_model = GradientBoostingClassifier(random_state=42)
        denial_model.fit(x_train, y_train)
        denial_accuracy = float(accuracy_score(y_test, denial_model.predict(x_test)))

    x_train_r, x_test_r, y_train_r, y_test_r = train_test_split(x, y_paid, test_size=0.25, random_state=42)
    reimbursement_model = GradientBoostingRegressor(random_state=42)
    reimbursement_model.fit(x_train_r, y_train_r)
    reimbursement_mae = float(mean_absolute_error(y_test_r, reimbursement_model.predict(x_test_r)))

    version = f"ml-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    classifier_artifact = {"model": denial_model, "vectorizer": vec, "version": version, "trained_at": datetime.now(timezone.utc).isoformat(), "accuracy": denial_accuracy, "record_count": len(rows)}
    regressor_artifact = {"model": reimbursement_model, "vectorizer": vec, "version": version, "trained_at": datetime.now(timezone.utc).isoformat(), "mae": reimbursement_mae, "record_count": len(rows)}
    joblib.dump(classifier_artifact, BASELINE_CLASSIFIER_PATH)
    joblib.dump(regressor_artifact, BASELINE_REGRESSOR_PATH)

    org_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if row.get("org_id"):
            org_groups[str(row["org_id"])].append(row)
    overlay_versions: dict[str, str] = {}
    for org_id, org_rows in org_groups.items():
        if len(org_rows) < 8:
            continue
        org_features = [_feature_from_row(row) for row in org_rows]
        org_x = vec.transform(org_features)
        org_y = np.array([1 if row.get("is_denial") else 0 for row in org_rows])
        if len(set(org_y.tolist())) < 2:
            continue
        overlay_model = GradientBoostingClassifier(random_state=42)
        overlay_model.fit(org_x, org_y)
        overlay_path = ORG_OVERLAY_DIR / f"{org_id}.joblib"
        joblib.dump({"model": overlay_model, "vectorizer": vec, "version": version, "trained_at": datetime.now(timezone.utc).isoformat()}, overlay_path)
        overlay_versions[org_id] = version

    await exec_write(
        conn,
        """
        INSERT INTO trident_training_ledger (
            training_run_id, trigger_type, records_ingested, records_labeled, model_version,
            accuracy_before, accuracy_after, accuracy_delta, feature_weights, status, completed_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'completed',NOW())
        """,
        str(uuid.uuid4()),
        trigger_type,
        len(rows),
        len(rows),
        version,
        None,
        denial_accuracy,
        None,
        json.dumps({"reimbursement_mae": reimbursement_mae}),
    )
    return {"status": "completed", "version": version, "record_count": len(rows), "accuracy": denial_accuracy, "reimbursement_mae": reimbursement_mae, "org_overlays": overlay_versions}


async def _recompute_learned_rates(conn) -> dict[str, Any]:
    rows = [dict(row) for row in await fetch_all(
        conn,
        """
        SELECT org_id, payer_id, hcpcs_code,
               AVG(paid_amount) AS avg_paid,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY paid_amount) AS median_paid,
               MIN(paid_amount) AS min_paid,
               MAX(paid_amount) AS max_paid,
               AVG(CASE WHEN is_denial THEN 1.0 ELSE 0.0 END) AS denial_rate,
               COUNT(*) AS sample_count
        FROM payment_outcomes
        WHERE payer_id IS NOT NULL AND hcpcs_code IS NOT NULL
        GROUP BY org_id, payer_id, hcpcs_code
        """
    )]
    for row in rows:
        await exec_write(
            conn,
            """
            INSERT INTO learned_rates (org_id, payer_id, hcpcs_code, avg_paid, median_paid, min_paid, max_paid, denial_rate, sample_count, last_updated)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
            ON CONFLICT (org_id, payer_id, hcpcs_code)
            DO UPDATE SET avg_paid = EXCLUDED.avg_paid, median_paid = EXCLUDED.median_paid, min_paid = EXCLUDED.min_paid,
                          max_paid = EXCLUDED.max_paid, denial_rate = EXCLUDED.denial_rate, sample_count = EXCLUDED.sample_count,
                          last_updated = NOW()
            """,
            row.get("org_id"),
            row["payer_id"],
            row["hcpcs_code"],
            row["avg_paid"],
            row["median_paid"],
            row["min_paid"],
            row["max_paid"],
            row["denial_rate"],
            row["sample_count"],
        )
    return {"rows_upserted": len(rows)}


@app.post("/api/v1/ml/train")
async def v1_ml_train(request: Request):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        result = await _train_artifacts(conn, "manual")
    return _serialize(result)


@app.post("/api/v1/ml/ingest-outcome")
async def v1_ml_ingest_outcome(payload: OutcomePayload, request: Request):
    db = request.app.state.db_pool
    threshold = int(os.getenv("MIN_TRAINING_RECORDS", "25"))
    async with db.connection() as conn:
        await exec_write(
            conn,
            """
            INSERT INTO payment_outcomes (
                id, org_id, order_id, claim_number, payer_id, payer_name, hcpcs_code, icd10_code,
                diagnosis_codes, billed_amount, paid_amount, is_denial, denial_reason, carc_code, rarc_code,
                date_of_service, adjudicated_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
            """,
            str(uuid.uuid4()),
            payload.org_id,
            payload.order_id,
            payload.claim_number,
            payload.payer_id,
            payload.payer_name,
            payload.hcpcs_code,
            payload.icd10_code,
            payload.diagnosis_codes,
            payload.billed_amount,
            payload.paid_amount,
            payload.is_denial,
            payload.denial_reason,
            payload.carc_code,
            payload.rarc_code,
            payload.date_of_service,
        )
        await _recompute_learned_rates(conn)
        recent = await fetch_one(conn, "SELECT COUNT(*) AS count FROM payment_outcomes WHERE created_at >= NOW() - INTERVAL '1 day'")
        auto_retrained = int((recent or {}).get("count") or 0) >= threshold
        if auto_retrained:
            await _train_artifacts(conn, "ingest_threshold")
    return {"status": "recorded", "auto_retrained": auto_retrained}


@app.post("/api/v1/ml/predict-denial")
async def v1_ml_predict_denial(payload: PredictionPayload):
    artifact = _load_artifact(BASELINE_CLASSIFIER_PATH)
    if not artifact or artifact.get("model") is None:
        fallback = 0.35
        return {"denial_probability": fallback, "confidence_interval": [max(0.0, fallback - 0.1), min(1.0, fallback + 0.1)], "model_version": None, "fallback": True}
    vector = artifact["vectorizer"].transform([_feature_from_row(payload.model_dump())])
    prob = float(artifact["model"].predict_proba(vector)[0][1])
    overlay_path = ORG_OVERLAY_DIR / f"{payload.org_id}.joblib" if payload.org_id else None
    if overlay_path and overlay_path.exists():
        overlay = joblib.load(overlay_path)
        overlay_prob = float(overlay["model"].predict_proba(overlay["vectorizer"].transform([_feature_from_row(payload.model_dump())]))[0][1])
        prob = (prob * 0.7) + (overlay_prob * 0.3)
    return {"denial_probability": round(prob, 4), "confidence_interval": [max(0.0, round(prob - 0.1, 4)), min(1.0, round(prob + 0.1, 4))], "model_version": artifact.get("version"), "fallback": False}


@app.post("/api/v1/ml/predict-reimbursement")
async def v1_ml_predict_reimbursement(payload: PredictionPayload):
    artifact = _load_artifact(BASELINE_REGRESSOR_PATH)
    if not artifact:
        estimate = float(payload.billed_amount or 0) * 0.55
        return {"predicted_reimbursement": round(estimate, 2), "confidence_interval": [round(max(0.0, estimate * 0.85), 2), round(estimate * 1.15, 2)], "model_version": None, "fallback": True}
    vector = artifact["vectorizer"].transform([_feature_from_row(payload.model_dump())])
    pred = float(artifact["model"].predict(vector)[0])
    return {"predicted_reimbursement": round(pred, 2), "confidence_interval": [round(max(0.0, pred * 0.85), 2), round(pred * 1.15, 2)], "model_version": artifact.get("version"), "fallback": False}


@app.post("/api/v1/ml/recompute-rates")
async def v1_ml_recompute_rates(request: Request):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        result = await _recompute_learned_rates(conn)
    return result


@app.get("/api/v1/ml/status")
async def v1_ml_status(request: Request):
    db = request.app.state.db_pool
    classifier = _load_artifact(BASELINE_CLASSIFIER_PATH)
    regressor = _load_artifact(BASELINE_REGRESSOR_PATH)
    async with db.connection() as conn:
        count_row = await fetch_one(conn, "SELECT COUNT(*) AS count FROM payment_outcomes")
        ledger = await fetch_one(conn, "SELECT * FROM trident_training_ledger ORDER BY started_at DESC LIMIT 1")
    return {
        "current_model_version": (classifier or regressor or {}).get("version"),
        "training_record_count": int((count_row or {}).get("count") or 0),
        "last_training_timestamp": (classifier or regressor or {}).get("trained_at"),
        "accuracy_metrics": {
            "denial_accuracy": (classifier or {}).get("accuracy"),
            "reimbursement_mae": (regressor or {}).get("mae"),
        },
        "last_ledger_entry": _serialize(dict(ledger) if ledger else {}),
    }


@app.get("/api/v1/ml/forecast")
async def v1_ml_forecast(request: Request):
    db = request.app.state.db_pool
    classifier = _load_artifact(BASELINE_CLASSIFIER_PATH)
    async with db.connection() as conn:
        open_orders = [dict(row) for row in await fetch_all(
            conn,
            """
            SELECT org_id, payer_id, COALESCE(total_billed,0) AS billed_amount, date_of_service, hcpcs_codes
            FROM orders
            WHERE status NOT IN ('paid','closed','cancelled')
            """
        )]
    if classifier and classifier.get("model") is not None and open_orders:
        features = [_feature_from_row({"payer_id": row.get("payer_id"), "hcpcs_code": (row.get("hcpcs_codes") or [None])[0] if isinstance(row.get("hcpcs_codes"), list) else "unknown", "billed_amount": row.get("billed_amount"), "date_of_service": row.get("date_of_service"), "patient_age_bucket": "adult"}) for row in open_orders]
        probs = classifier["model"].predict_proba(classifier["vectorizer"].transform(features))[:, 1].tolist()
    else:
        probs = [0.35 for _ in open_orders]
    rate = float(np.mean(probs)) if probs else 0.0
    recovery = sum(max(0.0, float(order.get("billed_amount") or 0) * (1.0 - probs[idx])) for idx, order in enumerate(open_orders))
    return {
        "projected_denial_rate_30": round(rate, 4),
        "projected_denial_rate_60": round(rate * 1.02, 4),
        "projected_denial_rate_90": round(rate * 1.04, 4),
        "expected_ar_recovery": round(recovery, 2),
    }
