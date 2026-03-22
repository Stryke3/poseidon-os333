#!/usr/bin/env bash
# Ingest CSV/XLSX from data/lvco into Core. Reads repo .env inside the Python script.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec python3 "$ROOT/scripts/ingest_lvco.py" "$@"
