from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.fee_schedule import HCPCSFeeSchedule
from app.models.reimbursement_history import ReimbursementHistory


def estimate_reimbursement(db: Session, payer: str, claim_lines: list[dict]) -> dict:
    lines: list[dict] = []
    total_allowed = 0.0
    total_paid = 0.0
    for line in claim_lines:
        hcpcs = line["hcpcs_code"]
        units = int(line.get("units", 1))
        fs = db.scalar(
            select(HCPCSFeeSchedule)
            .where(HCPCSFeeSchedule.hcpcs_code == hcpcs)
            .order_by(HCPCSFeeSchedule.effective_date.desc())
        )
        hist = db.execute(
            select(
                func.avg(ReimbursementHistory.allowed_amount),
                func.avg(ReimbursementHistory.paid_amount),
            ).where(
                ReimbursementHistory.payer_name == payer,
                ReimbursementHistory.hcpcs_code == hcpcs,
            )
        ).one()
        base_allowed = float(fs.fee_schedule_amount) if fs else 0.0
        hist_allowed = float(hist[0]) if hist[0] is not None else base_allowed
        hist_paid = float(hist[1]) if hist[1] is not None else hist_allowed * 0.82
        allowed = max(base_allowed, hist_allowed) * units
        paid = min(allowed, hist_paid * units)
        lines.append(
            {
                "hcpcs_code": hcpcs,
                "units": units,
                "expected_allowed": round(allowed, 2),
                "expected_paid": round(paid, 2),
            }
        )
        total_allowed += allowed
        total_paid += paid
    return {
        "total_expected_allowed": round(total_allowed, 2),
        "total_expected_paid": round(total_paid, 2),
        "lines": lines,
    }
