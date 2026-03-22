#!/bin/sh

set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[poseidon] stopping active compose stack"
docker compose down -v --remove-orphans || true

echo "[poseidon] removing leftover poseidon containers"
POSEIDON_CONTAINERS="$(docker ps -a --format '{{.Names}}' | grep '^poseidon' || true)"
if [ -n "$POSEIDON_CONTAINERS" ]; then
  printf '%s\n' "$POSEIDON_CONTAINERS" | while IFS= read -r container; do
    [ -n "$container" ] || continue
    docker rm -f "$container"
  done
fi

DEAD_IDS="$(docker ps -a --filter status=dead --format '{{.ID}}' || true)"
if [ -n "$DEAD_IDS" ]; then
  printf '%s\n' "$DEAD_IDS" | while IFS= read -r container_id; do
    [ -n "$container_id" ] || continue
    docker rm -f "$container_id" || true
  done
fi

echo "[poseidon] pruning poseidon volumes"
for volume in \
  poseidon2_postgres_data \
  poseidon2_redis_data \
  poseidon2_minio_data \
  poseidon2_training_data
do
  if docker volume ls --format '{{.Name}}' | grep -qx "$volume"; then
    docker volume rm -f "$volume" || true
  fi
done

echo "[poseidon] rebuilding and starting clean stack"
docker compose up -d --build --force-recreate

echo "[poseidon] current containers"
docker compose ps
