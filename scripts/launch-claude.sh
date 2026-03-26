#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/ai-cli-env.sh
source "${ROOT}/scripts/lib/ai-cli-env.sh"
cd "$ROOT"
exec claude "$@"
