-- Loaded after 007, before 008, in ONE backend to exercise cached plans.
create function pg_temp.guard_assert(ok boolean,message text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'TEST008: %',message;end if;end$$;
create function pg_temp.guard_reject(w uuid,op text,input jsonb,version bigint,code text,key text default 'reject') returns void language plpgsql as $$begin
 begin perform public.execute_operation(w,op,input,key,version);exception when others then if sqlerrm=code then return;end if;raise;end;
 raise exception 'TEST008: expected %',code;
end$$;
create function pg_temp.guard_snapshot(w uuid) returns jsonb language plpgsql security definer as $$
declare tab text; rows jsonb; result jsonb:='{}';begin
 foreach tab in array array['teams','team_members','domain_events','idempotency_requests','operation_rate_limits'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]'') from public.%I t',tab) into rows;
  result:=result||jsonb_build_object(tab,rows);
 end loop;return result;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
create table public.guard_fixture(w uuid,other uuid,before jsonb,result jsonb);
grant select,update on public.guard_fixture to authenticated;
insert into public.guard_fixture(w,other) select public.create_workspace('Guard','guard','{"teams":[{"id":"a","name":"A","unknown":{"preserved":[42]}},{"id":"b","name":"B"},{"id":"race-a","name":"Race A"},{"id":"race-b","name":"Race B"}],"projects":[],"tasks":[]}'),public.create_workspace('Other','other','{"teams":[{"id":"foreign","name":"Foreign"}],"tasks":[],"projects":[]}');
select public.migrate_workspace(w,0),public.migrate_workspace(other,0) from public.guard_fixture;
insert into public.workspace_memberships select w,'00000000-0000-0000-0000-000000000003','member' from public.guard_fixture;
insert into public.workspace_memberships select w,'00000000-0000-0000-0000-000000000002','guest' from public.guard_fixture;
begin;
set local role authenticated;
select public.execute_operation(w,'update_team','{"id":"a","name":"Warm 007"}','warm-single',1) is not null from public.guard_fixture;
select public.execute_operation(w,'batch','{"commands":[{"operation":"create_team","input":{"id":"warm","name":"Warm"}},{"operation":"update_team","input":{"id":"b"},"expectedVersion":1}]}','warm-batch') is not null from public.guard_fixture;
rollback;
\ir ../migrations/202610200008_team_membership_baselines.sql
set role authenticated;
update public.guard_fixture set result=public.execute_operation(w,'batch','{"commands":[{"operation":"update_team","input":{"id":"a","expectedMemberships":[{"userId":"00000000-0000-0000-0000-000000000003","teamIds":[]}]},"expectedVersion":1},{"operation":"set_team_member","input":{"id":"a","userId":"00000000-0000-0000-0000-000000000003"},"expectedVersion":2}]}','plan-a');
update public.guard_fixture set before=pg_temp.guard_snapshot(w);
-- Stale empty baseline: prior child, target update, memberships, receipts and events roll back.
select pg_temp.guard_reject(w,'batch','{"commands":[{"operation":"create_team","input":{"id":"rollback","name":"Rollback"}},{"operation":"update_team","input":{"id":"b","expectedMemberships":[{"userId":"00000000-0000-0000-0000-000000000003","teamIds":[]}]},"expectedVersion":1},{"operation":"set_team_member","input":{"id":"b","userId":"00000000-0000-0000-0000-000000000003"},"expectedVersion":2}]}',null,'version_conflict') from public.guard_fixture;
select pg_temp.guard_assert(before=pg_temp.guard_snapshot(w),'whole stale batch rollback') from public.guard_fixture;
select pg_temp.guard_assert(result=public.execute_operation(w,'batch','{"commands":[{"operation":"update_team","input":{"id":"a","expectedMemberships":[{"userId":"00000000-0000-0000-0000-000000000003","teamIds":[]}]},"expectedVersion":1},{"operation":"set_team_member","input":{"id":"a","userId":"00000000-0000-0000-0000-000000000003"},"expectedVersion":2}]}','plan-a'),'authorized replay skips old relationship guard') from public.guard_fixture;
-- Unmodified contract allows multiple teams. Snapshot order is irrelevant.
select public.execute_operation(w,'set_team_member','{"id":"b","userId":"00000000-0000-0000-0000-000000000003"}','unguarded',1) is not null from public.guard_fixture;
select public.execute_operation(w,'update_team','{"id":"a","expectedMemberships":[{"userId":"00000000-0000-0000-0000-000000000003","teamIds":["b","a"]}]}','order',3) is not null from public.guard_fixture;
-- Team created after the old snapshot: phantom and selected-member drift.
select public.execute_operation(w,'create_team','{"id":"newer","name":"Newer","expectedMemberships":[]}','newer') is not null from public.guard_fixture;
select public.execute_operation(w,'set_team_member','{"id":"newer","userId":"00000000-0000-0000-0000-000000000003"}','newer-member',1) is not null from public.guard_fixture;
update public.guard_fixture set before=pg_temp.guard_snapshot(w);
select pg_temp.guard_reject(w,'update_team','{"id":"b","expectedMemberships":[{"userId":"00000000-0000-0000-0000-000000000003","teamIds":["b","a"]}]}',2,'version_conflict') from public.guard_fixture;
select pg_temp.guard_reject(w,'update_team','{"id":"b","expectedMemberships":[{"userId":"00000000-0000-0000-0000-000000000099","teamIds":[]}]}',2,'version_conflict') from public.guard_fixture;
select pg_temp.guard_reject(w,'update_team','{"id":"b","expectedMemberships":[{"userId":"00000000-0000-0000-0000-000000000003","teamIds":["foreign"]}]}',2,'version_conflict') from public.guard_fixture;
select pg_temp.guard_assert(before=pg_temp.guard_snapshot(w),'phantom, missing user and foreign team leave no writes') from public.guard_fixture;
select public.execute_operation(w,'create_team','{"id":"reviewed","name":"Reviewed","expectedMemberships":[{"userId":"00000000-0000-0000-0000-000000000003","teamIds":["newer","a","b"]}]}','reviewed') is not null from public.guard_fixture;
-- Malformed shape and duplicate sets fail as validation errors, before replay/mutation.
do $$declare expected jsonb; w uuid:=(select f.w from public.guard_fixture f);begin
 for expected in select value from jsonb_array_elements('[null,{},[null],[{}],[{"userId":"00000000-0000-0000-0000-000000000003","teamIds":null}],[{"userId":"00000000-0000-0000-0000-000000000003","teamIds":[1]}],[{"userId":"00000000-0000-0000-0000-000000000003","teamIds":["a","a"]}],[{"userId":"00000000-0000-0000-0000-000000000003","teamIds":[],"unknown":true}],[{"userId":"abcdef00-0000-0000-0000-000000000003","teamIds":[]},{"userId":"ABCDEF00-0000-0000-0000-000000000003","teamIds":[]}]]'::jsonb) loop
  perform pg_temp.guard_reject(w,'update_team',jsonb_build_object('id','b','expectedMemberships',expected),2,'validation_error');
 end loop;
