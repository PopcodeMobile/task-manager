import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const owner = '00000000-0000-0000-0000-000000000001',
  guest = '00000000-0000-0000-0000-000000000002',
  other = '00000000-0000-0000-0000-000000000003',
  admin = '00000000-0000-0000-0000-000000000004',
  invitee = '00000000-0000-0000-0000-000000000005',
  unconfirmed = '00000000-0000-0000-0000-000000000006';
const reject = (p, code) => assert.rejects(p, e => e.code === code);
async function setup() {
  const db = new PGlite();
  await db.exec(await readFile('supabase/tests/bootstrap.sql', 'utf8'));
  const files = (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql') && !f.includes('0004_webhook')).sort();
  for (const f of files) {
    if (f.includes('0003_integration'))
      await db.exec(
        `create table auth.oauth_clients(id uuid primary key,client_name text,deleted_at timestamptz);create table auth.oauth_authorizations(authorization_id text primary key,user_id uuid,client_id uuid,status text,expires_at timestamptz);create table auth.oauth_consents(user_id uuid,client_id uuid,revoked_at timestamptz);`,
      );
    if (f.includes('0010_organization'))
      await db.exec(
        `create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant all on storage.objects to anon,authenticated;`,
      );
    await db.exec(await readFile(`supabase/migrations/${f}`, 'utf8'));
  }
  await db.query(
    `insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'admin@example.test',now(),'{}'),($2,'Invitee@Example.test',now(),'{"name":"Ana"}'),($3,'late@example.test',null,'{}')`,
    [admin, invitee, unconfirmed],
  );
  await db.exec('update auth.users set email_confirmed_at=now() where email_confirmed_at is null and email<>$$late@example.test$$');
  const q = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.result;
  const as = async (user = owner, client = '') => {
    await db.exec('reset role');
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.client_id',$2,false),set_config('request.jwt.claims','{}',false)",
      [user, client],
    );
    await db.exec('set role authenticated');
  };
  await as();
  const ws = await q(`select public.create_workspace('Delta','delta','{"projects":[],"tasks":[]}') result`);
  await db.exec('reset role');
  await db.query("insert into public.workspace_memberships values($1,$2,'admin'),($1,$3,'guest'),($1,$4,'member')", [ws, admin, guest, other]);
  await as();
  return {
    db,
    q,
    as,
    ws,
    invite: (email, role = 'member', workspace = ws) => q('select public.create_workspace_invitation($1,$2,$3) result', [workspace, email, role]),
    list: (workspace = ws) => q('select public.list_workspace_invitations($1) result', [workspace]),
    mine: () => q('select public.list_my_workspace_invitations() result'),
    accept: id => q('select public.accept_workspace_invitation($1) result', [id]),
    revoke: (id, workspace = ws) => q('select public.revoke_workspace_invitation($1,$2) result', [workspace, id]),
  };
}
test('owner invites, the verified invitee accepts and becomes a listed member', async () => {
  const h = await setup();
  try {
    const created = await h.invite('  INVITEE@example.TEST ', 'member');
    assert.equal(created.email, 'invitee@example.test');
    assert.equal(created.role, 'member');
    assert.equal(created.status, 'pending');
    assert.equal(created.workspaceName, 'Delta');
    assert.equal(created.inviterName, 'Um administrador');
    assert.ok(new Date(created.expiresAt) - Date.now() > 6.9 * 864e5);
    assert.equal((await h.list()).items.length, 1);
    await h.as(invitee);
    const mine = await h.mine();
    assert.equal(mine.items.length, 1);
    assert.equal(mine.items[0].workspaceName, 'Delta');
    assert.equal(mine.items[0].role, 'member');
    assert.equal(JSON.stringify(mine).includes('owner@example.test'), false);
    const accepted = await h.accept(created.id);
    assert.equal(accepted.workspaceId, h.ws);
    assert.equal(accepted.role, 'member');
    assert.deepEqual(await h.accept(created.id), accepted);
    assert.equal((await h.mine()).items.length, 0);
    const members = (await h.db.query('select user_id::text,role from public.list_workspace_members($1)', [h.ws])).rows;
    assert.ok(members.some(m => m.user_id === invitee && m.role === 'member'));
    await h.as();
    assert.equal((await h.list()).items.length, 0);
  } finally {
    await h.db.close();
  }
});
test('role matrix: owner grants admin, admin cannot, member and guest cannot invite, nobody grants owner', async () => {
  const h = await setup();
  try {
    assert.equal((await h.invite('a@example.test', 'admin')).role, 'admin');
    await reject(h.invite('b@example.test', 'owner'), 'PT422');
    await reject(h.invite('b@example.test', 'boss'), 'PT422');
    await h.as(admin);
    await reject(h.invite('b@example.test', 'admin'), 'PT403');
    assert.equal((await h.invite('b@example.test', 'guest')).role, 'guest');
    assert.equal((await h.list()).items.length, 2);
    for (const user of [other, guest, invitee]) {
      await h.as(user);
      await reject(h.invite('c@example.test'), 'PT403');
      await reject(h.list(), 'PT403');
    }
    await h.as(owner, 'claude-client');
    await reject(h.invite('c@example.test'), 'PT403');
  } finally {
    await h.db.close();
  }
});
test('invalid email, existing member and resend renew without duplicates', async () => {
  const h = await setup();
  try {
    for (const bad of ['', 'nope', 'a@b', 'a b@example.test', 'x<v@evil.test>@example.test', 'a,b@example.test', `${'x'.repeat(250)}@example.test`])
      await reject(h.invite(bad), 'PT422');
    await reject(h.invite('Admin@example.test'), 'PT422');
    const first = await h.invite('new@example.test', 'guest');
    await h.db.exec('reset role');
    await reject(h.invite('new@example.test', 'member'), 'PT429');
    await h.db.exec('reset role');
    await h.db.query("update public.workspace_invitations set expires_at=now()+interval '1 day',last_sent_at=now()-interval '11 minutes'");
    await h.as();
    const again = await h.invite('new@example.test', 'member');
    assert.equal(again.id, first.id);
    assert.equal(again.role, 'member');
    assert.ok(new Date(again.expiresAt) - Date.now() > 6.9 * 864e5);
    assert.equal((await h.list()).items.length, 1);
    await h.db.exec('reset role');
    await h.db.query("update public.workspace_invitations set last_sent_at=now()-interval '11 minutes',send_count=5");
    await h.as();
    await reject(h.invite('new@example.test', 'member'), 'PT429');
  } finally {
    await h.db.close();
  }
});
test('unconfirmed, wrong, expired and revoked invitations cannot be accepted', async () => {
  const h = await setup();
  try {
    const late = await h.invite('late@example.test');
    const ana = await h.invite('invitee@example.test');
    await h.as(unconfirmed);
    assert.equal((await h.mine()).items.length, 0);
    await reject(h.accept(late.id), 'PT404');
    await h.as(other);
    assert.equal((await h.mine()).items.length, 0);
    await reject(h.accept(ana.id), 'PT404');
    await h.as(invitee, 'claude-client');
    await reject(h.mine(), 'PT403');
    await reject(h.accept(ana.id), 'PT403');
    await h.as();
    assert.equal((await h.revoke(ana.id)).status, 'revoked');
    await h.as(invitee);
    await reject(h.accept(ana.id), 'PT404');
    await h.as();
    const fresh = await h.invite('invitee@example.test');
    assert.notEqual(fresh.id, ana.id);
    await h.db.exec('reset role');
    await h.db.query("update public.workspace_invitations set expires_at=now()-interval '1 second' where id=$1", [fresh.id]);
    await h.as(invitee);
    assert.equal((await h.mine()).items.length, 0);
    await reject(h.accept(fresh.id), 'PT404');
    await h.as();
    assert.equal((await h.list()).items.find(i => i.id === fresh.id).status, 'expired');
    await h.as(other);
    await reject(h.revoke(late.id), 'PT403');
  } finally {
    await h.db.close();
  }
});
test('tables stay private and sends are rate limited per workspace', async () => {
  const h = await setup();
  try {
    await reject(h.q('select count(*) result from public.workspace_invitations'), '42501');
    await h.db.exec('reset role');
    await h.db.query(
      "insert into public.workspace_invitations(workspace_id,email,role,invited_by,send_count,last_sent_at) select $1,'bulk'||g||'@example.test','member',$2,1,now() from generate_series(1,50) g",
      [h.ws, owner],
    );
    await h.as();
    await reject(h.invite('one-more@example.test'), 'PT429');
  } finally {
    await h.db.close();
  }
});
