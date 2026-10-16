#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
container_name="task-manager-rls-${RANDOM}-${RANDOM}"
trap 'docker rm -f "$container_name" >/dev/null 2>&1 || true' EXIT
docker run --rm -d --name "$container_name" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine >/dev/null
ready=false
for attempt in $(seq 1 30); do
  # The entrypoint's temporary initialization server accepts only Unix sockets.
  # Wait for the final TCP server and a successful SQL connection before testing.
  if docker exec "$container_name" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 &&
     docker exec "$container_name" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != true ]; then
  printf 'PostgreSQL test server did not become ready on TCP within 30 seconds.\n' >&2
  docker logs --tail 20 "$container_name" >&2
  exit 1
fi
docker exec -i "$container_name" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < "$repo_root/supabase/tests/bootstrap.sql"
docker exec -i "$container_name" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < "$repo_root/supabase/migrations/202610160001_workspaces.sql"
docker exec -i "$container_name" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < "$repo_root/supabase/tests/rls.sql"
