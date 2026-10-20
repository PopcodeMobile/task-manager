-- Run with run-postgres.sh normalized. Role changes exercise real PostgreSQL RLS.
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000004','member@example.test'),
 ('00000000-0000-0000-0000-000000000005','admin@example.test');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
set role authenticated;
select public.create_workspace('Normalized','normalized','{"projects":[{"id":"p1","name":"Project","fav":true}],"tasks":[{"id":"t1","project":"p1","title":"Task","status":"todo","priority":"high","assignee":"00000000-0000-0000-0000-000000000004"}],"notifs":[{"id":"n1","task":"t1","read":true}]}') as normalized_id \gset
select set_config('test.normalized_id',:'normalized_id',false);
reset role;
insert into public.workspace_memberships values
 (:'normalized_id','00000000-0000-0000-0000-000000000002','guest'),
 (:'normalized_id','00000000-0000-0000-0000-000000000004','member'),
 (:'normalized_id','00000000-0000-0000-0000-000000000005','admin');
insert into public.snapshot_personal_provenance values(:'normalized_id',0,'00000000-0000-0000-0000-000000000001');
set role authenticated;
select public.migrate_workspace(:'normalized_id',0);
select public.migrate_workspace(:'normalized_id',999);
do $$ begin
 if (select count(*) from public.tasks where workspace_id=current_setting('test.normalized_id')::uuid and id='t1')<>1 then raise exception 'task missing or duplicated'; end if;
 if (select assignee_user_id::text from public.tasks where workspace_id=current_setting('test.normalized_id')::uuid and id='t1')<>'00000000-0000-0000-0000-000000000004' then raise exception 'real assignee lost'; end if;
 if (select count(*) from public.user_preferences)<>1 then raise exception 'owner preferences lost'; end if;
 begin perform public.save_workspace_snapshot(current_setting('test.normalized_id')::uuid,0,'{"tasks":[],"projects":[]}'); raise exception 'old CAS writer accepted'; exception when object_not_in_prerequisite_state then null; end;
 begin perform public.save_workspace_snapshot_v1(current_setting('test.normalized_id')::uuid,0,'{"tasks":[],"projects":[]}'); raise exception 'v1 bypass accepted'; exception when insufficient_privilege then null; end;
 begin insert into public.tasks(workspace_id,id,project_id,title) values(current_setting('test.normalized_id')::uuid,'bypass','p1','No audit'); raise exception 'direct owner DML accepted'; exception when insufficient_privilege then null; end;
end $$;
-- A valid JWT client_id is still denied until the OAuth grants migration exists.
select set_config('request.jwt.claims','{"client_id":"ungranted-client"}',false);
do $$ begin
 if exists(select 1 from public.tasks) then raise exception 'OAuth exposed rows before grants'; end if;
 if exists(select 1 from public.workspaces) then raise exception 'OAuth exposed workspace metadata'; end if;
 if exists(select 1 from public.workspace_snapshots) then raise exception 'OAuth exposed recovery snapshot'; end if;
 if exists(select 1 from public.workspace_memberships) then raise exception 'OAuth exposed memberships'; end if;
 begin perform 1 from public.list_workspace_members(current_setting('test.normalized_id')::uuid); raise exception 'OAuth exposed member RPC'; exception when insufficient_privilege then null; end;
 begin perform public.create_workspace('OAuth','oauth','{"projects":[],"tasks":[]}'); raise exception 'OAuth created workspace'; exception when insufficient_privilege then null; end;
 begin perform public.create_workspace_v1('OAuth','oauth','{"projects":[],"tasks":[]}'); raise exception 'OAuth bypassed create wrapper'; exception when insufficient_privilege then null; end;
 begin perform public.save_workspace_snapshot(current_setting('test.normalized_id')::uuid,0,'{"projects":[],"tasks":[]}'); raise exception 'OAuth saved snapshot'; exception when insufficient_privilege then null; end;
 begin perform public.migrate_workspace(current_setting('test.normalized_id')::uuid,0); raise exception 'OAuth migration accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{}',false);
-- Guest sees shared content, never the owner's personal preferences, and cannot cut over.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$ begin
 if (select count(*) from public.tasks where workspace_id=current_setting('test.normalized_id')::uuid)<>1 then raise exception 'guest read denied'; end if;
 if exists(select 1 from public.user_preferences) then raise exception 'guest sees personal values'; end if;
 begin perform public.migrate_workspace(current_setting('test.normalized_id')::uuid,0); raise exception 'guest cutover accepted'; exception when insufficient_privilege then null; end;
 begin update public.tasks set title='guest'; raise exception 'guest wrote'; exception when insufficient_privilege then null; end;
 begin insert into public.snapshot_personal_provenance values(current_setting('test.normalized_id')::uuid,0,auth.uid()); raise exception 'guest forged provenance'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
do $$ begin
 if exists(select 1 from public.user_preferences) then raise exception 'member sees owner values'; end if;
 begin perform public.migrate_workspace(current_setting('test.normalized_id')::uuid,0); raise exception 'member cutover accepted'; exception when insufficient_privilege then null; end;
end $$;
-- Revoking membership denies reads immediately with the same authenticated subject.
reset role;
delete from public.workspace_memberships where workspace_id=:'normalized_id' and user_id='00000000-0000-0000-0000-000000000004';
set role authenticated;
do $$ begin
 if exists(select 1 from public.tasks) then raise exception 'revoked member reads'; end if;
