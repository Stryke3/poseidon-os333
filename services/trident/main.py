# =============================================================================
# TRIDENT Intelligence Engine — Port 8002
# Denial prediction, medical necessity scoring, HCPCS optimization
# =============================================================================

from __future__ import annotations

import asyncio
import json
import os
import pickle
import re
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel
from psycopg.rows import dict_row  # type: ignore[import-untyped]
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.feature_extraction import DictVectorizer
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split

# Shared module: Docker has /app/shared; local uses repo/services/shared
_shared_dir = Path("/app/shared") if Path("/app/shared").exists() else (Path(__file__).resolve().parent.parent / "shared")
sys.path.insert(0, str(_shared_dir))
from base import create_app, get_redis, logger, settings
try:
    from data_modeling import HistoricalDataCatalog
except ImportError:
    from .data_modeling import HistoricalDataCatalog
try:
    from data_normalization import HistoricalDataNormalizer
except ImportError:
    from .data_normalization import HistoricalDataNormalizer
try:
    from document_corpus import MyBoxCorpusCatalog
except ImportError:
    from .document_corpus import MyBoxCorpusCatalog
try:
    from appeals_intelligence import AppealsIntelligenceRuntime, build_artifact
except ImportError:
    from .appeals_intelligence import AppealsIntelligenceRuntime, build_artifact

# ---------------------------------------------------------------------------
app = create_app(
    title="POSEIDON Trident Intelligence Engine",
    version="2.0.0",
    description="ML denial prediction, medical necessity scoring, billing optimization",
)

MODELS_DIR = Path("/app/models")
MODELS_DIR.mkdir(exist_ok=True)
HISTORICAL_DATA_DIR = Path(__file__).resolve().parent / "Historical_Model_Data"
TRIDENT_MODEL_PATH = MODELS_DIR / "trident_denial_model.pkl"


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
# Payer Rules — 19 major payers
# ---------------------------------------------------------------------------

PAYER_RULES: dict[str, dict] = {
    "MEDICARE_DMERC": {
        "name": "Medicare DMERC",
        "timely_filing_days": 365,
        "requires_cmn": True,
        "requires_prior_auth": ["E0601", "E1399", "K0001", "K0002", "K0003", "K0004", "K0005"],
        "statutory_exclusions": ["A4556", "A4557", "A9270"],
        "modifier_required": ["KX", "GA", "GZ"],
        "baseline_denial_rate": 0.905,
    },
    "UHC": {
        "name": "UnitedHealthcare",
        "timely_filing_days": 180,
        "requires_cmn": False,
        "requires_prior_auth": ["E0601", "K0001", "K0004", "K0005"],
        "statutory_exclusions": [],
        "modifier_required": [],
        "baseline_denial_rate": 0.32,
    },
    "AETNA": {
        "name": "Aetna",
        "timely_filing_days": 180,
        "requires_cmn": False,
        "requires_prior_auth": ["E0601", "K0001"],
        "statutory_exclusions": [],
        "modifier_required": [],
        "baseline_denial_rate": 0.28,
    },
    "BCBS": {
        "name": "Blue Cross Blue Shield",
        "timely_filing_days": 365,
        "requires_cmn": False,
        "requires_prior_auth": ["E0601", "K0001", "K0004"],
        "statutory_exclusions": [],
        "modifier_required": [],
        "baseline_denial_rate": 0.25,
    },
    "CIGNA": {
        "name": "Cigna",
        "timely_filing_days": 180,
        "requires_cmn": False,
        "requires_prior_auth": ["E0601"],
        "statutory_exclusions": [],
        "modifier_required": [],
        "baseline_denial_rate": 0.27,
    },
    "HUMANA": {
        "name": "Humana",
        "timely_filing_days": 365,
        "requires_cmn": True,
        "requires_prior_auth": ["E0601", "K0001", "K0004", "K0005"],
        "statutory_exclusions": [],
        "modifier_required": [],
        "baseline_denial_rate": 0.35,
    },
    "MEDICAID": {
        "name": "Medicaid",
        "timely_filing_days": 365,
        "requires_cmn": True,
        "requires_prior_auth": [],
        "statutory_exclusions": [],
        "modifier_required": [],
        "baseline_denial_rate": 0.40,
    },
    "ANTHEM": {"name": "Anthem", "timely_filing_days": 180, "requires_cmn": False, "requires_prior_auth": ["E0601"], "statutory_exclusions": [], "modifier_required": [], "baseline_denial_rate": 0.26},
    "MOLINA": {"name": "Molina Healthcare", "timely_filing_days": 365, "requires_cmn": False, "requires_prior_auth": [], "statutory_exclusions": [], "modifier_required": [], "baseline_denial_rate": 0.38},
    "CENTENE": {"name": "Centene", "timely_filing_days": 180, "requires_cmn": False, "requires_prior_auth": [], "statutory_exclusions": [], "modifier_required": [], "baseline_denial_rate": 0.33},
    "WELLCARE": {"name": "WellCare", "timely_filing_days": 180, "requires_cmn": False, "requires_prior_auth": [], "statutory_exclusions": [], "modifier_required": [], "baseline_denial_rate": 0.36},
    "CARESOURCE": {"name": "CareSource", "timely_filing_days": 365, "requires_cmn": False, "requires_prior_auth": [], "statutory_exclusions": [], "modifier_required": [], "baseline_denial_rate": 0.34},
    "OSCAR": {"name": "Oscar Health", "timely_filing_days": 180, "requires_cmn": False, "requires_prior_auth": [], "statutory_exclusions": [], "modifier_required": [], "baseline_denial_rate": 0.22},
    "AMBETTER": {"name": "Ambetter", "timely_filing_days": 180, "requires_cmn": False, "requires_prior_auth": [], "statutory_exclusions": [], "modifier_required": [], "baseline_denial_rate": 0.30},
    "TRICARE": {"name": "TRICARE", "timely_filing_days": 365, "requires_cmn": False, "requires_prior_auth": ["E0601"], "statutory_exclusions": [], "modifier_required": [], "baseline_denial_rate": 0.18},
    "VA": {"name": "Veterans Affairs", "timely_filing_days": 365, "requires_cmn": False, "requires_prior_auth": [], "statutory_exclusions": [], "modifier_required": [], "baseline_denial_rate": 0.15},
    "KAISER": {"name": "Kaiser Permanente", "timely_filing_days": 180, "requires_cmn": False, "requires_prior_auth": [], "statutory_exclusions": [], "modifier_required": [], "baseline_denial_rate": 0.12},
    "MAGELLAN": {"name": "Magellan Health", "timely_filing_days": 180, "requires_cmn": False, "requires_prior_auth": [], "statutory_exclusions": [], "modifier_required": [], "baseline_denial_rate": 0.29},
    "CHAMP_VA": {"name": "ChampVA", "timely_filing_days": 365, "requires_cmn": False, "requires_prior_auth": [], "statutory_exclusions": [], "modifier_required": [], "baseline_denial_rate": 0.16},
}

