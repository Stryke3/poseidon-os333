from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.hcpcs import HCPCSMaster
from app.models.modifier_rules import ModifierRule


def assign_modifiers(db: Session, hcpcs_code: str, laterality: str | None, purchase_type: str) -> dict:
    errors: list[str] = []
    modifiers: list[str] = []

    code = db.get(HCPCSMaster, hcpcs_code)
    if not code:
        return {"modifiers": [], "errors": [f"Unknown HCPCS {hcpcs_code}"]}

    pt = (purchase_type or "").upper()
    if pt not in {"NU", "RR"}:
        errors.append("purchase_type must be NU or RR")
    else:
        modifiers.append(pt)
        if pt == "RR" and not code.capped_rental_flag:
            errors.append(f"{hcpcs_code} does not support rental")
        if pt == "NU" and not code.purchase_allowed_flag:
            errors.append(f"{hcpcs_code} does not support purchase")

    lat = (laterality or "").upper()
    if code.laterality_applicable_flag:
        if lat not in {"RT", "LT"}:
            errors.append(f"{hcpcs_code} requires RT/LT")
        else:
            modifiers.append(lat)

    rules = list(db.scalars(select(ModifierRule).where(ModifierRule.hcpcs_code == hcpcs_code)))
    for rule in rules:
        if rule.required_flag and rule.modifier not in modifiers:
            modifiers.append(rule.modifier)
        if not rule.allowed_flag and rule.modifier in modifiers:
            errors.append(f"Modifier {rule.modifier} is not allowed for {hcpcs_code}")
        for ex in rule.mutually_exclusive_with:
            if rule.modifier in modifiers and ex in modifiers:
                errors.append(f"Invalid modifier combo: {rule.modifier}+{ex}")

    unique = []
    for m in modifiers:
        if m not in unique:
            unique.append(m)
    return {"modifiers": unique, "errors": errors}
