from types import SimpleNamespace

from app.services.dx_linking_service import map_diagnosis_to_lines


class FakeDB:
    def scalars(self, _stmt):
        return [
            SimpleNamespace(hcpcs_code="L1833", diagnosis_code="M17.11", support_level="required", active_flag=True),
            SimpleNamespace(hcpcs_code="L1833", diagnosis_code="Z48.89", support_level="supportive", active_flag=True),
        ]


def test_dx_pointer_assignment():
    db = FakeDB()
    lines = [{"hcpcs_code": "L1833", "units": 1}]
    out = map_diagnosis_to_lines(db, lines, ["M17.11", "Z48.89"])
    assert out[0]["diagnosis_pointers"]
    assert out[0]["dx_link_status"] == "PASS"
