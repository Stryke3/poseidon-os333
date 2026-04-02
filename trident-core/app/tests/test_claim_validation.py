from app.services.claim_builder_service import build_claim


class FakeDB:
    def __init__(self):
        self.items = []
        self.claims = []

    def get(self, model, key):
        class C:
            capped_rental_flag = False
            purchase_allowed_flag = True
            laterality_applicable_flag = key in {"L1833", "L1832", "L1686"}

        return C()

    def scalars(self, _stmt):
        return []

    def scalar(self, _stmt):
        return None

    def execute(self, _stmt):
        class R:
            @staticmethod
            def one():
                return (100.0, 80.0)

        return R()

    def add(self, item):
        self.items.append(item)

    def flush(self):
        return None

    def commit(self):
        return None


def test_missing_laterality_fail():
    db = FakeDB()
    payload = {
        "patient_id": "p1",
        "payer_name": "Medicare",
        "date_of_service": "2026-02-01",
        "procedure_family": "TKA",
        "laterality": None,
        "diagnoses": ["M17.11"],
        "documents": {},
        "lines": [{"hcpcs_code": "L1833", "units": 1, "purchase_type": "NU", "charge_amount": 300}],
        "idempotency_key": "k1",
    }
    result = build_claim(db, payload)
    assert result["status"] in {"REJECT", "REVIEW"}


def test_duplicate_claim_blocked():
    from app.services import claim_builder_service as svc

    original = svc.detect_duplicates
    svc.detect_duplicates = lambda *_args, **_kwargs: {"duplicate_flag": True, "existing_claim_id": "abc", "match_confidence": 1.0}
    try:
        db = FakeDB()
        payload = {
            "patient_id": "p1",
            "payer_name": "Medicare",
            "date_of_service": "2026-02-01",
            "procedure_family": "TKA",
            "laterality": "RT",
            "diagnoses": ["M17.11"],
            "documents": {},
            "lines": [{"hcpcs_code": "L1833", "units": 1, "purchase_type": "NU", "charge_amount": 300}],
            "idempotency_key": "k2",
        }
        result = build_claim(db, payload)
        assert result["status"] == "BLOCKED"
    finally:
        svc.detect_duplicates = original
