-- OAuth grants only authorize normalized operations. Legacy workspace_role remains fenced.
begin;
create table public.integration_connections (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 client_id uuid not null, client_name text not null,
 status text not null default 'pending' check(status in ('pending','active','revoked')),
 authorization_id text not null, consent_attempt_id uuid not null default gen_random_uuid(), created_at timestamptz not null default now(), authorized_at timestamptz, revoked_at timestamptz,
 unique(user_id,client_id)
);
create table public.integration_grants (
 connection_id uuid not null references public.integration_connections(id) on delete cascade,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 capability text not null check(capability in ('read','write')), agent_id text,
 primary key(connection_id,workspace_id),
 foreign key(workspace_id,agent_id) references public.agents(workspace_id,id)
);
create index integration_grants_workspace_idx on public.integration_grants(workspace_id,connection_id);
alter table public.integration_connections enable row level security;
alter table public.integration_grants enable row level security;
revoke all on public.integration_connections,public.integration_grants from public,anon,authenticated;

create function public.integration_human() returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); client text;
begin
 client:=coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'client_id',nullif(current_setting('request.jwt.claim.client_id',true),''));
 if uid is null then raise exception 'unauthorized' using errcode='PT401'; end if;
 if client is not null then raise exception 'forbidden' using errcode='PT403'; end if;
 return uid;
end $$;
revoke all on function public.integration_human() from public,anon,authenticated;

