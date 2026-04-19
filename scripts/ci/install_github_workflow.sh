#!/usr/bin/env bash
# Install CI workflow into .github/workflows/ (local only — use SSH or a PAT with
# workflow scope when pushing that path to GitHub).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="$ROOT/.github/workflows/ci.yml"
mkdir -p "$(dirname "$DEST")"
cp "$ROOT/scripts/ci/github-actions-ci.yml" "$DEST"
echo "Wrote $DEST"
echo "Commit and push .github/workflows/ci.yml (SSH or PAT with workflow scope)."