end$$;
-- Whole payload/operation bound rejects before any writes.
update public.guard_fixture set before=pg_temp.guard_snapshot(w);
select pg_temp.guard_reject(w,'batch',jsonb_build_object('commands',(select jsonb_agg(jsonb_build_object('operation','create_team','input',jsonb_build_object('name','Large','description',repeat('x',10000),'expectedMemberships','[]'::jsonb))) from generate_series(1,30))),null,'validation_error') from public.guard_fixture;
select pg_temp.guard_reject(w,'batch',jsonb_build_object('commands',(select jsonb_agg(jsonb_build_object('operation','create_team','input',jsonb_build_object('name','Extra'))) from generate_series(1,101))),null,'validation_error') from public.guard_fixture;
select pg_temp.guard_assert(before=pg_temp.guard_snapshot(w),'limits reject entire request') from public.guard_fixture;
reset role;
select pg_temp.guard_assert((select version=2 from public.teams where workspace_id=w and id='newer'),'untouched team version unchanged') from public.guard_fixture;
select pg_temp.guard_assert(not exists(select 1 from public.teams where legacy_metadata?'expectedMemberships'),'guard is never entity metadata');
select pg_temp.guard_assert((select legacy_metadata->'unknown'='{"preserved":[42]}' from public.teams where workspace_id=w and id='a'),'unknown metadata preserved') from public.guard_fixture;
-- Private helpers cannot become public PostgREST/GraphQL operations.
select pg_temp.guard_assert(count(*)=4 and bool_and(not prosecdef and not has_function_privilege('anon',oid,'execute') and not has_function_privilege('authenticated',oid,'execute')),'private invoker helper ACLs') from pg_proc where pronamespace='public'::regnamespace and proname in ('operation_validate','operation_graph','operation_validate_before_team_membership_baselines','operation_graph_before_team_membership_baselines');
set role authenticated;
do $$begin
 begin perform public.operation_validate('create_team','{"name":"Direct"}');raise exception 'helper exposed';exception when insufficient_privilege then null;end;
 begin perform public.operation_graph((select w from public.guard_fixture),'create_team','{"name":"Direct"}',null,'{}');raise exception 'helper exposed';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select pg_temp.guard_reject(w,'update_team','{"id":"a","expectedMemberships":[]}',4,'forbidden') from public.guard_fixture;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select pg_temp.guard_reject(other,'create_team','{"name":"Tenant","expectedMemberships":[]}',null,'forbidden') from public.guard_fixture;
