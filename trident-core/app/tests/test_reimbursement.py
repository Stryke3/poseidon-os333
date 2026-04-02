from app.services.reimbursement_service import estimate_reimbursement


class FakeScalar:
    def __init__(self, value):
        self.value = value


class FakeDB:
    def scalar(self, _stmt):
        return None

    def execute(self, _stmt):
        class R:
            @staticmethod
            def one():
                return (150.0, 120.0)

        return R()


def test_estimate_reimbursement_returns_totals():
    db = FakeDB()
    result = estimate_reimbursement(db, "Medicare", [{"hcpcs_code": "L1833", "units": 1}])
    assert result["total_expected_allowed"] >= 0
    assert result["total_expected_paid"] >= 0
