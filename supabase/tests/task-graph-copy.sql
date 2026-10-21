-- Real PostgreSQL/pgmq transaction proof, isolated from subsequent fixture counts.
begin;
create function pg_temp.graph_assert(ok boolean,message text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'TEST007: %',message;end if;end$$;
create function pg_temp.graph_snapshot(w uuid) returns jsonb language plpgsql as $$
declare tab text; rows jsonb; result jsonb:='{}';
begin
 foreach tab in array array['projects','tasks','subtasks','files','task_attachments','task_dependencies','task_labels','task_claims','domain_events','idempotency_requests','project_task_sequences'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]'') from public.%I t where workspace_id=$1',tab) into rows using w;
  result:=result||jsonb_build_object(tab,rows);
 end loop;
 return result||jsonb_build_object('rates',(select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]') from public.operation_rate_limits r),'deliveries',(select coalesce(jsonb_agg(to_jsonb(d) order by id),'[]') from public.webhook_deliveries d),'queue',(select coalesce(jsonb_agg(to_jsonb(q) order by msg_id),'[]') from pgmq.q_webhook_delivery q));
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{}',true);
create temp table graph_fixture(w uuid,c uuid,s uuid,before jsonb,result jsonb);
grant select,update on graph_fixture to authenticated;
insert into graph_fixture(w,c) select public.create_workspace('Graph copy','graph-copy','{"projects":[{"id":"p1","name":"Source","key":"G"},{"id":"p2","name":"Destination","key":"D"}],"tasks":[{"id":"source","project":"p1","title":"Source","status":"done","completedAt":3000,"recur":"Weekly","due":"2026-12-01","custom":{"kept":true},"subtasks":[{"id":"s1","title":"Done","done":true,"note":"keep","unknown":[42]}],"labels":["l1"],"deps":["target"],"attachments":[{"id":"f1","name":"File","unknown":{"relation":true}}]},{"id":"target","project":"p1","title":"Target"}]}'),'10000000-0000-0000-0000-000000000007';
select public.migrate_workspace(w,0) from graph_fixture;
insert into auth.oauth_clients select c,'Graph fixture',null from graph_fixture;
insert into auth.oauth_consents select '00000000-0000-0000-0000-000000000001',c,null from graph_fixture;
insert into public.integration_connections(id,user_id,client_id,client_name,status,authorization_id,authorized_at) select c,'00000000-0000-0000-0000-000000000001',c,'Graph fixture','active','graph-fixture',now() from graph_fixture;
insert into public.agents(workspace_id,id,name,auth_user_id,client_id) select w,'graph-agent','Graph fixture','00000000-0000-0000-0000-000000000001',c::text from graph_fixture;
insert into public.integration_grants select c,w,'write','graph-agent' from graph_fixture;
update graph_fixture set s=public.provision_webhook_subscription(w,c,'00000000-0000-0000-0000-000000000001','https://hermes.deltaacademy.com.br/webhooks/task-manager',repeat('graph-fixture-',4));
select public.configure_webhook_subscription(w,s,true,array['task.updated','task.completed'],false) from graph_fixture;
update graph_fixture set before=pg_temp.graph_snapshot(w);
-- Fail the actual logged queue INSERT; all entities, joins, receipts, events and numbering roll back.
create function pg_temp.fail_graph_queue() returns trigger language plpgsql as $$begin raise exception 'injected graph queue failure';end$$;
create trigger injected_graph_queue_failure before insert on pgmq.q_webhook_delivery for each row execute function pg_temp.fail_graph_queue();
set local role authenticated;
do $$begin
 begin
  perform public.execute_operation((select w from graph_fixture),'batch','{"commands":[{"operation":"create_project","input":{"id":"fresh","name":"Fresh","key":"F"}},{"operation":"duplicate_task_graph","input":{"id":"source","projectId":"fresh","mode":"project"},"expectedVersion":1}]}','graph-batch');
  raise exception 'unexpected success';
 exception when raise_exception then if sqlerrm<>'injected graph queue failure' then raise;end if;end;
end$$;
reset role;
drop trigger injected_graph_queue_failure on pgmq.q_webhook_delivery;
select pg_temp.graph_assert(pg_temp.graph_snapshot(w)=before,'queue failure restored full graph, sequence, receipts and outbox') from graph_fixture;
set local role authenticated;
update graph_fixture set result=public.execute_operation(w,'batch','{"commands":[{"operation":"create_project","input":{"id":"fresh","name":"Fresh","key":"F"}},{"operation":"duplicate_task_graph","input":{"id":"source","projectId":"fresh","mode":"project"},"expectedVersion":1}]}','graph-batch');
select pg_temp.graph_assert(public.execute_operation(w,'batch','{"commands":[{"operation":"create_project","input":{"id":"fresh","name":"Fresh","key":"F"}},{"operation":"duplicate_task_graph","input":{"id":"source","projectId":"fresh","mode":"project"},"expectedVersion":1}]}','graph-batch')=result,'batch replay returns stable identities') from graph_fixture;
reset role;
do $$declare w uuid; result jsonb; copied text; event uuid; snapshot jsonb; taskcopy jsonb; begin
 select f.w,f.result,f.before into w,result,snapshot from graph_fixture f;
 copied:=result->'data'->'results'->1->'data'->>'id';event:=(result->'data'->'results'->1->>'eventId')::uuid;
 perform pg_temp.graph_assert((select key='F-1' and status='todo' and completed_at is null and executor_agent_id is null and not archived and version=1 and legacy_metadata->'custom'='{"kept":true}' from public.tasks where workspace_id=w and id=copied),'new project task semantics');
 perform pg_temp.graph_assert((select done and id<>'s1' and legacy_metadata->>'note'='keep' and legacy_metadata->'unknown'='[42]' from public.subtasks where workspace_id=w and task_id=copied),'complete subtask clone');
 perform pg_temp.graph_assert((select depends_on_task_id='target' from public.task_dependencies where workspace_id=w and task_id=copied),'original dependency target');
 perform pg_temp.graph_assert((select label_id='l1' from public.task_labels where workspace_id=w and task_id=copied),'label copied');
 perform pg_temp.graph_assert((select sort_order=1 and legacy_metadata->'unknown'='{"relation":true}' from public.task_attachments where workspace_id=w and task_id=copied),'full attachment relation');
 perform pg_temp.graph_assert((select task_id='source' and project_id='p1' from public.files where workspace_id=w and id='f1'),'file retains original owner');
 perform pg_temp.graph_assert(not exists(select 1 from public.task_claims where workspace_id=w and task_id=copied),'no inherited execution lease');
 perform pg_temp.graph_assert((select count(*)=3 from public.tasks where workspace_id=w),'no recurrence successor');
 perform pg_temp.graph_assert((select entity_id=copied and payload->>'taskId'=copied and payload->>'projectId'='fresh' from public.domain_events where id=event),'new task/project audit scope');
 perform pg_temp.graph_assert((select raw_body::jsonb->>'task_id'=copied and raw_body::jsonb->>'event_type'='task.updated' from public.webhook_deliveries where event_id=event),'fanout routed to new project copy');
 perform pg_temp.graph_assert((select count(*)=1 from public.webhook_deliveries where event_id=event),'one complete graph event delivery');
 perform pg_temp.graph_assert((select count(*)=1 from pgmq.q_webhook_delivery where message->>'delivery_id'=(select id::text from public.webhook_deliveries where event_id=event)),'one actual queue message');
 perform pg_temp.graph_assert((select to_jsonb(t)=jsonb_path_query_first(snapshot->'tasks','$[*] ? (@.id == "source")') from public.tasks t where workspace_id=w and id='source'),'source canonical row unchanged');
 taskcopy:=public.execute_operation(w,'duplicate_task_graph','{"id":"source","projectId":"p2","mode":"task"}','graph-task',1);
 perform pg_temp.graph_assert(taskcopy->'data'->>'status'='done' and taskcopy->'data'->>'completedAt' is not null,'task mode preserves completion');
 perform pg_temp.graph_assert((select raw_body::jsonb->>'task_id'=taskcopy->'data'->>'id' and raw_body::jsonb->>'event_type'='task.completed' from public.webhook_deliveries where event_id=(taskcopy->>'eventId')::uuid),'done copy follows existing completed event classification');
end$$;
rollback;
select 'PASS007 real PostgreSQL complete graph, source provenance, batch/replay, event routing and actual pgmq failure rollback';
