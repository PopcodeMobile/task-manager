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

-- Regression: deletion cannot authorize writes to a surviving task via FK cascades.
-- This transaction is rolled back so the independent concurrent-claim fixture stays unchanged.
begin;
create temporary table deletion_fixture as select public.create_workspace('Deletion','deletion','{"projects":[{"id":"p1","name":"Deleted"},{"id":"p2","name":"Survivor"}],"tasks":[{"id":"a","project":"p1","title":"A"},{"id":"b","project":"p2","title":"B"}]}') workspace_id;
select public.migrate_workspace(workspace_id,0) from deletion_fixture;
grant select on deletion_fixture to authenticated;
insert into public.workspace_memberships select workspace_id,'00000000-0000-0000-0000-000000000003','member' from deletion_fixture;
insert into public.agents(workspace_id,id,name,auth_user_id) select workspace_id,'a1','First','00000000-0000-0000-0000-000000000001' from deletion_fixture;
insert into public.agents(workspace_id,id,name,auth_user_id) select workspace_id,'a2','Second','00000000-0000-0000-0000-000000000003' from deletion_fixture;
insert into public.task_dependencies select workspace_id,'b','a' from deletion_fixture;
insert into public.files(workspace_id,id,project_id,task_id,name) select workspace_id,'shared','p1','a','Shared' from deletion_fixture;
insert into public.task_attachments select workspace_id,'b','shared',0,'{}' from deletion_fixture;
set role authenticated;
do $$ declare w uuid; own_claim jsonb; begin
 select workspace_id into w from deletion_fixture;
 own_claim:=public.execute_operation(w,'claim_task','{"id":"a"}','claim-a',1);
 perform set_config('test.claim_a',own_claim->'data'->>'claimToken',true);
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
 perform public.execute_operation(w,'claim_task','{"id":"b"}','claim-b',1);
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 perform public.test_operation_denied(format('select public.execute_operation(%L,%L,%L,%L,2)',w,'delete_task',jsonb_build_object('id','a','claimToken',current_setting('test.claim_a')),'delete-a'),'validation_error');
end $$;
reset role;
create temporary table surviving_task_before as select to_jsonb(task_row) task_state,to_jsonb(claim_row) claim_state from public.tasks task_row join public.task_claims claim_row on claim_row.workspace_id=task_row.workspace_id and claim_row.task_id=task_row.id where task_row.workspace_id=(select workspace_id from deletion_fixture) and task_row.id='b';
update public.agents set auth_user_id=null where workspace_id=(select workspace_id from deletion_fixture) and id='a1';
set role authenticated;
do $$ declare w uuid; created jsonb; begin
 select workspace_id into w from deletion_fixture;
 perform public.test_operation_denied(format('select public.execute_operation(%L,%L,%L,%L,2)',w,'intervene_task','{"id":"a","action":"delete"}','intervene-delete'),'validation_error');
 perform public.test_operation_denied(format('select public.execute_operation(%L,%L,%L,%L,1)',w,'delete_project','{"id":"p1"}','reserved-project'),'already_claimed');
 perform public.execute_operation(w,'intervene_task','{"id":"a","action":"release"}','release-a',2);
 perform public.test_operation_denied(format('select public.execute_operation(%L,%L,%L,%L,1)',w,'delete_project','{"id":"p1"}','external-project'),'validation_error');
 created:=public.execute_operation(w,'create_project','{"id":"empty","name":"Empty"}','create-empty',null);
 perform public.execute_operation(w,'delete_project','{"id":"empty"}','delete-empty',1);
 perform public.execute_operation(w,'create_project','{"id":"internal","name":"Internal"}','create-internal',null);
 perform public.execute_operation(w,'create_task','{"id":"x","projectId":"internal","title":"X"}','create-x',null);
 perform public.execute_operation(w,'create_task','{"id":"y","projectId":"internal","title":"Y"}','create-y',null);
 perform public.execute_operation(w,'set_task_dependency','{"id":"y","dependsOnTaskId":"x"}','internal-dep',1);
 perform public.execute_operation(w,'delete_project','{"id":"internal"}','delete-internal',1);
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.tasks task_row join public.task_claims claim_row on claim_row.workspace_id=task_row.workspace_id and claim_row.task_id=task_row.id cross join surviving_task_before before_row where task_row.workspace_id=(select workspace_id from deletion_fixture) and task_row.id='b' and (to_jsonb(task_row)<>before_row.task_state or to_jsonb(claim_row)<>before_row.claim_state))
 or (select count(*) from public.task_dependencies where workspace_id=(select workspace_id from deletion_fixture) and task_id='b')<>1
 or (select count(*) from public.task_attachments where workspace_id=(select workspace_id from deletion_fixture) and task_id='b')<>1 then raise exception 'Surviving task or lease mutated by deletion';end if;
end $$;
rollback;