end $$;
-- Same text IDs in another tenant do not merge or satisfy foreign keys.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select public.create_workspace('Other','other','{"projects":[{"id":"p1","name":"Other"},{"id":"only-other","name":"Only other"}],"tasks":[{"id":"t1","project":"p1","title":"Other task"}]}') as other_id \gset
select set_config('test.other_id',:'other_id',false);
select public.migrate_workspace(:'other_id',0);
do $$ begin
 if (select count(*) from public.tasks)<>1 then raise exception 'tenant task leakage'; end if;
 if exists(select 1 from public.tasks where workspace_id=current_setting('test.normalized_id')::uuid) then raise exception 'outsider read'; end if;
 begin perform public.migrate_workspace(current_setting('test.normalized_id')::uuid,0); raise exception 'outsider migration'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 begin insert into public.tasks(workspace_id,id,project_id,title) values(current_setting('test.normalized_id')::uuid,'bad-project','only-other','Cross'); raise exception 'cross project FK accepted'; exception when foreign_key_violation then null; end;
 begin insert into public.task_dependencies values(current_setting('test.other_id')::uuid,'t1','only-normalized'); raise exception 'cross dependency accepted'; exception when foreign_key_violation then null; end;
 begin insert into public.tasks(workspace_id,id,project_id,title,status) values(current_setting('test.normalized_id')::uuid,'bad-status','p1','Bad','blocked'); raise exception 'invalid status accepted'; exception when check_violation then null; end;
 begin insert into public.tasks(workspace_id,id,project_id,title,priority) values(current_setting('test.normalized_id')::uuid,'bad-priority','p1','Bad','critical'); raise exception 'invalid priority accepted'; exception when check_violation then null; end;
 begin update public.workspace_snapshots set revision=100 where workspace_id=current_setting('test.normalized_id')::uuid; raise exception 'snapshot mutable'; exception when object_not_in_prerequisite_state then null; end;
 if (select revision from public.workspace_snapshots where workspace_id=current_setting('test.normalized_id')::uuid)<>0 then raise exception 'snapshot revision changed'; end if;
 if (select version from public.tasks where workspace_id=current_setting('test.normalized_id')::uuid and id='t1')<>1 then raise exception 'version changed after old write'; end if;
end $$;
-- Invalid graph aborts atomically, including records inserted before the bad relation.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
set role authenticated;
select public.create_workspace('Broken','broken','{"projects":[{"id":"p1","name":"Valid"}],"tasks":[{"id":"t1","project":"orphan","title":"Bad"}]}') as broken_id \gset
select set_config('test.broken_id',:'broken_id',false);
do $$ begin
 begin perform public.migrate_workspace(current_setting('test.broken_id')::uuid,0); raise exception 'orphan migration accepted'; exception when foreign_key_violation then null; end;
 if exists(select 1 from public.projects where workspace_id=current_setting('test.broken_id')::uuid) then raise exception 'partial cutover committed'; end if;
 if (select storage_version from public.workspaces where id=current_setting('test.broken_id')::uuid)<>1 then raise exception 'invalid workspace activated'; end if;
end $$;
reset role;
-- Revoke the exact attested owner. Preparatory ownership rows disappear, history/work survives.
insert into public.agents(workspace_id,id,name,auth_user_id) values(:'normalized_id','owner-agent','Owner agent','00000000-0000-0000-0000-000000000001');
update public.tasks set executor_agent_id='owner-agent' where workspace_id=:'normalized_id' and id='t1';
delete from public.workspace_memberships where workspace_id=:'normalized_id' and user_id='00000000-0000-0000-0000-000000000001';
do $$ begin
 if exists(select 1 from public.snapshot_personal_provenance where workspace_id=current_setting('test.normalized_id')::uuid) then raise exception 'provenance blocks revocation'; end if;
 if exists(select 1 from public.user_preferences where workspace_id=current_setting('test.normalized_id')::uuid) then raise exception 'removed owner preferences retained'; end if;
 if (select count(*) from public.agents where workspace_id=current_setting('test.normalized_id')::uuid and id='owner-agent' and auth_user_id is null)<>1 then raise exception 'agent deleted or identity not cleared'; end if;
 if (select count(*) from public.tasks where workspace_id=current_setting('test.normalized_id')::uuid and id='t1' and executor_agent_id='owner-agent')<>1 then raise exception 'agent work lost on revocation'; end if;
 if (select diagnostics->>'personalStateOwner' from public.workspace_migrations where workspace_id=current_setting('test.normalized_id')::uuid)<>'00000000-0000-0000-0000-000000000001' then raise exception 'historical provenance lost'; end if;
end $$;
set role authenticated;
do $$ begin
 if exists(select 1 from public.tasks where workspace_id=current_setting('test.normalized_id')::uuid) then raise exception 'removed owner reads tasks'; end if;
 if exists(select 1 from public.workspace_snapshots where workspace_id=current_setting('test.normalized_id')::uuid) then raise exception 'removed owner reads snapshot'; end if;
 begin perform 1 from public.list_workspace_members(current_setting('test.normalized_id')::uuid); raise exception 'removed owner reads members'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$ begin
 begin perform 1 from public.tasks; raise exception 'anonymous tasks'; exception when insufficient_privilege then null; end;
 begin perform public.migrate_workspace(current_setting('test.normalized_id')::uuid,0); raise exception 'anonymous migration'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'Normalized migration, ownership, membership, guest, outsider, revocation, OAuth fail-closed, FKs and frozen CAS passed on PostgreSQL '||current_setting('server_version') as result;