-- Resolve the client from Auth's server-owned authorization record, never caller JSON.
-- This deliberately depends on the OAuth Server beta schema; absent/unexpected Auth state fails closed.
create function public.prepare_integration_consent(p_authorization_id text,p_grants jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.integration_human(); a record; g jsonb; w uuid; r text; c public.integration_connections;
 normalized jsonb:='[]'; existing jsonb; seen uuid[]:='{}'; inserted boolean;
begin
 select o.client_id,cl.client_name into a from auth.oauth_authorizations o join auth.oauth_clients cl on cl.id=o.client_id
 where o.authorization_id=p_authorization_id and o.user_id=uid and o.status::text='pending' and o.expires_at>now() and cl.deleted_at is null for share of o,cl;
 if not found then raise exception 'forbidden' using errcode='PT403'; end if;
 if jsonb_typeof(p_grants) is distinct from 'array' or jsonb_array_length(p_grants) not between 1 and 100 then raise exception 'validation_error' using errcode='PT422';end if;
 -- Validate and canonicalize the complete selection before changing connection state.
 for g in select value from jsonb_array_elements(p_grants) loop
  if jsonb_typeof(g) is distinct from 'object' or g->>'capability' not in ('read','write') or g->>'capability' is null or (g-'workspaceId'-'capability')<>'{}'::jsonb then raise exception 'validation_error' using errcode='PT422';end if;
  begin w:=(g->>'workspaceId')::uuid; exception when invalid_text_representation then raise exception 'validation_error' using errcode='PT422';end;
  if w is null or w=any(seen) then raise exception 'validation_error' using errcode='PT422';end if;
  seen:=array_append(seen,w);
  select m.role into r from public.workspace_memberships m join public.workspaces ws on ws.id=m.workspace_id and ws.storage_version=2 where m.workspace_id=w and m.user_id=uid for share of m,ws;
  if not found or (r='guest' and g->>'capability'='write') then raise exception 'forbidden' using errcode='PT403';end if;
  normalized:=normalized||jsonb_build_array(jsonb_build_object('workspaceId',w,'capability',g->>'capability'));
 end loop;
 select jsonb_agg(value order by value->>'workspaceId') into normalized from jsonb_array_elements(normalized);
 insert into public.integration_connections(user_id,client_id,client_name,authorization_id)
 values(uid,a.client_id,coalesce(nullif(a.client_name,''),'OAuth client'),p_authorization_id)
 on conflict(user_id,client_id) do nothing returning * into c;
 inserted:=found;
 if not inserted then
  select * into c from public.integration_connections where user_id=uid and client_id=a.client_id for update;
  if c.authorization_id=p_authorization_id then
   select coalesce(jsonb_agg(jsonb_build_object('workspaceId',workspace_id,'capability',capability) order by workspace_id::text),'[]') into existing from public.integration_grants where connection_id=c.id;
   -- One Auth request has one immutable selection. Identical pending retries share its nonce.
   if c.status='pending' and existing=normalized then return jsonb_build_object('connectionId',c.id,'attemptId',c.consent_attempt_id,'status','pending');end if;
   raise exception 'idempotency_conflict' using errcode='PT409';
  end if;
  update public.integration_connections set status='pending',authorization_id=p_authorization_id,consent_attempt_id=gen_random_uuid(),client_name=coalesce(nullif(a.client_name,''),'OAuth client'),authorized_at=null,revoked_at=null where id=c.id returning * into c;
  delete from public.integration_grants where connection_id=c.id;
 end if;
 for g in select value from jsonb_array_elements(normalized) loop
  insert into public.integration_grants(connection_id,workspace_id,capability) values(c.id,(g->>'workspaceId')::uuid,g->>'capability');
 end loop;
 return jsonb_build_object('connectionId',c.id,'attemptId',c.consent_attempt_id,'status','pending');
exception when undefined_table or undefined_column then
 raise exception 'temporarily_unavailable' using errcode='PT503';
end $$;

create function public.activate_integration_consent(p_authorization_id text,p_attempt_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.integration_human(); c public.integration_connections; g record; aid text; r text;
begin
 select * into c from public.integration_connections where user_id=uid and authorization_id=p_authorization_id and consent_attempt_id=p_attempt_id and status in ('pending','active') for update;
 if not found then raise exception 'forbidden' using errcode='PT403';end if;
 perform 1 from auth.oauth_authorizations o join auth.oauth_clients cl on cl.id=o.client_id join auth.oauth_consents oc on oc.client_id=o.client_id and oc.user_id=uid
 where o.authorization_id=p_authorization_id and o.user_id=uid and o.client_id=c.client_id and o.status::text='approved' and cl.deleted_at is null and oc.revoked_at is null for share of o,cl,oc;
 if not found then raise exception 'forbidden' using errcode='PT403';end if;
 for g in select * from public.integration_grants where connection_id=c.id order by workspace_id for update loop
  select role into r from public.workspace_memberships where workspace_id=g.workspace_id and user_id=uid for share;
  if not found or (g.capability='write' and r='guest') then raise exception 'forbidden' using errcode='PT403';end if;
  if g.capability='write' then
   select id into aid from public.agents where workspace_id=g.workspace_id and auth_user_id=uid and client_id=c.client_id::text for update;
   if not found then insert into public.agents(workspace_id,name,auth_user_id,client_id) values(g.workspace_id,c.client_name,uid,c.client_id::text) returning id into aid;end if;
   update public.integration_grants set agent_id=aid where connection_id=c.id and workspace_id=g.workspace_id;
  end if;
 end loop;
 update public.integration_connections set status='active',authorized_at=coalesce(authorized_at,clock_timestamp()),revoked_at=null where id=c.id;
 return jsonb_build_object('connectionId',c.id,'status','active');
exception when undefined_table or undefined_column then
 raise exception 'temporarily_unavailable' using errcode='PT503';
end $$;

create function public.cancel_integration_consent(p_authorization_id text,p_attempt_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.integration_connections set status='revoked',revoked_at=clock_timestamp() where user_id=public.integration_human() and authorization_id=p_authorization_id and consent_attempt_id=p_attempt_id and status='pending';
end $$;
create function public.revoke_integration_connection(p_connection_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.integration_connections set status='revoked',revoked_at=clock_timestamp() where id=p_connection_id and user_id=public.integration_human();
 if not found then raise exception 'forbidden' using errcode='PT403';end if;
end $$;
create function public.list_integration_connections() returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.integration_human(); result jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'clientId',c.client_id,'clientName',c.client_name,'status',c.status,'createdAt',c.created_at,'grants',
 (select coalesce(jsonb_agg(jsonb_build_object('workspaceId',g.workspace_id,'workspaceName',w.name,'capability',g.capability)),'[]') from public.integration_grants g join public.workspaces w on w.id=g.workspace_id where g.connection_id=c.id and exists(select 1 from public.workspace_memberships m where m.workspace_id=g.workspace_id and m.user_id=uid)))),'[]') into result from public.integration_connections c where c.user_id=uid;
 return jsonb_build_object('items',result);
end $$;

-- Administrative Hermes linking is explicit. The target must already hold its own active write grant.
create function public.link_integration_executor(p_connection_id uuid,p_workspace_id uuid,p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.integration_human(); aid text;
begin
 perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=uid and role in ('owner','admin') for share;
 if not found then raise exception 'forbidden' using errcode='PT403';end if;
 if p_name is null or length(trim(p_name)) not between 1 and 120 then raise exception 'validation_error' using errcode='PT422';end if;
 select g.agent_id into aid from public.integration_grants g join public.integration_connections c on c.id=g.connection_id
 where c.id=p_connection_id and c.status='active' and g.workspace_id=p_workspace_id and g.capability='write' and g.agent_id is not null for update of c,g;
 if not found then raise exception 'forbidden' using errcode='PT403';end if;
 update public.agents set name=trim(p_name),version=version+1 where workspace_id=p_workspace_id and id=aid;
 return jsonb_build_object('agentId',aid,'connectionId',p_connection_id);
end $$;

create or replace function public.operation_authorize(p_workspace_id uuid,p_write boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r text; uid uuid:=auth.uid(); client text; aid text; c uuid; capability text;
begin
 client:=coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'client_id',nullif(current_setting('request.jwt.claim.client_id',true),''));
 if uid is null then raise exception 'unauthorized' using errcode='PT401';end if;
 select role into r from public.workspace_memberships where workspace_id=p_workspace_id and user_id=uid for share;
 if r is null or (p_write and r='guest') then raise exception 'forbidden' using errcode='PT403';end if;
 if not exists(select 1 from public.workspaces where id=p_workspace_id and storage_version=2) then raise exception 'forbidden' using errcode='PT403';end if;
 if client is not null then
  select ic.id,g.agent_id,g.capability into c,aid,capability from public.integration_connections ic join public.integration_grants g on g.connection_id=ic.id
  join auth.oauth_consents oc on oc.user_id=ic.user_id and oc.client_id=ic.client_id and oc.revoked_at is null
  join auth.oauth_clients cl on cl.id=ic.client_id and cl.deleted_at is null
  where ic.user_id=uid and ic.client_id::text=client and ic.status='active' and g.workspace_id=p_workspace_id for share of ic,g,oc,cl;
  if not found or (p_write and (capability<>'write' or aid is null)) then raise exception 'forbidden' using errcode='PT403';end if;
  if aid is not null and not exists(select 1 from public.agents where workspace_id=p_workspace_id and id=aid and auth_user_id=uid and client_id=client) then raise exception 'forbidden' using errcode='PT403';end if;
 else
  select id into aid from public.agents where workspace_id=p_workspace_id and auth_user_id=uid and client_id is null;
 end if;
 return jsonb_build_object('userId',uid,'clientId',client,'connectionId',c,'agentId',aid,'role',r);
exception when undefined_table or undefined_column then
 raise exception 'temporarily_unavailable' using errcode='PT503';
end $$;
revoke all on function public.operation_authorize(uuid,boolean) from public,anon,authenticated;
revoke all on function public.prepare_integration_consent(text,jsonb),public.activate_integration_consent(text,uuid),public.cancel_integration_consent(text,uuid),public.revoke_integration_connection(uuid),public.list_integration_connections(),public.link_integration_executor(uuid,uuid,text) from public,anon;
grant execute on function public.prepare_integration_consent(text,jsonb),public.activate_integration_consent(text,uuid),public.cancel_integration_consent(text,uuid),public.revoke_integration_connection(uuid),public.list_integration_connections(),public.link_integration_executor(uuid,uuid,text) to authenticated;
commit;
