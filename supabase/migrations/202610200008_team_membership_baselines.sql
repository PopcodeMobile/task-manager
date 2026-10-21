-- Optional relationship snapshot guards for team composition. Existing unguarded
-- commands retain multi-team semantics, engine authorization, replay and audit.
create index team_members_by_user on public.team_members(workspace_id,user_id,team_id);

alter function public.operation_validate(text,jsonb) rename to operation_validate_before_team_membership_baselines;
create function public.operation_validate(p_operation text,p_input jsonb) returns void
language plpgsql set search_path='' as $$
declare baseline jsonb; team_id jsonb;
begin
 if p_operation not in ('create_team','update_team') or not p_input?'expectedMemberships' then
  perform public.operation_validate_before_team_membership_baselines(p_operation,p_input);
  return;
 end if;
 if jsonb_typeof(p_input) is distinct from 'object' or pg_column_size(p_input)>262144 or
    jsonb_typeof(p_input->'expectedMemberships') is distinct from 'array' then raise exception 'validation_error' using errcode='PT422';end if;
 perform public.operation_validate_before_team_membership_baselines(p_operation,p_input-'expectedMemberships');
 for baseline in select value from jsonb_array_elements(p_input->'expectedMemberships') loop
  if jsonb_typeof(baseline) is distinct from 'object' then raise exception 'validation_error' using errcode='PT422';end if;
  if exists(select 1 from jsonb_object_keys(baseline) k where k not in ('userId','teamIds')) or
     jsonb_typeof(baseline->'userId') is distinct from 'string' or
     baseline->>'userId'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or
     jsonb_typeof(baseline->'teamIds') is distinct from 'array' then raise exception 'validation_error' using errcode='PT422';end if;
  for team_id in select value from jsonb_array_elements(baseline->'teamIds') loop
   -- Reuse 006's exact UTF-16/ECMAScript-whitespace ID validation, never Auth creation.
   perform public.operation_validate_before_team_membership_baselines('duplicate_file',jsonb_build_object('id',team_id));
  end loop;
  if (select count(*)<>count(distinct value) from jsonb_array_elements(baseline->'teamIds')) then raise exception 'validation_error' using errcode='PT422';end if;
 end loop;
 if (select count(*)<>count(distinct (value->>'userId')::uuid) from jsonb_array_elements(p_input->'expectedMemberships')) then raise exception 'validation_error' using errcode='PT422';end if;
end $$;
revoke all on function public.operation_validate(text,jsonb) from public,anon,authenticated;
revoke all on function public.operation_validate_before_team_membership_baselines(text,jsonb) from public,anon,authenticated;

alter function public.operation_graph(uuid,text,jsonb,bigint,jsonb) rename to operation_graph_before_team_membership_baselines;
create function public.operation_graph(p_workspace uuid,p_operation text,p_input jsonb,p_expected bigint,p_actor jsonb) returns jsonb
language plpgsql set search_path='' as $$
begin
 if p_operation in ('create_team','update_team') and p_input?'expectedMemberships' then
  -- execute_operation already owns the workspace mutex and checked current actor
  -- authority. Its authorized receipt replay returns before reaching this helper.
  -- Missing members and vanished/foreign team IDs are stale snapshots (409).
  if exists(
   select 1 from jsonb_array_elements(p_input->'expectedMemberships') b
   where not exists(select 1 from public.workspace_memberships m where m.workspace_id=p_workspace and m.user_id=(b->>'userId')::uuid)
     or array(select tm.team_id from public.team_members tm where tm.workspace_id=p_workspace and tm.user_id=(b->>'userId')::uuid order by tm.team_id)
        is distinct from array(select value from jsonb_array_elements_text(b->'teamIds') order by value)
  ) then raise exception 'version_conflict' using errcode='PT409';end if;
  -- Guards are command preconditions, never writable entity metadata or columns.
  return public.operation_graph_before_team_membership_baselines(p_workspace,p_operation,p_input-'expectedMemberships',p_expected,p_actor);
 end if;
 return public.operation_graph_before_team_membership_baselines(p_workspace,p_operation,p_input,p_expected,p_actor);
end $$;
revoke all on function public.operation_graph(uuid,text,jsonb,bigint,jsonb) from public,anon,authenticated;
revoke all on function public.operation_graph_before_team_membership_baselines(uuid,text,jsonb,bigint,jsonb) from public,anon,authenticated;