# ICD-10 → Medical necessity weight mapping (key diagnosis groups)
DIAGNOSIS_WEIGHTS: dict[str, float] = {
    # Sleep apnea
    "G47.33": 0.92, "G47.30": 0.85, "G47.31": 0.90,
    # COPD / respiratory
    "J44.1": 0.88, "J44.0": 0.84, "J43.9": 0.82, "J96.0": 0.95,
    # Mobility
    "M79.3": 0.75, "G35": 0.90, "G80.9": 0.88, "Z89": 0.85,
    # Diabetes
    "E11.65": 0.80, "E11.621": 0.85, "E11.649": 0.78,
    # Wound care
    "L97.1": 0.88, "L89.2": 0.90,
    # Cardiac
    "I50.9": 0.86, "I50.32": 0.89,
    # Default
    "DEFAULT": 0.65,
}

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ScoreRequest(BaseModel):
    order_id: str
    patient_id: str
    hcpcs_codes: list[str]
    diagnosis_codes: list[str]
    payer_id: str
    referring_physician_npi: str
    days_since_order: int = 0
    has_prior_auth: bool = False
    has_cmn: bool = False
    modifier_codes: list[str] = []


class OptimizeRequest(BaseModel):
    hcpcs_codes: list[str]
    diagnosis_codes: list[str]
    payer_id: str
    laterality: str | None = None  # left | right | bilateral


class TrainingRecord(BaseModel):
    order_id: str
    hcpcs_codes: list[str]
    diagnosis_codes: list[str]
    payer_id: str
    was_denied: bool
    denial_category: str | None = None
    carc_code: str | None = None
    paid_amount: float | None = None
    denied_amount: float | None = None


# ---------------------------------------------------------------------------
# Scoring Engine
# ---------------------------------------------------------------------------

