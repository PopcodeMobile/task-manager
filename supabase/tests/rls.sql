select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
set role authenticated;
select public.create_workspace('Test','test','{"tasks":[],"projects":[],"ws":{},"members":[{"role":"Owner"}]}') as workspace_id \gset
select set_config('test.workspace_id', :'workspace_id', false);
do $$ begin
  if (select count(*) from public.workspace_memberships where role='owner') <> 1 then raise exception 'owner missing'; end if;
  if exists (select 1 from public.workspace_snapshots where payload ? 'members') then raise exception 'payload leaked role'; end if;
end $$;
select public.save_workspace_snapshot(:'workspace_id',0,'{"tasks":[{"id":"winner"}],"projects":[],"ws":{}}');
do $$ begin
  begin perform public.save_workspace_snapshot(current_setting('test.workspace_id')::uuid,0,'{"tasks":[],"projects":[]}'); raise exception 'CAS accepted stale revision';
  exception when serialization_failure then null; end;
  begin insert into public.workspace_memberships values (current_setting('test.workspace_id')::uuid,'00000000-0000-0000-0000-000000000003','owner'); raise exception 'role escalation accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.workspace_memberships values (:'workspace_id','00000000-0000-0000-0000-000000000002','guest');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
set role authenticated;
do $$ begin
  if (select count(*) from public.workspace_snapshots) <> 1 then raise exception 'guest cannot read'; end if;
  begin perform public.save_workspace_snapshot(current_setting('test.workspace_id')::uuid,1,'{"tasks":[],"projects":[]}'); raise exception 'guest wrote snapshot';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
set role authenticated;
do $$ begin
  if (select count(*) from public.workspace_snapshots) <> 0 then raise exception 'cross-tenant read'; end if;
  if (select count(*) from public.workspaces) <> 0 then raise exception 'cross-tenant metadata'; end if;
  begin perform public.save_workspace_snapshot(current_setting('test.workspace_id')::uuid,1,'{"tasks":[],"projects":[]}'); raise exception 'cross-tenant write';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$ begin
  begin perform 1 from public.workspace_snapshots; raise exception 'anonymous read';
  exception when insufficient_privilege then null; end;
  begin perform public.create_workspace('Bad','bad','{"tasks":[],"projects":[]}'); raise exception 'anonymous create';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'RLS, guest permissions, role protection and CAS passed on PostgreSQL ' || current_setting('server_version') as result;
