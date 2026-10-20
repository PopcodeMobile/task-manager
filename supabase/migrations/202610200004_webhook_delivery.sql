-- Durable, at-least-once delivery. pg_net only wakes the worker; it never owns delivery state.
begin;
create extension if not exists pgmq;
create extension if not exists supabase_vault;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
select pgmq.create('webhook_delivery');

create table public.webhook_subscriptions (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 connection_id uuid not null references public.integration_connections(id) on delete cascade,
 agent_id text not null, target_url text not null check(length(target_url)<=2048), secret_id uuid not null,
 event_types text[] not null default array['task.assigned','task.updated','task.comment_added','task.completed','task.run_blocked'],
 filter_executor boolean not null default true, enabled boolean not null default true,
 created_by uuid not null, created_at timestamptz not null default clock_timestamp(),
 unique(workspace_id,connection_id), foreign key(workspace_id,agent_id) references public.agents(workspace_id,id),
 check(cardinality(event_types) between 1 and 5 and event_types <@ array['task.assigned','task.updated','task.comment_added','task.completed','task.run_blocked']::text[])
);
create table public.webhook_deliveries (
 id uuid primary key default gen_random_uuid(), subscription_id uuid not null references public.webhook_subscriptions(id) on delete cascade,
 event_id uuid not null references public.domain_events(id) on delete cascade,
 raw_body text not null, queue_msg_id bigint, state text not null default 'pending' check(state in ('pending','processing','succeeded','failed','cancelled')),
 attempt integer not null default 0 check(attempt between 0 and 8), total_attempts integer not null default 0,
 replay_count integer not null default 0, next_attempt_at timestamptz not null default clock_timestamp(),
 lease_token uuid, lease_until timestamptz, last_category text, last_status integer,
 created_at timestamptz not null default clock_timestamp(), completed_at timestamptz,
 unique(subscription_id,event_id)
);
create index webhook_delivery_due_idx on public.webhook_deliveries(next_attempt_at) where state in ('pending','processing');
create index webhook_delivery_subscription_idx on public.webhook_deliveries(subscription_id,created_at,id);
create table public.webhook_delivery_attempts (
 delivery_id uuid not null references public.webhook_deliveries(id) on delete cascade,
 sequence integer not null, replay integer not null, attempt integer not null, lease_token uuid not null,
 started_at timestamptz not null default clock_timestamp(), completed_at timestamptz,
 category text, response_status integer, primary key(delivery_id,sequence)
);
create table public.webhook_manual_replays (
 delivery_id uuid not null references public.webhook_deliveries(id) on delete cascade,
 replay integer not null, actor_user_id uuid not null, created_at timestamptz not null default clock_timestamp(),
 primary key(delivery_id,replay)
);
alter table public.webhook_subscriptions enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.webhook_delivery_attempts enable row level security;
alter table public.webhook_manual_replays enable row level security;
revoke all on public.webhook_subscriptions,public.webhook_deliveries,public.webhook_delivery_attempts,public.webhook_manual_replays from public,anon,authenticated;
-- Secrets and generic queue primitives have no browser/OAuth access.
revoke all on schema vault,pgmq,cron,net from public,anon,authenticated;
revoke all on all tables in schema vault,pgmq,cron,net from public,anon,authenticated;
revoke all on all functions in schema vault,pgmq,cron,net from public,anon,authenticated;

create function public.webhook_admin(p_workspace_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.integration_human();
begin
 perform 1 from public.workspace_memberships m join public.workspaces w on w.id=m.workspace_id and w.storage_version=2
 where m.workspace_id=p_workspace_id and m.user_id=uid and m.role in ('owner','admin') for share of m,w;
 if not found then raise exception 'forbidden' using errcode='PT403';end if;
 return uid;
end $$;
create function public.webhook_connection_allowed(p_subscription_id uuid) returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from public.webhook_subscriptions s
 join public.integration_connections c on c.id=s.connection_id and c.status='active'
 join public.integration_grants g on g.connection_id=c.id and g.workspace_id=s.workspace_id and g.capability='write' and g.agent_id=s.agent_id
 join public.agents a on a.workspace_id=g.workspace_id and a.id=g.agent_id and a.auth_user_id=c.user_id and a.client_id=c.client_id::text
 join public.workspace_memberships m on m.workspace_id=g.workspace_id and m.user_id=c.user_id and m.role<>'guest'
 join auth.oauth_clients oc on oc.id=c.client_id and oc.deleted_at is null
 join auth.oauth_consents consent on consent.user_id=c.user_id and consent.client_id=c.client_id and consent.revoked_at is null
 where s.id=p_subscription_id and s.enabled)