class TridentEngine:
    """Rule-based + ML hybrid denial prediction engine."""

    def score_claim(self, req: ScoreRequest) -> dict:
        payer = PAYER_RULES.get(req.payer_id, PAYER_RULES.get("BCBS"))
        flags: list[dict] = []
        risk_score = payer.get("baseline_denial_rate", 0.30)

        # --- Statutory exclusion check ---
        for code in req.hcpcs_codes:
            if code in payer.get("statutory_exclusions", []):
                flags.append({
                    "severity": "critical",
                    "code": code,
                    "message": f"{code} is a statutory exclusion for {payer['name']} — submit will deny",
                    "action": "BLOCK",
                })
                risk_score = min(risk_score + 0.35, 0.99)

        # --- Prior auth check ---
        for code in req.hcpcs_codes:
            if code in payer.get("requires_prior_auth", []) and not req.has_prior_auth:
                flags.append({
                    "severity": "high",
                    "code": code,
                    "message": f"{code} requires prior authorization from {payer['name']}",
                    "action": "OBTAIN_AUTH",
                })
                risk_score = min(risk_score + 0.25, 0.99)

        # --- CMN check ---
        if payer.get("requires_cmn") and not req.has_cmn:
            flags.append({
                "severity": "high",
                "code": "CMN",
                "message": f"Certificate of Medical Necessity required by {payer['name']}",
                "action": "GENERATE_CMN",
            })
            risk_score = min(risk_score + 0.20, 0.99)

        # --- Timely filing check ---
        if req.days_since_order > payer.get("timely_filing_days", 365):
            flags.append({
                "severity": "critical",
                "code": "TIMELY",
                "message": f"Timely filing window exceeded ({payer['timely_filing_days']} days for {payer['name']})",
                "action": "WRITE_OFF",
            })
            risk_score = min(risk_score + 0.40, 0.99)

        # --- Medical necessity scoring ---
        med_nec_score = self._medical_necessity_score(req.diagnosis_codes, req.hcpcs_codes)
        if med_nec_score < 0.60:
            flags.append({
                "severity": "medium",
                "code": "MED_NEC",
                "message": f"Low medical necessity score ({med_nec_score:.0%}) — documentation may be insufficient",
                "action": "STRENGTHEN_DOCUMENTATION",
            })
            risk_score = min(risk_score + 0.15, 0.99)
        elif med_nec_score >= 0.85:
            risk_score = max(risk_score - 0.08, 0.05)

        # --- Modifier check ---
        required_mods = payer.get("modifier_required", [])
        if required_mods:
            missing = [m for m in required_mods if m not in req.modifier_codes]
            if missing:
                flags.append({
                    "severity": "medium",
                    "code": "MODIFIER",
                    "message": f"Missing recommended modifiers for {payer['name']}: {', '.join(missing)}",
                    "action": "ADD_MODIFIERS",
                })
                risk_score = min(risk_score + 0.08, 0.99)

        risk_score = round(risk_score, 4)
        risk_tier = self._tier(risk_score)
        recommendation = self._recommendation(risk_score, flags)
        inferred_denial_type = self._infer_denial_type(flags, med_nec_score)
        appeals_guidance = appeals_runtime.guidance(req.payer_id, inferred_denial_type, risk_tier)

        return {
            "order_id": req.order_id,
            "payer": payer["name"],
            "denial_risk_score": risk_score,
            "risk_tier": risk_tier,
            "medical_necessity_score": round(med_nec_score, 4),
            "flags": flags,
            "recommendation": recommendation,
            "inferred_denial_type": inferred_denial_type,
            "appeals_guidance": appeals_guidance,
            "scored_at": datetime.now(timezone.utc).isoformat(),
        }

    def _medical_necessity_score(self, dx_codes: list[str], hcpcs: list[str]) -> float:
        scores = []
        for code in dx_codes:
            # Exact match first, then prefix match
            score = DIAGNOSIS_WEIGHTS.get(code)
            if score is None:
                for prefix_len in [5, 4, 3]:
                    score = DIAGNOSIS_WEIGHTS.get(code[:prefix_len])
                    if score:
                        break
            scores.append(score or DIAGNOSIS_WEIGHTS["DEFAULT"])
        return np.mean(scores) if scores else DIAGNOSIS_WEIGHTS["DEFAULT"]

    def _tier(self, score: float) -> str:
        if score >= 0.80:
            return "CRITICAL"
        if score >= 0.60:
            return "HIGH"
        if score >= 0.40:
            return "MEDIUM"
        return "LOW"

    def _recommendation(self, score: float, flags: list) -> str:
        critical = [f for f in flags if f["severity"] == "critical"]
        if critical:
            return "DO_NOT_SUBMIT — resolve critical flags before submission"
        if score >= 0.70:
            return "HOLD — high denial risk, address flags before submitting"
        if score >= 0.45:
            return "REVIEW — moderate risk, verify documentation"
        return "SUBMIT — low denial risk, proceed with submission"

    def _infer_denial_type(self, flags: list[dict], med_nec_score: float) -> str:
        joined = " ".join(f"{flag.get('code', '')} {flag.get('message', '')}".lower() for flag in flags)
        if "timely" in joined:
            return "timely_filing"
        if "authorization" in joined or "cmn" in joined:
            return "authorization_or_referral_missing"
        if "statutory exclusion" in joined or "out of network" in joined or "not covered" in joined:
            return "out_of_network_or_coverage"
        if "med_nec" in joined or med_nec_score < 0.60:
            return "medical_necessity_or_experimental"
        return "medical_necessity_or_experimental"

    def optimize_billing(self, req: OptimizeRequest) -> dict:
        recommendations: list[dict] = []
        payer = PAYER_RULES.get(req.payer_id, {})

        # Laterality modifiers
        if req.laterality:
            mod_map = {"left": "LT", "right": "RT", "bilateral": "50"}
            mod = mod_map.get(req.laterality)
            if mod:
                recommendations.append({
                    "type": "modifier",
                    "action": f"Add modifier -{mod} for {req.laterality} laterality",
                    "codes_affected": req.hcpcs_codes,
                })

        # Medicare KX modifier
        if req.payer_id == "MEDICARE_DMERC":
            recommendations.append({
                "type": "modifier",
                "action": "Add -KX modifier to certify medical necessity documentation on file",
                "codes_affected": req.hcpcs_codes,
            })

        return {
            "payer_id": req.payer_id,
            "recommendations": recommendations,
            "optimized_at": datetime.now(timezone.utc).isoformat(),
        }


