-- Human workspace invitations. Acceptance is bound to the invitee's confirmed Auth email,
-- so links carry no secret. Tables are private; every path is a human-only RPC.
begin;
create table public.workspace_invitations (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 email text not null check(email=lower(btrim(email)) and length(email)<=254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
 role text not null check(role in ('admin','member','guest')),
 invited_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '7 days',
 last_sent_at timestamptz not null default clock_timestamp(),
 send_count integer not null default 1 check(send_count>=1),
 accepted_at timestamptz, accepted_by uuid references auth.users(id) on delete set null,
 revoked_at timestamptz
);
create unique index workspace_invitations_pending on public.workspace_invitations(workspace_id,email) where accepted_at is null and revoked_at is null;
create index workspace_invitations_email on public.workspace_invitations(email) where accepted_at is null and revoked_at is null;
alter table public.workspace_invitations enable row level security;
revoke all on public.workspace_invitations from public,anon,authenticated;

-- OAuth clients and organization tokens never manage or accept human access.
create function public.invitation_human() returns uuid language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null
   or nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'client_id' is not null
   or nullif(current_setting('request.jwt.claim.client_id',true),'') is not null then
  raise exception 'forbidden' using errcode='PT403'; end if;
 return auth.uid();
end $$;
create function public.invitation_manager(p_workspace_id uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare r text;
begin
 perform public.invitation_human();
 r:=public.workspace_role(p_workspace_id);
 if r is null or r not in ('owner','admin') then raise exception 'forbidden' using errcode='PT403'; end if;
 return r;
end $$;
create function public.invitation_metadata(i public.workspace_invitations) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',i.id,'workspaceId',i.workspace_id,'email',i.email,'role',i.role,'createdAt',i.created_at,'expiresAt',i.expires_at,
  'lastSentAt',i.last_sent_at,'sendCount',i.send_count,
  'status',case when i.revoked_at is not null then 'revoked' when i.accepted_at is not null then 'accepted' when i.expires_at<=clock_timestamp() then 'expired' else 'pending' end)
$$;
create function public.invitation_person_name(p_user_id uuid) returns text language sql stable security definer set search_path='' as $$
 select coalesce(nullif(btrim(u.raw_user_meta_data->>'name'),''),split_part(u.email,'@',1)) from auth.users u where u.id=p_user_id
$$;
revoke all on function public.invitation_human(),public.invitation_manager(uuid),public.invitation_metadata(public.workspace_invitations),public.invitation_person_name(uuid) from public,anon,authenticated;

create function public.create_workspace_invitation(p_workspace_id uuid,p_email text,p_role text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor_role text; uid uuid; addr text:=lower(btrim(coalesce(p_email,''))); i public.workspace_invitations;
begin
 actor_role:=public.invitation_manager(p_workspace_id); uid:=auth.uid();
 if p_role is null or p_role not in ('admin','member','guest') or length(addr)>254 or addr !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
  raise exception 'validation_error' using errcode='PT422'; end if;
 if p_role='admin' and actor_role<>'owner' then raise exception 'forbidden' using errcode='PT403'; end if;
 if exists(select 1 from public.workspace_memberships m join auth.users u on u.id=m.user_id where m.workspace_id=p_workspace_id and lower(u.email)=addr) then
  raise exception 'validation_error' using errcode='PT422'; end if;
 -- Serialize per workspace so the send window and pending caps cannot be raced.
 perform 1 from public.workspaces where id=p_workspace_id for update;
 if (select count(*) from public.workspace_invitations where workspace_id=p_workspace_id and last_sent_at>clock_timestamp()-interval '24 hours')>=50 then
  raise exception 'rate_limited' using errcode='PT429'; end if;
 update public.workspace_invitations set role=p_role,invited_by=uid,expires_at=clock_timestamp()+interval '7 days',last_sent_at=clock_timestamp(),send_count=send_count+1
  where workspace_id=p_workspace_id and email=addr and accepted_at is null and revoked_at is null returning * into i;
 if not found then
  if (select count(*) from public.workspace_invitations where workspace_id=p_workspace_id and accepted_at is null and revoked_at is null and expires_at>clock_timestamp())>=100 then
   raise exception 'rate_limited' using errcode='PT429'; end if;
  insert into public.workspace_invitations(workspace_id,email,role,invited_by) values(p_workspace_id,addr,p_role,uid) returning * into i;
 end if;
 return public.invitation_metadata(i)||jsonb_build_object('workspaceName',(select name from public.workspaces where id=p_workspace_id),'inviterName',public.invitation_person_name(uid));
end $$;

create function public.list_workspace_invitations(p_workspace_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.invitation_manager(p_workspace_id);
 return jsonb_build_object('items',coalesce((select jsonb_agg(public.invitation_metadata(i) order by i.created_at,i.id) from public.workspace_invitations i
  where i.workspace_id=p_workspace_id and i.accepted_at is null and i.revoked_at is null),'[]'::jsonb));
end $$;

create function public.revoke_workspace_invitation(p_workspace_id uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.workspace_invitations;
begin
 perform public.invitation_manager(p_workspace_id);
 update public.workspace_invitations set revoked_at=clock_timestamp() where id=p_id and workspace_id=p_workspace_id and accepted_at is null and revoked_at is null returning * into i;
 if not found then raise exception 'not_found' using errcode='PT404'; end if;
 return public.invitation_metadata(i);
end $$;

create function public.list_my_workspace_invitations() returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.invitation_human(); addr text;
begin
 select lower(email) into addr from auth.users where id=uid and email_confirmed_at is not null;
 return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'workspaceId',i.workspace_id,'workspaceName',w.name,'role',i.role,
   'inviterName',public.invitation_person_name(i.invited_by),'expiresAt',i.expires_at) order by i.created_at,i.id)
  from public.workspace_invitations i join public.workspaces w on w.id=i.workspace_id
  where addr is not null and i.email=addr and i.accepted_at is null and i.revoked_at is null and i.expires_at>clock_timestamp()
   and not exists(select 1 from public.workspace_memberships m where m.workspace_id=i.workspace_id and m.user_id=uid)),'[]'::jsonb));
