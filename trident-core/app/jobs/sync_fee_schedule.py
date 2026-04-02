from datetime import date

from sqlalchemy.orm import Session

from app.models.fee_schedule import HCPCSFeeSchedule


def run_sync_fee_schedule(db: Session) -> int:
    defaults = {
        "L1833": 325.00,
        "L1832": 210.00,
        "E0218": 145.00,
        "E0143": 85.00,
        "E0165": 75.00,
        "E0651": 190.00,
        "L1686": 340.00,
        "L3960": 295.00,
        "L3670": 120.00,
    }
    count = 0
    for code, amount in defaults.items():
        db.add(
            HCPCSFeeSchedule(
                hcpcs_code=code,
                jurisdiction="DME_MAC_A",
                state=None,
                rural_flag=False,
                fee_schedule_amount=amount,
                purchase_rental_indicator="P",
                effective_date=date(2026, 1, 1),
                source_version="seed-2026q1",
            )
        )
        count += 1
    db.commit()
    return count
