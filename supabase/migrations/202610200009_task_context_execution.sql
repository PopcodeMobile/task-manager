-- Additive final integration contracts. No deployed migration is rewritten.
alter table public.tasks add column execution_state text check (execution_state in ('running','blocked'));
alter table public.tasks add column blocking_reason text;
alter table public.tasks add constraint task_execution_reason check ((execution_state='blocked' and blocking_reason is not null and length(btrim(blocking_reason)) between 1 and 2000) or (execution_state is distinct from 'blocked' and blocking_reason is null));
alter function public.operation_validate(text,jsonb) rename to operation_validate_before_execution;
create function public.operation_validate(p_operation text,p_input jsonb) returns void language plpgsql set search_path='' as $$
begin
 if p_operation='renew_task_claim' then
  perform public.operation_validate_before_execution(p_operation,p_input-'executionState'-'blockingReason');
  if p_input?'executionState' and (jsonb_typeof(p_input->'executionState') is distinct from 'string' or p_input->>'executionState' not in ('running','blocked')) then raise exception 'validation_error' using errcode='PT422';end if;
  if p_input->>'executionState'='blocked' then
   if jsonb_typeof(p_input->'blockingReason') is distinct from 'string' or (length(btrim(p_input->>'blockingReason'))<1 or length(p_input->>'blockingReason')>2000) then raise exception 'validation_error' using errcode='PT422';end if;
  elsif p_input?'blockingReason' then raise exception 'validation_error' using errcode='PT422';end if;
  if pg_column_size(p_input)>262144 then raise exception 'validation_error' using errcode='PT422';end if;
 else perform public.operation_validate_before_execution(p_operation,p_input);end if;
end $$;
revoke all on function public.operation_validate(text,jsonb),public.operation_validate_before_execution(text,jsonb) from public,anon,authenticated;
alter function public.operation_task(jsonb) rename to operation_task_before_execution;
create function public.operation_task(p_row jsonb) returns jsonb language plpgsql volatile set search_path='' as $$
declare data jsonb;
begin
 data:=public.operation_task_before_execution(p_row);
 if coalesce((data->'reservation'->>'active')::boolean,false) and not exists(
  select 1 from public.agents a join public.workspace_memberships m on m.workspace_id=a.workspace_id and m.user_id=a.auth_user_id and m.role<>'guest'
  where a.workspace_id=(p_row->>'workspace_id')::uuid and a.id=data->'reservation'->>'agentId' and
   (a.client_id is null or exists(select 1 from public.integration_connections ic join public.integration_grants g on g.connection_id=ic.id
    join auth.oauth_consents oc on oc.user_id=ic.user_id and oc.client_id=ic.client_id and oc.revoked_at is null
    join auth.oauth_clients cl on cl.id=ic.client_id and cl.deleted_at is null
    where ic.user_id=a.auth_user_id and ic.client_id::text=a.client_id and ic.status='active' and g.workspace_id=a.workspace_id and g.agent_id=a.id and g.capability='write'))
 ) then data:=jsonb_set(data,'{reservation,active}','false');end if;

 return (data-'executionState'-'blockingReason')||jsonb_build_object('execution',case when p_row->>'execution_state' is null then null else jsonb_build_object('state',p_row->>'execution_state','reason',p_row->>'blocking_reason','active',coalesce((data->'reservation'->>'active')::boolean,false)) end);
