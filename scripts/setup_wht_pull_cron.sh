#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"

# Defaults: morning 06:15, nightly 21:30 local time.
MORNING_SPEC="${WHT_MORNING_CRON_SPEC:-15 6 * * *}"
NIGHTLY_SPEC="${WHT_NIGHTLY_CRON_SPEC:-30 21 * * *}"

MORNING_CMD="cd \"$ROOT_DIR\" && $PYTHON_BIN scripts/wht_data_room_pull.py --mode morning >> \"$ROOT_DIR/data/processed/wht_morning.log\" 2>&1"
NIGHTLY_CMD="cd \"$ROOT_DIR\" && $PYTHON_BIN scripts/wht_data_room_pull.py --mode nightly >> \"$ROOT_DIR/data/processed/wht_nightly.log\" 2>&1"

mkdir -p "$ROOT_DIR/data/processed"

EXISTING="$(crontab -l 2>/dev/null || true)"
FILTERED="$(printf "%s\n" "$EXISTING" | awk '!/wht_data_room_pull.py/')"

{
  printf "%s\n" "$FILTERED"
  printf "%s %s\n" "$MORNING_SPEC" "$MORNING_CMD"
  printf "%s %s\n" "$NIGHTLY_SPEC" "$NIGHTLY_CMD"
} | crontab -

echo "Installed WHT pull cron jobs:"
echo "  MORNING: $MORNING_SPEC"
echo "  NIGHTLY: $NIGHTLY_SPEC"
