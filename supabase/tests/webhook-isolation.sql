-- A second workspace has a different owner, OAuth connection, executor and Vault secret.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
create table public.webhook_isolation_fixture(w uuid,s uuid,d uuid);
grant select on public.webhook_isolation_fixture to authenticated;
insert into public.webhook_isolation_fixture(w) select public.create_workspace('Other webhook tenant','other-hooks','{"projects":[{"id":"pb","name":"Other","key":"B"}],"tasks":[{"id":"b1","project":"pb","title":"Other task"}]}');
select public.migrate_workspace(w,0) from public.webhook_isolation_fixture;
insert into auth.oauth_clients values('20000000-0000-0000-0000-000000000001','Other Hermes',null);
insert into auth.oauth_consents values('00000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001',null);
insert into public.integration_connections(id,user_id,client_id,client_name,status,authorization_id) values('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','Other Hermes','active','other-fixture');
insert into public.agents(workspace_id,id,name,auth_user_id,client_id) select w,'other-hermes','Other Hermes','00000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001' from public.webhook_isolation_fixture;
insert into public.integration_grants select '20000000-0000-0000-0000-000000000001',w,'write','other-hermes' from public.webhook_isolation_fixture;
update public.tasks set executor_agent_id='other-hermes' where workspace_id=(select w from public.webhook_isolation_fixture);
update public.webhook_isolation_fixture set s=public.provision_webhook_subscription(w,'20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','https://example.com/other-hook',repeat('other-fixture-',4));
select public.execute_operation(w,'update_task','{"id":"b1","title":"Other owner update"}','other-hook',1) from public.webhook_isolation_fixture;
update public.webhook_isolation_fixture f set d=(select id from public.webhook_deliveries where subscription_id=f.s);
-- Construct a terminal receiver failure, isolated from A's independent worker contention fixture.
select pgmq.archive('webhook_delivery',queue_msg_id) from public.webhook_deliveries where subscription_id=(select s from public.webhook_isolation_fixture);
update public.webhook_deliveries set state='failed',attempt=8,last_category='http_rejected',last_status=400 where subscription_id=(select s from public.webhook_isolation_fixture);
select public.test_assert(jsonb_array_length(public.list_webhook_subscriptions(w))=1,'B owner can read own subscription') from public.webhook_isolation_fixture;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
set role authenticated;
select public.test_assert(jsonb_array_length(public.list_webhook_subscriptions(w))=1,'A owner only sees A') from public.webhook_fixture;
do $$declare b public.webhook_isolation_fixture; a public.webhook_fixture;begin
 select * into b from public.webhook_isolation_fixture;select * into a from public.webhook_fixture;
 begin perform public.list_webhook_subscriptions(b.w);raise exception 'A listed B';exception when sqlstate 'PT403' then null;end;
 begin perform public.configure_webhook_subscription(b.w,b.s,false,array['task.updated']);raise exception 'A configured B';exception when sqlstate 'PT403' then null;end;
 begin perform public.configure_webhook_subscription(a.w,b.s,false,array['task.updated']);raise exception 'A injected B subscription into A';exception when sqlstate 'PT404' then null;end;
 begin perform public.list_webhook_deliveries(b.w,b.s);raise exception 'A listed B deliveries';exception when sqlstate 'PT403' then null;end;
 begin perform public.list_webhook_deliveries(a.w,b.s);raise exception 'A injected B delivery list into A';exception when sqlstate 'PT404' then null;end;
 begin perform public.retry_webhook_delivery(b.w,b.d);raise exception 'A replayed B';exception when sqlstate 'PT403' then null;end;
 begin perform public.retry_webhook_delivery(a.w,b.d);raise exception 'A injected B replay into A';exception when sqlstate 'PT404' then null;end;
 begin perform public.webhook_delivery_secret(b.d,gen_random_uuid());raise exception 'A selected B secret';exception when insufficient_privilege then null;end;
 begin perform secret_id from public.webhook_subscriptions where id=b.s;raise exception 'A read B Vault ID';exception when insufficient_privilege then null;end;
end$$;
reset role;
select public.test_assert((select enabled and replay_count=0 from public.webhook_subscriptions s join public.webhook_deliveries d on d.subscription_id=s.id where s.id=f.s),'B config/replay unchanged') from public.webhook_isolation_fixture f;
select public.test_assert((select decrypted_secret=repeat('other-fixture-',4) from vault.decrypted_secrets where id=(select secret_id from public.webhook_subscriptions where id=f.s)),'B secret unchanged') from public.webhook_isolation_fixture f;
select 'PASS second-workspace list/configure/replay/secret isolation';
