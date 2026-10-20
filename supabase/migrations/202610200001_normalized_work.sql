-- Additive cutover. Nothing changes storage mode until an administrator invokes migrate_workspace.
alter table public.workspaces add column storage_version integer not null default 1 check (storage_version in (1,2));

create function public.valid_legacy_metadata(value jsonb) returns boolean
language sql immutable set search_path = '' as $$
  with recursive nodes(value, depth) as (
    select value, 0
    union all
    select child.value, n.depth+1 from nodes n cross join lateral (
      select a.value from jsonb_array_elements(case when jsonb_typeof(n.value)='array' then n.value else '[]'::jsonb end) a
      union all
      select o.value from jsonb_each(case when jsonb_typeof(n.value)='object' then n.value else '{}'::jsonb end) o
    ) child where n.depth <= 20
  ) select jsonb_typeof(value)='object' and pg_column_size(value)<=5242880
    and not exists(select 1 from nodes where depth>20 or
      (jsonb_typeof(nodes.value)='object' and nodes.value ?| array['__proto__','constructor','prototype']))
$$;

alter table public.workspaces add column legacy_metadata jsonb not null default '{}' check(public.valid_legacy_metadata(legacy_metadata));

-- OAuth fails closed until integration grants replace this helper in the OAuth migration.
create function public.normalized_workspace_role(p_workspace_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select public.workspace_role(p_workspace_id)
  where nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'client_id' is null
    and nullif(current_setting('request.jwt.claim.client_id',true),'') is null
$$;
revoke all on function public.normalized_workspace_role(uuid) from public, anon;
grant execute on function public.normalized_workspace_role(uuid) to authenticated;

-- These rows can only be supplied by a trusted DBA after verifying export ownership.
-- Snapshot JSON (including me, by, owner) is never proof of personal ownership.
create table public.snapshot_personal_provenance (
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 snapshot_revision integer not null check(snapshot_revision>=0),
 user_id uuid not null,
 foreign key(workspace_id,user_id) references public.workspace_memberships(workspace_id,user_id)
);
alter table public.snapshot_personal_provenance enable row level security;
revoke all on public.snapshot_personal_provenance from public, anon, authenticated;

create table public.workspace_migrations (
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 snapshot_revision integer not null,
 migrated_by uuid not null references auth.users(id),
 migrated_at timestamptz not null default now(),
 diagnostics jsonb not null check(public.valid_legacy_metadata(diagnostics))
);

create table public.teams (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 id text not null default gen_random_uuid()::text check(length(id) between 1 and 128),
 name text not null, description text not null default '',
 legacy_metadata jsonb not null default '{}' check(public.valid_legacy_metadata(legacy_metadata)),
 primary key(workspace_id,id)
);

create table public.projects (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 id text not null default gen_random_uuid()::text check(length(id) between 1 and 128),
 key text, name text not null, description text not null default '',
 status text not null default 'planning' check(status in ('planning','active','risk','hold','complete')),
 team_id text, lead_user_id uuid, due_date date, start_date date, sort_order numeric not null default 0,
 archived boolean not null default false, version bigint not null default 1 check(version>0),
 foreign key(workspace_id,team_id) references public.teams(workspace_id,id),
 foreign key(workspace_id,lead_user_id) references public.workspace_memberships(workspace_id,user_id) on delete set null (lead_user_id),
 legacy_metadata jsonb not null default '{}' check(public.valid_legacy_metadata(legacy_metadata)),
 primary key(workspace_id,id)
);

create table public.agents (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 id text not null default gen_random_uuid()::text check(length(id) between 1 and 128),
 name text not null, auth_user_id uuid, client_id text,
 version bigint not null default 1 check(version>0), created_at timestamptz not null default now(),
 foreign key(workspace_id,auth_user_id) references public.workspace_memberships(workspace_id,user_id) on delete cascade,
 legacy_metadata jsonb not null default '{}' check(public.valid_legacy_metadata(legacy_metadata)),
 primary key(workspace_id,id)
);

create table public.tasks (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 id text not null default gen_random_uuid()::text check(length(id) between 1 and 128),
 project_id text not null, key text, title text not null, description text not null default '',
 status text not null default 'todo' check(status in ('backlog','todo','progress','review','done')),
 priority text not null default 'none' check(priority in ('none','low','medium','high','urgent')),
 version bigint not null default 1 check(version>0), assignee_user_id uuid, executor_agent_id text,
 recurrence text check(recurrence in ('Daily','Weekly','Every 2 weeks','Monthly')),
 due_date date, start_date date, sort_order numeric not null default 0, archived boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz, archived_at timestamptz,
 foreign key(workspace_id,project_id) references public.projects(workspace_id,id),
 foreign key(workspace_id,assignee_user_id) references public.workspace_memberships(workspace_id,user_id) on delete set null (assignee_user_id),
 foreign key(workspace_id,executor_agent_id) references public.agents(workspace_id,id),
 legacy_metadata jsonb not null default '{}' check(public.valid_legacy_metadata(legacy_metadata)),
 primary key(workspace_id,id)
);

create table public.subtasks (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 id text not null default gen_random_uuid()::text check(length(id) between 1 and 128),
 task_id text not null, title text not null, done boolean not null default false, sort_order numeric not null default 0,
 foreign key(workspace_id,task_id) references public.tasks(workspace_id,id) on delete cascade,
 legacy_metadata jsonb not null default '{}' check(public.valid_legacy_metadata(legacy_metadata)),
 primary key(workspace_id,id)
);

create table public.labels (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 id text not null default gen_random_uuid()::text check(length(id) between 1 and 128),
 name text not null,
 legacy_metadata jsonb not null default '{}' check(public.valid_legacy_metadata(legacy_metadata)),
 primary key(workspace_id,id)
);

create table public.comments (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 id text not null default gen_random_uuid()::text check(length(id) between 1 and 128),
 task_id text not null, author_user_id uuid, body text not null, created_at timestamptz not null default now(),
 foreign key(workspace_id,task_id) references public.tasks(workspace_id,id) on delete cascade,
 foreign key(workspace_id,author_user_id) references public.workspace_memberships(workspace_id,user_id) on delete set null (author_user_id),
 legacy_metadata jsonb not null default '{}' check(public.valid_legacy_metadata(legacy_metadata)),
 primary key(workspace_id,id)
);

create table public.files (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 id text not null default gen_random_uuid()::text check(length(id) between 1 and 128),
 project_id text, task_id text, name text not null, file_type text not null default 'other' check(file_type in ('fig','pdf','zip','img','sheet','doc','code','other')),
 size_label text, author_user_id uuid, created_at timestamptz not null default now(),
 foreign key(workspace_id,project_id) references public.projects(workspace_id,id),
 foreign key(workspace_id,task_id) references public.tasks(workspace_id,id) on delete cascade,
 foreign key(workspace_id,author_user_id) references public.workspace_memberships(workspace_id,user_id) on delete set null (author_user_id),
 legacy_metadata jsonb not null default '{}' check(public.valid_legacy_metadata(legacy_metadata)),
 primary key(workspace_id,id)
);

create table public.calendar_events (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 id text not null default gen_random_uuid()::text check(length(id) between 1 and 128),
 project_id text, task_id text, title text not null, event_date date, event_time time,
 foreign key(workspace_id,project_id) references public.projects(workspace_id,id),
 foreign key(workspace_id,task_id) references public.tasks(workspace_id,id),
 legacy_metadata jsonb not null default '{}' check(public.valid_legacy_metadata(legacy_metadata)),
 primary key(workspace_id,id)
);

create table public.saved_views (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 id text not null default gen_random_uuid()::text check(length(id) between 1 and 128),
 project_id text, name text not null, view_type text not null check(view_type in ('board','list','table','calendar','timeline','files','overview')),
 filters jsonb not null default '[]' check(jsonb_typeof(filters)='array'),
 foreign key(workspace_id,project_id) references public.projects(workspace_id,id),
 legacy_metadata jsonb not null default '{}' check(public.valid_legacy_metadata(legacy_metadata)),
 primary key(workspace_id,id)
);

create table public.activity_entries (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 id text not null default gen_random_uuid()::text check(length(id) between 1 and 128),
 project_id text, task_id text, actor_user_id uuid, verb text not null, created_at timestamptz not null default now(),
 foreign key(workspace_id,project_id) references public.projects(workspace_id,id),
 foreign key(workspace_id,task_id) references public.tasks(workspace_id,id),
 foreign key(workspace_id,actor_user_id) references public.workspace_memberships(workspace_id,user_id) on delete set null (actor_user_id),
 legacy_metadata jsonb not null default '{}' check(public.valid_legacy_metadata(legacy_metadata)),
 primary key(workspace_id,id)
);

create table public.notifications (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 id text not null default gen_random_uuid()::text check(length(id) between 1 and 128),
 project_id text, task_id text, author_user_id uuid, notification_type text not null default 'update',
 foreign key(workspace_id,project_id) references public.projects(workspace_id,id),
 foreign key(workspace_id,task_id) references public.tasks(workspace_id,id),
 foreign key(workspace_id,author_user_id) references public.workspace_memberships(workspace_id,user_id) on delete set null (author_user_id),
 legacy_metadata jsonb not null default '{}' check(public.valid_legacy_metadata(legacy_metadata)),
 primary key(workspace_id,id)
);

create table public.project_members (
 workspace_id uuid not null, project_id text not null, user_id uuid not null,
 primary key(workspace_id,project_id,user_id),
 foreign key(workspace_id,project_id) references public.projects(workspace_id,id) on delete cascade,
 foreign key(workspace_id,user_id) references public.workspace_memberships(workspace_id,user_id) on delete cascade
);
create table public.team_members (
 workspace_id uuid not null, team_id text not null, user_id uuid not null,
 primary key(workspace_id,team_id,user_id),
 foreign key(workspace_id,team_id) references public.teams(workspace_id,id) on delete cascade,
 foreign key(workspace_id,user_id) references public.workspace_memberships(workspace_id,user_id) on delete cascade
);
create table public.task_dependencies (
 workspace_id uuid not null, task_id text not null, depends_on_task_id text not null,
 primary key(workspace_id,task_id,depends_on_task_id), check(task_id<>depends_on_task_id),
 foreign key(workspace_id,task_id) references public.tasks(workspace_id,id) on delete cascade,
 foreign key(workspace_id,depends_on_task_id) references public.tasks(workspace_id,id) on delete cascade
);
create table public.task_labels (
 workspace_id uuid not null, task_id text not null, label_id text not null,
 primary key(workspace_id,task_id,label_id),
 foreign key(workspace_id,task_id) references public.tasks(workspace_id,id) on delete cascade,
 foreign key(workspace_id,label_id) references public.labels(workspace_id,id) on delete cascade
);
create table public.task_attachments (
 workspace_id uuid not null, task_id text not null, file_id text not null, sort_order integer not null,
 legacy_metadata jsonb not null check(public.valid_legacy_metadata(legacy_metadata)),
 primary key(workspace_id,task_id,file_id),
 foreign key(workspace_id,task_id) references public.tasks(workspace_id,id) on delete cascade,
 foreign key(workspace_id,file_id) references public.files(workspace_id,id) on delete cascade
);
-- legacy_user_id preserves reaction membership without manufacturing an Auth identity.
create table public.comment_reactions (
 workspace_id uuid not null, comment_id text not null, reaction text not null, legacy_user_id text not null, user_id uuid,
 primary key(workspace_id,comment_id,reaction,legacy_user_id),
 foreign key(workspace_id,comment_id) references public.comments(workspace_id,id) on delete cascade,
 foreign key(workspace_id,user_id) references public.workspace_memberships(workspace_id,user_id) on delete set null (user_id)
);
create table public.user_preferences (
 workspace_id uuid not null, user_id uuid not null,
 preferences jsonb not null default '{}' check(public.valid_legacy_metadata(preferences)),
 primary key(workspace_id,user_id),
 foreign key(workspace_id,user_id) references public.workspace_memberships(workspace_id,user_id) on delete cascade
);
create index projects_team_idx on public.projects(workspace_id,team_id);
create index tasks_project_order_idx on public.tasks(workspace_id,project_id,sort_order,id);
create index tasks_status_idx on public.tasks(workspace_id,status,id);
create index tasks_assignee_idx on public.tasks(workspace_id,assignee_user_id);
create index tasks_executor_idx on public.tasks(workspace_id,executor_agent_id);
create index subtasks_task_idx on public.subtasks(workspace_id,task_id,sort_order);
create index comments_task_idx on public.comments(workspace_id,task_id,created_at,id);
create index files_project_idx on public.files(workspace_id,project_id);
create index files_task_idx on public.files(workspace_id,task_id);
create index activity_task_idx on public.activity_entries(workspace_id,task_id,created_at,id);
create index dependencies_target_idx on public.task_dependencies(workspace_id,depends_on_task_id);

alter table public.teams enable row level security;
revoke all on public.teams from public, anon, authenticated;
grant select on public.teams to authenticated;
create policy normalized_read on public.teams for select to authenticated
 using (public.normalized_workspace_role(workspace_id) is not null);

alter table public.projects enable row level security;
revoke all on public.projects from public, anon, authenticated;
grant select on public.projects to authenticated;
create policy normalized_read on public.projects for select to authenticated
 using (public.normalized_workspace_role(workspace_id) is not null);

alter table public.agents enable row level security;
revoke all on public.agents from public, anon, authenticated;
grant select on public.agents to authenticated;
create policy normalized_read on public.agents for select to authenticated
 using (public.normalized_workspace_role(workspace_id) is not null);

alter table public.tasks enable row level security;
revoke all on public.tasks from public, anon, authenticated;
grant select on public.tasks to authenticated;
create policy normalized_read on public.tasks for select to authenticated
 using (public.normalized_workspace_role(workspace_id) is not null);

alter table public.subtasks enable row level security;
revoke all on public.subtasks from public, anon, authenticated;
grant select on public.subtasks to authenticated;
create policy normalized_read on public.subtasks for select to authenticated
 using (public.normalized_workspace_role(workspace_id) is not null);

alter table public.labels enable row level security;
revoke all on public.labels from public, anon, authenticated;
grant select on public.labels to authenticated;
create policy normalized_read on public.labels for select to authenticated
 using (public.normalized_workspace_role(workspace_id) is not null);

alter table public.comments enable row level security;
revoke all on public.comments from public, anon, authenticated;
grant select on public.comments to authenticated;
create policy normalized_read on public.comments for select to authenticated
 using (public.normalized_workspace_role(workspace_id) is not null);

alter table public.files enable row level security;
revoke all on public.files from public, anon, authenticated;
grant select on public.files to authenticated;
create policy normalized_read on public.files for select to authenticated
 using (public.normalized_workspace_role(workspace_id) is not null);

alter table public.calendar_events enable row level security;
revoke all on public.calendar_events from public, anon, authenticated;
grant select on public.calendar_events to authenticated;
create policy normalized_read on public.calendar_events for select to authenticated
 using (public.normalized_workspace_role(workspace_id) is not null);

alter table public.saved_views enable row level security;
revoke all on public.saved_views from public, anon, authenticated;
grant select on public.saved_views to authenticated;
create policy normalized_read on public.saved_views for select to authenticated
 using (public.normalized_workspace_role(workspace_id) is not null);

alter table public.activity_entries enable row level security;
revoke all on public.activity_entries from public, anon, authenticated;
grant select on public.activity_entries to authenticated;
create policy normalized_read on public.activity_entries for select to authenticated
 using (public.normalized_workspace_role(workspace_id) is not null);

alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
create policy normalized_read on public.notifications for select to authenticated
 using (public.normalized_workspace_role(workspace_id) is not null);

alter table public.project_members enable row level security;
revoke all on public.project_members from public, anon, authenticated;
grant select on public.project_members to authenticated;
create policy normalized_read on public.project_members for select to authenticated
 using (public.normalized_workspace_role(workspace_id) is not null);

alter table public.team_members enable row level security;
revoke all on public.team_members from public, anon, authenticated;
grant select on public.team_members to authenticated;
create policy normalized_read on public.team_members for select to authenticated
 using (public.normalized_workspace_role(workspace_id) is not null);

alter table public.task_dependencies enable row level security;
revoke all on public.task_dependencies from public, anon, authenticated;
grant select on public.task_dependencies to authenticated;
create policy normalized_read on public.task_dependencies for select to authenticated
 using (public.normalized_workspace_role(workspace_id) is not null);

alter table public.task_labels enable row level security;
revoke all on public.task_labels from public, anon, authenticated;
grant select on public.task_labels to authenticated;
create policy normalized_read on public.task_labels for select to authenticated
 using (public.normalized_workspace_role(workspace_id) is not null);

alter table public.task_attachments enable row level security;
revoke all on public.task_attachments from public, anon, authenticated;
grant select on public.task_attachments to authenticated;
create policy normalized_read on public.task_attachments for select to authenticated
 using (public.normalized_workspace_role(workspace_id) is not null);

alter table public.comment_reactions enable row level security;
revoke all on public.comment_reactions from public, anon, authenticated;
grant select on public.comment_reactions to authenticated;
create policy normalized_read on public.comment_reactions for select to authenticated
 using (public.normalized_workspace_role(workspace_id) is not null);

alter table public.user_preferences enable row level security;
revoke all on public.user_preferences from public, anon, authenticated;
grant select on public.user_preferences to authenticated;
create policy normalized_read on public.user_preferences for select to authenticated
 using (public.normalized_workspace_role(workspace_id) is not null and user_id = (select auth.uid()));

alter table public.workspace_migrations enable row level security;
revoke all on public.workspace_migrations from public, anon, authenticated;
grant select on public.workspace_migrations to authenticated;
create policy normalized_read on public.workspace_migrations for select to authenticated
 using (public.normalized_workspace_role(workspace_id) is not null);

-- No direct user DML: following migrations expose audited transactional RPCs.
create function public.legacy_member_id(p_workspace_id uuid,p_legacy_id text) returns uuid
language sql stable set search_path = '' as $$
 select user_id from public.workspace_memberships where workspace_id=p_workspace_id and user_id::text=p_legacy_id
$$;
revoke all on function public.legacy_member_id(uuid,text) from public, anon, authenticated;

create function public.freeze_legacy_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
declare storage integer;
begin
 select storage_version into storage from public.workspaces where id=old.workspace_id for update;
 if storage=2 then raise exception 'storage_migrated' using errcode='55000'; end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function public.freeze_legacy_snapshot() from public, anon, authenticated;
create trigger freeze_legacy_snapshot before update or delete on public.workspace_snapshots
 for each row execute function public.freeze_legacy_snapshot();

alter function public.save_workspace_snapshot(uuid,integer,jsonb) rename to save_workspace_snapshot_v1;
revoke all on function public.save_workspace_snapshot_v1(uuid,integer,jsonb) from public, anon, authenticated;
create function public.save_workspace_snapshot(p_workspace_id uuid,p_expected_revision integer,p_payload jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare storage integer;
begin
 if public.normalized_workspace_role(p_workspace_id) is null or public.normalized_workspace_role(p_workspace_id)='guest' then
  raise exception 'forbidden' using errcode='42501'; end if;
 -- Same first lock as the migrator, so a browser racing the cutover cannot commit afterward.
 select storage_version into storage from public.workspaces where id=p_workspace_id for update;
 if storage=2 then raise exception 'storage_migrated' using errcode='55000'; end if;
 return public.save_workspace_snapshot_v1(p_workspace_id,p_expected_revision,p_payload);
end $$;
revoke all on function public.save_workspace_snapshot(uuid,integer,jsonb) from public, anon;
grant execute on function public.save_workspace_snapshot(uuid,integer,jsonb) to authenticated;

create function public.legacy_array(value jsonb, field text) returns jsonb
language plpgsql immutable set search_path = '' as $$
begin
 if value->field is null or value->field='null'::jsonb then return '[]'::jsonb; end if;
 if jsonb_typeof(value->field)<>'array' then raise exception 'invalid_legacy_container' using errcode='22023'; end if;
 return value->field;
end $$;
revoke all on function public.legacy_array(jsonb,text) from public, anon, authenticated;

create function public.migrate_workspace(p_workspace_id uuid,p_expected_snapshot_revision integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 ws public.workspaces; snapshot public.workspace_snapshots; payload jsonb;
 record jsonb; child jsonb; reaction record; user_ref text; field text; collection text;
 ordinal bigint; uid uuid; provenance uuid; diagnostics jsonb; unresolved jsonb:='[]'; counts jsonb:='{}';
begin
 if public.normalized_workspace_role(p_workspace_id) not in ('owner','admin') or public.normalized_workspace_role(p_workspace_id) is null then
  raise exception 'forbidden' using errcode='42501'; end if;
 select * into ws from public.workspaces where id=p_workspace_id for update;
 if ws.storage_version=2 then
  return (select m.diagnostics from public.workspace_migrations m where m.workspace_id=p_workspace_id);
 end if;
 select * into snapshot from public.workspace_snapshots where workspace_id=p_workspace_id for update;
 if not found then raise exception 'snapshot_missing' using errcode='P0002'; end if;
 if snapshot.revision is distinct from p_expected_snapshot_revision then raise exception 'conflict' using errcode='40001'; end if;
 payload:=snapshot.payload;
 if not public.valid_legacy_metadata(payload) or jsonb_typeof(payload->'projects') is distinct from 'array'
   or jsonb_typeof(payload->'tasks') is distinct from 'array' then
  raise exception 'invalid_legacy_payload' using errcode='22023'; end if;
 -- Complete source objects are retained as validated metadata; unknown fields never disappear.
 foreach collection in array array['projects','tasks','teams','comments','files','events','savedViews','activity','notifs'] loop
  counts:=counts||jsonb_build_object(collection,jsonb_array_length(public.legacy_array(payload,collection)));
  for record in select value from jsonb_array_elements(public.legacy_array(payload,collection)) loop
   if not public.valid_legacy_metadata(record) or record->>'id' is null or record->>'id' !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$' then
    raise exception 'invalid_legacy_entity' using errcode='22023'; end if;
   foreach field in array array['assignee','by','lead'] loop
    user_ref:=record->>field;
    if nullif(user_ref,'') is not null and public.legacy_member_id(p_workspace_id,user_ref) is null then
     unresolved:=unresolved||jsonb_build_array(user_ref);
    end if;
   end loop;
   for user_ref in select jsonb_array_elements_text(public.legacy_array(record,'members')) loop
    if public.legacy_member_id(p_workspace_id,user_ref) is null then unresolved:=unresolved||jsonb_build_array(user_ref); end if;
   end loop;
  end loop;
 end loop;
 for record in select value from jsonb_array_elements(public.legacy_array(payload,'teams')) loop
  insert into public.teams(workspace_id,id,name,description,legacy_metadata)
   values(p_workspace_id,record->>'id',coalesce(record->>'name',''),coalesce(record->>'desc',''),record);
  for user_ref in select jsonb_array_elements_text(public.legacy_array(record,'members')) loop
   uid:=public.legacy_member_id(p_workspace_id,user_ref);
   if uid is not null then insert into public.team_members values(p_workspace_id,record->>'id',uid); end if;
  end loop;
 end loop;
 -- Cloud adapter stores team membership separately from authoritative Auth memberships.
 if payload ? 'memberTeams' and jsonb_typeof(payload->'memberTeams')<>'object' then raise exception 'invalid_member_teams' using errcode='22023'; end if;
 for user_ref,field in select key,value from jsonb_each_text(coalesce(payload->'memberTeams','{}')) loop
  if nullif(field,'') is not null then
   if not exists(select 1 from public.teams where workspace_id=p_workspace_id and id=field) then raise exception 'orphan_team' using errcode='23503'; end if;
   uid:=public.legacy_member_id(p_workspace_id,user_ref);
   if uid is null then unresolved:=unresolved||jsonb_build_array(user_ref);
   else insert into public.team_members values(p_workspace_id,field,uid) on conflict do nothing; end if;
  end if;
 end loop;
 for record,ordinal in select value, ordinality from jsonb_array_elements(payload->'projects') with ordinality loop
  if record->'private'='true'::jsonb then raise exception 'private_projects_unsupported' using errcode='22023'; end if;
  insert into public.projects(workspace_id,id,key,name,description,status,team_id,lead_user_id,due_date,start_date,sort_order,archived,legacy_metadata)
   values(p_workspace_id,record->>'id',record->>'key',coalesce(record->>'name',''),coalesce(record->>'desc',''),coalesce(record->>'status','planning'),
    nullif(record->>'team',''),public.legacy_member_id(p_workspace_id,record->>'lead'),nullif(record->>'due','')::date,nullif(record->>'start','')::date,
    ordinal,coalesce((record->>'archived')::boolean,false),record);
  for user_ref in select jsonb_array_elements_text(public.legacy_array(record,'members')) loop
   uid:=public.legacy_member_id(p_workspace_id,user_ref);
   if uid is not null then insert into public.project_members values(p_workspace_id,record->>'id',uid); end if;
  end loop;
 end loop;
 for child,ordinal in select value,ordinality from jsonb_array_elements(public.legacy_array(payload,'projOrder')) with ordinality loop
  update public.projects set sort_order=ordinal where workspace_id=p_workspace_id and id=child#>>'{}';
  if not found then raise exception 'orphan_project_order' using errcode='23503'; end if;
 end loop;
 for record,ordinal in select value,ordinality from jsonb_array_elements(payload->'tasks') with ordinality loop
  if record->>'prevStatus' is not null and record->>'prevStatus' not in ('backlog','todo','progress','review','done') then raise exception 'invalid_status' using errcode='22023'; end if;
  insert into public.tasks(workspace_id,id,project_id,key,title,description,status,priority,assignee_user_id,recurrence,due_date,start_date,
   sort_order,archived,created_at,updated_at,completed_at,archived_at,legacy_metadata)
  values(p_workspace_id,record->>'id',record->>'project',record->>'key',coalesce(record->>'title',''),coalesce(record->>'desc',''),
   coalesce(record->>'status','todo'),coalesce(record->>'priority','none'),public.legacy_member_id(p_workspace_id,record->>'assignee'),record->>'recur',
   nullif(record->>'due','')::date,nullif(record->>'start','')::date,coalesce((record->>'order')::numeric,ordinal),coalesce((record->>'archived')::boolean,false),
   coalesce(to_timestamp((record->>'created')::double precision/1000),snapshot.updated_at),
   coalesce(to_timestamp((record->>'updated')::double precision/1000),snapshot.updated_at),
   to_timestamp((record->>'completedAt')::double precision/1000),to_timestamp((record->>'archivedAt')::double precision/1000),record);
  for child,ordinal in select value,ordinality from jsonb_array_elements(public.legacy_array(record,'subtasks')) with ordinality loop
   if child->>'id' is null or child->>'id' !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$' then raise exception 'invalid_subtask' using errcode='22023'; end if;
   insert into public.subtasks(workspace_id,id,task_id,title,done,sort_order,legacy_metadata)
    values(p_workspace_id,child->>'id',record->>'id',coalesce(child->>'title',''),coalesce((child->>'done')::boolean,false),ordinal,child);
  end loop;
  for user_ref in select jsonb_array_elements_text(public.legacy_array(record,'labels')) loop
   if user_ref is null or user_ref !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$' then raise exception 'invalid_label' using errcode='22023'; end if;
   insert into public.labels(workspace_id,id,name) values(p_workspace_id,user_ref,user_ref) on conflict do nothing;
   insert into public.task_labels values(p_workspace_id,record->>'id',user_ref);
  end loop;
 end loop;
 for record in select value from jsonb_array_elements(payload->'tasks') loop
  for user_ref in select jsonb_array_elements_text(public.legacy_array(record,'deps')) loop
   insert into public.task_dependencies values(p_workspace_id,record->>'id',user_ref);
  end loop;
 end loop;
 for record in select value from jsonb_array_elements(public.legacy_array(payload,'comments')) loop
  insert into public.comments(workspace_id,id,task_id,author_user_id,body,created_at,legacy_metadata)
   values(p_workspace_id,record->>'id',record->>'task',public.legacy_member_id(p_workspace_id,record->>'by'),coalesce(record->>'text',''),coalesce(to_timestamp((record->>'at')::double precision/1000),snapshot.updated_at),record);
  if record ? 're' and jsonb_typeof(record->'re')<>'object' then raise exception 'invalid_reactions' using errcode='22023'; end if;
  for reaction in select key,value from jsonb_each(coalesce(record->'re','{}')) loop
   if jsonb_typeof(reaction.value)<>'array' then raise exception 'invalid_reactions' using errcode='22023'; end if;
   for user_ref in select jsonb_array_elements_text(reaction.value) loop
    if user_ref is null or user_ref !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$' then raise exception 'invalid_reaction_user' using errcode='22023'; end if;
    uid:=public.legacy_member_id(p_workspace_id,user_ref);
    if uid is null then unresolved:=unresolved||jsonb_build_array(user_ref); end if;
    insert into public.comment_reactions values(p_workspace_id,record->>'id',reaction.key,user_ref,uid);
   end loop;
  end loop;
 end loop;
 for record in select value from jsonb_array_elements(public.legacy_array(payload,'files')) loop
  insert into public.files(workspace_id,id,project_id,task_id,name,file_type,size_label,author_user_id,created_at,legacy_metadata)
   values(p_workspace_id,record->>'id',nullif(record->>'project',''),nullif(record->>'task',''),coalesce(record->>'name',''),coalesce(record->>'type','other'),record->>'size',public.legacy_member_id(p_workspace_id,record->>'by'),coalesce(to_timestamp((record->>'at')::double precision/1000),snapshot.updated_at),record);
 end loop;
 for record in select value from jsonb_array_elements(payload->'tasks') loop
  for child,ordinal in select value,ordinality from jsonb_array_elements(public.legacy_array(record,'attachments')) with ordinality loop
   if child->>'id' is null or child->>'id' !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$' then raise exception 'invalid_attachment' using errcode='22023'; end if;
   insert into public.files(workspace_id,id,project_id,task_id,name,file_type,size_label,author_user_id,created_at,legacy_metadata)
    values(p_workspace_id,child->>'id',record->>'project',record->>'id',coalesce(child->>'name',''),coalesce(child->>'type','other'),child->>'size',public.legacy_member_id(p_workspace_id,child->>'by'),coalesce(to_timestamp((child->>'at')::double precision/1000),snapshot.updated_at),child) on conflict do nothing;
   insert into public.task_attachments values(p_workspace_id,record->>'id',child->>'id',ordinal,child);
   if nullif(child->>'by','') is not null and public.legacy_member_id(p_workspace_id,child->>'by') is null then unresolved:=unresolved||jsonb_build_array(child->>'by'); end if;
  end loop;
 end loop;
 for record in select value from jsonb_array_elements(public.legacy_array(payload,'events')) loop
  insert into public.calendar_events(workspace_id,id,project_id,task_id,title,event_date,event_time,legacy_metadata)
   values(p_workspace_id,record->>'id',nullif(record->>'project',''),nullif(record->>'task',''),coalesce(record->>'title',''),nullif(record->>'date','')::date,nullif(record->>'time','')::time,record);
 end loop;
 for record in select value from jsonb_array_elements(public.legacy_array(payload,'savedViews')) loop
  insert into public.saved_views(workspace_id,id,project_id,name,view_type,filters,legacy_metadata)
   values(p_workspace_id,record->>'id',nullif(record->>'project',''),coalesce(record->>'name',''),coalesce(record->>'type','list'),public.legacy_array(record,'filters'),record);
 end loop;
 for record in select value from jsonb_array_elements(public.legacy_array(payload,'activity')) loop
  insert into public.activity_entries(workspace_id,id,project_id,task_id,actor_user_id,verb,created_at,legacy_metadata)
   values(p_workspace_id,record->>'id',nullif(record->>'project',''),nullif(record->>'task',''),public.legacy_member_id(p_workspace_id,record->>'by'),coalesce(record->>'verb',''),coalesce(to_timestamp((record->>'at')::double precision/1000),snapshot.updated_at),record);
 end loop;
 for record in select value from jsonb_array_elements(public.legacy_array(payload,'notifs')) loop
  insert into public.notifications(workspace_id,id,project_id,task_id,author_user_id,notification_type,legacy_metadata)
   values(p_workspace_id,record->>'id',nullif(record->>'project',''),nullif(record->>'task',''),public.legacy_member_id(p_workspace_id,record->>'by'),coalesce(record->>'type','update'),record-'read');
 end loop;
 select user_id into provenance from public.snapshot_personal_provenance where workspace_id=p_workspace_id and snapshot_revision=snapshot.revision;
 if provenance is not null then
  insert into public.user_preferences values(p_workspace_id,provenance,jsonb_build_object(
   'favoriteProjectIds',coalesce((select jsonb_agg(p->>'id') from jsonb_array_elements(payload->'projects') p where p->'fav'='true'::jsonb),'[]'),
   'favoriteTaskIds',coalesce((select jsonb_agg(t->>'id') from jsonb_array_elements(payload->'tasks') t where t->'fav'='true'::jsonb),'[]'),
   'notificationReadStates',coalesce((select jsonb_object_agg(n->>'id',n->'read') from jsonb_array_elements(public.legacy_array(payload,'notifs')) n where jsonb_typeof(n->'read')='boolean'),'{}')));
 end if;
 select coalesce(jsonb_agg(distinct u),'[]') into unresolved from jsonb_array_elements(unresolved) u;
 diagnostics:=jsonb_build_object('counts',counts,'unresolvedUsers',unresolved,'personalStateOwner',provenance,
  'personalState','snapshot_retained','sourceRevision',snapshot.revision);
 insert into public.workspace_migrations(workspace_id,snapshot_revision,migrated_by,diagnostics)
  values(p_workspace_id,snapshot.revision,auth.uid(),diagnostics);
 update public.workspaces set storage_version=2,legacy_metadata=payload-array['projects','tasks','teams','comments','files','events','savedViews','activity','notifs'] where id=p_workspace_id;
 return diagnostics;
end $$;
revoke all on function public.migrate_workspace(uuid,integer) from public, anon;
grant execute on function public.migrate_workspace(uuid,integer) to authenticated;