$$;
-- Only trusted server setup can create/rotate the Vault secret and bind the server-owned grant.
create function public.provision_webhook_subscription(p_workspace_id uuid,p_connection_id uuid,p_admin_user_id uuid,p_target_url text,p_secret text) returns uuid
language plpgsql security definer set search_path='' as $$
declare aid text; sid uuid; secret uuid;
begin
 if not exists(select 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_admin_user_id and role in ('owner','admin')) then raise exception 'forbidden' using errcode='PT403';end if;
 if p_secret is null or length(p_secret) not between 32 and 512 or p_target_url is null or length(p_target_url)>2048 or p_target_url !~ '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}(/[^?#@[:space:]]*)?$' then raise exception 'validation_error' using errcode='PT422';end if;
 select g.agent_id into aid from public.integration_grants g join public.integration_connections c on c.id=g.connection_id and c.status='active'
 where g.workspace_id=p_workspace_id and g.connection_id=p_connection_id and g.capability='write' for share of g,c;
 if aid is null then raise exception 'forbidden' using errcode='PT403';end if;
 select id,secret_id into sid,secret from public.webhook_subscriptions where workspace_id=p_workspace_id and connection_id=p_connection_id for update;
 if sid is null then
  secret:=vault.create_secret(p_secret);
  insert into public.webhook_subscriptions(workspace_id,connection_id,agent_id,target_url,secret_id,created_by)
  values(p_workspace_id,p_connection_id,aid,p_target_url,secret,p_admin_user_id) returning id into sid;
 else
  perform vault.update_secret(secret,p_secret);
  update public.webhook_subscriptions set target_url=p_target_url,agent_id=aid where id=sid;
 end if;
 if not public.webhook_connection_allowed(sid) then raise exception 'forbidden' using errcode='PT403';end if;
 return sid;
end $$;
create function public.configure_webhook_subscription(p_workspace_id uuid,p_subscription_id uuid,p_enabled boolean,p_event_types text[],p_filter_executor boolean default true) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.webhook_admin(p_workspace_id);
 if p_enabled is null or p_filter_executor is null or p_event_types is null or cardinality(p_event_types) not between 1 and 5 or array_position(p_event_types,null) is not null or not p_event_types <@ array['task.assigned','task.updated','task.comment_added','task.completed','task.run_blocked']::text[] then raise exception 'validation_error' using errcode='PT422';end if;
 update public.webhook_subscriptions set enabled=p_enabled,event_types=p_event_types,filter_executor=p_filter_executor where id=p_subscription_id and workspace_id=p_workspace_id;
 if not found then raise exception 'not_found' using errcode='PT404';end if;
end $$;
create function public.list_webhook_subscriptions(p_workspace_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.webhook_admin(p_workspace_id);
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'connectionId',connection_id,'agentId',agent_id,'targetUrl',target_url,'eventTypes',event_types,'filterExecutor',filter_executor,'enabled',enabled,'active',public.webhook_connection_allowed(id),'createdAt',created_at) order by created_at,id),'[]') into result from public.webhook_subscriptions where workspace_id=p_workspace_id;
 return result;
end $$;
create function public.list_webhook_deliveries(p_workspace_id uuid,p_subscription_id uuid,p_before timestamptz default null,p_limit integer default 50) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.webhook_admin(p_workspace_id);
 if not exists(select 1 from public.webhook_subscriptions where id=p_subscription_id and workspace_id=p_workspace_id) then raise exception 'not_found' using errcode='PT404';end if;
 select coalesce(jsonb_agg(to_jsonb(row) order by row."createdAt" desc,row.id),'[]') into result from (
  select id,event_id as "eventId",state,attempt,total_attempts as "totalAttempts",replay_count as "replayCount",next_attempt_at as "nextAttemptAt",last_category as "lastCategory",last_status as "lastStatus",created_at as "createdAt",completed_at as "completedAt"
  from public.webhook_deliveries where subscription_id=p_subscription_id and (p_before is null or created_at<p_before)
  order by created_at desc,id limit least(100,greatest(1,coalesce(p_limit,50)))
 ) row;
 return result;