reset role;
-- Real OAuth grant path uses only fixture identities and preserves current revocation.
insert into auth.oauth_clients values('10000000-0000-0000-0000-000000000008','Guard test',null);
insert into auth.oauth_consents values('00000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000008',null);
insert into public.integration_connections(id,user_id,client_id,client_name,status,authorization_id,authorized_at) values('10000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000008','Guard test','active','guard-test',now());
insert into public.agents(workspace_id,id,name,auth_user_id,client_id) select w,'guard-agent','Guard agent','00000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000008' from public.guard_fixture;
insert into public.integration_grants select '10000000-0000-0000-0000-000000000008',w,'write','guard-agent' from public.guard_fixture;
select set_config('request.jwt.claims','{"client_id":"10000000-0000-0000-0000-000000000008"}',false);
set role authenticated;
update public.guard_fixture set result=public.execute_operation(w,'update_team','{"id":"b","expectedMemberships":[{"userId":"00000000-0000-0000-0000-000000000003","teamIds":["a","b","newer"]}]}','agent',2);
select pg_temp.guard_assert(result=public.execute_operation(w,'update_team','{"id":"b","expectedMemberships":[{"userId":"00000000-0000-0000-0000-000000000003","teamIds":["a","b","newer"]}]}','agent',2),'agent replay') from public.guard_fixture;
reset role;
update public.integration_grants set capability='read' where connection_id='10000000-0000-0000-0000-000000000008';
set role authenticated;
select pg_temp.guard_reject(w,'update_team','{"id":"b","expectedMemberships":[{"userId":"00000000-0000-0000-0000-000000000003","teamIds":["a","b","newer"]}]}',2,'forbidden','agent') from public.guard_fixture;
reset role;
update public.integration_grants set capability='write' where connection_id='10000000-0000-0000-0000-000000000008';
delete from public.workspace_memberships where user_id='00000000-0000-0000-0000-000000000003';
set role authenticated;
select pg_temp.guard_reject(w,'update_team','{"id":"b","expectedMemberships":[{"userId":"00000000-0000-0000-0000-000000000003","teamIds":["a","b","newer"]}]}',2,'forbidden','agent') from public.guard_fixture;
reset role;
select 'TEST008 SQL contract checks passed' as result;
