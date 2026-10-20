#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
suite="${1:-legacy}"
case "$suite" in
  legacy|normalized|agents|all) ;;
  *) printf 'Usage: %s [legacy|normalized|agents|all]\n' "$0" >&2; exit 2 ;;
esac
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
if [ "$suite" = legacy ] || [ "$suite" = all ]; then
  docker exec -i "$container_name" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < "$repo_root/supabase/tests/rls.sql"
fi
if [ "$suite" = normalized ] || [ "$suite" = agents ] || [ "$suite" = all ]; then
  docker exec -i "$container_name" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < "$repo_root/supabase/migrations/202610200001_normalized_work.sql"
  docker exec -i "$container_name" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < "$repo_root/supabase/tests/normalized-rls.sql"
fi

if [ "$suite" = agents ] || [ "$suite" = all ]; then
  docker exec -i "$container_name" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < "$repo_root/supabase/migrations/202610200002_agent_operations.sql"
  docker exec -i "$container_name" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < "$repo_root/supabase/tests/agent-operations.sql"
  # Two real sessions contend for one lease. The second waits for the first commit.
  docker exec -i "$container_name" psql -qAt -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 > /tmp/task-manager-claim-first.log 2>&1 <<'SQL' &
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select public.execute_operation(workspace_id,'claim_task','{"id":"t1"}','claim-first',1) is not null from public.agent_test_fixture;
select pg_sleep(2);
commit;
SQL
  first_pid=$!
  sleep 0.3
  if docker exec -i "$container_name" psql -qAt -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 > /tmp/task-manager-claim-second.log 2>&1 <<'SQL'
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select public.execute_operation(workspace_id,'claim_task','{"id":"t1"}','claim-second',1) from public.agent_test_fixture;
SQL
  then
    printf 'Concurrent claim unexpectedly succeeded twice.\n' >&2; exit 1
  fi
  wait "$first_pid"
  rg -q 'version_conflict|already_claimed' /tmp/task-manager-claim-second.log
  # Same-key replay in independent concurrent sessions yields one task/event.
  for attempt in 1 2; do
    docker exec -i "$container_name" psql -qAt -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 > "/tmp/task-manager-idempotency-${attempt}.log" 2>&1 <<'SQL' &
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.execute_operation(workspace_id,'create_task','{"projectId":"p1","title":"Replay race"}','replay-race',null) is not null from public.agent_test_fixture;
SQL
    if [ "$attempt" = 1 ]; then first_pid=$!; else second_pid=$!; fi
  done
  wait "$first_pid"
  wait "$second_pid"
  for attempt in 1 2; do
    docker exec -i "$container_name" psql -qAt -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 > "/tmp/task-manager-key-${attempt}.log" 2>&1 <<SQL &
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.execute_operation(workspace_id,'create_task','{"projectId":"p1","title":"Key race ${attempt}"}','key-race-${attempt}',null) is not null from public.agent_test_fixture;
SQL
    if [ "$attempt" = 1 ]; then first_pid=$!; else second_pid=$!; fi
  done
  wait "$first_pid"
  wait "$second_pid"
  docker exec -i "$container_name" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
 if (select count(*) from public.task_claims)<>1 then raise exception 'Claim race did not retain exactly one lease';end if;
 if (select count(*) from public.tasks where title='Replay race')<>1 then raise exception 'Idempotency race duplicated task';end if;
 if (select count(*) from public.domain_events where operation='create_task')<>3 then raise exception 'Idempotency race duplicated event';end if;
 if (select count(distinct key) from public.tasks where title like 'Key race %')<>2 then raise exception 'Concurrent sequence duplicated key';end if;
 if exists(select 1 from public.domain_events where payload::text like '%claimToken%') then raise exception 'Event exposed claim token';end if;
end $$;
SQL
  printf 'Agent authorization, real concurrent claims, idempotency and project sequences passed on PostgreSQL.\n'
fi
