#!/bin/sh
# Resolve DATABASE_URL for Core and other Python services.
#
# Priority:
#   1) POSEIDON_DATABASE_URL — explicit override (Compose / ops)
#   2) DATABASE_URL — keep when already set (managed Postgres, platform-injected DSN, manual)
#   3) Bundled Compose Postgres on the docker network (local default)
#
# Previously we always forced (3) when POSEIDON_DATABASE_URL was unset, which
# wiped a valid platform DATABASE_URL and made /ready report database: error.

if [ -n "${POSEIDON_DATABASE_URL:-}" ]; then
  export DATABASE_URL="$POSEIDON_DATABASE_URL"
elif [ -z "${DATABASE_URL:-}" ]; then
  export DATABASE_URL="postgresql://poseidon:poseidon@postgres:5432/poseidon_db"
fi
exec "$@"