engine = TridentEngine()
historical_data_catalog = HistoricalDataCatalog(HISTORICAL_DATA_DIR)
historical_data_normalizer = HistoricalDataNormalizer(HISTORICAL_DATA_DIR)
mybox_corpus_catalog = MyBoxCorpusCatalog(HISTORICAL_DATA_DIR / "mybox-selected")
PDF_LEARNING_SUMMARY_PATH = Path("/app/data/processed/trident_mybox_pdf_learning_summary.json")
APPEALS_INTELLIGENCE_PATH = Path("/app/data/processed/trident_appeals_intelligence.json")
appeals_runtime = AppealsIntelligenceRuntime(APPEALS_INTELLIGENCE_PATH)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.post("/score")
async def score_claim(req: ScoreRequest):
    result = engine.score_claim(req)
    logger.info(
        "Scored order=%s payer=%s risk=%.2f tier=%s",
        req.order_id, req.payer_id, result["denial_risk_score"], result["risk_tier"],
    )
    return result


@app.post("/optimize")
async def optimize_billing(req: OptimizeRequest):
    return engine.optimize_billing(req)


@app.post("/train")
async def submit_training_record(record: TrainingRecord, request: Request):
    """Accept payment outcome records to improve future predictions."""
    redis = get_redis(request)
    await redis.rpush("trident:training_queue", record.model_dump_json())
    return {"status": "queued", "order_id": record.order_id}


@app.get("/payers")
async def list_payers():
    return {
        "payers": [
            {
                "id": k,
                "name": v["name"],
                "timely_filing_days": v["timely_filing_days"],
                "requires_cmn": v["requires_cmn"],
                "baseline_denial_rate": v["baseline_denial_rate"],
            }
            for k, v in PAYER_RULES.items()
        ]
    }


@app.get("/payers/{payer_id}")
async def get_payer_rules(payer_id: str):
    payer = PAYER_RULES.get(payer_id.upper())
    if not payer:
        raise HTTPException(status_code=404, detail="Payer not found")
    return {"payer_id": payer_id, **payer}


@app.get("/diagnosis-weights")
async def get_diagnosis_weights():
    return {"weights": DIAGNOSIS_WEIGHTS}


@app.get("/model/status")
async def model_status():
    model_file = MODELS_DIR / "denial_predictor.pkl"
    return {
        "model_exists": model_file.exists(),
        "model_path": str(model_file),
        "last_modified": model_file.stat().st_mtime if model_file.exists() else None,
        "payers_configured": len(PAYER_RULES),
        "diagnosis_codes_mapped": len(DIAGNOSIS_WEIGHTS),
    }


@app.get("/data-modeling/catalog")
async def get_data_modeling_catalog():
    return historical_data_catalog.summary()


@app.get("/data-modeling/assets/{asset_name}")
async def get_data_modeling_asset(asset_name: str):
    asset = historical_data_catalog.asset(asset_name)
    if not asset:
        raise HTTPException(status_code=404, detail=f"Historical data asset not found: {asset_name}")
    return asset


@app.get("/data-modeling/normalized-preview")
async def get_normalized_preview(limit: int = 25):
    return historical_data_normalizer.preview(limit=limit)


@app.get("/data-modeling/normalized-assets/{asset_name}")
async def get_normalized_asset(asset_name: str, limit: int = 100):
    normalized = historical_data_normalizer.normalize_asset(asset_name, limit=limit)
    if normalized["dataset_kind"] == "missing":
        raise HTTPException(status_code=404, detail=f"Historical data asset not found: {asset_name}")
    return normalized


@app.get("/data-modeling/mybox-selected")
async def get_mybox_selected_catalog(limit: int = 100):
    return mybox_corpus_catalog.summary(limit=limit)


@app.get("/data-modeling/mybox-selected/pdf-learning-summary")
async def get_mybox_selected_pdf_learning_summary():
    if not PDF_LEARNING_SUMMARY_PATH.exists():
        raise HTTPException(status_code=404, detail="PDF learning summary not generated yet")
    return json.loads(PDF_LEARNING_SUMMARY_PATH.read_text())


@app.get("/data-modeling/mybox-selected/appeals-intelligence")
async def get_appeals_intelligence(refresh: bool = False):
    if refresh or not APPEALS_INTELLIGENCE_PATH.exists():
        if not PDF_LEARNING_SUMMARY_PATH.exists():
            raise HTTPException(status_code=404, detail="PDF learning summary not generated yet")
        return build_artifact(PDF_LEARNING_SUMMARY_PATH, APPEALS_INTELLIGENCE_PATH)
    return json.loads(APPEALS_INTELLIGENCE_PATH.read_text())


