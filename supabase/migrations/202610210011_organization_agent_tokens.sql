-- Organization principals never create Auth users or human memberships.
-- Lock order: managing human membership SHARE, connection UPDATE (use/rotate/revoke), credential SHARE / UPDATE, then existing workspace mutex.
begin;
create table public.organization_agent_connections (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 agent_id text not null, name text not null check(length(btrim(name)) between 1 and 100),
 capability text not null check(capability in ('read','write')),
 created_by_user_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default clock_timestamp(), revoked_at timestamptz,
 foreign key(workspace_id,agent_id) references public.agents(workspace_id,id), unique(workspace_id,agent_id)
);
create table public.organization_agent_credentials (
 selector text primary key check(selector ~ '^[0-9a-f]{32}$'),
 connection_id uuid not null references public.organization_agent_connections(id) on delete cascade,
 secret_hash bytea not null check(octet_length(secret_hash)=32),
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz, last_used_at timestamptz, revoked_at timestamptz
);
create unique index organization_agent_current_credential on public.organization_agent_credentials(connection_id) where revoked_at is null;
create index organization_agent_metadata_page on public.organization_agent_connections(workspace_id,created_at,id);
-- Transaction identity is not a user-controlled setting. Only the verified secret
-- entrypoints can insert this row; no reusable session or public setter exists.
create table public.organization_agent_context (
 backend_pid integer not null, transaction_id bigint not null, actor jsonb not null,
 primary key(backend_pid,transaction_id)
);
create table public.organization_agent_audit (
 id uuid primary key default gen_random_uuid(), connection_id uuid not null references public.organization_agent_connections(id) on delete cascade,
 workspace_id uuid not null references public.workspaces(id) on delete cascade, operation text not null check(operation in ('created','rotated','revoked')),
 actor_user_id uuid references auth.users(id) on delete set null, created_at timestamptz not null default clock_timestamp()
);
alter table public.organization_agent_connections enable row level security;
alter table public.organization_agent_credentials enable row level security;
alter table public.organization_agent_context enable row level security;
alter table public.organization_agent_audit enable row level security;
revoke all on public.organization_agent_connections,public.organization_agent_credentials,public.organization_agent_context,public.organization_agent_audit from public,anon,authenticated;
alter table public.agents add column connection_source text check(connection_source='organization_token');
alter table public.comments add column author_agent_id text;
alter table public.comments add foreign key(workspace_id,author_agent_id) references public.agents(workspace_id,id);
alter table public.domain_events alter column actor_user_id drop not null;
alter table public.domain_events add column actor_kind text not null default 'user' check(actor_kind in ('user','organization_token'));
alter table public.domain_events add column actor_principal_id uuid;
alter table public.domain_events add constraint domain_event_principal check((actor_kind='user' and actor_user_id is not null) or (actor_kind='organization_token' and actor_user_id is null and actor_principal_id is not null and actor_agent_id is not null));
-- Legacy UUID columns below are technical namespaces, never human attribution.
-- A fixed reserved client discriminator prevents collision with user/OAuth tuples.
alter table public.idempotency_requests add column actor_kind text generated always as(case when actor_client_id='organization_token' then 'organization_token' else 'user' end) stored;
alter table public.operation_rate_limits add column actor_kind text generated always as(case when client_id like 'organization_token:%' then 'organization_token' else 'user' end) stored;

create function public.organization_agent_actor() returns jsonb language sql volatile set search_path='' as $$
 select actor from public.organization_agent_context where backend_pid=pg_backend_pid() and transaction_id=txid_current()
