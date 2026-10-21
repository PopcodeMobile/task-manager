#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
container_name="task-manager-guard008-${RANDOM}-${RANDOM}"
trap 'docker rm -f "$container_name" >/dev/null 2>&1 || true' EXIT
docker run --rm -d --name "$container_name" -e POSTGRES_HOST_AUTH_METHOD=trust -v "$repo_root:/workspace:ro" postgres:17-alpine >/dev/null
ready=false
for attempt in $(seq 1 30); do
  if docker exec "$container_name" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 -c 'select 1' >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[ "$ready" = true ] || exit 1
sql() { docker exec -i "$container_name" psql -X -q -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 "$@"; }
sql -f /workspace/supabase/tests/bootstrap.sql
for migration in 202610160001_workspaces 202610200001_normalized_work 202610200002_agent_operations; do sql -f "/workspace/supabase/migrations/$migration.sql"; done
sql <<'SQL'
create table auth.oauth_clients(id uuid primary key,client_name text,deleted_at timestamptz);
create table auth.oauth_authorizations(authorization_id text primary key,user_id uuid,client_id uuid,status text,expires_at timestamptz);
create table auth.oauth_consents(user_id uuid,client_id uuid,revoked_at timestamptz);
SQL
for migration in 202610200003_integration_grants 202610200005_ui_contracts 202610200006_file_duplication 202610200007_task_graph_copy; do sql -f "/workspace/supabase/migrations/$migration.sql"; done
sql -f /workspace/supabase/tests/team-membership-baselines.sql
# Separate real backends serialize on the unchanged workspace mutex.
sql > /tmp/task4d-postgres-first.log 2>&1 <<'SQL' &
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select public.execute_operation(w,'batch','{"commands":[{"operation":"update_team","input":{"id":"race-a","expectedMemberships":[{"userId":"00000000-0000-0000-0000-000000000001","teamIds":[]}]},"expectedVersion":1},{"operation":"set_team_member","input":{"id":"race-a","userId":"00000000-0000-0000-0000-000000000001"},"expectedVersion":2}]}','race-a') is not null from public.guard_fixture;
select pg_sleep(2);
commit;
SQL
first_pid=$!
sleep 0.5
if sql > /tmp/task4d-postgres-second.log 2>&1 <<'SQL'
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.execute_operation(w,'batch','{"commands":[{"operation":"create_team","input":{"id":"race-rollback","name":"Rollback"}},{"operation":"update_team","input":{"id":"race-b","expectedMemberships":[{"userId":"00000000-0000-0000-0000-000000000001","teamIds":[]}]},"expectedVersion":1},{"operation":"set_team_member","input":{"id":"race-b","userId":"00000000-0000-0000-0000-000000000001"},"expectedVersion":2}]}','race-b') is not null from public.guard_fixture;
SQL
then printf 'Second stale plan unexpectedly succeeded\n' >&2; exit 1; fi
wait "$first_pid"
rg -q 'version_conflict' /tmp/task4d-postgres-second.log
sql <<'SQL'
do $$begin
 if (select count(*) from public.team_members where user_id='00000000-0000-0000-0000-000000000001')<>1 then raise exception 'race membership count';end if;
 if exists(select 1 from public.teams where id='race-rollback') then raise exception 'partial batch';end if;
 if exists(select 1 from public.domain_events where entity_id in ('race-b','race-rollback')) then raise exception 'partial event';end if;
 if exists(select 1 from public.idempotency_requests where key='race-b') then raise exception 'partial receipt';end if;
 if (select version from public.teams where id='race-b')<>1 then raise exception 'target changed';end if;
end$$;
SQL
printf 'TEST008 PostgreSQL 17: warm007, atomic guards, replay, tenant/guest/agent/ACL and two-session serialization passed.\n'