@app.get("/guidance/appeals")
async def get_appeals_guidance(payer_id: str, denial_type: str | None = None, risk_tier: str | None = None):
    if not APPEALS_INTELLIGENCE_PATH.exists():
        raise HTTPException(status_code=404, detail="Appeals intelligence not generated yet")
    return appeals_runtime.guidance(payer_id=payer_id, denial_type=denial_type, risk_tier=risk_tier)


# ---------------------------------------------------------------------------
# Canonical /api/v1 Trident compatibility layer
# ---------------------------------------------------------------------------

class CanonicalScoreRequest(BaseModel):
    icd10_codes: list[str]
    hcpcs_codes: list[str]
    payer_id: str
    physician_npi: str | None = None
    patient_age: int = 0
    dos: str | None = None


class FeedbackPayload(BaseModel):
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


def _load_trident_model() -> dict[str, Any] | None:
    if not TRIDENT_MODEL_PATH.exists():
        return None
    with TRIDENT_MODEL_PATH.open("rb") as fh:
        return pickle.load(fh)


def _age_bucket(age: int) -> str:
    if age < 18:
        return "child"
    if age < 45:
        return "adult"
    if age < 65:
        return "mid"
    return "senior"


def _feature_dict_from_row(row: dict[str, Any]) -> dict[str, Any]:
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
    billed = float(row.get("billed_amount") or 0)
    return {
        "payer_id": row.get("payer_id") or "unknown",
        "hcpcs_code": row.get("hcpcs_code") or "unknown",
        "icd10_code": row.get("icd10_code") or "unknown",
        "physician_specialty": row.get("physician_specialty") or "unknown",
        "billed_amount": billed,
        "day_of_week": dos_dt.weekday(),
        "month": dos_dt.month,
        "patient_age_bucket": row.get("patient_age_bucket") or "adult",
    }


async def _train_trident_model(conn, trigger_type: str = "manual") -> dict[str, Any]:
    rows = [dict(row) for row in await fetch_all(
        conn,
        """
        SELECT payer_id, hcpcs_code, icd10_code, billed_amount, is_denial, date_of_service
        FROM payment_outcomes
        WHERE payer_id IS NOT NULL AND hcpcs_code IS NOT NULL
        """
    )]
    if len(rows) < 10:
        result = {
            "model_version": None,
            "records_ingested": len(rows),
            "records_labeled": len(rows),
            "accuracy_after": None,
            "status": "insufficient_data",
        }
        await exec_write(
            conn,
            """
            INSERT INTO trident_training_ledger (training_run_id, trigger_type, records_ingested, records_labeled, status, completed_at)
            VALUES ($1,$2,$3,$4,$5,NOW())
            """,
            str(uuid.uuid4()),
            trigger_type,
            len(rows),
            len(rows),
            "insufficient_data",
        )
        return result

    dataset = []
    labels = []
    for row in rows:
        dataset.append(_feature_dict_from_row(row))
        labels.append(1 if row.get("is_denial") else 0)
    vectorizer = DictVectorizer(sparse=False)
    x = vectorizer.fit_transform(dataset)
    y = np.array(labels)
    if len(set(labels)) < 2:
        accuracy = 1.0
        model = None
    else:
        x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.25, random_state=42)
        model = GradientBoostingClassifier(random_state=42)
        model.fit(x_train, y_train)
        accuracy = float(accuracy_score(y_test, model.predict(x_test)))
    model_version = f"trident-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    artifact = {"model": model, "vectorizer": vectorizer, "version": model_version, "trained_at": datetime.now(timezone.utc).isoformat(), "record_count": len(rows), "accuracy": accuracy}
    with TRIDENT_MODEL_PATH.open("wb") as fh:
        pickle.dump(artifact, fh)
    await exec_write(
        conn,
        """
        INSERT INTO trident_training_ledger (
            training_run_id, trigger_type, records_ingested, records_labeled, model_version,
            accuracy_before, accuracy_after, accuracy_delta, status, completed_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'completed',NOW())
        """,
        str(uuid.uuid4()),
        trigger_type,
        len(rows),
        len(rows),
        model_version,
        None,
        accuracy,
        None,
    )
    return artifact


