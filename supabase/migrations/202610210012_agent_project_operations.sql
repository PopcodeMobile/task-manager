-- Extend organization write authority through the existing domain command boundary.
-- CREATE OR REPLACE preserves the reviewed011 function ACL and transaction lifecycle.
begin;
create or replace function public.execute_organization_agent_operation(p_token text,p_workspace_id uuid,p_operation text,p_command jsonb,p_idempotency_key text,p_expected_version bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a jsonb; result jsonb;
begin
 a:=public.organization_agent_verify(p_token);
 if a->>'capability'<>'write' or p_workspace_id is distinct from (a->>'workspaceId')::uuid or p_operation is null or p_operation not in ('create_task','claim_task','renew_task_claim','release_task_claim','update_task','add_task_comment','complete_task','create_project','update_project','archive_project') then raise exception 'forbidden' using errcode='PT403';end if;
 a:=a||jsonb_build_object('userId',a->>'principalId','clientId','organization_token','role','member');
 insert into public.organization_agent_context values(pg_backend_pid(),txid_current(),a);
 result:=public.execute_operation(p_workspace_id,p_operation,p_command,p_idempotency_key,p_expected_version);
 delete from public.organization_agent_context where backend_pid=pg_backend_pid() and transaction_id=txid_current();
 return result;
end $$;
commit;
