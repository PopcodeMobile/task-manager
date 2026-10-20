-- Commands are the only authenticated writers. All identity comes from verified JWT settings.
create table public.task_claims (
 workspace_id uuid not null, task_id text not null, agent_id text not null,
 claim_token uuid not null default gen_random_uuid(), claimed_at timestamptz not null default statement_timestamp(),
 expires_at timestamptz not null default statement_timestamp()+interval '15 minutes',
 primary key(workspace_id,task_id),
 foreign key(workspace_id,task_id) references public.tasks(workspace_id,id) on delete cascade,
 foreign key(workspace_id,agent_id) references public.agents(workspace_id,id)
);
create table public.domain_events (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 operation text not null, entity_id text, actor_user_id uuid not null,
 actor_client_id text, actor_connection_id text, actor_agent_id text,
 payload jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create index domain_events_workspace_time_idx on public.domain_events(workspace_id,created_at,id);
create table public.idempotency_requests (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 actor_user_id uuid not null, actor_client_id text not null, actor_connection_id text not null,
 operation text not null, key text not null, fingerprint text not null, result jsonb not null,
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null default clock_timestamp()+interval '48 hours',
 primary key(workspace_id,actor_user_id,actor_client_id,actor_connection_id,operation,key)
);
create index idempotency_expiry_idx on public.idempotency_requests(expires_at);
create table public.operation_rate_limits (
 actor_user_id uuid not null, client_id text not null, window_start timestamptz not null, requests integer not null,
 primary key(actor_user_id,client_id,window_start)
);
create table public.project_task_sequences (
 workspace_id uuid not null, project_id text not null, value bigint not null default 0,
 primary key(workspace_id,project_id), foreign key(workspace_id,project_id) references public.projects(workspace_id,id) on delete cascade
);
-- Independent identity tuples prevent ambiguous executor resolution, including non-OAuth automation accounts.
create unique index agents_identity_unique on public.agents(workspace_id,auth_user_id,coalesce(client_id,'')) where auth_user_id is not null;
alter table public.teams add column version bigint not null default 1;
alter table public.labels add column version bigint not null default 1;
alter table public.subtasks add column version bigint not null default 1;
alter table public.files add column version bigint not null default 1;
alter table public.calendar_events add column version bigint not null default 1;
alter table public.saved_views add column version bigint not null default 1;

alter table public.task_claims enable row level security;
alter table public.domain_events enable row level security;
alter table public.idempotency_requests enable row level security;
alter table public.operation_rate_limits enable row level security;
alter table public.project_task_sequences enable row level security;
revoke all on public.task_claims,public.domain_events,public.idempotency_requests,public.operation_rate_limits,public.project_task_sequences from public,anon,authenticated;

-- Task 3 replaces this seam with grant/connection checks. Legacy workspace_role stays OAuth-fenced.
create function public.operation_authorize(p_workspace_id uuid,p_write boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r text; uid uuid:=auth.uid(); client text; aid text;
begin
 client:=coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'client_id',nullif(current_setting('request.jwt.claim.client_id',true),''));
 if uid is null then raise exception 'unauthorized' using errcode='PT401'; end if;
 if client is not null then raise exception 'forbidden' using errcode='PT403'; end if;
 select role into r from public.workspace_memberships where workspace_id=p_workspace_id and user_id=uid for share;
 if r is null or (p_write and r='guest') then raise exception 'forbidden' using errcode='PT403'; end if;
 if not exists(select 1 from public.workspaces where id=p_workspace_id and storage_version=2) then raise exception 'forbidden' using errcode='PT403'; end if;
 select id into aid from public.agents where workspace_id=p_workspace_id and auth_user_id=uid and client_id is not distinct from client;
 return jsonb_build_object('userId',uid,'clientId',client,'connectionId',null,'agentId',aid,'role',r);
end $$;
revoke all on function public.operation_authorize(uuid,boolean) from public,anon,authenticated;

create function public.operation_rate_limit(p_actor jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 insert into public.operation_rate_limits(actor_user_id,client_id,window_start,requests)
 values((p_actor->>'userId')::uuid,coalesce(p_actor->>'clientId','')||':'||coalesce(p_actor->>'connectionId',''),date_trunc('minute',clock_timestamp()),1)
 on conflict(actor_user_id,client_id,window_start) do update set requests=public.operation_rate_limits.requests+1 returning requests into n;
 if n>240 then raise exception 'rate_limited' using errcode='PT429'; end if;
end $$;
revoke all on function public.operation_rate_limit(jsonb) from public,anon,authenticated;

-- Content source fields remain available to render legacy domain extras; workspace/archive export is never passed here.
create function public.operation_entity(p_row jsonb) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg((select string_agg(case when ord=1 then part else initcap(part) end,'' order by ord) from unnest(string_to_array(k,'_')) with ordinality as x(part,ord)),v),'{}')
 from jsonb_each((p_row-'legacy_metadata')||case when p_row?'legacy_metadata' then jsonb_build_object('legacy_metadata',p_row->'legacy_metadata') else '{}'::jsonb end) as t(k,v)
$$;
revoke all on function public.operation_entity(jsonb) from public,anon,authenticated;

create function public.operation_validate(p_operation text,p_input jsonb) returns void
language plpgsql set search_path='' as $$
declare allowed text[]; required text[]:='{}'; k text; v jsonb;
begin
 if jsonb_typeof(p_input) is distinct from 'object' or pg_column_size(p_input)>262144 then raise exception 'validation_error' using errcode='PT422'; end if;
 case p_operation
 when 'create_task' then allowed:=array['id','projectId','title','description','status','priority','assigneeUserId','recurrence','dueDate','startDate','sortOrder','attributes'];required:=array['projectId','title'];
 when 'update_task' then allowed:=array['id','title','description','status','priority','assigneeUserId','recurrence','dueDate','startDate','sortOrder','claimToken','attributes'];required:=array['id'];
 when 'move_task' then allowed:=array['id','projectId','sortOrder','claimToken'];required:=array['id','projectId'];
 when 'duplicate_task' then allowed:=array['id','projectId','title','claimToken'];required:=array['id'];
 when 'delete_task','archive_task','restore_task','claim_task' then allowed:=array['id','claimToken'];required:=array['id'];
 when 'renew_task_claim','release_task_claim' then allowed:=array['id','claimToken'];required:=array['id','claimToken'];
 when 'complete_task' then allowed:=array['id','claimToken'];required:=array['id'];
 when 'intervene_task' then allowed:=array['id','action','executorAgentId'];required:=array['id','action'];
 when 'add_task_comment' then allowed:=array['id','taskId','body'];required:=array['taskId','body'];
 when 'create_project' then allowed:=array['id','key','name','description','status','teamId','leadUserId','dueDate','startDate','sortOrder','attributes'];required:=array['name'];
 when 'update_project' then allowed:=array['id','key','name','description','status','teamId','leadUserId','dueDate','startDate','sortOrder','archived','attributes'];required:=array['id'];
 when 'delete_project','archive_project','restore_project' then allowed:=array['id'];required:=array['id'];
 when 'create_subtask' then allowed:=array['id','taskId','title','done','sortOrder','claimToken'];required:=array['taskId','title'];
 when 'update_subtask' then allowed:=array['id','taskId','title','done','sortOrder','claimToken'];required:=array['id','taskId'];
 when 'delete_subtask' then allowed:=array['id','taskId','claimToken'];required:=array['id','taskId'];
 when 'set_task_dependency','remove_task_dependency' then allowed:=array['id','dependsOnTaskId','claimToken'];required:=array['id','dependsOnTaskId'];
 when 'set_task_label','remove_task_label' then allowed:=array['id','labelId','claimToken'];required:=array['id','labelId'];
 when 'set_task_attachment','remove_task_attachment' then allowed:=array['id','fileId','sortOrder','claimToken'];required:=array['id','fileId'];
 when 'add_reaction','remove_reaction' then allowed:=array['commentId','reaction'];required:=allowed;
 when 'create_team','update_team' then allowed:=array['id','name','description','attributes'];if p_operation='create_team' then required:=array['name'];else required:=array['id'];end if;
 when 'delete_team','delete_label','delete_view','delete_calendar_event','delete_file' then allowed:=array['id'];required:=allowed;
 when 'set_team_member','remove_team_member' then allowed:=array['id','userId'];required:=allowed;
 when 'set_project_member','remove_project_member' then allowed:=array['id','userId'];required:=allowed;
 when 'create_label','update_label' then allowed:=array['id','name'];if p_operation='create_label' then required:=array['name'];else required:=array['id'];end if;
 when 'create_view','update_view' then allowed:=array['id','projectId','name','viewType','filters'];if p_operation='create_view' then required:=array['name','viewType'];else required:=array['id'];end if;
 when 'create_calendar_event','update_calendar_event' then allowed:=array['id','projectId','taskId','title','eventDate','eventTime'];if p_operation='create_calendar_event' then required:=array['title'];else required:=array['id'];end if;
 when 'create_file','update_file' then allowed:=array['id','projectId','taskId','name','fileType','sizeLabel'];if p_operation='create_file' then required:=array['name'];else required:=array['id'];end if;
 when 'set_preferences' then allowed:=array['preferences'];required:=allowed;
 else raise exception 'validation_error' using errcode='PT422';
 end case;
 if exists(select 1 from jsonb_object_keys(p_input) x where not(x=any(allowed))) then raise exception 'validation_error' using errcode='PT422';end if;
 foreach k in array required loop if not p_input?k or p_input->k='null' then raise exception 'validation_error' using errcode='PT422';end if;end loop;
 for k,v in select * from jsonb_each(p_input) loop
  if k in ('preferences','filters','attributes') then
   if (k in ('preferences','attributes') and jsonb_typeof(v)<>'object') or (k='filters' and jsonb_typeof(v)<>'array') or not public.valid_legacy_metadata(jsonb_build_object(k,v)) then raise exception 'validation_error' using errcode='PT422';end if;
  elsif k in ('done','archived') then
   if jsonb_typeof(v)<>'boolean' then raise exception 'validation_error' using errcode='PT422';end if;
  elsif k='sortOrder' then
   if jsonb_typeof(v)<>'number' then raise exception 'validation_error' using errcode='PT422';end if;
  elsif v<>'null' then
   if jsonb_typeof(v)<>'string' or length(v#>>'{}')>(case when k='description' then 100000 when k='body' then 20000 when k in ('title','name') then 500 else 128 end) or length(btrim(v#>>'{}'))=0 then raise exception 'validation_error' using errcode='PT422';end if;
  elsif k not in ('assigneeUserId','recurrence','dueDate','startDate','teamId','leadUserId','projectId','taskId','eventDate','eventTime','sizeLabel','executorAgentId') then raise exception 'validation_error' using errcode='PT422';
  end if;
 end loop;
 if p_input?'attributes' then
  for k,v in select * from jsonb_each(p_input->'attributes') loop
   if not (case when p_operation in ('create_task','update_task') then k='estimate' when p_operation in ('create_project','update_project') then k in ('icon','color','milestones') when p_operation in ('create_team','update_team') then k in ('icon','color') else false end) then raise exception 'validation_error' using errcode='PT422';end if;
   if k='milestones' then
    if jsonb_typeof(v)<>'array' or jsonb_array_length(v)>100 then raise exception 'validation_error' using errcode='PT422';end if;
    if exists(select 1 from jsonb_array_elements(v) x where jsonb_typeof(x)<>'object' or jsonb_typeof(x->'name') is distinct from 'string' or jsonb_typeof(x->'date') is distinct from 'string' or length(x->>'name')>500 or exists(select 1 from jsonb_object_keys(x) y where y not in ('name','date'))) then raise exception 'validation_error' using errcode='PT422';end if;
   elsif v<>'null' and (jsonb_typeof(v)<>'string' or length(v#>>'{}')>128) then raise exception 'validation_error' using errcode='PT422';end if;
  end loop;
 end if;
 if p_input?'status' then
  if p_operation like '%task' and (p_input->>'status' not in ('backlog','todo','progress','review') or p_input->>'status' is null) then raise exception 'validation_error' using errcode='PT422';end if;
  if p_operation like '%project' and p_input->>'status' not in ('planning','active','risk','hold','complete') then raise exception 'validation_error' using errcode='PT422';end if;
 end if;
 if p_input?'priority' and p_input->>'priority' not in ('none','low','medium','high','urgent') then raise exception 'validation_error' using errcode='PT422';end if;
 if p_input?'recurrence' and p_input->>'recurrence' not in ('Daily','Weekly','Every 2 weeks','Monthly') then raise exception 'validation_error' using errcode='PT422';end if;
 if p_input?'action' and p_input->>'action' not in ('release','reassign','complete','delete') then raise exception 'validation_error' using errcode='PT422';end if;
 if p_input?'preferences' then
  if exists(select 1 from jsonb_object_keys(p_input->'preferences') x where x not in ('favoriteTaskIds','favoriteProjectIds','notificationReadStates')) then raise exception 'validation_error' using errcode='PT422';end if;
  for k,v in select * from jsonb_each(p_input->'preferences') loop
   if k in ('favoriteProjectIds','favoriteTaskIds') then
    if jsonb_typeof(v)<>'array' then raise exception 'validation_error' using errcode='PT422';end if;
    if exists(select 1 from jsonb_array_elements(v) x where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 128) then raise exception 'validation_error' using errcode='PT422';end if;
   else
    if jsonb_typeof(v)<>'object' then raise exception 'validation_error' using errcode='PT422';end if;
    if exists(select 1 from jsonb_each(v) x where length(x.key) not between 1 and 128 or jsonb_typeof(x.value)<>'boolean') then raise exception 'validation_error' using errcode='PT422';end if;
   end if;
  end loop;
 end if;
end $$;
revoke all on function public.operation_validate(text,jsonb) from public,anon,authenticated;

create function public.operation_next_task_key(p_workspace uuid,p_project text) returns text language plpgsql set search_path='' as $$
declare n bigint; prefix text;
begin
 select coalesce(key,'TASK') into prefix from public.projects where workspace_id=p_workspace and id=p_project for update;
 if not found then raise exception 'validation_error' using errcode='PT422';end if;
 insert into public.project_task_sequences(workspace_id,project_id,value)
 select p_workspace,p_project,coalesce(max((substring(key from '[0-9]+$'))::bigint),0)+1 from public.tasks where workspace_id=p_workspace and project_id=p_project
 on conflict(workspace_id,project_id) do update set value=public.project_task_sequences.value+1 returning value into n;
 return prefix||'-'||n;
end $$;
revoke all on function public.operation_next_task_key(uuid,text) from public,anon,authenticated;

create function public.operation_assert_claim(p_workspace uuid,p_task text,p_actor jsonb,p_token text) returns void language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.task_claims where workspace_id=p_workspace and task_id=p_task and agent_id=p_actor->>'agentId' and claim_token::text=p_token and expires_at>clock_timestamp()) then raise exception 'claim_expired' using errcode='PT409';end if;
end $$;
revoke all on function public.operation_assert_claim(uuid,text,jsonb,text) from public,anon,authenticated;

create function public.operation_delete_task(p_workspace uuid,p_task text) returns void language plpgsql set search_path='' as $$
begin
 delete from public.calendar_events where workspace_id=p_workspace and task_id=p_task;
 delete from public.activity_entries where workspace_id=p_workspace and task_id=p_task;
 delete from public.notifications where workspace_id=p_workspace and task_id=p_task;
 delete from public.tasks where workspace_id=p_workspace and id=p_task;
end $$;
revoke all on function public.operation_delete_task(uuid,text) from public,anon,authenticated;

-- Fixed table/column registry for small graph entities. Callers cannot supply SQL identifiers.
create function public.operation_graph(p_workspace uuid,p_operation text,p_input jsonb,p_expected bigint,p_actor jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare tbl text; mode text:=split_part(p_operation,'_',1); row_data jsonb; old_data jsonb; cols text; vals text; sets text; k text; col text; ident text:=coalesce(p_input->>'id',gen_random_uuid()::text); task_id text; parent public.tasks;
begin
 case p_operation
 when 'create_subtask','update_subtask','delete_subtask' then tbl:='subtasks';
 when 'create_team','update_team','delete_team' then tbl:='teams';
 when 'create_label','update_label','delete_label' then tbl:='labels';
 when 'create_view','update_view','delete_view' then tbl:='saved_views';
 when 'create_calendar_event','update_calendar_event','delete_calendar_event' then tbl:='calendar_events';
 when 'create_file','update_file','delete_file' then tbl:='files';
 else raise exception 'validation_error' using errcode='PT422';end case;
 if mode<>'create' then
  execute format('select to_jsonb(t) from public.%I t where workspace_id=$1 and id=$2 for update',tbl) into old_data using p_workspace,ident;
  if old_data is null then raise exception 'not_found' using errcode='PT404';end if;
 end if;
 if tbl='subtasks' then
  task_id:=p_input->>'taskId';
  if mode<>'create' and old_data->>'task_id'<>task_id then raise exception 'validation_error' using errcode='PT422';end if;
  select * into parent from public.tasks where workspace_id=p_workspace and id=task_id for update;
  if not found then raise exception 'not_found' using errcode='PT404';end if;
  if p_expected is null or p_expected<>parent.version then raise exception 'version_conflict' using errcode='PT409';end if;
  if p_actor->>'agentId' is not null then perform public.operation_assert_claim(p_workspace,task_id,p_actor,p_input->>'claimToken');end if;
 else
  if p_actor->>'agentId' is not null and ((tbl='labels' and mode='delete' and exists(select 1 from public.task_labels where workspace_id=p_workspace and label_id=ident)) or (tbl='files' and exists(select 1 from public.task_attachments where workspace_id=p_workspace and file_id=ident))) then raise exception 'forbidden' using errcode='PT403';end if;
  if p_actor->>'agentId' is not null and tbl in ('files','calendar_events') and coalesce(p_input->>'taskId',old_data->>'task_id') is not null then raise exception 'forbidden' using errcode='PT403';end if;
  if mode<>'create' and (p_expected is null or p_expected<>(old_data->>'version')::bigint) then raise exception 'version_conflict' using errcode='PT409';end if;
 end if;
 row_data:=jsonb_build_object('workspace_id',p_workspace,'id',ident);
 for k in select jsonb_object_keys(p_input) loop
  col:=case k when 'taskId' then 'task_id' when 'projectId' then 'project_id' when 'sortOrder' then 'sort_order' when 'viewType' then 'view_type' when 'eventDate' then 'event_date' when 'eventTime' then 'event_time' when 'fileType' then 'file_type' when 'sizeLabel' then 'size_label' else k end;
  if k='attributes' then row_data:=row_data||jsonb_build_object('legacy_metadata',coalesce(old_data->'legacy_metadata','{}')||(p_input->k));elsif k<>'claimToken' then row_data:=row_data||jsonb_build_object(col,p_input->k);end if;
 end loop;
 if tbl='files' and mode='create' then row_data:=row_data||jsonb_build_object('author_user_id',p_actor->>'userId');end if;
 if mode='create' then
  select string_agg(format('%I',x),','),string_agg(format('r.%I',x),',') into cols,vals from jsonb_object_keys(row_data) x;
  execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1) r returning to_jsonb(%I.*)',tbl,cols,vals,tbl,tbl) into row_data using row_data;
 elsif mode='update' then
  select string_agg(format('%1$I=r.%1$I',x),',') into sets from jsonb_object_keys(row_data) x where x not in ('id','workspace_id');
  execute format('update public.%I t set %s version=t.version+1 from jsonb_populate_record(null::public.%I,$1) r where t.workspace_id=$2 and t.id=$3 returning to_jsonb(t.*)',tbl,case when sets is null then '' else sets||',' end,tbl) into row_data using row_data,p_workspace,ident;
 else
  -- Remove nullable/relation references before deleting their parent.
  if tbl='teams' then update public.projects set team_id=null,version=version+1 where workspace_id=p_workspace and team_id=ident;end if;
  execute format('delete from public.%I where workspace_id=$1 and id=$2',tbl) using p_workspace,ident;
  row_data:=jsonb_build_object('id',ident,'deleted',true);
 end if;
 if tbl='subtasks' then update public.tasks set version=version+1,updated_at=clock_timestamp() where workspace_id=p_workspace and id=task_id;end if;
 return public.operation_entity(row_data);
end $$;
revoke all on function public.operation_graph(uuid,text,jsonb,bigint,jsonb) from public,anon,authenticated;

create function public.execute_operation(p_workspace_id uuid,p_operation text,p_command jsonb,p_idempotency_key text,p_expected_version bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 a jsonb; cached public.idempotency_requests; fp text; result jsonb; data jsonb; event uuid:=gen_random_uuid();
 t public.tasks; p public.projects; claim public.task_claims; ident text; next_id text; has_claim boolean; child record;
begin
 -- Authorization precedes validation, rate checks and idempotent replay. Membership row lock protects revocation races.
 a:=public.operation_authorize(p_workspace_id,true);
 perform public.operation_rate_limit(a);
 perform public.operation_validate(p_operation,p_command);
 if p_idempotency_key is null or length(p_idempotency_key) not between 1 and 200 or (p_expected_version is not null and p_expected_version<1) then raise exception 'validation_error' using errcode='PT422';end if;
 -- Workspace mutex also serializes project numbering, graph writes and idempotency-key races.
 perform 1 from public.workspaces where id=p_workspace_id for update;
 fp:=encode(sha256(convert_to(jsonb_build_object('input',p_command,'expectedVersion',p_expected_version)::text,'UTF8')),'hex');
 select * into cached from public.idempotency_requests where workspace_id=p_workspace_id and actor_user_id=(a->>'userId')::uuid and actor_client_id=coalesce(a->>'clientId','') and actor_connection_id=coalesce(a->>'connectionId','') and operation=p_operation and key=p_idempotency_key;
 if found then
  if cached.fingerprint<>fp then raise exception 'idempotency_conflict' using errcode='PT409';end if;
  return cached.result;
 end if;
 ident:=p_command->>'id';
 if p_operation in ('update_task','delete_task','archive_task','restore_task','move_task','duplicate_task','claim_task','renew_task_claim','release_task_claim','complete_task','intervene_task','set_task_dependency','remove_task_dependency','set_task_label','remove_task_label','set_task_attachment','remove_task_attachment') then
  select * into t from public.tasks where workspace_id=p_workspace_id and id=ident for update;
  if not found then raise exception 'not_found' using errcode='PT404';end if;
  if p_expected_version is null or p_expected_version<>t.version then raise exception 'version_conflict' using errcode='PT409';end if;
  select * into claim from public.task_claims where workspace_id=p_workspace_id and task_id=ident;
  has_claim:=found and claim.expires_at>clock_timestamp();
  if a->>'agentId' is not null and p_operation not in ('claim_task','intervene_task') then
   perform public.operation_assert_claim(p_workspace_id,ident,a,p_command->>'claimToken');
  end if;
  if a->>'agentId' is null and has_claim and p_operation in ('complete_task','delete_task','move_task') then raise exception 'already_claimed' using errcode='PT409';end if;
 end if;
 case p_operation
 when 'create_task' then
  ident:=coalesce(ident,gen_random_uuid()::text);
  insert into public.tasks(workspace_id,id,project_id,key,title,description,status,priority,assignee_user_id,recurrence,due_date,start_date,sort_order,legacy_metadata)
  values(p_workspace_id,ident,p_command->>'projectId',public.operation_next_task_key(p_workspace_id,p_command->>'projectId'),p_command->>'title',coalesce(p_command->>'description',''),coalesce(p_command->>'status','todo'),coalesce(p_command->>'priority','none'),(p_command->>'assigneeUserId')::uuid,p_command->>'recurrence',(p_command->>'dueDate')::date,(p_command->>'startDate')::date,coalesce((p_command->>'sortOrder')::numeric,0),coalesce(p_command->'attributes','{}')) returning public.operation_entity(to_jsonb(tasks.*)) into data;
 when 'update_task','move_task','archive_task','restore_task' then
  update public.tasks set
   project_id=case when p_operation='move_task' then p_command->>'projectId' else project_id end,
   key=case when p_operation='move_task' and p_command->>'projectId'<>project_id then public.operation_next_task_key(p_workspace_id,p_command->>'projectId') else key end,
   legacy_metadata=legacy_metadata||coalesce(p_command->'attributes','{}'),title=coalesce(p_command->>'title',title),description=coalesce(p_command->>'description',description),status=coalesce(p_command->>'status',status),priority=coalesce(p_command->>'priority',priority),
   assignee_user_id=case when p_command?'assigneeUserId' then (p_command->>'assigneeUserId')::uuid else assignee_user_id end,
   recurrence=case when p_command?'recurrence' then p_command->>'recurrence' else recurrence end,
   due_date=case when p_command?'dueDate' then (p_command->>'dueDate')::date else due_date end,
   start_date=case when p_command?'startDate' then (p_command->>'startDate')::date else start_date end,
   sort_order=coalesce((p_command->>'sortOrder')::numeric,sort_order),
   archived=case when p_operation='archive_task' then true when p_operation='restore_task' then false else archived end,
   archived_at=case when p_operation='archive_task' then clock_timestamp() when p_operation='restore_task' then null else archived_at end,
   version=version+1,updated_at=clock_timestamp() where workspace_id=p_workspace_id and id=ident returning public.operation_entity(to_jsonb(tasks.*)) into data;
 when 'duplicate_task' then
  next_id:=gen_random_uuid()::text;
  insert into public.tasks(workspace_id,id,project_id,key,title,description,status,priority,assignee_user_id,recurrence,due_date,start_date,sort_order,legacy_metadata)
  values(p_workspace_id,next_id,coalesce(p_command->>'projectId',t.project_id),public.operation_next_task_key(p_workspace_id,coalesce(p_command->>'projectId',t.project_id)),coalesce(p_command->>'title',t.title),t.description,'todo',t.priority,t.assignee_user_id,t.recurrence,t.due_date,t.start_date,t.sort_order,t.legacy_metadata) returning public.operation_entity(to_jsonb(tasks.*)) into data;
  insert into public.subtasks(workspace_id,task_id,title,sort_order) select workspace_id,next_id,title,sort_order from public.subtasks where workspace_id=p_workspace_id and task_id=ident;
  insert into public.task_labels select workspace_id,next_id,label_id from public.task_labels where workspace_id=p_workspace_id and task_id=ident;
  ident:=next_id;
 when 'claim_task' then
  if a->>'agentId' is null then raise exception 'forbidden' using errcode='PT403';end if;
  if has_claim then raise exception 'already_claimed' using errcode='PT409';end if;
  if t.status='done' or t.archived then raise exception 'validation_error' using errcode='PT422';end if;
  insert into public.task_claims(workspace_id,task_id,agent_id) values(p_workspace_id,ident,a->>'agentId')
  on conflict(workspace_id,task_id) do update set agent_id=excluded.agent_id,claim_token=gen_random_uuid(),claimed_at=clock_timestamp(),expires_at=clock_timestamp()+interval '15 minutes' returning * into claim;
  update public.tasks set executor_agent_id=a->>'agentId',version=version+1,updated_at=clock_timestamp() where workspace_id=p_workspace_id and id=ident returning * into t;
  data:=jsonb_build_object('task',public.operation_entity(to_jsonb(t)),'claimToken',claim.claim_token,'claimedAt',claim.claimed_at,'expiresAt',claim.expires_at);
 when 'renew_task_claim','release_task_claim' then
  perform public.operation_assert_claim(p_workspace_id,ident,a,p_command->>'claimToken');
  if p_operation='renew_task_claim' then update public.task_claims set expires_at=clock_timestamp()+interval '15 minutes' where workspace_id=p_workspace_id and task_id=ident returning * into claim;
  else delete from public.task_claims where workspace_id=p_workspace_id and task_id=ident;end if;
  update public.tasks set executor_agent_id=case when p_operation='release_task_claim' then null else executor_agent_id end,version=version+1,updated_at=clock_timestamp() where workspace_id=p_workspace_id and id=ident returning * into t;
  data:=jsonb_build_object('task',public.operation_entity(to_jsonb(t)),'expiresAt',case when p_operation='renew_task_claim' then claim.expires_at else null end);
 when 'complete_task','intervene_task' then
  if p_operation='intervene_task' then
   if a->>'agentId' is not null or a->>'clientId' is not null then raise exception 'forbidden' using errcode='PT403';end if;
   delete from public.task_claims where workspace_id=p_workspace_id and task_id=ident;
   if p_command->>'action'='delete' then perform public.operation_delete_task(p_workspace_id,ident);data:=jsonb_build_object('id',ident,'deleted',true);
   elsif p_command->>'action' in ('release','reassign') then
    update public.tasks set executor_agent_id=case when p_command->>'action'='reassign' then p_command->>'executorAgentId' else null end,version=version+1,updated_at=clock_timestamp() where workspace_id=p_workspace_id and id=ident returning public.operation_entity(to_jsonb(tasks.*)) into data;
   end if;
  end if;
  if p_operation='complete_task' or p_command->>'action'='complete' then
   if t.status='done' then raise exception 'validation_error' using errcode='PT422';end if;
   delete from public.task_claims where workspace_id=p_workspace_id and task_id=ident;
   update public.tasks set status='done',completed_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where workspace_id=p_workspace_id and id=ident returning public.operation_entity(to_jsonb(tasks.*)) into data;
   if t.recurrence is not null then
    next_id:=gen_random_uuid()::text;
    insert into public.tasks(workspace_id,id,project_id,key,title,description,status,priority,assignee_user_id,recurrence,due_date,start_date,sort_order,legacy_metadata)
    values(p_workspace_id,next_id,t.project_id,public.operation_next_task_key(p_workspace_id,t.project_id),t.title,t.description,'todo',t.priority,t.assignee_user_id,t.recurrence,coalesce(t.due_date,current_date)+case t.recurrence when 'Daily' then interval '1 day' when 'Weekly' then interval '7 days' when 'Every 2 weeks' then interval '14 days' else interval '1 month' end,null,t.sort_order,t.legacy_metadata);
    insert into public.subtasks(workspace_id,task_id,title,sort_order) select workspace_id,next_id,title,sort_order from public.subtasks where workspace_id=p_workspace_id and task_id=ident;
    insert into public.task_labels select workspace_id,next_id,label_id from public.task_labels where workspace_id=p_workspace_id and task_id=ident;
   end if;
  end if;
 when 'delete_task' then perform public.operation_delete_task(p_workspace_id,ident);data:=jsonb_build_object('id',ident,'deleted',true);
 when 'add_task_comment' then
  ident:=coalesce(ident,gen_random_uuid()::text);
  insert into public.comments(workspace_id,id,task_id,author_user_id,body) values(p_workspace_id,ident,p_command->>'taskId',(a->>'userId')::uuid,p_command->>'body') returning public.operation_entity(to_jsonb(comments.*)) into data;
 when 'create_project' then
  ident:=coalesce(ident,gen_random_uuid()::text);
  insert into public.projects(workspace_id,id,key,name,description,status,team_id,lead_user_id,due_date,start_date,sort_order,legacy_metadata)
  values(p_workspace_id,ident,coalesce(p_command->>'key','P'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),p_command->>'name',coalesce(p_command->>'description',''),coalesce(p_command->>'status','planning'),p_command->>'teamId',(p_command->>'leadUserId')::uuid,(p_command->>'dueDate')::date,(p_command->>'startDate')::date,coalesce((p_command->>'sortOrder')::numeric,0),coalesce(p_command->'attributes','{}')) returning public.operation_entity(to_jsonb(projects.*)) into data;
 when 'update_project','delete_project','archive_project','restore_project','set_project_member','remove_project_member' then
  select * into p from public.projects where workspace_id=p_workspace_id and id=ident for update;
  if not found then raise exception 'not_found' using errcode='PT404';end if;
  if p_expected_version is null or p_expected_version<>p.version then raise exception 'version_conflict' using errcode='PT409';end if;
  if p_operation='delete_project' then
   if exists(select 1 from public.task_claims c join public.tasks t on t.workspace_id=c.workspace_id and t.id=c.task_id where t.workspace_id=p_workspace_id and t.project_id=ident and c.expires_at>clock_timestamp()) then raise exception 'already_claimed' using errcode='PT409';end if;
   if a->>'agentId' is not null and exists(select 1 from public.tasks where workspace_id=p_workspace_id and project_id=ident) then raise exception 'forbidden' using errcode='PT403';end if;
   for child in select id from public.tasks where workspace_id=p_workspace_id and project_id=ident loop perform public.operation_delete_task(p_workspace_id,child.id);end loop;
   delete from public.files where workspace_id=p_workspace_id and project_id=ident;
   delete from public.calendar_events where workspace_id=p_workspace_id and project_id=ident;
   delete from public.saved_views where workspace_id=p_workspace_id and project_id=ident;
   delete from public.activity_entries where workspace_id=p_workspace_id and project_id=ident;
   delete from public.notifications where workspace_id=p_workspace_id and project_id=ident;
   delete from public.projects where workspace_id=p_workspace_id and id=ident;
   data:=jsonb_build_object('id',ident,'deleted',true);
  else
   if p_operation in ('set_project_member','remove_project_member') then
    if p_operation='set_project_member' then insert into public.project_members values(p_workspace_id,ident,(p_command->>'userId')::uuid) on conflict do nothing;else delete from public.project_members where workspace_id=p_workspace_id and project_id=ident and user_id=(p_command->>'userId')::uuid;end if;
   end if;
   update public.projects set legacy_metadata=legacy_metadata||coalesce(p_command->'attributes','{}'),name=coalesce(p_command->>'name',name),key=coalesce(p_command->>'key',key),description=coalesce(p_command->>'description',description),status=coalesce(p_command->>'status',status),team_id=case when p_command?'teamId' then p_command->>'teamId' else team_id end,lead_user_id=case when p_command?'leadUserId' then (p_command->>'leadUserId')::uuid else lead_user_id end,due_date=case when p_command?'dueDate' then (p_command->>'dueDate')::date else due_date end,start_date=case when p_command?'startDate' then (p_command->>'startDate')::date else start_date end,sort_order=coalesce((p_command->>'sortOrder')::numeric,sort_order),archived=case when p_operation='archive_project' then true when p_operation='restore_project' then false else coalesce((p_command->>'archived')::boolean,archived) end,version=version+1 where workspace_id=p_workspace_id and id=ident returning public.operation_entity(to_jsonb(projects.*)) into data;
  end if;
 when 'set_task_dependency','remove_task_dependency','set_task_label','remove_task_label','set_task_attachment','remove_task_attachment' then
  if p_operation='set_task_dependency' then
   -- Reject cycles in addition to the table's self-dependency constraint.
   if exists(with recursive chain(id) as(select p_command->>'dependsOnTaskId' union select d.depends_on_task_id from public.task_dependencies d join chain c on d.task_id=c.id where d.workspace_id=p_workspace_id) select 1 from chain where id=ident) then raise exception 'validation_error' using errcode='PT422';end if;
   insert into public.task_dependencies values(p_workspace_id,ident,p_command->>'dependsOnTaskId') on conflict do nothing;
  elsif p_operation='remove_task_dependency' then delete from public.task_dependencies where workspace_id=p_workspace_id and task_id=ident and depends_on_task_id=p_command->>'dependsOnTaskId';
  elsif p_operation='set_task_label' then insert into public.task_labels values(p_workspace_id,ident,p_command->>'labelId') on conflict do nothing;
  elsif p_operation='remove_task_label' then delete from public.task_labels where workspace_id=p_workspace_id and task_id=ident and label_id=p_command->>'labelId';
  elsif p_operation='set_task_attachment' then insert into public.task_attachments values(p_workspace_id,ident,p_command->>'fileId',coalesce((p_command->>'sortOrder')::integer,0),'{}') on conflict(workspace_id,task_id,file_id) do update set sort_order=excluded.sort_order;
  else delete from public.task_attachments where workspace_id=p_workspace_id and task_id=ident and file_id=p_command->>'fileId';end if;
  update public.tasks set version=version+1,updated_at=clock_timestamp() where workspace_id=p_workspace_id and id=ident returning public.operation_entity(to_jsonb(tasks.*)) into data;
 when 'set_team_member','remove_team_member' then
  select to_jsonb(x) into data from public.teams x where workspace_id=p_workspace_id and id=ident for update;
  if data is null then raise exception 'not_found' using errcode='PT404';end if;
  if p_expected_version is null or p_expected_version<>(data->>'version')::bigint then raise exception 'version_conflict' using errcode='PT409';end if;
  if p_operation='set_team_member' then insert into public.team_members values(p_workspace_id,ident,(p_command->>'userId')::uuid) on conflict do nothing;else delete from public.team_members where workspace_id=p_workspace_id and team_id=ident and user_id=(p_command->>'userId')::uuid;end if;
  update public.teams set version=version+1 where workspace_id=p_workspace_id and id=ident returning public.operation_entity(to_jsonb(teams.*)) into data;
 when 'add_reaction','remove_reaction' then
  if not exists(select 1 from public.comments where workspace_id=p_workspace_id and id=p_command->>'commentId') then raise exception 'not_found' using errcode='PT404';end if;
  if p_operation='add_reaction' then insert into public.comment_reactions values(p_workspace_id,p_command->>'commentId',p_command->>'reaction',a->>'userId',(a->>'userId')::uuid) on conflict do nothing;
  else delete from public.comment_reactions where workspace_id=p_workspace_id and comment_id=p_command->>'commentId' and reaction=p_command->>'reaction' and user_id=(a->>'userId')::uuid;end if;
  data:=jsonb_build_object('commentId',p_command->>'commentId','reaction',p_command->>'reaction','userId',a->>'userId');
 when 'set_preferences' then
  insert into public.user_preferences(workspace_id,user_id,preferences) values(p_workspace_id,(a->>'userId')::uuid,p_command->'preferences') on conflict(workspace_id,user_id) do update set preferences=public.user_preferences.preferences||excluded.preferences returning public.operation_entity(to_jsonb(user_preferences.*)) into data;
 else data:=public.operation_graph(p_workspace_id,p_operation,p_command,p_expected_version,a);ident:=data->>'id';
 end case;
 -- The audit is the durable outbox. Claim credentials are excluded from every event.
 insert into public.domain_events(id,workspace_id,operation,entity_id,actor_user_id,actor_client_id,actor_connection_id,actor_agent_id,payload)
 values(event,p_workspace_id,p_operation,ident,(a->>'userId')::uuid,a->>'clientId',a->>'connectionId',a->>'agentId',jsonb_build_object('id',ident,'taskId',coalesce(p_command->>'taskId',t.id),'projectId',coalesce(p_command->>'projectId',t.project_id,p.id),'version',coalesce(data->'version',data->'task'->'version'),'status',coalesce(data->'status',data->'task'->'status')));
 result:=jsonb_build_object('data',data,'eventId',event);
 insert into public.idempotency_requests(workspace_id,actor_user_id,actor_client_id,actor_connection_id,operation,key,fingerprint,result)
 values(p_workspace_id,(a->>'userId')::uuid,coalesce(a->>'clientId',''),coalesce(a->>'connectionId',''),p_operation,p_idempotency_key,fp,result);
 return result;
exception
 when foreign_key_violation or check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range or unique_violation then
  raise exception 'validation_error' using errcode='PT422';
end $$;
revoke all on function public.execute_operation(uuid,text,jsonb,text,bigint) from public,anon;
grant execute on function public.execute_operation(uuid,text,jsonb,text,bigint) to authenticated;

create function public.read_operation(p_workspace_id uuid,p_operation text,p_query jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare a jsonb; lim integer:=50; cursor text; tbl text; rows jsonb; row_data jsonb; out_rows jsonb:='[]'; next_cursor text; r record; key_expr text;
begin
 if auth.uid() is null then raise exception 'unauthorized' using errcode='PT401';end if;
 if jsonb_typeof(p_query) is distinct from 'object' or pg_column_size(p_query)>4096 or exists(select 1 from jsonb_object_keys(p_query) x where x not in ('id','projectId','taskId','status','limit','cursor')) then raise exception 'validation_error' using errcode='PT422';end if;
 if p_query?'limit' then
  if jsonb_typeof(p_query->'limit')<>'number' or p_query->>'limit'!~'^[0-9]+$' then raise exception 'validation_error' using errcode='PT422';end if;
  lim:=(p_query->>'limit')::integer;
 end if;
 if lim not between 1 and 100 then raise exception 'validation_error' using errcode='PT422';end if;
 for r in select key,value from jsonb_each(p_query-'limit') loop
  if jsonb_typeof(r.value)<>'string' or length(r.value#>>'{}')>1024 then raise exception 'validation_error' using errcode='PT422';end if;
 end loop;
 cursor:=p_query->>'cursor';
 if p_operation='list_workspaces' then
  perform public.operation_rate_limit(jsonb_build_object('userId',auth.uid(),'clientId',coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'client_id',nullif(current_setting('request.jwt.claim.client_id',true),''))));
  for r in select w.id,w.name,w.slug,w.color,w.storage_version,m.role from public.workspaces w join public.workspace_memberships m on m.workspace_id=w.id and m.user_id=auth.uid() where (cursor is null or w.id::text>cursor) order by w.id::text loop
   if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'client_id',nullif(current_setting('request.jwt.claim.client_id',true),'')) is null then a:=jsonb_build_object('role',r.role);else begin a:=public.operation_authorize(r.id,false);exception when sqlstate 'PT403' then continue;end;end if;
   if jsonb_array_length(out_rows)=lim then next_cursor:=out_rows->(lim-1)->>'id';exit;end if;
   out_rows:=out_rows||jsonb_build_array(jsonb_build_object('id',r.id,'name',r.name,'slug',r.slug,'color',r.color,'storageVersion',r.storage_version,'role',a->>'role'));
  end loop;
  return jsonb_build_object('items',out_rows,'nextCursor',next_cursor);
 end if;
 a:=public.operation_authorize(p_workspace_id,false);
 perform public.operation_rate_limit(a);
 if p_operation='get_workspace' then
  select jsonb_build_object('id',id,'name',name,'slug',slug,'color',color,'storageVersion',storage_version,'role',a->>'role') into row_data from public.workspaces where id=p_workspace_id;
  return jsonb_build_object('data',row_data);
 elsif p_operation='get_preferences' then
  select public.operation_entity(to_jsonb(t)) into row_data from public.user_preferences t where workspace_id=p_workspace_id and user_id=auth.uid();
  return jsonb_build_object('data',row_data);
 elsif p_operation='get_task' then
  if not p_query?'id' then raise exception 'validation_error' using errcode='PT422';end if;
  select public.operation_entity(to_jsonb(t)) into row_data from public.tasks t where workspace_id=p_workspace_id and id=p_query->>'id';
  if row_data is null then raise exception 'not_found' using errcode='PT404';end if;
  return jsonb_build_object('data',row_data);
 elsif p_operation='list_task_activity' then
  if not p_query?'taskId' then raise exception 'validation_error' using errcode='PT422';end if;
  select coalesce(jsonb_agg(x.item order by x.key),'[]') into rows from (
   select jsonb_build_array(created_at,id)::text key,public.operation_entity(to_jsonb(t))||jsonb_build_object('_cursor',jsonb_build_array(created_at,id)::text) item from public.domain_events t where workspace_id=p_workspace_id and (entity_id=p_query->>'taskId' or payload->>'taskId'=p_query->>'taskId' or payload->'task'->>'id'=p_query->>'taskId') and (cursor is null or jsonb_build_array(created_at,id)::text>cursor) order by jsonb_build_array(created_at,id)::text limit lim+1
  ) x;
 else
  tbl:=case p_operation when 'list_projects' then 'projects' when 'list_tasks' then 'tasks' when 'list_subtasks' then 'subtasks' when 'list_comments' then 'comments' when 'list_teams' then 'teams' when 'list_labels' then 'labels' when 'list_files' then 'files' when 'list_calendar_events' then 'calendar_events' when 'list_views' then 'saved_views' when 'list_agents' then 'agents' when 'list_notifications' then 'notifications' when 'list_activity' then 'activity_entries' when 'list_domain_events' then 'domain_events' when 'list_dependencies' then 'task_dependencies' when 'list_task_labels' then 'task_labels' when 'list_reactions' then 'comment_reactions' when 'list_team_members' then 'team_members' when 'list_project_members' then 'project_members' when 'list_members' then 'workspace_memberships' when 'list_attachments' then 'task_attachments' else null end;
  if tbl is null then raise exception 'validation_error' using errcode='PT422';end if;
  key_expr:=case tbl when 'task_dependencies' then 'jsonb_build_array(t.task_id,t.depends_on_task_id)::text' when 'task_labels' then 'jsonb_build_array(t.task_id,t.label_id)::text' when 'task_attachments' then 'jsonb_build_array(t.task_id,t.file_id)::text' when 'comment_reactions' then 'jsonb_build_array(t.comment_id,t.reaction,t.legacy_user_id)::text' when 'team_members' then 'jsonb_build_array(t.team_id,t.user_id)::text' when 'project_members' then 'jsonb_build_array(t.project_id,t.user_id)::text' when 'workspace_memberships' then 't.user_id::text' when 'domain_events' then 'jsonb_build_array(t.created_at,t.id)::text' else 't.id' end;
  execute format('select coalesce(jsonb_agg(x.item order by x.key),''[]'') from (select %s as key,public.operation_entity(to_jsonb(t))||jsonb_build_object(''_cursor'',%s) item from public.%I t where t.workspace_id=$1 and ($2 is null or %s>$2) and ($3 is null or to_jsonb(t)->>''project_id''=$3) and ($4 is null or to_jsonb(t)->>''task_id''=$4) and ($5 is null or to_jsonb(t)->>''status''=$5) order by %s limit $6) x',key_expr,key_expr,tbl,key_expr,key_expr)
  into rows using p_workspace_id,cursor,p_query->>'projectId',p_query->>'taskId',p_query->>'status',lim+1;
 end if;
 if jsonb_array_length(rows)>lim then next_cursor:=coalesce(rows->(lim-1)->>'_cursor',rows->(lim-1)->>'id');end if;
 select coalesce(jsonb_agg(value-'_cursor' order by ord),'[]') into out_rows from jsonb_array_elements(rows) with ordinality x(value,ord) where ord<=lim;
 return jsonb_build_object('items',out_rows,'nextCursor',next_cursor);
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'validation_error' using errcode='PT422';
end $$;
revoke all on function public.read_operation(uuid,text,jsonb) from public,anon;
grant execute on function public.read_operation(uuid,text,jsonb) to authenticated;

-- Empty normalized workspaces are created without giving OAuth access to legacy create/export RPCs.
create function public.create_workspace_v2(p_name text,p_slug text,p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); w uuid; ev uuid:=gen_random_uuid(); old public.idempotency_requests; fp text;
begin
 if uid is null then raise exception 'unauthorized' using errcode='PT401';end if;
 if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'client_id',nullif(current_setting('request.jwt.claim.client_id',true),'')) is not null then raise exception 'forbidden' using errcode='PT403';end if;
 if length(btrim(p_name)) not between 1 and 120 or p_name is null or p_slug is null or length(p_slug) not between 1 and 120 or p_slug!~'^[a-z0-9][a-z0-9-]*$' or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 200 then raise exception 'validation_error' using errcode='PT422';end if;
 perform public.operation_rate_limit(jsonb_build_object('userId',uid));
 -- A user-row lock serializes workspace-creation retries before any workspace exists.
 perform 1 from auth.users where id=uid for update;
 fp:=encode(sha256(convert_to(jsonb_build_array(p_name,p_slug)::text,'UTF8')),'hex');
 select i.* into old from public.idempotency_requests i where actor_user_id=uid and operation='create_workspace' and key=p_idempotency_key;
 if found then
  perform public.operation_authorize(old.workspace_id,true);
  if old.fingerprint<>fp then raise exception 'idempotency_conflict' using errcode='PT409';end if;
  return old.result;
 end if;
 insert into public.workspaces(name,slug,created_by,storage_version) values(p_name,p_slug,uid,2) returning id into w;
 insert into public.workspace_memberships values(w,uid,'owner');
 insert into public.domain_events(id,workspace_id,operation,entity_id,actor_user_id,payload) values(ev,w,'create_workspace',w::text,uid,jsonb_build_object('id',w,'name',p_name,'slug',p_slug));
 insert into public.idempotency_requests(workspace_id,actor_user_id,actor_client_id,actor_connection_id,operation,key,fingerprint,result) values(w,uid,'','','create_workspace',p_idempotency_key,fp,jsonb_build_object('data',jsonb_build_object('id',w,'name',p_name,'slug',p_slug,'storageVersion',2),'eventId',ev)) returning result into old.result;
 return old.result;
end $$;
revoke all on function public.create_workspace_v2(text,text,text) from public,anon;
grant execute on function public.create_workspace_v2(text,text,text) to authenticated;
