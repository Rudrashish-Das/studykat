#!/usr/bin/env bash
# Runs the migrations and the SQL assertions against a throwaway Postgres
# container. Needs Docker; touches nothing outside the container.
set -euo pipefail

CONTAINER=studycat-pgtest
IMAGE=postgres:16-alpine
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "Starting $IMAGE..."
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null

for _ in $(seq 1 40); do
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 0.5
done

docker cp "$HERE/." "$CONTAINER:/sql" >/dev/null

run() { docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -q -f "$1"; }

echo "Applying the Supabase shim..."
run /sql/tests/00_shim.sql

echo "Applying migrations..."
for file in $(docker exec "$CONTAINER" sh -c 'ls /sql/migrations/*.sql | sort'); do
  echo "  $(basename "$file")"
  run "$file"
done

echo "Installing test helpers..."
run /sql/tests/01_helpers.sql

echo "Running assertions..."
docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -f /sql/tests/rls_and_rpc.sql
