#!/usr/bin/env bash
# Start the full stack and wait until EDI responds on http://127.0.0.1:8006/health
# Requires: Docker Desktop (or Docker Engine) running.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  cp .env.template .env
  echo "Created .env from .env.template (edit secrets for anything beyond local dev)."
fi

docker compose up -d --build

echo "Waiting for EDI health (up to ~3 min on first build)..."
for _ in $(seq 1 40); do
  if curl -fsS --max-time 5 http://127.0.0.1:8006/health >/dev/null 2>&1; then
    echo "EDI health:"
    curl -sS http://127.0.0.1:8006/health
    echo ""
    exit 0
  fi
  sleep 5
done

echo "EDI did not become ready. Check: docker compose logs edi --tail 80"
exit 1
