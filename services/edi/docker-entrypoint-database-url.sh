#!/bin/sh
# Same as services/shared/scripts/docker-entrypoint-database-url.sh (EDI build context cannot COPY ../shared).

if [ -n "${POSEIDON_DATABASE_URL:-}" ]; then
  export DATABASE_URL="$POSEIDON_DATABASE_URL"
elif [ -z "${DATABASE_URL:-}" ]; then
  export DATABASE_URL="postgresql://poseidon:poseidon@postgres:5432/poseidon_db"
fi
exec "$@"
