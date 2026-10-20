-- Current001–005 on real pgmq/Vault; commands run as authenticated, migrations as NOSUPERUSER postgres.
create function pg_temp.ui_assert(ok boolean,message text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'TEST005: %',message;end if;end$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
create temp table ui_fixture(w uuid,c uuid,s uuid,a text);
grant select on ui_fixture to authenticated;
insert into ui_fixture(w,c,a) select public.create_workspace('Panel contracts','panel-contracts','{"projects":[{"id":"p1","name":"Project","key":"P"}],"tasks":[{"id":"t1","project":"p1","title":"Original"}]}'),'10000000-0000-0000-0000-000000000005','ui-agent';
select public.migrate_workspace(w,0) from ui_fixture;
insert into auth.oauth_clients select c,'UI fixture',null from ui_fixture;
insert into auth.oauth_consents select '00000000-0000-0000-0000-000000000001',c,null from ui_fixture;
insert into public.integration_connections(id,user_id,client_id,client_name,status,authorization_id,authorized_at) select c,'00000000-0000-0000-0000-000000000001',c,'UI fixture','active','ui-fixture',now() from ui_fixture;
insert into public.agents(workspace_id,id,name,auth_user_id,client_id) select w,a,'UI fixture','00000000-0000-0000-0000-000000000001',c::text from ui_fixture;
insert into public.integration_grants select c,w,'write',a from ui_fixture;
update ui_fixture set s=public.provision_webhook_subscription(w,c,'00000000-0000-0000-0000-000000000001','https://hermes.deltaacademy.com.br/webhooks/task-manager',repeat('ui-fixture-secret-',3));
select public.configure_webhook_subscription(w,s,true,array['task.assigned','task.updated','task.comment_added','task.completed','task.run_blocked'],false) from ui_fixture;
-- Parent-CAS, generated IDs and recurrence are tested through the same live dispatcher.
set role authenticated;
select public.execute_operation(w,'update_task','{"id":"t1","description":"","recurrence":"Monthly","dueDate":"2026-01-31"}','ui-details',1) from ui_fixture;
select public.execute_operation(w,'create_subtask','{"id":"s1","taskId":"t1","title":"Sub","done":true,"attributes":{"assignee":"unmapped","due":"2026-12-01","note":"keep"}}','ui-sub',2) from ui_fixture;
select public.execute_operation(w,'complete_task','{"id":"t1"}','ui-complete',3) from ui_fixture;
select pg_temp.ui_assert((public.read_operation(w,'list_tasks')->'items') @> '[{"dueDate":"2026-03-02","startDate":"2026-03-02","status":"todo"}]','monthly30 and successor start') from ui_fixture;
select pg_temp.ui_assert((public.read_operation(w,'list_subtasks')->'items') @> '[{"done":false,"legacyMetadata":{"assignee":"unmapped","due":"2026-12-01","note":"keep"}}]','recurrence retains details') from ui_fixture;
reset role;
select pg_temp.ui_assert((select count(*) from pgmq.q_webhook_delivery)>0,'fixture must enqueue real pgmq events');
-- Snapshot all transactional effects, then force a conflict after a queue-producing child.
create temp table ui_before as select jsonb_build_object('events',(select count(*) from public.domain_events),'queue',(select count(*) from pgmq.q_webhook_delivery),'deliveries',(select count(*) from public.webhook_deliveries),'keys',(select count(*) from public.idempotency_requests),'limits',(select jsonb_agg(to_jsonb(x) order by actor_user_id,client_id,window_start) from public.operation_rate_limits x),'sequences',(select jsonb_agg(to_jsonb(x) order by workspace_id,project_id) from public.project_task_sequences x)) state;
set role authenticated;
do $$begin begin
 perform public.execute_operation((select w from ui_fixture),'batch','{"commands":[{"operation":"create_task","input":{"id":"rollback","projectId":"p1","title":"Rollback"}},{"operation":"update_task","input":{"id":"t1","title":"Conflict"},"expectedVersion":1}]}','ui-rollback');
 raise exception 'unexpected commit';exception when sqlstate 'PT409' then null;end;end$$;
reset role;
select pg_temp.ui_assert((select state from ui_before)=jsonb_build_object('events',(select count(*) from public.domain_events),'queue',(select count(*) from pgmq.q_webhook_delivery),'deliveries',(select count(*) from public.webhook_deliveries),'keys',(select count(*) from public.idempotency_requests),'limits',(select jsonb_agg(to_jsonb(x) order by actor_user_id,client_id,window_start) from public.operation_rate_limits x),'sequences',(select jsonb_agg(to_jsonb(x) order by workspace_id,project_id) from public.project_task_sequences x)),'batch conflict rolls back events, logged pgmq, ledger, keys, rate counters and numbering');
select pg_temp.ui_assert(not exists(select 1 from public.tasks where id='rollback'),'batch task rollback');
-- Success and cached replay enqueue once. Server child keys cannot collide with client batch:index keys.
set role authenticated;
select public.execute_operation(w,'batch','{"commands":[{"operation":"update_task","input":{"id":"t1","title":"Batch"},"expectedVersion":4},{"operation":"create_task","input":{"id":"promoted","projectId":"p1","title":"Promotion"}},{"operation":"delete_subtask","input":{"id":"s1","taskId":"t1"},"expectedVersion":5}]}','ui-batch') from ui_fixture;
reset role;
update ui_before set state=jsonb_build_object('events',(select count(*) from public.domain_events),'queue',(select count(*) from pgmq.q_webhook_delivery),'deliveries',(select count(*) from public.webhook_deliveries),'keys',(select count(*) from public.idempotency_requests));
set role authenticated;
select public.execute_operation(w,'batch','{"commands":[{"operation":"update_task","input":{"id":"t1","title":"Batch"},"expectedVersion":4},{"operation":"create_task","input":{"id":"promoted","projectId":"p1","title":"Promotion"}},{"operation":"delete_subtask","input":{"id":"s1","taskId":"t1"},"expectedVersion":5}]}','ui-batch') from ui_fixture;
reset role;
select pg_temp.ui_assert((select state from ui_before)=jsonb_build_object('events',(select count(*) from public.domain_events),'queue',(select count(*) from pgmq.q_webhook_delivery),'deliveries',(select count(*) from public.webhook_deliveries),'keys',(select count(*) from public.idempotency_requests)),'batch replay does not enqueue or emit again');
select pg_temp.ui_assert(not exists(select 1 from public.domain_events where payload::text like '%claimToken%'),'batch audit remains credential-free');
-- Explicit005 helpers retain private ACLs and legacy snapshot writer remains fenced.
select pg_temp.ui_assert(not has_function_privilege('authenticated','public.operation_task(jsonb)','execute'),'safe projection helper private');
set role authenticated;
do $$begin begin perform public.save_workspace_snapshot((select w from ui_fixture),0,'{}');raise exception 'snapshot reopened';exception when sqlstate '55000' then null;end;end$$;
reset role;
-- Remove isolated fixture, ledger and queue before the existing Task4 worker assertions.
select pgmq.delete('webhook_delivery',msg_id) from pgmq.q_webhook_delivery where message->>'delivery_id' in(select d.id::text from public.webhook_deliveries d join public.webhook_subscriptions s on s.id=d.subscription_id where s.workspace_id=(select w from ui_fixture));
delete from public.workspaces where id=(select w from ui_fixture);
delete from public.integration_connections where id=(select c from ui_fixture);
delete from auth.oauth_consents where client_id=(select c from ui_fixture);
delete from auth.oauth_clients where id=(select c from ui_fixture);
select 'PASS005 real authenticated contracts, recurrence, promotion batch, transactional queue rollback/replay';