async def _refresh_learned_rates(conn) -> int:
    rows = [dict(row) for row in await fetch_all(
        conn,
        """
        SELECT org_id, payer_id, hcpcs_code,
               AVG(COALESCE(paid_amount, 0)) AS avg_paid,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(paid_amount, 0)) AS median_paid,
               MIN(COALESCE(paid_amount, 0)) AS min_paid,
               MAX(COALESCE(paid_amount, 0)) AS max_paid,
               AVG(CASE WHEN is_denial THEN 1.0 ELSE 0.0 END) AS denial_rate,
               COUNT(*) AS sample_count
        FROM payment_outcomes
        WHERE payer_id IS NOT NULL
          AND hcpcs_code IS NOT NULL
          AND created_at >= NOW() - make_interval(days => $1)
        GROUP BY org_id, payer_id, hcpcs_code
        """,
        settings.trident_learning_lookback_days,
    )]
    for row in rows:
        await exec_write(
            conn,
            """
            INSERT INTO learned_rates (
                org_id, payer_id, hcpcs_code, avg_paid, median_paid, min_paid, max_paid,
                denial_rate, sample_count, last_updated
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
            ON CONFLICT (org_id, payer_id, hcpcs_code)
            DO UPDATE SET avg_paid = EXCLUDED.avg_paid,
                          median_paid = EXCLUDED.median_paid,
                          min_paid = EXCLUDED.min_paid,
                          max_paid = EXCLUDED.max_paid,
                          denial_rate = EXCLUDED.denial_rate,
                          sample_count = EXCLUDED.sample_count,
                          last_updated = NOW()
            """,
            row.get("org_id"),
            row.get("payer_id"),
            row.get("hcpcs_code"),
            row.get("avg_paid"),
            row.get("median_paid"),
            row.get("min_paid"),
            row.get("max_paid"),
            row.get("denial_rate"),
            row.get("sample_count"),
        )
    return len(rows)


async def _learning_snapshot(conn) -> dict[str, Any]:
    counts = {
        "payment_outcomes": await fetch_one(conn, "SELECT COUNT(*) AS count FROM payment_outcomes"),
        "denials": await fetch_one(conn, "SELECT COUNT(*) AS count FROM denials"),
        "claim_submissions": await fetch_one(conn, "SELECT COUNT(*) AS count FROM claim_submissions"),
        "eligibility_checks": await fetch_one(conn, "SELECT COUNT(*) AS count FROM eligibility_checks"),
        "learned_rates": await fetch_one(conn, "SELECT COUNT(*) AS count FROM learned_rates"),
    }
    latest = await fetch_one(conn, "SELECT * FROM trident_training_ledger ORDER BY started_at DESC LIMIT 1")
    return {
        "counts": {key: int((row or {}).get("count") or 0) for key, row in counts.items()},
        "latest_training_run": _serialize(dict(latest) if latest else {}),
    }


async def _run_learning_sync(conn, trigger_type: str = "sync") -> dict[str, Any]:
    learned_rates_updated = await _refresh_learned_rates(conn)
    snapshot = await _learning_snapshot(conn)
    artifact: dict[str, Any] | None = None
    training_count = snapshot["counts"]["payment_outcomes"]
    auto_retrained = (
        settings.trident_learning_auto_retrain
        and training_count >= settings.min_training_records
    )
    if auto_retrained:
        artifact = await _train_trident_model(conn, trigger_type)
    return {
        "learning_mode": settings.trident_learning_mode,
        "learned_rates_updated": learned_rates_updated,
        "training_records": training_count,
        "auto_retrained": auto_retrained,
        "artifact": _serialize(artifact) if artifact else None,
        "snapshot": snapshot,
        "synced_at": datetime.now(timezone.utc).isoformat(),
    }


async def _maybe_schedule_learning_refresh(request: Request) -> None:
    if settings.trident_learning_mode not in {"continuous", "full"}:
        return
    redis = get_redis(request)
    now = datetime.now(timezone.utc)
    last_started_raw = await redis.get("trident:learning:last_started_at")
    in_flight = await redis.get("trident:learning:in_flight")
    if in_flight == "1":
        return
    if last_started_raw:
        try:
            last_started = datetime.fromisoformat(last_started_raw)
            if (now - last_started).total_seconds() < settings.trident_learning_interval_minutes * 60:
                return
        except ValueError:
            pass

    await redis.set("trident:learning:in_flight", "1", ex=max(settings.trident_learning_interval_minutes * 60, 60))
    await redis.set("trident:learning:last_started_at", now.isoformat(), ex=max(settings.trident_learning_interval_minutes * 120, 120))

    async def _runner() -> None:
        try:
            db = request.app.state.db_pool
            async with db.connection() as conn:
                result = await _run_learning_sync(conn, "continuous_refresh")
            await redis.set("trident:learning:last_success_at", datetime.now(timezone.utc).isoformat())
            await redis.set("trident:learning:last_result", json.dumps(_serialize(result)), ex=max(settings.trident_learning_interval_minutes * 240, 600))
        except Exception:
            logger.exception("Trident continuous learning refresh failed")
        finally:
            await redis.delete("trident:learning:in_flight")

    asyncio.create_task(_runner())


async def _lookup_learned_rate(conn, payer_id: str, hcpcs_code: str) -> dict[str, Any] | None:
    row = await fetch_one(
        conn,
        """
        SELECT avg_paid, median_paid, min_paid, max_paid, denial_rate, sample_count
        FROM learned_rates
        WHERE payer_id = $1 AND hcpcs_code = $2
        ORDER BY org_id NULLS LAST
        LIMIT 1
        """,
        payer_id,
        hcpcs_code,
    )
    return dict(row) if row else None