end $$;

-- Fanout is synchronous with the command transaction: a queue failure rolls the entire command back.
create function public.enqueue_domain_webhooks() returns trigger language plpgsql security definer set search_path='' as $$
declare sub record; task text; task_version bigint; executor text; kind text; delivery uuid; body text; msg bigint;
begin
 task:=new.payload->>'taskId';
 if task is null and new.operation in ('create_task','update_task','delete_task','archive_task','restore_task','move_task','duplicate_task','claim_task','renew_task_claim','release_task_claim','complete_task','intervene_task') then task:=new.entity_id;end if;
 if task is null then return new;end if;
 select version,executor_agent_id into task_version,executor from public.tasks where workspace_id=new.workspace_id and id=task;
 if task_version is null then task_version:=(new.payload->>'version')::bigint;end if;
 kind:=case when new.operation='add_task_comment' then 'task.comment_added' when new.operation='complete_task' or new.payload->>'status'='done' then 'task.completed' when new.payload->>'status'='blocked' then 'task.run_blocked' when new.operation in ('claim_task','intervene_task') and executor is not null then 'task.assigned' else 'task.updated' end;
 body:=jsonb_build_object('schema_version',1,'event_id',new.id,'event_type',kind,'occurred_at',new.created_at,'workspace_id',new.workspace_id,'task_id',task,'task_version',task_version,'actor_id',coalesce(new.actor_agent_id,new.actor_user_id::text),'connection_id',new.actor_connection_id,'correlation_id',new.id)::text;
 for sub in select * from public.webhook_subscriptions s where s.workspace_id=new.workspace_id and kind=any(s.event_types) and s.agent_id is distinct from new.actor_agent_id and (not s.filter_executor or s.agent_id=executor) and public.webhook_connection_allowed(s.id) loop
  insert into public.webhook_deliveries(subscription_id,event_id,raw_body) values(sub.id,new.id,body) on conflict(subscription_id,event_id) do nothing returning id into delivery;
  if found then
   select pgmq.send('webhook_delivery',jsonb_build_object('delivery_id',delivery)) into msg;
   update public.webhook_deliveries set queue_msg_id=msg where id=delivery;
  end if;
 end loop;
 return new;
end $$;
create trigger domain_events_webhooks after insert on public.domain_events for each row execute function public.enqueue_domain_webhooks();

create function public.claim_webhook_batch(p_limit integer default 5) returns jsonb language plpgsql security definer set search_path='' as $$
declare msg record; d public.webhook_deliveries; result jsonb:='[]'; token uuid; reserve_until timestamptz; recover_at timestamptz;
begin
 for msg in select * from pgmq.read('webhook_delivery',60,least(5,greatest(1,coalesce(p_limit,5)))) loop
  select * into d from public.webhook_deliveries where id=(msg.message->>'delivery_id')::uuid and queue_msg_id=msg.msg_id for update skip locked;
  if not found then continue;end if;
  if d.state in ('succeeded','failed','cancelled') then perform pgmq.archive('webhook_delivery',msg.msg_id);continue;end if;
  if not public.webhook_connection_allowed(d.subscription_id) then
   update public.webhook_deliveries set state='cancelled',lease_token=null,lease_until=null,completed_at=clock_timestamp(),last_category='access_revoked' where id=d.id;
   update public.webhook_delivery_attempts set category='access_revoked',completed_at=clock_timestamp() where delivery_id=d.id and completed_at is null;
   perform pgmq.archive('webhook_delivery',msg.msg_id);continue;
  end if;
  if d.state='processing' then
   if d.lease_until>clock_timestamp() then perform pgmq.set_vt('webhook_delivery',msg.msg_id,greatest(1,ceil(extract(epoch from d.lease_until-clock_timestamp()))::int));continue;end if;
   update public.webhook_delivery_attempts set category='lease_expired',completed_at=clock_timestamp() where delivery_id=d.id and completed_at is null;
   if d.attempt>=8 then
    update public.webhook_deliveries set state='failed',lease_token=null,lease_until=null,last_category='lease_expired',last_status=null,completed_at=clock_timestamp() where id=d.id;
    perform pgmq.archive('webhook_delivery',msg.msg_id);continue;
   end if;
   -- A lost acknowledgement follows the same retry floor; polling never restarts its wait.
   recover_at:=greatest(d.next_attempt_at,coalesce(d.lease_until,clock_timestamp())+make_interval(secs=>(array[30,120,600,1800,7200,21600,86400])[d.attempt]));
   update public.webhook_deliveries set state='pending',lease_token=null,lease_until=null,next_attempt_at=recover_at,last_category='lease_expired',last_status=null where id=d.id returning * into d;
  end if;
  if d.next_attempt_at>clock_timestamp() then perform pgmq.set_vt('webhook_delivery',msg.msg_id,greatest(1,ceil(extract(epoch from d.next_attempt_at-clock_timestamp()))::int));continue;end if;
  token:=gen_random_uuid();reserve_until:=clock_timestamp()+interval '60 seconds';
  -- Persist fallback due before I/O, so a crash cannot bypass the interval after its lease.
  update public.webhook_deliveries set state='processing',attempt=attempt+1,total_attempts=total_attempts+1,lease_token=token,lease_until=reserve_until,next_attempt_at=reserve_until+make_interval(secs=>coalesce((array[30,120,600,1800,7200,21600,86400])[attempt+1],0)) where id=d.id returning * into d;
  insert into public.webhook_delivery_attempts(delivery_id,sequence,replay,attempt,lease_token) values(d.id,d.total_attempts,d.replay_count,d.attempt,token);
  result:=result||jsonb_build_array(jsonb_build_object('id',d.id,'leaseToken',token,'eventId',d.event_id,'attempt',d.attempt,'rawBody',d.raw_body,'targetUrl',(select target_url from public.webhook_subscriptions where id=d.subscription_id)));
 end loop;
 return result;
