create function public.test_assert(ok boolean, message text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'TEST: %',message;end if;end$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
create table public.webhook_fixture(w uuid,c uuid,s uuid,a text,d uuid,old_lease uuid,new_lease uuid);
grant select on public.webhook_fixture to authenticated;
insert into public.webhook_fixture(w,c,a) select public.create_workspace('Webhooks','hooks','{"projects":[{"id":"p1","name":"Project","key":"W"}],"tasks":[{"id":"t1","project":"p1","title":"Initial"}]}'),'10000000-0000-0000-0000-000000000001','hermes-fixture';
select public.migrate_workspace(w,0) from public.webhook_fixture;
insert into public.workspace_memberships(workspace_id,user_id,role) select w,'00000000-0000-0000-0000-000000000002','guest' from public.webhook_fixture on conflict do nothing;
insert into auth.oauth_clients select c,'Hermes',null from public.webhook_fixture;
insert into auth.oauth_consents select '00000000-0000-0000-0000-000000000001',c,null from public.webhook_fixture;
insert into public.integration_connections(id,user_id,client_id,client_name,status,authorization_id,authorized_at) select c,'00000000-0000-0000-0000-000000000001',c,'Hermes','active','fixture',now() from public.webhook_fixture;
insert into public.agents(workspace_id,id,name,auth_user_id,client_id) select w,a,'Hermes','00000000-0000-0000-0000-000000000001',c::text from public.webhook_fixture;
insert into public.integration_grants select c,w,'write',a from public.webhook_fixture;
update public.tasks set executor_agent_id=(select a from public.webhook_fixture);
update public.webhook_fixture set s=public.provision_webhook_subscription(w,c,'00000000-0000-0000-0000-000000000001','https://hermes.deltaacademy.com.br/webhooks/task-manager',repeat('fixture-key-',4));
select public.test_assert((select count(*)=1 from vault.decrypted_secrets where decrypted_secret=repeat('fixture-key-',4)),'real Vault encryption/decryption');
select public.test_assert((select relpersistence='p' from pg_class where oid='pgmq.q_webhook_delivery'::regclass),'queue is logged');
select public.test_assert(not has_function_privilege('authenticated','public.claim_webhook_batch(integer)','execute'),'users cannot dequeue');
select public.test_assert(not has_function_privilege('anon','public.claim_webhook_batch(integer)','execute'),'anonymous cannot dequeue');
select public.test_assert(not has_function_privilege('authenticated','public.webhook_delivery_secret(uuid,uuid)','execute'),'users cannot decrypt');
select public.test_assert(not has_schema_privilege('authenticated','vault','usage'),'Vault schema private');
select public.test_assert(not has_function_privilege('authenticated','public.provision_webhook_subscription(uuid,uuid,uuid,text,text)','execute'),'browser cannot provision secrets');
select public.test_assert(not has_table_privilege('authenticated','public.webhook_subscriptions','select'),'no subscription base reads');
select public.test_assert(not has_function_privilege('authenticated','public.configure_webhook_scheduler(text,text)','execute'),'scheduler private');
set role authenticated;
select public.test_assert((public.list_webhook_subscriptions(w)->0->>'agentId')=a,'owner safe subscription read') from public.webhook_fixture;
reset role;
select public.test_assert(not(public.list_webhook_subscriptions(w)::text like '%secret%'),'no secret or Vault ID in browser response') from public.webhook_fixture;
-- Guest and delegated OAuth cannot configure or inspect; second-workspace isolation runs separately.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$begin begin perform public.list_webhook_subscriptions((select w from public.webhook_fixture));raise exception 'guest unexpectedly allowed';exception when sqlstate 'PT403' then null;end;end$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select set_config('request.jwt.claims','{"client_id":"10000000-0000-0000-0000-000000000001"}',false);
do $$begin begin perform public.configure_webhook_subscription((select w from public.webhook_fixture),(select s from public.webhook_fixture),true,array['task.updated']);raise exception 'OAuth unexpectedly allowed';exception when sqlstate 'PT403' then null;end;end$$;
select set_config('request.jwt.claims','{}',false);
-- A real command, outbox event, ledger delivery and logged message commit once; replay adds none.
select public.execute_operation(w,'update_task','{"id":"t1","title":"Human update"}','hook-command',1) from public.webhook_fixture;
select public.execute_operation(w,'update_task','{"id":"t1","title":"Human update"}','hook-command',1) from public.webhook_fixture;
select public.test_assert((select count(*)=1 from public.webhook_deliveries),'one delivery per event/subscription');
select public.test_assert((select count(*)=1 from pgmq.q_webhook_delivery),'one queued delivery');
update public.webhook_fixture set d=(select id from public.webhook_deliveries);
select public.test_assert((select raw_body::jsonb->>'event_type'='task.updated' and raw_body::jsonb->>'correlation_id'=event_id::text from public.webhook_deliveries),'minimal payload type/correlation');
select public.test_assert(not exists(select 1 from public.webhook_deliveries where raw_body like '%Human update%' or raw_body like '%fixture-key%'),'payload has no task text or credentials');
create function public.fail_test_enqueue() returns trigger language plpgsql as $$begin raise exception 'injected enqueue failure';end$$;
create trigger injected_queue_failure before insert on pgmq.q_webhook_delivery for each row execute function public.fail_test_enqueue();
do $$begin begin perform public.execute_operation((select w from public.webhook_fixture),'update_task','{"id":"t1","title":"Must rollback"}','rollback-hook',2);raise exception 'unexpected commit';exception when raise_exception then if sqlerrm<>'injected enqueue failure' then raise;end if;end;end$$;
drop trigger injected_queue_failure on pgmq.q_webhook_delivery;
select public.test_assert((select title='Human update' and version=2 from public.tasks where id='t1'),'queue failure rolls task back');
select public.test_assert(not exists(select 1 from public.idempotency_requests where key='rollback-hook'),'queue failure rolls idempotency back');
select public.test_assert((select count(*)=1 from public.webhook_deliveries),'queue failure rolls event and delivery back');
-- Reservation precedes I/O; a crash after receiver acceptance repeats identity, fences old acknowledgement.
update public.webhook_fixture set old_lease=(public.claim_webhook_batch()->0->>'leaseToken')::uuid;
select public.test_assert(public.webhook_delivery_secret(d,old_lease)=repeat('fixture-key-',4),'only current lease decrypts') from public.webhook_fixture;
select public.test_assert(jsonb_array_length(public.claim_webhook_batch())=0,'visibility protects live lease');
update public.webhook_deliveries set lease_until=now()-interval '1 second';
update pgmq.q_webhook_delivery set vt=now()-interval '1 second';
select public.test_assert(public.claim_webhook_batch()='[]'::jsonb,'expired lease must wait for its persisted crash backoff');
select public.test_assert((select state='pending' and next_attempt_at>clock_timestamp()+interval '25 seconds' from public.webhook_deliveries),'crash wait persisted before replacement');
-- Advance time only after proving the interrupted attempt cannot reserve early.
update public.webhook_deliveries set next_attempt_at=clock_timestamp()-interval '1 second';
update pgmq.q_webhook_delivery set vt=clock_timestamp()-interval '1 second';
update public.webhook_fixture set new_lease=(public.claim_webhook_batch()->0->>'leaseToken')::uuid;
select public.test_assert(old_lease<>new_lease,'recovery replaces lease token') from public.webhook_fixture;
select public.test_assert(not public.complete_webhook_delivery(d,old_lease,'accepted',200),'stale worker cannot archive replacement') from public.webhook_fixture;
select public.test_assert(public.webhook_delivery_secret(d,old_lease) is null,'stale worker cannot retrieve secret') from public.webhook_fixture;
select public.test_assert((select count(*)=1 from pgmq.q_webhook_delivery),'old ack did not remove queue item');
select public.test_assert((select count(*)=2 from public.webhook_delivery_attempts),'crash reservations remain audited');
select public.complete_webhook_delivery(d,new_lease,'http_retry',429,180) from public.webhook_fixture;
select public.test_assert((select next_attempt_at>=now()+interval '175 seconds' and attempt=2 and last_status=429 from public.webhook_deliveries),'Retry-After persisted beyond base backoff');
-- Make time advance in the disposable ledger; never sleep through retry intervals.
do $$declare i integer; batch jsonb; begin
 for i in 3..8 loop
  update public.webhook_deliveries set next_attempt_at=now()-interval '1 second';update pgmq.q_webhook_delivery set vt=now()-interval '1 second';
  batch:=public.claim_webhook_batch();perform public.test_assert((batch->0->>'attempt')::integer=i,'finite attempt counter');
  perform public.complete_webhook_delivery((batch->0->>'id')::uuid,(batch->0->>'leaseToken')::uuid,'http_retry',503,0);
 end loop;
end$$;
select public.test_assert((select state='failed' and attempt=8 and total_attempts=8 from public.webhook_deliveries),'eighth failure terminal');
select public.test_assert((select count(*)=0 from pgmq.q_webhook_delivery),'terminal delivery archived');
select public.test_assert((select count(*)=1 from pgmq.a_webhook_delivery),'queue history retained');
select public.retry_webhook_delivery(w,d) from public.webhook_fixture;
select public.test_assert((select attempt=0 and replay_count=1 and total_attempts=8 from public.webhook_deliveries),'manual retry keeps total history and resets finite cycle');
select public.test_assert((select count(*)=1 from public.webhook_manual_replays),'manual actor audit');
update public.webhook_fixture set new_lease=(public.claim_webhook_batch()->0->>'leaseToken')::uuid;
select public.complete_webhook_delivery(d,new_lease,'accepted',200) from public.webhook_fixture;
select public.test_assert((select state='succeeded' and attempt=1 and total_attempts=9 from public.webhook_deliveries),'replay succeeds with same event');
select public.test_assert((select count(*)=9 from public.webhook_delivery_attempts),'all previous attempts retained');
-- Own-agent events never enqueue, even without executor filtering.
select public.configure_webhook_subscription(w,s,true,array['task.updated'],false) from public.webhook_fixture;
insert into public.domain_events(workspace_id,operation,entity_id,actor_user_id,actor_agent_id,payload)
select w,'update_task','t1','00000000-0000-0000-0000-000000000001',a,'{"taskId":"t1","version":2}' from public.webhook_fixture;
select public.test_assert((select count(*)=1 from public.webhook_deliveries),'own agent feedback suppressed');
-- Queue accepted before revocation cannot disclose secrets or send after revoke; next fanout excludes it.
select public.execute_operation(w,'update_task','{"id":"t1","title":"Before revoke"}','before-revoke',2) from public.webhook_fixture;
update public.webhook_fixture set new_lease=(public.claim_webhook_batch()->0->>'leaseToken')::uuid,d=(select id from public.webhook_deliveries where state='pending');
update public.integration_connections set status='revoked';
select public.test_assert(public.webhook_delivery_secret(d,new_lease) is null,'revocation prevents new secret retrieval') from public.webhook_fixture;
select public.complete_webhook_delivery(d,new_lease,'accepted',200) from public.webhook_fixture;
select public.test_assert((select count(*)=1 from public.webhook_deliveries where state='cancelled'),'revoked in-flight acknowledgement cancelled');
select public.execute_operation(w,'update_task','{"id":"t1","title":"After revoke"}','after-revoke',3) from public.webhook_fixture;
select public.test_assert((select count(*)=2 from public.webhook_deliveries),'revocation prevents fanout');
update public.integration_connections set status='active';
-- Scheduler stores actual Vault IDs in executable Cron text; no plaintext credential.
select public.configure_webhook_scheduler('https://project.supabase.co/functions/v1/webhook-dispatch',repeat('scheduler-fixture-',3));
select public.test_assert((select schedule='30 seconds' and command like '%net.http_post%' and command not like '%scheduler-fixture%' from cron.job where jobname='task-manager-webhooks'),'real Cron/Vault/pg_net command');
select public.test_assert((select username='postgres' from cron.job where jobname='task-manager-webhooks'),'scheduler executes as restricted application owner');
select cron.unschedule(jobid) from cron.job where jobname='task-manager-webhooks';
-- Leave exactly one visible event for independent concurrent session reservation.
select public.execute_operation(w,'update_task','{"id":"t1","title":"Concurrent"}','concurrent-hook',4) from public.webhook_fixture;
select 'SQL assertions passed';
