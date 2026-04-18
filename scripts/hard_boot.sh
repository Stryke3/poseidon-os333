#!/usr/bin/env bash
# Destructive local reset: stops Compose, removes named volumes, rebuilds, starts stack.
# Requires Docker. Do not run against any environment you cannot afford to wipe.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "[poseidon] hard_boot: docker compose down -v (removes postgres/redis/minio volumes)"
docker compose down -v

echo "[poseidon] hard_boot: docker compose up -d --build"
docker compose up -d --build

echo "[poseidon] hard_boot: done. Wait for healthchecks, then http://localhost/ and http://127.0.0.1:8001/ready"
