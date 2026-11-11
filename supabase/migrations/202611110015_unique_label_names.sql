-- One label per name in a workspace, ignoring case and surrounding whitespace.
-- Concurrent create_label calls (agents or people) otherwise duplicate a tag such as `cockpit`.
-- A collision surfaces as unique_violation, which execute_operation already maps to validation_error (PT422).
begin;

-- Names are stored trimmed on every write path, so the stored value matches what uniqueness compares.
create function public.labels_trim_name() returns trigger
language plpgsql set search_path='' as $$
begin
 new.name:=btrim(new.name,E' \t\n\r\f');
 return new;
end $$;
revoke all on function public.labels_trim_name() from public,anon,authenticated;
create trigger labels_trim_name before insert or update of name on public.labels
 for each row execute function public.labels_trim_name();

-- Existing duplicates merge into the label with the lowest id; their task links move to it.
update public.labels set name=btrim(name,E' \t\n\r\f') where name<>btrim(name,E' \t\n\r\f');
create temporary table label_merges on commit drop as
 select workspace_id,id as loser,first_value(id) over w as survivor
 from public.labels
 window w as (partition by workspace_id,lower(name) order by id);
delete from label_merges where loser=survivor;
insert into public.task_labels(workspace_id,task_id,label_id)
 select t.workspace_id,t.task_id,m.survivor from public.task_labels t
 join label_merges m on m.workspace_id=t.workspace_id and m.loser=t.label_id
 on conflict do nothing;
delete from public.labels l using label_merges m where l.workspace_id=m.workspace_id and l.id=m.loser;

create unique index labels_workspace_name_ux on public.labels (workspace_id, lower(name));

create or replace function public.migrate_workspace(p_workspace_id uuid,p_expected_snapshot_revision integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 ws public.workspaces; snapshot public.workspace_snapshots; payload jsonb;
 record jsonb; child jsonb; reaction record; user_ref text; field text; collection text;
 ordinal bigint; uid uuid; label_ref text; provenance uuid; diagnostics jsonb; unresolved jsonb:='[]'; counts jsonb:='{}';
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
   -- Legacy label ids are their names; case variants now resolve to the label already imported.
   select l.id into label_ref from public.labels l where l.workspace_id=p_workspace_id and lower(l.name)=lower(user_ref);
   if not found then
    insert into public.labels(workspace_id,id,name) values(p_workspace_id,user_ref,user_ref);
    label_ref:=user_ref;
   end if;
   insert into public.task_labels values(p_workspace_id,record->>'id',label_ref) on conflict do nothing;
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

commit;
