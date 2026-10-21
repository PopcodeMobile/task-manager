-- Source-authoritative copying uses the existing authenticated transaction engine.
-- Ordinary duplicate_task remains unchanged. Every helper below stays private.
alter function public.operation_validate(text,jsonb) rename to operation_validate_before_task_graph_copy;
create function public.operation_validate(p_operation text,p_input jsonb) returns void
language plpgsql set search_path='' as $$
begin
 if p_operation<>'duplicate_task_graph' then
  perform public.operation_validate_before_task_graph_copy(p_operation,p_input);
  return;
 end if;
 if jsonb_typeof(p_input) is distinct from 'object' or pg_column_size(p_input)>262144 then raise exception 'validation_error' using errcode='PT422';end if;
 if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('id','projectId','mode','title','claimToken')) or
    not (p_input ?& array['id','projectId','mode']) or jsonb_typeof(p_input->'mode') is distinct from 'string' or
    p_input->>'mode' not in ('task','project') then raise exception 'validation_error' using errcode='PT422';end if;
 -- 006 owns the explicit UTF-16/ECMAScript-whitespace ID contract. Reuse it for both IDs.
 perform public.operation_validate_before_task_graph_copy('duplicate_file',jsonb_build_object('id',p_input->'id','newId',p_input->'projectId'));
 perform public.operation_validate_before_task_graph_copy('duplicate_task',p_input-'mode');
end $$;
revoke all on function public.operation_validate(text,jsonb) from public,anon,authenticated;
revoke all on function public.operation_validate_before_task_graph_copy(text,jsonb) from public,anon,authenticated;

alter function public.operation_batch_allowed(text) rename to operation_batch_allowed_before_task_graph_copy;
create function public.operation_batch_allowed(p_operation text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(p_operation='duplicate_task_graph',false) or public.operation_batch_allowed_before_task_graph_copy(p_operation)
$$;
revoke all on function public.operation_batch_allowed(text) from public,anon,authenticated;
revoke all on function public.operation_batch_allowed_before_task_graph_copy(text) from public,anon,authenticated;

alter function public.operation_graph(uuid,text,jsonb,bigint,jsonb) rename to operation_graph_before_task_graph_copy;
create function public.operation_graph(p_workspace uuid,p_operation text,p_input jsonb,p_expected bigint,p_actor jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare source public.tasks; copied public.tasks; ident text; stamp timestamptz;
begin
 if p_operation<>'duplicate_task_graph' then
  return public.operation_graph_before_task_graph_copy(p_workspace,p_operation,p_input,p_expected,p_actor);
 end if;
 select * into source from public.tasks where workspace_id=p_workspace and id=p_input->>'id' for update;
 if not found then raise exception 'not_found' using errcode='PT404';end if;
 if p_expected is null or p_expected<>source.version then raise exception 'version_conflict' using errcode='PT409';end if;
 -- Same source authority as duplicate_task: agents require their current live lease;
 -- human duplication is permitted even during a lease and never changes that lease.
 if p_actor->>'agentId' is not null then
  perform public.operation_assert_claim(p_workspace,source.id,p_actor,p_input->>'claimToken');
 end if;
 ident:=gen_random_uuid()::text;
 stamp:=clock_timestamp();
 insert into public.tasks(workspace_id,id,project_id,key,title,description,status,priority,assignee_user_id,recurrence,due_date,start_date,sort_order,legacy_metadata,created_at,updated_at,completed_at)
 values(p_workspace,ident,p_input->>'projectId',public.operation_next_task_key(p_workspace,p_input->>'projectId'),coalesce(p_input->>'title',source.title),source.description,
   case when p_input->>'mode'='task' then source.status else 'todo' end,source.priority,source.assignee_user_id,source.recurrence,source.due_date,source.start_date,source.sort_order,source.legacy_metadata,stamp,stamp,
   case when p_input->>'mode'='task' and source.status='done' then source.completed_at else null end) returning * into copied;
 insert into public.subtasks(workspace_id,task_id,title,done,sort_order,legacy_metadata)
 select workspace_id,ident,title,done,sort_order,legacy_metadata from public.subtasks where workspace_id=p_workspace and task_id=source.id;
 insert into public.task_labels(workspace_id,task_id,label_id)
 select workspace_id,ident,label_id from public.task_labels where workspace_id=p_workspace and task_id=source.id;
 insert into public.task_dependencies(workspace_id,task_id,depends_on_task_id)
 select workspace_id,ident,depends_on_task_id from public.task_dependencies where workspace_id=p_workspace and task_id=source.id;
 insert into public.task_attachments(workspace_id,task_id,file_id,sort_order,legacy_metadata)
 select workspace_id,ident,file_id,sort_order,legacy_metadata from public.task_attachments where workspace_id=p_workspace and task_id=source.id;
 -- The dispatcher emits one complete event, scoped to the NEW task and explicit project.
 return public.operation_task(to_jsonb(copied))||jsonb_build_object('taskId',ident);
end $$;
revoke all on function public.operation_graph(uuid,text,jsonb,bigint,jsonb) from public,anon,authenticated;
revoke all on function public.operation_graph_before_task_graph_copy(uuid,text,jsonb,bigint,jsonb) from public,anon,authenticated;