$$;
create function public.organization_agent_admin(p_workspace_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare a jsonb;
begin
 if public.organization_agent_actor() is not null then raise exception 'forbidden' using errcode='PT403';end if;
 a:=public.operation_authorize(p_workspace_id,true);
 if a->>'role' not in ('owner','admin') or a->>'agentId' is not null or a->>'clientId' is not null then raise exception 'forbidden' using errcode='PT403';end if;
 return (a->>'userId')::uuid;
end $$;
create function public.organization_agent_metadata(p_connection_id uuid) returns jsonb language sql volatile set search_path='' as $$
 select jsonb_build_object('id',c.id,'workspaceId',c.workspace_id,'agentId',c.agent_id,'name',c.name,'capability',c.capability,'prefix','krs_'||k.selector,
  'createdByUserId',c.created_by_user_id,'createdAt',c.created_at,'expiresAt',k.expires_at,'lastUsedAt',k.last_used_at,'revokedAt',c.revoked_at,
  'status',case when c.revoked_at is not null then 'revoked' when k.expires_at<=clock_timestamp() then 'expired' else 'active' end)
 from public.organization_agent_connections c join lateral(select * from public.organization_agent_credentials where connection_id=c.id order by created_at desc,selector desc limit 1) k on true where c.id=p_connection_id
$$;
create function public.organization_agent_issue(p_connection_id uuid,p_expires_in_days integer) returns jsonb language plpgsql set search_path='' as $$
declare selector text:=replace(gen_random_uuid()::text,'-',''); secret text; expires timestamptz;
begin
 if p_expires_in_days is not null and p_expires_in_days not in (30,90,365) then raise exception 'validation_error' using errcode='PT422';end if;
 expires:=clock_timestamp()+p_expires_in_days*interval '1 day';
 -- Three independent OS-CSPRNG UUIDs provide 366 random bits. SHA-256 extracts
 -- a uniformly distributed 256-bit secret without adding a pgcrypto dependency.
 secret:=translate(rtrim(encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'base64'),'='),'+/','-_');
 insert into public.organization_agent_credentials(selector,connection_id,secret_hash,expires_at) values(selector,p_connection_id,sha256(convert_to(secret,'UTF8')),expires);
 perform set_config('response.headers','[{"Cache-Control":"no-store"}]',true);
 return jsonb_build_object('token','krs_'||selector||'_'||secret,'connection',public.organization_agent_metadata(p_connection_id));
end $$;
create function public.create_organization_agent_token(p_workspace_id uuid,p_name text,p_capability text,p_expires_in_days integer default 90) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid; ident uuid:=gen_random_uuid(); aid text:=ident::text;
begin
 uid:=public.organization_agent_admin(p_workspace_id);
 p_name:=regexp_replace(p_name,'^[[:space:]]+|[[:space:]]+$','','g');
 if p_name is null or length(btrim(p_name)) not between 1 and 100 or p_capability is null or p_capability not in ('read','write') then raise exception 'validation_error' using errcode='PT422';end if;
 insert into public.agents(workspace_id,id,name,connection_source) values(p_workspace_id,aid,btrim(p_name),'organization_token');
 insert into public.organization_agent_connections(id,workspace_id,agent_id,name,capability,created_by_user_id) values(ident,p_workspace_id,aid,btrim(p_name),p_capability,uid);
 insert into public.organization_agent_audit(connection_id,workspace_id,operation,actor_user_id) values(ident,p_workspace_id,'created',uid);
 return public.organization_agent_issue(ident,p_expires_in_days);
