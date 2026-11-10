-- Extend organization agent authority to workspace labels, task labels and member reads.
-- CREATE OR REPLACE preserves the reviewed011/012 function ACL and transaction lifecycle.
-- Label deletion, label renaming and membership writes stay outside this credential.
begin;
create or replace function public.execute_organization_agent_operation(p_token text,p_workspace_id uuid,p_operation text,p_command jsonb,p_idempotency_key text,p_expected_version bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a jsonb; result jsonb;
begin
 a:=public.organization_agent_verify(p_token);
 if a->>'capability'<>'write' or p_workspace_id is distinct from (a->>'workspaceId')::uuid or p_operation is null or p_operation not in ('create_task','claim_task','renew_task_claim','release_task_claim','update_task','add_task_comment','complete_task','create_project','update_project','archive_project','create_label','set_task_label','remove_task_label') then raise exception 'forbidden' using errcode='PT403';end if;
 a:=a||jsonb_build_object('userId',a->>'principalId','clientId','organization_token','role','member');
 insert into public.organization_agent_context values(pg_backend_pid(),txid_current(),a);
 result:=public.execute_operation(p_workspace_id,p_operation,p_command,p_idempotency_key,p_expected_version);
 delete from public.organization_agent_context where backend_pid=pg_backend_pid() and transaction_id=txid_current();
 return result;
end $$;
create or replace function public.read_organization_agent_operation(p_token text,p_workspace_id uuid,p_operation text,p_query jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare a jsonb; result jsonb;
begin
 a:=public.organization_agent_verify(p_token);
 if p_operation is null or p_operation not in ('list_workspaces','list_projects','list_tasks','get_task','list_task_activity','list_labels','list_task_labels','list_members') or (p_workspace_id is distinct from (a->>'workspaceId')::uuid and not(p_operation='list_workspaces' and p_workspace_id is null)) then raise exception 'forbidden' using errcode='PT403';end if;
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
commit;
