import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL RLS and CAS protect workspace snapshots and authoritative roles', async () => {
  const migration = await readFile(new URL('../supabase/migrations/202610160001_workspaces.sql', import.meta.url), 'utf8').catch(() => null);
  assert.ok(migration, 'workspace SQL migration must exist');
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users (id uuid primary key, email varchar(255), raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      insert into auth.users values
      ('00000000-0000-0000-0000-000000000001','owner@example.test','{"name":"Owner"}'),
      ('00000000-0000-0000-0000-000000000002','outsider@example.test','{"name":"Outsider"}'),
      ('00000000-0000-0000-0000-000000000003','guest@example.test','{"name":"Guest"}'),
      ('00000000-0000-0000-0000-000000000004','member@example.test','{"name":"Member"}');
    `);
    await db.exec(migration);
    const asUser = async n => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", ['00000000-0000-0000-0000-' + String(n).padStart(12, '0')]);
      await db.exec('set role authenticated');
    };
    const payload = { ws: {}, tasks: [], projects: [], members: [{ id: 'spoof', role: 'Owner' }], me: 'spoof' };
    await asUser(1);
    const created = await db.query('select public.create_workspace($1,$2,$3::jsonb) as id', ['Team One', 'team-one', JSON.stringify(payload)]);
    const id = created.rows[0].id;
    assert.equal((await db.query('select * from public.list_workspace_members($1)', [id])).rows[0].email, 'owner@example.test');
    assert.equal((await db.query('select role from public.workspace_memberships')).rows[0].role, 'owner');
    assert.equal((await db.query('select payload from public.workspace_snapshots')).rows[0].payload.members, undefined);
    await assert.rejects(
      db.query("insert into public.workspace_memberships values ($1,$2,'owner')", [id, '00000000-0000-0000-0000-000000000002']),
      error => error.code === '42501',
    );
    await asUser(2);
    assert.equal((await db.query('select * from public.workspace_snapshots')).rows.length, 0);
    assert.equal((await db.query('select * from public.workspaces')).rows.length, 0);
    await assert.rejects(db.query('select public.save_workspace_snapshot($1,0,$2::jsonb)', [id, JSON.stringify(payload)]), error => error.code === '42501');
    await assert.rejects(db.query('select * from public.list_workspace_members($1)', [id]), error => error.code === '42501');
    await db.exec('reset role');
    await db.query(
      "insert into public.workspace_memberships values ($1,'00000000-0000-0000-0000-000000000003','guest'),($1,'00000000-0000-0000-0000-000000000004','member')",
      [id],
    );
    await asUser(3);
    assert.equal((await db.query('select * from public.workspace_snapshots')).rows.length, 1);
    await assert.rejects(db.query('select public.save_workspace_snapshot($1,0,$2::jsonb)', [id, JSON.stringify(payload)]), error => error.code === '42501');
    await asUser(4);
    const changed = { ...payload, tasks: [{ id: 'saved' }] };
    assert.equal((await db.query('select public.save_workspace_snapshot($1,0,$2::jsonb) as revision', [id, JSON.stringify(changed)])).rows[0].revision, 1);
    assert.equal((await db.query('select role from public.workspace_memberships where user_id=auth.uid()')).rows[0].role, 'member');
    await assert.rejects(db.query('select public.save_workspace_snapshot($1,0,$2::jsonb)', [id, JSON.stringify(payload)]), error => error.code === '40001');
    assert.equal((await db.query('select payload from public.workspace_snapshots')).rows[0].payload.tasks[0].id, 'saved');
    await assert.rejects(
      db.query('select public.save_workspace_snapshot($1,1,$2::jsonb)', [id, JSON.stringify({ ...changed, ws: { name: 'Member rename' } })]),
      error => error.code === '42501',
    );
    await asUser(1);
    await db.query('select public.save_workspace_snapshot($1,1,$2::jsonb)', [
      id,
      JSON.stringify({ ...changed, ws: { name: 'Renamed', url: 'renamed', c: '#112233' } }),
    ]);
    assert.deepEqual((await db.query('select name,slug,color from public.workspaces where id=$1', [id])).rows[0], {
      name: 'Renamed',
      slug: 'renamed',
      color: '#112233',
    });
    await assert.rejects(
      db.query('select public.save_workspace_snapshot($1,1,$2::jsonb)', [id, JSON.stringify({ ...changed, ws: { name: 'Stale metadata' } })]),
      error => error.code === '40001',
    );
    assert.equal((await db.query('select name from public.workspaces where id=$1', [id])).rows[0].name, 'Renamed');
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from public.workspace_snapshots'), error => error.code === '42501');
    await assert.rejects(
      db.query('select public.create_workspace($1,$2,$3::jsonb)', ['Anon', 'anon', JSON.stringify(payload)]),
      error => error.code === '42501',
    );
  } finally {
    await db.close();
  }
});
