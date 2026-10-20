-- Runs only in the disposable PostgreSQL runner, with deliberately fabricated test Auth rows.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
create table public.agent_test_fixture(workspace_id uuid);
insert into public.agent_test_fixture select public.create_workspace('Operations','operations','{"projects":[{"id":"p1","key":"OPS","name":"Ops"}],"tasks":[{"id":"t1","project":"p1","title":"Concurrent"}]}');
select public.migrate_workspace(workspace_id,0) from public.agent_test_fixture;
insert into public.workspace_memberships select workspace_id,'00000000-0000-0000-0000-000000000003','member' from public.agent_test_fixture;
insert into public.workspace_memberships select workspace_id,'00000000-0000-0000-0000-000000000002','guest' from public.agent_test_fixture;
insert into public.agents(workspace_id,id,name,auth_user_id) select workspace_id,'a1','First','00000000-0000-0000-0000-000000000001' from public.agent_test_fixture;
insert into public.agents(workspace_id,id,name,auth_user_id) select workspace_id,'a2','Second','00000000-0000-0000-0000-000000000003' from public.agent_test_fixture;
grant select on public.agent_test_fixture to authenticated;
create function public.test_operation_denied(stmt text,wanted text) returns void language plpgsql as $$
begin execute stmt; raise exception 'Expected rejection: %',wanted;
exception when others then if sqlerrm<>wanted then raise;end if;end $$;
set role authenticated;
select public.test_operation_denied(format('select public.execute_operation(%L,%L,%L,%L,1)',workspace_id,'update_task','{"id":"t1","title":"No claim"}','no-claim'),'claim_expired') from public.agent_test_fixture;
select public.test_operation_denied(format('select public.execute_operation(%L,%L,%L,%L,1)',workspace_id,'update_task','{"id":"t1","status":"done"}','bypass'),'validation_error') from public.agent_test_fixture;
select public.test_operation_denied('select * from public.task_claims','permission denied for table task_claims');
select public.test_operation_denied('select public.operation_authorize(null,true)','permission denied for function operation_authorize');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select public.test_operation_denied(format('select public.execute_operation(%L,%L,%L,%L,null)',workspace_id,'create_task','{"projectId":"p1","title":"Guest"}','guest'),'forbidden') from public.agent_test_fixture;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select set_config('request.jwt.claims','{"client_id":"ungranted"}',false);
select public.test_operation_denied(format('select public.read_operation(%L,%L,%L)',workspace_id,'list_tasks','{}'),'forbidden') from public.agent_test_fixture;
select set_config('request.jwt.claims','{}',false);
reset role;