end $$;
create function public.webhook_delivery_secret(p_delivery_id uuid,p_lease_token uuid) returns text language plpgsql security definer set search_path='' as $$
declare d public.webhook_deliveries; result text;
begin
 select * into d from public.webhook_deliveries where id=p_delivery_id and state='processing' and lease_token=p_lease_token for update;
 -- The row may have waited on an unchanged lock past its expiry. Check a fresh clock now.
 if not found or d.lease_until is null or d.lease_until<=clock_timestamp() then return null;end if;
 if not public.webhook_connection_allowed(d.subscription_id) then return null;end if;
 select decrypted_secret into result from vault.decrypted_secrets where id=(select secret_id from public.webhook_subscriptions where id=d.subscription_id);
 return result;
end $$;
create function public.complete_webhook_delivery(p_delivery_id uuid,p_lease_token uuid,p_category text,p_status integer default null,p_retry_seconds integer default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare d public.webhook_deliveries; retry integer; v_category text:=p_category; terminal text;
begin
 if v_category is null or v_category not in ('accepted','http_retry','http_rejected','redirect','timeout','network','dns_unavailable','target_rejected','configuration') or (p_status is not null and p_status not between 100 and 599) then raise exception 'validation_error' using errcode='PT422';end if;
 select * into d from public.webhook_deliveries where id=p_delivery_id and state='processing' and lease_token=p_lease_token for update;
 if not found or d.lease_until is null or d.lease_until<=clock_timestamp() then return false;end if;
 if not public.webhook_connection_allowed(d.subscription_id) then terminal:='cancelled';v_category:='access_revoked';
 elsif v_category='accepted' and p_status between 200 and 299 then terminal:='succeeded';
 elsif d.attempt<8 and v_category in ('http_retry','timeout','network','dns_unavailable','configuration') then
  retry:=greatest((array[30,120,600,1800,7200,21600,86400])[d.attempt],least(86400,greatest(0,coalesce(p_retry_seconds,0))));terminal:='pending';
 else terminal:='failed';end if;
 update public.webhook_delivery_attempts set completed_at=clock_timestamp(),category=v_category,response_status=p_status where delivery_id=d.id and sequence=d.total_attempts;
 update public.webhook_deliveries set state=terminal,last_category=v_category,last_status=p_status,lease_token=null,lease_until=null,next_attempt_at=case when retry is not null then clock_timestamp()+make_interval(secs=>retry) else next_attempt_at end,completed_at=case when retry is null then clock_timestamp() else null end where id=d.id;
 if retry is null then perform pgmq.archive('webhook_delivery',d.queue_msg_id);else perform pgmq.set_vt('webhook_delivery',d.queue_msg_id,retry);end if;
 return true;
end $$;
create function public.retry_webhook_delivery(p_workspace_id uuid,p_delivery_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.webhook_admin(p_workspace_id); d public.webhook_deliveries; msg bigint;
begin
 select d0.* into d from public.webhook_deliveries d0 join public.webhook_subscriptions s on s.id=d0.subscription_id and s.workspace_id=p_workspace_id where d0.id=p_delivery_id for update of d0;
 if not found then raise exception 'not_found' using errcode='PT404';end if;
 if d.state<>'failed' or not public.webhook_connection_allowed(d.subscription_id) then raise exception 'version_conflict' using errcode='PT409';end if;
 select pgmq.send('webhook_delivery',jsonb_build_object('delivery_id',d.id)) into msg;
 update public.webhook_deliveries set state='pending',attempt=0,replay_count=replay_count+1,queue_msg_id=msg,next_attempt_at=clock_timestamp(),lease_token=null,lease_until=null,completed_at=null where id=d.id;
 insert into public.webhook_manual_replays(delivery_id,replay,actor_user_id) values(d.id,d.replay_count+1,uid);
end $$;

-- The job text only contains Vault IDs. The dedicated worker secret is NOT a user JWT or public API key.
create function public.configure_webhook_scheduler(p_dispatch_url text,p_worker_secret text) returns bigint language plpgsql security definer set search_path='' as $$
declare secret uuid; endpoint uuid; job bigint;
begin
 if p_worker_secret is null or length(p_worker_secret) not between 32 and 256 or p_dispatch_url is null or p_dispatch_url !~ '^https://[a-z0-9.-]+/functions/v1/webhook-dispatch$' then raise exception 'validation_error' using errcode='PT422';end if;
 select id into secret from vault.secrets where name='task_manager_webhook_worker';
 if secret is null then secret:=vault.create_secret(p_worker_secret,'task_manager_webhook_worker');else perform vault.update_secret(secret,p_worker_secret);end if;
 select id into endpoint from vault.secrets where name='task_manager_webhook_dispatch_url';
 if endpoint is null then endpoint:=vault.create_secret(p_dispatch_url,'task_manager_webhook_dispatch_url');else perform vault.update_secret(endpoint,p_dispatch_url);end if;
 select cron.schedule('task-manager-webhooks','30 seconds',format($job$select net.http_post(url:=(select decrypted_secret from vault.decrypted_secrets where id=%L::uuid),headers:=jsonb_build_object('Content-Type','application/json','X-Webhook-Worker-Key',(select decrypted_secret from vault.decrypted_secrets where id=%L::uuid)),body:='{}'::jsonb,timeout_milliseconds:=30000);$job$,endpoint,secret)) into job;
 return job;
end $$;
-- Explicit grants: worker RPCs are service-only; humans receive only safe administrator RPCs.
revoke all on function public.webhook_admin(uuid),public.webhook_connection_allowed(uuid),public.enqueue_domain_webhooks(),public.provision_webhook_subscription(uuid,uuid,uuid,text,text),public.claim_webhook_batch(integer),public.webhook_delivery_secret(uuid,uuid),public.complete_webhook_delivery(uuid,uuid,text,integer,integer),public.configure_webhook_scheduler(text,text),public.configure_webhook_subscription(uuid,uuid,boolean,text[],boolean),public.list_webhook_subscriptions(uuid),public.list_webhook_deliveries(uuid,uuid,timestamptz,integer),public.retry_webhook_delivery(uuid,uuid) from public,anon,authenticated;
grant execute on function public.provision_webhook_subscription(uuid,uuid,uuid,text,text),public.claim_webhook_batch(integer),public.webhook_delivery_secret(uuid,uuid),public.complete_webhook_delivery(uuid,uuid,text,integer,integer),public.configure_webhook_scheduler(text,text) to service_role;
grant execute on function public.configure_webhook_subscription(uuid,uuid,boolean,text[],boolean),public.list_webhook_subscriptions(uuid),public.list_webhook_deliveries(uuid,uuid,timestamptz,integer),public.retry_webhook_delivery(uuid,uuid) to authenticated;
commit;