async def _trident_score(conn, payload: CanonicalScoreRequest) -> dict[str, Any]:
    rules = [dict(row) for row in await fetch_all(
        conn,
        """
        SELECT * FROM trident_rules
        WHERE payer_id = $1 AND hcpcs_code = ANY($2)
        """,
        payload.payer_id,
        payload.hcpcs_codes or [""],
    )]
    timely = await fetch_one(
        conn,
        "SELECT window_days FROM timely_filing_windows WHERE lower(payer_id) = lower($1) ORDER BY effective_date DESC LIMIT 1",
        payload.payer_id,
    )
    feature = _feature_dict_from_row(
        {
            "payer_id": payload.payer_id,
            "hcpcs_code": payload.hcpcs_codes[0] if payload.hcpcs_codes else "unknown",
            "icd10_code": payload.icd10_codes[0] if payload.icd10_codes else "unknown",
            "billed_amount": 0,
            "date_of_service": payload.dos or datetime.now(timezone.utc).date().isoformat(),
            "patient_age_bucket": _age_bucket(payload.patient_age),
        }
    )
    artifact = _load_trident_model()
    if artifact and artifact.get("model") is not None:
        denial_probability = float(artifact["model"].predict_proba(artifact["vectorizer"].transform([feature]))[0][1])
    else:
        rule_probs = [float(rule.get("denial_probability") or 0) for rule in rules if rule.get("denial_probability") is not None]
        denial_probability = float(np.mean(rule_probs)) if rule_probs else PAYER_RULES.get(payload.payer_id, {}).get("baseline_denial_rate", 0.35)

    med_score = float(engine._medical_necessity_score(payload.icd10_codes, payload.hcpcs_codes))
    modifiers = [rule.get("modifier_recommendation") for rule in rules if rule.get("modifier_recommendation")]
    learned = await _lookup_learned_rate(conn, payload.payer_id, payload.hcpcs_codes[0] if payload.hcpcs_codes else "")
    expected_reimbursement = float((learned or {}).get("avg_paid") or 0)
    risk_factors: list[str] = []
    if med_score < 0.65:
        risk_factors.append("medical_necessity_risk")
    if float(denial_probability) > 0.55:
        risk_factors.append("high_denial_probability")
    if timely and payload.dos:
        try:
            dos = datetime.fromisoformat(payload.dos).date()
            if (datetime.now(timezone.utc).date() - dos).days > int(timely["window_days"]) - 14:
                risk_factors.append("timely_filing_risk")
        except ValueError:
            pass
    if not rules:
        risk_factors.append("limited_training_rules")
    alternatives = [
        {"hcpcs_code": rule.get("hcpcs_code"), "avg_reimbursement": float(rule.get("avg_reimbursement") or 0)}
        for rule in rules
        if rule.get("avg_reimbursement")
    ]
    alternatives.sort(key=lambda item: item["avg_reimbursement"], reverse=True)
    return {
        "medical_necessity_score": round(med_score * 100, 2),
        "denial_probability": round(float(denial_probability), 4),
        "recommended_modifiers": sorted(set(modifiers)),
        "expected_reimbursement": expected_reimbursement,
        "risk_factors": risk_factors,
        "bundling_analysis": {"should_bundle": len(payload.hcpcs_codes) > 1, "codes": payload.hcpcs_codes},
        "alternative_codes": alternatives[:5],
    }


@app.post("/api/v1/trident/score")
async def v1_trident_score(payload: CanonicalScoreRequest, request: Request):
    await _maybe_schedule_learning_refresh(request)
    db = request.app.state.db_pool
    async with db.connection() as conn:
        result = await _trident_score(conn, payload)
    return result


@app.post("/api/v1/trident/retrain")
async def v1_trident_retrain(request: Request):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        artifact = await _train_trident_model(conn, "manual")
        await _refresh_learned_rates(conn)
    return _serialize(artifact)


@app.post("/api/v1/trident/feedback")
async def v1_trident_feedback(payload: FeedbackPayload, request: Request):
    db = request.app.state.db_pool
    threshold = settings.min_training_records
    async with db.connection() as conn:
        record_id = str(uuid.uuid4())
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
            record_id,
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
        await _refresh_learned_rates(conn)
        recent = await fetch_one(
            conn,
            """
            SELECT COUNT(*) AS count
            FROM payment_outcomes
            WHERE created_at >= NOW() - INTERVAL '1 day'
            """,
        )
        auto_retrained = False
        if int((recent or {}).get("count") or 0) >= threshold:
            await _train_trident_model(conn, "feedback_threshold")
            auto_retrained = True
    return {"status": "recorded", "auto_retrained": auto_retrained}


