-- Keep the single authenticated transaction/audit/idempotency dispatcher unchanged.
-- These existing helpers are private INVOKER functions; renamed implementations
-- retain their ACLs and wrappers are revoked before this migration commits.
alter function public.operation_validate(text,jsonb) rename to operation_validate_before_file_duplication;
create function public.operation_validate(p_operation text,p_input jsonb) returns void
language plpgsql set search_path='' as $$
declare id_key text; id_value text;
begin
 if p_operation='duplicate_file' then
  if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'validation_error' using errcode='PT422';end if;
  if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('id','newId','name')) then raise exception 'validation_error' using errcode='PT422';end if;
  -- Reuse remaining strict shape/name/size rules without exposing writable metadata.
  perform public.operation_validate_before_file_duplication('update_file',p_input-'newId');
  if p_input?'newId' then perform public.operation_validate_before_file_duplication('update_file',jsonb_build_object('id',p_input->'newId'));end if;
  -- Match the shared API: preserve strings, count UTF-16 units, reject JS-trim blanks.
  -- NUL/lone surrogates cannot reach this function through PostgreSQL JSONB decoding.
  foreach id_key in array array['id','newId'] loop
   if p_input?id_key then
    id_value:=p_input->>id_key;
    if jsonb_typeof(p_input->id_key) is distinct from 'string' or length(btrim(id_value,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))=0 then raise exception 'validation_error' using errcode='PT422';end if;
    if length(id_value)+(select count(*) from generate_series(1,length(id_value)) i where ascii(substr(id_value,i,1))>65535)>128 then raise exception 'validation_error' using errcode='PT422';end if;
   end if;
  end loop;
 else
  perform public.operation_validate_before_file_duplication(p_operation,p_input);
 end if;
end $$;
revoke all on function public.operation_validate(text,jsonb) from public,anon,authenticated;
revoke all on function public.operation_validate_before_file_duplication(text,jsonb) from public,anon,authenticated;

create or replace function public.operation_batch_allowed(p_operation text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(p_operation=any(array['create_task','update_task','move_task','duplicate_task','delete_task','archive_task','restore_task','complete_task','intervene_task','add_task_comment','delete_comment','create_project','update_project','delete_project','archive_project','restore_project','create_subtask','update_subtask','delete_subtask','set_task_dependency','remove_task_dependency','set_task_label','remove_task_label','set_task_attachment','remove_task_attachment','add_reaction','remove_reaction','create_team','update_team','delete_team','set_team_member','remove_team_member','set_project_member','remove_project_member','create_label','update_label','delete_label','create_view','update_view','delete_view','create_calendar_event','update_calendar_event','delete_calendar_event','create_file','duplicate_file','update_file','delete_file','set_preferences','update_workspace']),false)
$$;
revoke all on function public.operation_batch_allowed(text) from public,anon,authenticated;

alter function public.operation_graph(uuid,text,jsonb,bigint,jsonb) rename to operation_graph_before_file_duplication;
create function public.operation_graph(p_workspace uuid,p_operation text,p_input jsonb,p_expected bigint,p_actor jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare source public.files; copied public.files; metadata jsonb; ident text; effective_name text; stamp timestamptz; alias text;
begin
 if p_operation<>'duplicate_file' then
  return public.operation_graph_before_file_duplication(p_workspace,p_operation,p_input,p_expected,p_actor);
 end if;
 select * into source from public.files where workspace_id=p_workspace and id=p_input->>'id' for update;
 if not found then raise exception 'not_found' using errcode='PT404';end if;
 -- Match existing file graph authority: agents cannot mutate owned or linked files.
 if p_actor->>'agentId' is not null and (source.task_id is not null or exists(select 1 from public.task_attachments where workspace_id=p_workspace and file_id=source.id)) then raise exception 'forbidden' using errcode='PT403';end if;
 if p_expected is null or p_expected<>source.version then raise exception 'version_conflict' using errcode='PT409';end if;
 ident:=coalesce(p_input->>'newId',gen_random_uuid()::text);
 effective_name:=coalesce(p_input->>'name',regexp_replace(source.name,'(\.[^.]+)$',' copy\1'));
 -- Millisecond precision keeps legacy epoch milliseconds and the canonical DTO equal.
 stamp:=date_trunc('milliseconds',clock_timestamp());
 metadata:=source.legacy_metadata||jsonb_build_object('id',ident,'name',effective_name,'by',p_actor->>'userId','at',extract(epoch from stamp)*1000);
 foreach alias in array array['authorUserId','author_user_id'] loop
  if metadata?alias then metadata:=jsonb_set(metadata,array[alias],to_jsonb(p_actor->>'userId'));end if;
 end loop;
 foreach alias in array array['createdAt','created_at'] loop
  if metadata?alias then metadata:=jsonb_set(metadata,array[alias],to_jsonb(stamp));end if;
 end loop;
 insert into public.files(workspace_id,id,project_id,task_id,name,file_type,size_label,author_user_id,created_at,legacy_metadata)
 values(p_workspace,ident,source.project_id,source.task_id,effective_name,source.file_type,source.size_label,(p_actor->>'userId')::uuid,stamp,metadata) returning * into copied;
 -- No source update and no attachment join copy. execute_operation records this new ID.
 return public.operation_entity(to_jsonb(copied));
end $$;
revoke all on function public.operation_graph(uuid,text,jsonb,bigint,jsonb) from public,anon,authenticated;
revoke all on function public.operation_graph_before_file_duplication(uuid,text,jsonb,bigint,jsonb) from public,anon,authenticated;