end $$;
create function public.list_organization_agent_tokens(p_workspace_id uuid,p_limit integer default 50,p_cursor text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cur jsonb; items jsonb; next_cursor text; stamp timestamptz; ident uuid;
begin
 perform public.organization_agent_admin(p_workspace_id);
 if p_limit is null or p_limit not between 1 and 100 or length(p_cursor)>1024 then raise exception 'validation_error' using errcode='PT422';end if;
 if p_cursor is not null then
  cur:=p_cursor::jsonb;
  if jsonb_typeof(cur) is distinct from 'array' or jsonb_array_length(cur)<>3 or cur->>0 is distinct from p_workspace_id::text or jsonb_typeof(cur->1) is distinct from 'string' or jsonb_typeof(cur->2) is distinct from 'string' then raise exception 'validation_error' using errcode='PT422';end if;
  stamp:=(cur->>1)::timestamptz;ident:=(cur->>2)::uuid;
 end if;
 select coalesce(jsonb_agg(public.organization_agent_metadata(x.id) order by x.created_at,x.id),'[]') into items from(select id,created_at from public.organization_agent_connections where workspace_id=p_workspace_id and (p_cursor is null or (created_at,id)>(stamp,ident)) order by created_at,id limit p_limit+1)x;
 if jsonb_array_length(items)>p_limit then next_cursor:=jsonb_build_array(p_workspace_id,items->(p_limit-1)->>'createdAt',items->(p_limit-1)->>'id')::text;end if;
 select coalesce(jsonb_agg(value order by ord),'[]') into items from jsonb_array_elements(items) with ordinality x(value,ord) where ord<=p_limit;
 return jsonb_build_object('items',items,'nextCursor',next_cursor);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then raise exception 'validation_error' using errcode='PT422';
end $$;
create function public.rotate_organization_agent_token(p_workspace_id uuid,p_connection_id uuid,p_expires_in_days integer default 90) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid; c public.organization_agent_connections;
begin
 uid:=public.organization_agent_admin(p_workspace_id);
 select * into c from public.organization_agent_connections where id=p_connection_id and workspace_id=p_workspace_id for update;
 if not found or c.revoked_at is not null then raise exception 'forbidden' using errcode='PT403';end if;
 update public.organization_agent_credentials set revoked_at=clock_timestamp() where connection_id=c.id and revoked_at is null;
 insert into public.organization_agent_audit(connection_id,workspace_id,operation,actor_user_id) values(c.id,p_workspace_id,'rotated',uid);
 return public.organization_agent_issue(c.id,p_expires_in_days);
end $$;
create function public.revoke_organization_agent_token(p_workspace_id uuid,p_connection_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid; c public.organization_agent_connections;
begin
 uid:=public.organization_agent_admin(p_workspace_id);
 select * into c from public.organization_agent_connections where id=p_connection_id and workspace_id=p_workspace_id for update;
 if not found then raise exception 'forbidden' using errcode='PT403';end if;
 if c.revoked_at is null then
  update public.organization_agent_connections set revoked_at=clock_timestamp() where id=c.id;
  update public.organization_agent_credentials set revoked_at=clock_timestamp() where connection_id=c.id and revoked_at is null;
  insert into public.organization_agent_audit(connection_id,workspace_id,operation,actor_user_id) values(c.id,p_workspace_id,'revoked',uid);
 end if;
 return jsonb_build_object('connection',public.organization_agent_metadata(c.id));
end $$;
create function public.organization_agent_verify(p_token text) returns jsonb language plpgsql set search_path='' as $$
declare c public.organization_agent_connections; k public.organization_agent_credentials;
begin
 if p_token is null or p_token !~ '^krs_[0-9a-f]{32}_[A-Za-z0-9_-]{43}$' then raise exception 'unauthorized' using errcode='PT401';end if;
 -- Resolve selector without taking its lock first. All paths lock connection first.
 select x.* into c from public.organization_agent_connections x join public.organization_agent_credentials y on y.connection_id=x.id where y.selector=substr(p_token,5,32) for update of x;
 if not found or c.revoked_at is not null then raise exception 'unauthorized' using errcode='PT401';end if;
 select * into k from public.organization_agent_credentials where selector=substr(p_token,5,32) and connection_id=c.id for share;
 if not found or k.revoked_at is not null or k.expires_at<=clock_timestamp() or k.secret_hash<>sha256(convert_to(substr(p_token,38),'UTF8')) then raise exception 'unauthorized' using errcode='PT401';end if;
 if not exists(select 1 from public.agents where workspace_id=c.workspace_id and id=c.agent_id and connection_source='organization_token') or not exists(select 1 from public.workspaces where id=c.workspace_id and storage_version=2) then raise exception 'unauthorized' using errcode='PT401';end if;
 -- Last-use writes serialize on the connection before credential locks.
 -- Rotation/revocation wait for the entire authorized operation to finish.
 update public.organization_agent_credentials set last_used_at=clock_timestamp() where selector=k.selector;
 return jsonb_build_object('kind','organization_token','principalId',c.id,'connectionId',c.id,'agentId',c.agent_id,'workspaceId',c.workspace_id,'capability',c.capability,'userId',null,'clientId',null);
end $$;
create function public.authenticate_organization_agent_token(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
begin return public.organization_agent_verify(p_token);end $$;

alter function public.operation_authorize(uuid,boolean) rename to operation_authorize_before_organization_tokens;
create function public.operation_authorize(p_workspace_id uuid,p_write boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb;
begin
 a:=public.organization_agent_actor();
 if a is null then return public.operation_authorize_before_organization_tokens(p_workspace_id,p_write);end if;
 if a->>'workspaceId' is distinct from p_workspace_id::text or (p_write and a->>'capability'<>'write') then raise exception 'forbidden' using errcode='PT403';end if;
 return a;
end $$;
create function public.organization_agent_attribution() returns trigger language plpgsql set search_path='' as $$
declare a jsonb:=public.organization_agent_actor();
begin
 if a is not null then
  if tg_table_name='comments' then new.author_user_id:=null;new.author_agent_id:=a->>'agentId';
  else new.actor_user_id:=null;new.actor_kind:='organization_token';new.actor_principal_id:=(a->>'principalId')::uuid;new.actor_client_id:=null;end if;
 end if;
 return new;
end $$;
create trigger organization_comment_attribution before insert on public.comments for each row execute function public.organization_agent_attribution();
create trigger organization_event_attribution before insert on public.domain_events for each row execute function public.organization_agent_attribution();
-- Preserve the reviewed SQL domain dispatcher exactly except its initial human
-- guard: the private transaction context is the additional authorized principal.
do $$ declare definition text;begin
 select pg_get_functiondef('public.read_operation_before_context(uuid,text,jsonb)'::regprocedure) into definition;
 if position('if auth.uid() is null then' in definition)=0 then raise exception 'unexpected domain read predecessor';end if;
 execute replace(definition,'if auth.uid() is null then','if auth.uid() is null and public.organization_agent_actor() is null then');
end $$;
create or replace function public.operation_task(p_row jsonb) returns jsonb language plpgsql volatile set search_path='' as $$
declare data jsonb; execution_active boolean;
begin
 data:=public.operation_task_before_execution(p_row);
 execution_active:=coalesce((data->'reservation'->>'active')::boolean,false);
 if execution_active and not exists(
  select 1 from public.agents a join public.workspace_memberships m on m.workspace_id=a.workspace_id and m.user_id=a.auth_user_id and m.role<>'guest'
  where a.workspace_id=(p_row->>'workspace_id')::uuid and a.id=data->'reservation'->>'agentId' and
   (a.client_id is null or exists(select 1 from public.integration_connections ic join public.integration_grants g on g.connection_id=ic.id
    join auth.oauth_consents oc on oc.user_id=ic.user_id and oc.client_id=ic.client_id and oc.revoked_at is null
    join auth.oauth_clients cl on cl.id=ic.client_id and cl.deleted_at is null
    where ic.user_id=a.auth_user_id and ic.client_id::text=a.client_id and ic.status='active' and g.workspace_id=a.workspace_id and g.agent_id=a.id and g.capability='write'))
 ) and not exists(
  select 1 from public.organization_agent_connections c join public.organization_agent_credentials k on k.connection_id=c.id
  where c.workspace_id=(p_row->>'workspace_id')::uuid and c.agent_id=data->'reservation'->>'agentId' and c.revoked_at is null and c.capability='write' and k.revoked_at is null and (k.expires_at is null or k.expires_at>clock_timestamp())
 ) then execution_active:=false;end if;
 return (data-'executionState'-'blockingReason')||jsonb_build_object('execution',case when p_row->>'execution_state' is null then null else jsonb_build_object('state',p_row->>'execution_state','reason',p_row->>'blocking_reason','active',execution_active) end);
end $$;
create function public.read_organization_agent_operation(p_token text,p_workspace_id uuid,p_operation text,p_query jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare a jsonb; result jsonb;
begin
 a:=public.organization_agent_verify(p_token);
 if p_operation is null or p_operation not in ('list_workspaces','list_projects','list_tasks','get_task','list_task_activity') or (p_workspace_id is distinct from (a->>'workspaceId')::uuid and not(p_operation='list_workspaces' and p_workspace_id is null)) then raise exception 'forbidden' using errcode='PT403';end if;
 a:=a||jsonb_build_object('userId',a->>'principalId','clientId','organization_token','role','member');
 insert into public.organization_agent_context values(pg_backend_pid(),txid_current(),a);
 if p_operation='list_workspaces' then
  if jsonb_typeof(p_query) is distinct from 'object' or pg_column_size(p_query)>4096 or exists(select 1 from jsonb_object_keys(p_query) k where k not in ('limit','cursor')) or (p_query?'limit' and (jsonb_typeof(p_query->'limit')<>'number' or p_query->>'limit'!~'^[0-9]+$' or (p_query->>'limit')::numeric not between 1 and 100)) or (p_query?'cursor' and (jsonb_typeof(p_query->'cursor')<>'string' or length(p_query->>'cursor')>1024)) then raise exception 'validation_error' using errcode='PT422';end if;
  perform public.operation_rate_limit(a);
  select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'slug',slug,'color',color,'logoPath',logo_path,'storageVersion',storage_version,'version',version,'role','member')),'[]'),'nextCursor',null) into result from public.workspaces where id=(a->>'workspaceId')::uuid and (not p_query?'cursor' or id::text>p_query->>'cursor');
 else result:=public.read_operation(p_workspace_id,p_operation,p_query);end if;
 delete from public.organization_agent_context where backend_pid=pg_backend_pid() and transaction_id=txid_current();
 return result;
exception when numeric_value_out_of_range then raise exception 'validation_error' using errcode='PT422';
end $$;
create function public.execute_organization_agent_operation(p_token text,p_workspace_id uuid,p_operation text,p_command jsonb,p_idempotency_key text,p_expected_version bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a jsonb; result jsonb;
begin
 a:=public.organization_agent_verify(p_token);
 if a->>'capability'<>'write' or p_workspace_id is distinct from (a->>'workspaceId')::uuid or p_operation is null or p_operation not in ('create_task','claim_task','renew_task_claim','release_task_claim','update_task','add_task_comment','complete_task') then raise exception 'forbidden' using errcode='PT403';end if;
 a:=a||jsonb_build_object('userId',a->>'principalId','clientId','organization_token','role','member');
 insert into public.organization_agent_context values(pg_backend_pid(),txid_current(),a);
 result:=public.execute_operation(p_workspace_id,p_operation,p_command,p_idempotency_key,p_expected_version);
 delete from public.organization_agent_context where backend_pid=pg_backend_pid() and transaction_id=txid_current();
 return result;
end $$;
revoke all on function public.organization_agent_actor(),public.organization_agent_admin(uuid),public.organization_agent_metadata(uuid),public.organization_agent_issue(uuid,integer),public.organization_agent_verify(text),public.organization_agent_attribution(),public.operation_authorize_before_organization_tokens(uuid,boolean),public.operation_authorize(uuid,boolean),public.operation_task(jsonb) from public,anon,authenticated;
revoke all on function public.create_organization_agent_token(uuid,text,text,integer),public.list_organization_agent_tokens(uuid,integer,text),public.rotate_organization_agent_token(uuid,uuid,integer),public.revoke_organization_agent_token(uuid,uuid),public.authenticate_organization_agent_token(text),public.read_organization_agent_operation(text,uuid,text,jsonb),public.execute_organization_agent_operation(text,uuid,text,jsonb,text,bigint) from public,anon,authenticated;
grant execute on function public.create_organization_agent_token(uuid,text,text,integer),public.list_organization_agent_tokens(uuid,integer,text),public.rotate_organization_agent_token(uuid,uuid,integer),public.revoke_organization_agent_token(uuid,uuid) to authenticated;
grant execute on function public.authenticate_organization_agent_token(text),public.read_organization_agent_operation(text,uuid,text,jsonb),public.execute_organization_agent_operation(text,uuid,text,jsonb,text,bigint) to anon,authenticated;
commit;