@app.get("/api/v1/trident/payer-rules/{payer_id}")
async def v1_trident_payer_rules(payer_id: str, request: Request):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        auth_reqs = [dict(row) for row in await fetch_all(conn, "SELECT * FROM payer_auth_requirements WHERE lower(payer_id) = lower($1) ORDER BY hcpcs_code", payer_id)]
        filing = await fetch_one(conn, "SELECT * FROM timely_filing_windows WHERE lower(payer_id) = lower($1) ORDER BY effective_date DESC LIMIT 1", payer_id)
        rules = [dict(row) for row in await fetch_all(conn, "SELECT * FROM trident_rules WHERE lower(payer_id) = lower($1) ORDER BY hcpcs_code", payer_id)]
    return {"payer_id": payer_id, "auth_requirements": _serialize(auth_reqs), "filing_window": _serialize(dict(filing) if filing else {}), "rules": _serialize(rules)}


@app.post("/api/v1/trident/score-batch")
async def v1_trident_score_batch(payload: list[CanonicalScoreRequest], request: Request):
    db = request.app.state.db_pool
    results = []
    async with db.connection() as conn:
        for item in payload:
            results.append(await _trident_score(conn, item))
    return {"results": results}


@app.get("/api/v1/trident/forecast")
async def v1_trident_forecast(request: Request):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        artifact = _load_trident_model()
        open_orders = [dict(row) for row in await fetch_all(
            conn,
            """
            SELECT payer_id, total_billed AS billed_amount, date_of_service, hcpcs_codes, status
            FROM orders
            WHERE status NOT IN ('paid','closed','cancelled')
            """
        )]
        probabilities: list[float] = []
        if artifact and artifact.get("model") is not None and open_orders:
            features = []
            for row in open_orders:
                features.append(_feature_dict_from_row(
                    {
                        "payer_id": row.get("payer_id"),
                        "hcpcs_code": (row.get("hcpcs_codes") or [None])[0] if isinstance(row.get("hcpcs_codes"), list) else "unknown",
                        "icd10_code": "unknown",
                        "billed_amount": row.get("billed_amount"),
                        "date_of_service": row.get("date_of_service"),
                        "patient_age_bucket": "adult",
                    }
                ))
            probabilities = artifact["model"].predict_proba(artifact["vectorizer"].transform(features))[:, 1].tolist()
        else:
            probabilities = [PAYER_RULES.get(row.get("payer_id"), {}).get("baseline_denial_rate", 0.35) for row in open_orders]
        projected_denial_rate = float(np.mean(probabilities)) if probabilities else 0.0
        ar_recovery = sum(max(0.0, float(row.get("billed_amount") or 0) * (1.0 - probabilities[index])) for index, row in enumerate(open_orders))
        payer_rows = [dict(row) for row in await fetch_all(
            conn,
            """
            SELECT payer_id, AVG(CASE WHEN is_denial THEN 1.0 ELSE 0.0 END) AS denial_rate, COUNT(*) AS sample_count
            FROM payment_outcomes
            GROUP BY payer_id
            ORDER BY denial_rate DESC NULLS LAST
            """
        )]
    return {
        "projected_denial_rate_30": round(projected_denial_rate, 4),
        "projected_denial_rate_60": round(projected_denial_rate * 1.02, 4),
        "projected_denial_rate_90": round(projected_denial_rate * 1.04, 4),
        "expected_ar_recovery": round(ar_recovery, 2),
        "payer_level_risk_trends": _serialize(payer_rows),
    }


@app.get("/api/v1/trident/learning-status")
async def v1_trident_learning_status(request: Request):
    redis = get_redis(request)
    db = request.app.state.db_pool
    async with db.connection() as conn:
        snapshot = await _learning_snapshot(conn)
    return {
        "learning_mode": settings.trident_learning_mode,
        "auto_retrain": settings.trident_learning_auto_retrain,
        "interval_minutes": settings.trident_learning_interval_minutes,
        "lookback_days": settings.trident_learning_lookback_days,
        "min_training_records": settings.min_training_records,
        "redis_state": {
            "in_flight": await redis.get("trident:learning:in_flight"),
            "last_started_at": await redis.get("trident:learning:last_started_at"),
            "last_success_at": await redis.get("trident:learning:last_success_at"),
        },
        "snapshot": snapshot,
    }


@app.post("/api/v1/trident/learning-sync")
async def v1_trident_learning_sync(request: Request):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        result = await _run_learning_sync(conn, "manual_sync")
    redis = get_redis(request)
    await redis.set("trident:learning:last_success_at", datetime.now(timezone.utc).isoformat())
    await redis.set("trident:learning:last_result", json.dumps(_serialize(result)), ex=max(settings.trident_learning_interval_minutes * 240, 600))
    return _serialize(result)


@app.get("/api/v1/trident/code-map")
async def v1_trident_code_map(icd10: str, request: Request):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        rows = [dict(row) for row in await fetch_all(
            conn,
            """
            SELECT payer_id, hcpcs_code, avg_reimbursement, denial_probability, modifier_recommendation, sample_count
            FROM trident_rules
            WHERE icd10_code = $1
            ORDER BY avg_reimbursement DESC NULLS LAST, sample_count DESC
            """,
            icd10,
        )]
    return {"icd10": icd10, "matches": _serialize(rows)}