end $$;

create function public.accept_workspace_invitation(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.invitation_human(); addr text; i public.workspace_invitations;
begin
 select lower(email) into addr from auth.users where id=uid and email_confirmed_at is not null;
 select * into i from public.workspace_invitations where id=p_id for update;
 if found and i.accepted_by=uid then
  return jsonb_build_object('workspaceId',i.workspace_id,'role',(select role from public.workspace_memberships where workspace_id=i.workspace_id and user_id=uid));
 end if;
 if not found or addr is null or i.email<>addr or i.accepted_at is not null or i.revoked_at is not null or i.expires_at<=clock_timestamp() then
  raise exception 'not_found' using errcode='PT404'; end if;
 insert into public.workspace_memberships(workspace_id,user_id,role) values(i.workspace_id,uid,i.role) on conflict do nothing;
 update public.workspace_invitations set accepted_at=clock_timestamp(),accepted_by=uid where id=i.id;
 return jsonb_build_object('workspaceId',i.workspace_id,'role',(select role from public.workspace_memberships where workspace_id=i.workspace_id and user_id=uid));
end $$;

revoke all on function public.create_workspace_invitation(uuid,text,text),public.list_workspace_invitations(uuid),public.revoke_workspace_invitation(uuid,uuid),
 public.list_my_workspace_invitations(),public.accept_workspace_invitation(uuid) from public,anon;
grant execute on function public.create_workspace_invitation(uuid,text,text),public.list_workspace_invitations(uuid),public.revoke_workspace_invitation(uuid,uuid),
 public.list_my_workspace_invitations(),public.accept_workspace_invitation(uuid) to authenticated;
commit;
