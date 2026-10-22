create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key, email varchar(255), email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000001','owner@example.test'),('00000000-0000-0000-0000-000000000002','guest@example.test'),('00000000-0000-0000-0000-000000000003','other@example.test');
