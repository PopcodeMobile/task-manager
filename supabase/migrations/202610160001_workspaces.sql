-- Workspace-level sharing. Every member can read the complete snapshot; guests cannot write.
-- Account identity and roles never come from the JSON payload.
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  slug text not null check (length(slug) between 1 and 120 and slug ~ '^[a-z0-9][a-z0-9-]*$'),
  color text not null default '#5A67D8' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.workspace_memberships (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'guest')),
  primary key (workspace_id, user_id)
);
create index workspace_memberships_user_idx on public.workspace_memberships(user_id);
create table public.workspace_snapshots (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);
alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.workspace_snapshots enable row level security;

create function public.workspace_role(p_workspace_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select role from public.workspace_memberships where workspace_id = p_workspace_id and user_id = (select auth.uid())
$$;
revoke all on function public.workspace_role(uuid) from public, anon;
grant execute on function public.workspace_role(uuid) to authenticated;
create policy workspace_read on public.workspaces for select to authenticated using (public.workspace_role(id) is not null);
create policy membership_read on public.workspace_memberships for select to authenticated using (public.workspace_role(workspace_id) is not null);
create policy snapshot_read on public.workspace_snapshots for select to authenticated using (public.workspace_role(workspace_id) is not null);
revoke all on public.workspaces, public.workspace_memberships, public.workspace_snapshots from public, anon, authenticated;
grant select on public.workspaces, public.workspace_memberships, public.workspace_snapshots to authenticated;

create function public.clean_workspace_payload(p_payload jsonb, p_workspace_id uuid) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare result jsonb;
begin
  if jsonb_typeof(p_payload) is distinct from 'object'
     or jsonb_typeof(p_payload->'tasks') is distinct from 'array'
     or jsonb_typeof(p_payload->'projects') is distinct from 'array'
     or (p_payload ? 'ws' and jsonb_typeof(p_payload->'ws') is distinct from 'object')
     or pg_column_size(p_payload) > 5242880 then
    raise exception 'invalid' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_payload->'projects') as p where p->'private' = 'true'::jsonb) then
    raise exception 'private_projects_unsupported' using errcode = '22023';
  end if;
  result := p_payload - array['members','me','workspaces','sessions','invoices','tfa','notifPrefs','recentSearches'];
  result := jsonb_set(result, '{ws}', coalesce(result->'ws', '{}'::jsonb) || jsonb_build_object('id', p_workspace_id));
  return result;
end
$$;
revoke all on function public.clean_workspace_payload(jsonb, uuid) from public, anon, authenticated;

create function public.create_workspace(p_name text, p_slug text, p_payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare workspace_id uuid := gen_random_uuid(); actor uuid := auth.uid();
begin
  if actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 120 or p_slug is null or length(p_slug) not between 1 and 120 then
    raise exception 'invalid' using errcode = '22023';
  end if;
  insert into public.workspaces(id, name, slug, created_by) values (workspace_id, btrim(p_name), p_slug, actor);
  insert into public.workspace_memberships values (workspace_id, actor, 'owner');
  insert into public.workspace_snapshots(workspace_id, payload)
    values (workspace_id, public.clean_workspace_payload(p_payload, workspace_id));
  return workspace_id;
end
$$;
revoke all on function public.create_workspace(text, text, jsonb) from public, anon;
grant execute on function public.create_workspace(text, text, jsonb) to authenticated;

create function public.save_workspace_snapshot(p_workspace_id uuid, p_expected_revision integer, p_payload jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare actor_role text; new_revision integer; clean jsonb; current_workspace public.workspaces;
begin
  actor_role := public.workspace_role(p_workspace_id);
  if actor_role is null or actor_role = 'guest' then raise exception 'forbidden' using errcode = '42501'; end if;
  clean := public.clean_workspace_payload(p_payload, p_workspace_id);
  select * into current_workspace from public.workspaces where id = p_workspace_id;
  if coalesce(clean #>> '{ws,name}', current_workspace.name) <> current_workspace.name
     or coalesce(clean #>> '{ws,url}', current_workspace.slug) <> current_workspace.slug
     or coalesce(clean #>> '{ws,c}', current_workspace.color) <> current_workspace.color then
    if actor_role not in ('owner', 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
    update public.workspaces set
      name = coalesce(clean #>> '{ws,name}', name),
      slug = coalesce(clean #>> '{ws,url}', slug),
      color = coalesce(clean #>> '{ws,c}', color)
      where id = p_workspace_id;
  end if;
  update public.workspace_snapshots set payload = clean, revision = revision + 1, updated_at = now()
    where workspace_id = p_workspace_id and revision = p_expected_revision returning revision into new_revision;
  if new_revision is null then raise exception 'conflict' using errcode = '40001'; end if;
  return new_revision;
end
$$;
revoke all on function public.save_workspace_snapshot(uuid, integer, jsonb) from public, anon;
grant execute on function public.save_workspace_snapshot(uuid, integer, jsonb) to authenticated;

create function public.list_workspace_members(p_workspace_id uuid)
returns table(user_id uuid, role text, name text, email text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.workspace_role(p_workspace_id) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select m.user_id, m.role,
    coalesce(nullif(u.raw_user_meta_data->>'name',''), split_part(u.email,'@',1)), u.email::text
    from public.workspace_memberships m join auth.users u on u.id = m.user_id
    where m.workspace_id = p_workspace_id order by m.user_id;
end
$$;
revoke all on function public.list_workspace_members(uuid) from public, anon;
grant execute on function public.list_workspace_members(uuid) to authenticated;
