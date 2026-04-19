"""
Tests for scripts/bootstrap_trident_from_history.py

These cover:
  - SQL body presence for every required scope
  - SQL body parameterization (no raw string interpolation of version_id)
  - _redact_host is safe
  - Required source table list is enforced
"""

from __future__ import annotations

import importlib.util
import pathlib
import sys


HERE = pathlib.Path(__file__).resolve()
SCRIPT = HERE.parent.parent / "bootstrap_trident_from_history.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("bootstrap_trident_from_history", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules["bootstrap_trident_from_history"] = module
    spec.loader.exec_module(module)
    return module


def test_required_source_tables_present():
    m = _load_module()
    assert set(m.REQUIRED_SOURCE_TABLES) >= {"payment_outcomes", "denials", "orders", "patients"}


def test_all_core_scopes_have_sql():
    m = _load_module()
    for scope in ("payer_hcpcs", "payer_dx", "hcpcs_dx", "payer_reason", "payer_lag"):
        assert scope in m.AGG_SQL, f"missing SQL for scope {scope}"
        sql_text = m.AGG_SQL[scope]
        assert "INSERT INTO trident_learned_aggregates" in sql_text
        assert "%(version_id)s" in sql_text, f"scope {scope} must parameterize version_id"


def test_optional_scopes_declare_dependencies():
    m = _load_module()
    for scope, (sql_text, deps) in m.OPTIONAL_AGG_SQL.items():
        assert isinstance(deps, list) and deps, f"scope {scope} must declare dependency tables"
        assert "INSERT INTO trident_learned_aggregates" in sql_text
        assert "%(version_id)s" in sql_text


def test_redact_host_does_not_expose_password():
    m = _load_module()
    url = "postgresql://user:supersecret@host.example.com:5432/db?sslmode=require"
    out = m._redact_host(url)
    assert "supersecret" not in out
    assert "host.example.com" in out


def test_redact_host_on_garbage_input():
    m = _load_module()
    assert m._redact_host("not-a-url") == "<unknown>"


def test_every_agg_inserts_version_id_column():
    m = _load_module()
    # Each INSERT must target `version_id` as one of the columns so the
    # `trident_learned_aggregates_current` view can pivot on it.
    for name, sql_text in list(m.AGG_SQL.items()) + [(k, v[0]) for k, v in m.OPTIONAL_AGG_SQL.items()]:
        assert "version_id" in sql_text, f"scope {name} must populate version_id column"
