from types import SimpleNamespace

from app.services.modifier_service import assign_modifiers


class FakeDB:
    def __init__(self):
        self.codes = {
            "L1833": SimpleNamespace(capped_rental_flag=False, purchase_allowed_flag=True, laterality_applicable_flag=True),
            "E0143": SimpleNamespace(capped_rental_flag=False, purchase_allowed_flag=True, laterality_applicable_flag=False),
        }

    def get(self, model, key):
        return self.codes.get(key)

    def scalars(self, _stmt):
        return []


def test_modifier_requires_laterality():
    db = FakeDB()
    result = assign_modifiers(db, "L1833", None, "NU")
    assert "requires RT/LT" in " ".join(result["errors"])


def test_modifier_assigns_rt_nu():
    db = FakeDB()
    result = assign_modifiers(db, "L1833", "RT", "NU")
    assert "RT" in result["modifiers"]
    assert "NU" in result["modifiers"]