end $$;
revoke all on function public.operation_task(jsonb),public.operation_task_before_execution(jsonb) from public,anon,authenticated;
create or replace function public.execute_operation(p_workspace_id uuid,p_operation text,p_command jsonb,p_idempotency_key text,p_expected_version bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 a jsonb; cached public.idempotency_requests; fp text; result jsonb; data jsonb; event uuid:=gen_random_uuid();
 t public.tasks; p public.projects; claim public.task_claims; ident text; next_id text; has_claim boolean; delete_ids text[]; child jsonb; child_result jsonb; child_results jsonb:='[]'; child_index integer:=0; comment_row public.comments; workspace_row public.workspaces; execution_changed boolean:=false;
begin
 -- Authorization precedes validation, rate checks and idempotent replay. Membership row lock protects revocation races.
 a:=public.operation_authorize(p_workspace_id,true);
 perform public.operation_rate_limit(a);
 perform public.operation_validate(p_operation,p_command);
 perform public.operation_capability(p_operation,p_command,a,null);
 if p_idempotency_key is null or length(p_idempotency_key) not between 1 and 200 or (p_expected_version is not null and p_expected_version<1) then raise exception 'validation_error' using errcode='PT422';end if;
 -- Workspace mutex also serializes project numbering, graph writes and idempotency-key races.
 perform 1 from public.workspaces where id=p_workspace_id for update;
 fp:=encode(sha256(convert_to(jsonb_build_object('input',p_command,'expectedVersion',p_expected_version)::text,'UTF8')),'hex');
 select * into cached from public.idempotency_requests where workspace_id=p_workspace_id and actor_user_id=(a->>'userId')::uuid and actor_client_id=coalesce(a->>'clientId','') and actor_connection_id=coalesce(a->>'connectionId','') and operation=p_operation and key=p_idempotency_key;
 if found then
  if cached.fingerprint<>fp then raise exception 'idempotency_conflict' using errcode='PT409';end if;
  perform public.operation_capability(p_operation,p_command,a,cached.result);
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
 when 'batch' then
  for child in select value from jsonb_array_elements(p_command->'commands') loop
   -- Fresh server UUID namespace cannot be pre-seeded by a standalone client key.
   child_result:=public.execute_operation(p_workspace_id,child->>'operation',child->'input','internal:'||event::text||':'||child_index,(child->>'expectedVersion')::bigint);
   child_results:=child_results||jsonb_build_array(child_result);child_index:=child_index+1;
  end loop;
  data:=jsonb_build_object('results',child_results);
 when 'update_workspace' then
  select * into workspace_row from public.workspaces where id=p_workspace_id for update;
  if p_expected_version is null or p_expected_version<>workspace_row.version then raise exception 'version_conflict' using errcode='PT409';end if;
  update public.workspaces set name=coalesce(p_command->>'name',name),slug=coalesce(p_command->>'slug',slug),color=coalesce(p_command->>'color',color),version=version+1 where id=p_workspace_id returning jsonb_build_object('id',id,'name',name,'slug',slug,'color',color,'version',version,'storageVersion',storage_version,'role',a->>'role') into data;
  ident:=p_workspace_id::text;
 when 'delete_comment' then
  select * into comment_row from public.comments where workspace_id=p_workspace_id and id=ident for update;
  if not found then raise exception 'not_found' using errcode='PT404';end if;
  if comment_row.author_user_id is distinct from (a->>'userId')::uuid and a->>'role' not in ('owner','admin') then raise exception 'forbidden' using errcode='PT403';end if;
  if p_expected_version is null or p_expected_version<>comment_row.version then raise exception 'version_conflict' using errcode='PT409';end if;
  delete from public.comments where workspace_id=p_workspace_id and id=ident;
  data:=jsonb_build_object('id',ident,'taskId',comment_row.task_id,'authorUserId',comment_row.author_user_id,'deleted',true);
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
  insert into public.subtasks(workspace_id,task_id,title,sort_order,legacy_metadata) select workspace_id,next_id,title,sort_order,legacy_metadata from public.subtasks where workspace_id=p_workspace_id and task_id=ident;
  insert into public.task_labels select workspace_id,next_id,label_id from public.task_labels where workspace_id=p_workspace_id and task_id=ident;
  ident:=next_id;
 when 'claim_task' then
  if a->>'agentId' is null then raise exception 'forbidden' using errcode='PT403';end if;
  if has_claim then raise exception 'already_claimed' using errcode='PT409';end if;
  if t.status='done' or t.archived then raise exception 'validation_error' using errcode='PT422';end if;
  insert into public.task_claims(workspace_id,task_id,agent_id) values(p_workspace_id,ident,a->>'agentId')
  on conflict(workspace_id,task_id) do update set agent_id=excluded.agent_id,claim_token=gen_random_uuid(),claimed_at=clock_timestamp(),expires_at=clock_timestamp()+interval '15 minutes' returning * into claim;
  update public.tasks set execution_state='running',blocking_reason=null,executor_agent_id=a->>'agentId',version=version+1,updated_at=clock_timestamp() where workspace_id=p_workspace_id and id=ident returning * into t;
  data:=jsonb_build_object('task',public.operation_task(to_jsonb(t)),'claimToken',claim.claim_token,'claimedAt',claim.claimed_at,'expiresAt',claim.expires_at);
 when 'renew_task_claim','release_task_claim' then
  perform public.operation_assert_claim(p_workspace_id,ident,a,p_command->>'claimToken');
  if p_operation='renew_task_claim' then update public.task_claims set expires_at=clock_timestamp()+interval '15 minutes' where workspace_id=p_workspace_id and task_id=ident returning * into claim;
  else delete from public.task_claims where workspace_id=p_workspace_id and task_id=ident;end if;
  execution_changed:=p_operation='renew_task_claim' and p_command?'executionState' and
   (t.execution_state is distinct from p_command->>'executionState' or t.blocking_reason is distinct from p_command->>'blockingReason');
  update public.tasks set execution_state=case when p_operation='release_task_claim' then null else coalesce(p_command->>'executionState',execution_state) end,
   blocking_reason=case when p_operation='release_task_claim' or p_command->>'executionState'='running' then null when p_command->>'executionState'='blocked' then p_command->>'blockingReason' else blocking_reason end
   where workspace_id=p_workspace_id and id=ident;
  update public.tasks set executor_agent_id=case when p_operation='release_task_claim' then null else executor_agent_id end,version=version+1,updated_at=clock_timestamp() where workspace_id=p_workspace_id and id=ident returning * into t;
  data:=jsonb_build_object('task',public.operation_task(to_jsonb(t)),'expiresAt',case when p_operation='renew_task_claim' then claim.expires_at else null end);
 when 'complete_task','intervene_task' then
  update public.tasks set execution_state=null,blocking_reason=null where workspace_id=p_workspace_id and id=ident;
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
   if t.recurrence is not null and t.due_date is not null then
    next_id:=gen_random_uuid()::text;
    insert into public.tasks(workspace_id,id,project_id,key,title,description,status,priority,assignee_user_id,recurrence,due_date,start_date,sort_order,legacy_metadata)
    values(p_workspace_id,next_id,t.project_id,public.operation_next_task_key(p_workspace_id,t.project_id),t.title,t.description,'todo',t.priority,t.assignee_user_id,t.recurrence,t.due_date+case t.recurrence when 'Daily' then 1 when 'Weekly' then 7 when 'Every 2 weeks' then 14 else 30 end,t.due_date+case t.recurrence when 'Daily' then 1 when 'Weekly' then 7 when 'Every 2 weeks' then 14 else 30 end,t.sort_order,t.legacy_metadata);
    insert into public.subtasks(workspace_id,task_id,title,sort_order,legacy_metadata) select workspace_id,next_id,title,sort_order,legacy_metadata from public.subtasks where workspace_id=p_workspace_id and task_id=ident;
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
   if exists(select 1 from public.task_claims c join public.tasks claimed_task on claimed_task.workspace_id=c.workspace_id and claimed_task.id=c.task_id where claimed_task.workspace_id=p_workspace_id and claimed_task.project_id=ident and c.expires_at>clock_timestamp()) then raise exception 'already_claimed' using errcode='PT409';end if;
   if a->>'agentId' is not null and exists(select 1 from public.tasks where workspace_id=p_workspace_id and project_id=ident) then raise exception 'forbidden' using errcode='PT403';end if;
   select coalesce(array_agg(id),'{}'::text[]) into delete_ids from public.tasks where workspace_id=p_workspace_id and project_id=ident;
   perform public.operation_delete_tasks(p_workspace_id,delete_ids,ident);
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
 values(event,p_workspace_id,p_operation,ident,(a->>'userId')::uuid,a->>'clientId',a->>'connectionId',a->>'agentId',jsonb_build_object('id',ident,'taskId',coalesce(p_command->>'taskId',data->>'taskId',t.id),'projectId',coalesce(p_command->>'projectId',t.project_id,p.id),'version',coalesce(data->'version',data->'task'->'version'),'status',coalesce(data->'status',data->'task'->'status'),'executionState',case when execution_changed then p_command->>'executionState' else null end,'blockingReason',case when execution_changed then p_command->>'blockingReason' else null end));
 result:=jsonb_build_object('data',data,'eventId',event);
 insert into public.idempotency_requests(workspace_id,actor_user_id,actor_client_id,actor_connection_id,operation,key,fingerprint,result)
 values(p_workspace_id,(a->>'userId')::uuid,coalesce(a->>'clientId',''),coalesce(a->>'connectionId',''),p_operation,p_idempotency_key,fp,result);
 return result;
exception
 when foreign_key_violation or check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range or unique_violation then
  raise exception 'validation_error' using errcode='PT422';
end $$;


alter function public.read_operation(uuid,text,jsonb) rename to read_operation_before_context;
create function public.read_operation(p_workspace_id uuid,p_operation text,p_query jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare a jsonb; data jsonb; page jsonb; cur jsonb; inner_cursor text; family text:=p_query->>'context'; op text; lim integer:=coalesce((p_query->>'limit')::integer,50); rows jsonb; n text;
begin
 -- Delegate unchanged contracts to the existing authority/validation/rate boundary.
 if p_operation<>'get_event_cursor' and not(p_operation='get_task' and p_query?'context') and not(p_operation='list_reactions' and p_query?'taskId') then
  return public.read_operation_before_context(p_workspace_id,p_operation,p_query);
 end if;
 a:=public.operation_authorize(p_workspace_id,false);
 perform public.operation_rate_limit(a);
 if jsonb_typeof(p_query) is distinct from 'object' or pg_column_size(p_query)>4096 or lim not between 1 and 100 or
 exists(select 1 from jsonb_object_keys(p_query) k where k not in ('id','taskId','context','cursor','limit')) or
 (p_query?'limit' and (jsonb_typeof(p_query->'limit')<>'number' or p_query->>'limit'!~'^[0-9]+$')) or
 exists(select 1 from jsonb_each(p_query-'limit') e where jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>1024) then raise exception 'validation_error' using errcode='PT422';end if;
 if p_operation='get_event_cursor' then
  if p_query<>'{}' then raise exception 'validation_error' using errcode='PT422';end if;
  select jsonb_build_array(created_at,id)::text into n from public.domain_events where workspace_id=p_workspace_id order by jsonb_build_array(created_at,id)::text desc limit 1;
  return jsonb_build_object('data',jsonb_build_object('cursor',coalesce(n,'["", ""]')));
 end if;
 if p_operation='get_task' then
  if family not in ('comments','subtasks','dependencies','files','attachments') or not p_query?'id' then raise exception 'validation_error' using errcode='PT422';end if;
  select public.operation_task(to_jsonb(t)) into data from public.tasks t where workspace_id=p_workspace_id and id=p_query->>'id';
  if data is null then raise exception 'not_found' using errcode='PT404';end if;
  if p_query?'cursor' then
   cur:=(p_query->>'cursor')::jsonb;
   if jsonb_typeof(cur)<>'array' or jsonb_array_length(cur)<>4 or cur->>0<>p_workspace_id::text or cur->>1<>p_query->>'id' or cur->>2<>family or jsonb_typeof(cur->3)<>'string' then raise exception 'validation_error' using errcode='PT422';end if;
   inner_cursor:=cur->>3;
  end if;
  if family='files' then
   select coalesce(jsonb_agg(x.item order by x.id),'[]') into rows from (select f.id,public.operation_entity(to_jsonb(f)) item from public.files f where f.workspace_id=p_workspace_id and (f.task_id=p_query->>'id' or exists(select 1 from public.task_attachments ta where ta.workspace_id=f.workspace_id and ta.file_id=f.id and ta.task_id=p_query->>'id')) and (inner_cursor is null or f.id>inner_cursor) order by f.id limit lim+1) x;
   if jsonb_array_length(rows)>lim then n:=rows->(lim-1)->>'id';end if;
   select coalesce(jsonb_agg(value order by ord),'[]') into rows from jsonb_array_elements(rows) with ordinality x(value,ord) where ord<=lim;
   page:=jsonb_build_object('items',rows,'nextCursor',n);
  else
   op:=case family when 'comments' then 'list_comments' when 'subtasks' then 'list_subtasks' when 'dependencies' then 'list_dependencies' when 'attachments' then 'list_attachments' end;
   page:=public.read_operation_before_context(p_workspace_id,op,jsonb_build_object('taskId',p_query->>'id','limit',lim)||case when inner_cursor is null then '{}'::jsonb else jsonb_build_object('cursor',inner_cursor) end);
  end if;
  return jsonb_build_object('data',data,'context',jsonb_build_object('kind',family,'items',page->'items','nextCursor',case when page->>'nextCursor' is null then null else jsonb_build_array(p_workspace_id,p_query->>'id',family,page->>'nextCursor')::text end));
 end if;
 -- Reactions are scoped through their current parent comment, never workspace history.
 select coalesce(jsonb_agg(x.item order by x.key),'[]') into rows from (select jsonb_build_array(r.comment_id,r.reaction,r.legacy_user_id)::text key,public.operation_entity(to_jsonb(r))||jsonb_build_object('_cursor',jsonb_build_array(r.comment_id,r.reaction,r.legacy_user_id)::text) item from public.comment_reactions r join public.comments c on c.workspace_id=r.workspace_id and c.id=r.comment_id where r.workspace_id=p_workspace_id and c.task_id=p_query->>'taskId' and (not p_query?'cursor' or jsonb_build_array(r.comment_id,r.reaction,r.legacy_user_id)::text>p_query->>'cursor') order by key limit lim+1) x;
 if jsonb_array_length(rows)>lim then n:=rows->(lim-1)->>'_cursor';end if;
 select coalesce(jsonb_agg(value-'_cursor' order by ord),'[]') into rows from jsonb_array_elements(rows) with ordinality x(value,ord) where ord<=lim;
 return jsonb_build_object('items',rows,'nextCursor',n);
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'validation_error' using errcode='PT422';
end $$;
revoke all on function public.read_operation_before_context(uuid,text,jsonb),public.read_operation(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.read_operation(uuid,text,jsonb) to authenticated;
-- Preserve the reviewed enqueue implementation and minimal payload; only its classifier changes.
do $$ declare definition text; begin
 if to_regprocedure('public.enqueue_domain_webhooks()') is not null then
  select pg_get_functiondef('public.enqueue_domain_webhooks()'::regprocedure) into definition;
  execute replace(definition, 'new.payload->>''status''=''blocked''', 'new.payload->>''executionState''=''blocked''');
 end if;
end $$;
