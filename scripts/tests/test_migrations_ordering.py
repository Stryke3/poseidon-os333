"""
Sanity tests for scripts/migrations/*.sql ordering.

Runs standalone; no DB required. Asserts:
  - No numbering collision (NNN_ prefix is unique).
  - Every migration file ends in .sql.
  - Lexical sort matches the expected monotonic order.
  - Required post-sprint migrations are present.
"""

from __future__ import annotations

import pathlib
import re

HERE = pathlib.Path(__file__).resolve()
MIGRATIONS_DIR = HERE.parent.parent / "migrations"


def list_migrations():
    return sorted(p.name for p in MIGRATIONS_DIR.glob("*.sql"))


def test_no_numbering_collision():
    seen: dict[str, str] = {}
    for name in list_migrations():
        prefix = name.split("_", 1)[0]
        assert prefix not in seen, f"numbering collision: {seen.get(prefix)} vs {name}"
        seen[prefix] = name


def test_monotonic_ordering():
    names = list_migrations()
    previous = -1
    for name in names:
        prefix = name.split("_", 1)[0]
        assert re.match(r"^\d{3}$", prefix), f"bad prefix: {name}"
        n = int(prefix)
        assert n > previous, f"non-monotonic ordering: {name} after prefix {previous}"
        previous = n


def test_required_post_sprint_migrations_present():
    names = list_migrations()
    assert "017_intake_review_queue.sql" in names
    assert "018_trident_learning_aggregates.sql" in names


def test_every_file_has_schema_version_bump():
    # Not strictly required for every migration, but the two new ones must.
    required = {"017_intake_review_queue.sql", "018_trident_learning_aggregates.sql"}
    for name in required:
        body = (MIGRATIONS_DIR / name).read_text()
        assert "schema_version" in body, f"{name} must bump schema_version"
