import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createLocalRepository } from '../src/workspace/local.js';
import { createLocalWorkspaceRepository } from '../src/workspace/local-panel-repository.ts';
import { seed } from '../src/data/seed.js';
import { emptyWorkspace } from '../src/data/workspace.js';
const owner = '00000000-0000-0000-0000-000000000001';
const guest = '00000000-0000-0000-0000-000000000002';
const member = '00000000-0000-0000-0000-000000000003';
const outsider = '00000000-0000-0000-0000-000000000004';
const client = '10000000-0000-0000-0000-000000000001';
const asset = '20000000-0000-0000-0000-000000000001';
const dataUrl = 'data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAA==';
const rejects = (promise, code) => assert.rejects(promise, e => e.code === code || e.message === code);
async function sqlSetup() {
  const db = new PGlite();
  for (const f of [
    'supabase/tests/bootstrap.sql',
    ...['202610160001_workspaces', '202610200001_normalized_work', '202610200002_agent_operations'].map(n => `supabase/migrations/${n}.sql`),
  ])
    await db.exec(await readFile(f, 'utf8'));
  await db.exec(`create table auth.oauth_clients(id uuid primary key,client_name text,deleted_at timestamptz);
    create table auth.oauth_authorizations(authorization_id text primary key,user_id uuid,client_id uuid,status text,expires_at timestamptz);
    create table auth.oauth_consents(user_id uuid,client_id uuid,revoked_at timestamptz);
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select,insert,update,delete on storage.objects to authenticated,anon;
    create policy unrelated_broad_policy on storage.objects for all to authenticated,anon using(true) with check(true);`);
  for (const n of [
    '202610200003_integration_grants',
    '202610200005_ui_contracts',
    '202610200006_file_duplication',
    '202610200007_task_graph_copy',
    '202610200008_team_membership_baselines',
    '202610200009_task_context_execution',
    '202610210010_organization_branding',
  ])
    await db.exec(await readFile(`supabase/migrations/${n}.sql`, 'utf8'));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  const ws = (await db.query("select public.create_workspace('Brand','brand','{\"projects\":[],\"tasks\":[]}') id")).rows[0].id;
  const other = (await db.query("select public.create_workspace('Other','other','{\"projects\":[],\"tasks\":[]}') id")).rows[0].id;
  await db.query('select public.migrate_workspace($1,0)', [ws]);
  await db.query('select public.migrate_workspace($1,0)', [other]);
  await db.query("insert into public.workspace_memberships values($1,$2,'member'),($1,$3,'guest')", [ws, member, guest]);
  await db.query("insert into auth.users(id,email) values($1,'outside@example.test')", [outsider]);
  const path = `${ws}/${asset}.webp`;
  const otherPath = `${other}/${asset}.webp`;
  const as = async (user = owner, oauth = '') => {
    await db.exec('reset role');
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.client_id',$2,false),set_config('request.jwt.claims','{}',false)",
      [user, oauth],
    );
    await db.exec('set role authenticated');
  };
  await as();
  return {
    db,
    ws,
    other,
    path,
    otherPath,
    as,
    command: async (input, version = 1, key = crypto.randomUUID(), workspace = ws) =>
      (await db.query("select public.execute_operation($1,'update_workspace',$2,$3,$4) result", [workspace, JSON.stringify(input), key, version])).rows[0]
        .result,
    read: async (operation = 'get_workspace', workspace = ws, query = {}) =>
      (await db.query('select public.read_operation($1,$2,$3) result', [workspace, operation, JSON.stringify(query)])).rows[0].result,
    upload: (name = path) => db.query("insert into storage.objects(bucket_id,name) values('organization-logos',$1)", [name]),
  };
}

test('SQL branding uses existing CAS, receipts, audit and isolated workspace projections', async () => {
  const h = await sqlSetup();
  try {
    assert.equal((await h.read()).data.logoPath, null);
    await rejects(h.command({ logoPath: h.path }), 'PT422');
    await h.upload();
    const saved = await h.command({ logoPath: h.path }, 1, 'save');
    assert.equal(saved.data.logoPath, h.path);
    assert.equal(saved.data.version, 2);
    assert.deepEqual(await h.command({ logoPath: h.path }, 1, 'save'), saved);
    await rejects(h.command({ logoPath: null }, 1, 'save'), 'PT409');
    await rejects(h.command({ logoPath: null }, 1), 'PT409');
    assert.equal((await h.read()).data.logoPath, h.path);
    assert.equal((await h.read('list_workspaces')).items.find(w => w.id === h.ws).logoPath, h.path);
    assert.equal((await h.read('list_workspaces')).items.find(w => w.id === h.other).logoPath, null);
    const old = await h.command({ name: 'Compatible' }, 2);
    assert.equal(old.data.logoPath, h.path);
    await h.upload(h.otherPath);
    await rejects(h.command({ logoPath: h.otherPath }, 3), 'PT422');
    for (const input of [{ logoPath: dataUrl }, { logoPath: null, unexpected: true }, { logoDataUrl: dataUrl }, {}])
      await rejects(h.command(input, 3), 'PT422');
    await rejects(
      h.db.query("select public.execute_operation($1,'batch',$2,'brand-rollback',null)", [
        h.ws,
        JSON.stringify({
          commands: [
            { operation: 'update_workspace', input: { logoPath: null }, expectedVersion: 3 },
            { operation: 'update_workspace', input: { name: 'Must roll back' }, expectedVersion: 3 },
          ],
        }),
      ]),
      'PT409',
    );
    assert.equal((await h.read()).data.logoPath, h.path);
    assert.equal((await h.read()).data.version, 3);
    await h.db.query("select public.execute_operation($1,'batch',$2,'brand-batch',null)", [
      h.ws,
      JSON.stringify({ commands: [{ operation: 'update_workspace', input: { logoPath: null }, expectedVersion: 3 }] }),
    ]);
    assert.equal((await h.read()).data.logoPath, null);
    assert.equal((await h.read()).data.version, 4);
    await h.db.exec('reset role');
    assert.equal(
      Number((await h.db.query("select count(*) n from public.domain_events where workspace_id=$1 and operation='update_workspace'", [h.ws])).rows[0].n),
      3,
    );
    assert.equal(
      Number((await h.db.query("select count(*) n from public.idempotency_requests where workspace_id=$1 and operation='update_workspace'", [h.ws])).rows[0].n),
      3,
    );
    await h.db.query("update public.workspace_memberships set role='member' where workspace_id=$1 and user_id=$2", [h.ws, owner]);
    await h.as();
    await rejects(h.command({ logoPath: h.path }, 1, 'save'), 'PT403');
  } finally {
    await h.db.close();
  }
});

test('Storage RLS checks real roles, prefix, revocation, OAuth and broad-policy isolation', async () => {
  const h = await sqlSetup();
  try {
    await h.upload();
    const can = async (path = h.path, write = true) =>
      (await h.db.query('select public.organization_logo_access($1,$2) allowed', [path, write])).rows[0].allowed;
    for (const path of ['', 'bad', `${h.ws}/../asset.webp`, `${h.ws}/${asset}.svg`, `${h.ws}/${asset}.webp/extra`, null]) assert.equal(await can(path), false);
    for (const user of [member, guest, outsider]) {
      await h.as(user);
      assert.equal(await can(), false);
      assert.equal(await can(h.path, false), user !== outsider);
      assert.equal((await h.db.query('select * from storage.objects')).rows.length, user === outsider ? 0 : 1);
      await assert.rejects(h.upload(`${h.ws}/${crypto.randomUUID()}.webp`), e => e.code === '42501');
      assert.equal((await h.db.query('delete from storage.objects returning *')).rows.length, 0);
      assert.equal((await h.db.query("update storage.objects set metadata='{}' returning *")).rows.length, 0);
      await rejects(h.command({ logoPath: null }), 'PT403');
    }
    await h.as();
    assert.equal(await can(), true);
    await h.db.exec('reset role');
    await h.db.query("update public.workspace_memberships set role='admin' where workspace_id=$1 and user_id=$2", [h.ws, member]);
    await h.as(member);
    const adminPath = `${h.ws}/${crypto.randomUUID()}.webp`;
    await h.upload(adminPath);
    assert.equal((await h.db.query("update storage.objects set metadata='{}' where name=$1 returning *", [adminPath])).rows.length, 1);
    assert.equal((await h.db.query('delete from storage.objects where name=$1 returning *', [adminPath])).rows.length, 1);
    assert.equal(await can(h.otherPath), false);
    await assert.rejects(h.upload(h.otherPath), e => e.code === '42501');
    await assert.rejects(h.db.query('update storage.objects set name=$2 where name=$1', [h.path, h.otherPath]), e => e.code === '42501');
    await h.db.exec('reset role');
    await h.db.query("insert into auth.oauth_clients values($1,'Test',null)", [client]);
    await h.db.query('insert into auth.oauth_consents values($1,$2,null)', [owner, client]);
    const connection = (
      await h.db.query(
        "insert into public.integration_connections(user_id,client_id,client_name,status,authorization_id) values($1,$2,'Test','active','fixture') returning id",
        [owner, client],
      )
    ).rows[0].id;
    await h.db.query("insert into public.integration_grants(connection_id,workspace_id,capability) values($1,$2,'read')", [connection, h.ws]);
    await h.as(owner, client);
    assert.equal(await can(), false);
    assert.equal(await can(h.path, false), true);
    await assert.rejects(h.upload(`${h.ws}/${crypto.randomUUID()}.webp`), e => e.code === '42501');
    await rejects(h.command({ logoPath: null }), 'PT403');
    await h.db.exec('reset role');
    await h.db.query("insert into public.agents(workspace_id,id,name,auth_user_id,client_id) values($1,'fixture-agent','Executor',$2,$3)", [
      h.ws,
      owner,
      client,
    ]);
    await h.db.query("update public.integration_grants set capability='write',agent_id='fixture-agent' where connection_id=$1", [connection]);
    await h.as(owner, client);
    assert.equal(await can(), false);
    await assert.rejects(h.upload(`${h.ws}/${crypto.randomUUID()}.webp`), e => e.code === '42501');
    await rejects(h.command({ logoPath: null }), 'PT403');
    await h.db.exec('reset role');
    await h.db.query("update public.integration_connections set status='revoked' where id=$1", [connection]);
    await h.as(owner, client);
    assert.equal(await can(h.path, false), false);
    await h.db.exec('reset role');
    await h.db.query("insert into public.agents(workspace_id,id,name,auth_user_id) values($1,'human-token-agent','Executor',$2)", [h.ws, owner]);
    await h.as();
    assert.equal(await can(), false);
    await rejects(h.command({ logoPath: null }), 'PT403');
    await h.as(member);
    await h.db.exec('reset role');
    await h.db.query('delete from public.workspace_memberships where workspace_id=$1 and user_id=$2', [h.ws, member]);
    await h.as(member);
    assert.equal(await can(h.path, false), false);
    await h.db.exec('reset role;set role anon');
    assert.equal((await h.db.query('select * from storage.objects')).rows.length, 0);
    await assert.rejects(h.upload(), e => e.code === '42501');
    await h.db.exec('reset role');
    for (const fn of ['public.operation_validate_before_branding(text,jsonb)', 'public.read_operation_before_branding(uuid,text,jsonb)'])
      assert.equal((await h.db.query("select has_function_privilege('authenticated',$1,'EXECUTE') allowed", [fn])).rows[0].allowed, false);
    assert.equal(
      (await h.db.query("select has_function_privilege('anon','public.organization_logo_access(text,boolean)','EXECUTE') allowed")).rows[0].allowed,
      false,
    );
    const bucket = (await h.db.query("select * from storage.buckets where id='organization-logos'")).rows[0];
    assert.equal(bucket.public, false);
    assert.equal(Number(bucket.file_size_limit), 2097152);
    assert.deepEqual(bucket.allowed_mime_types, ['image/png', 'image/jpeg', 'image/webp']);
  } finally {
    await h.db.close();
  }
});

async function localSetup() {
  const data = {
    ...seed(),
    me: owner,
    members: [
      { id: owner, name: 'Owner', role: 'Owner' },
      { id: member, name: 'Member', role: 'Member' },
    ],
  };
  const values = new Map([['gr8r.v2', JSON.stringify({ data })]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const persistence = createLocalRepository({ storage, seed, blank: emptyWorkspace });
  const options = { persistence, storage, identity: 'local', workspaceId: null };
  options.workspaceId = (await createLocalWorkspaceRepository(options).workspaces())[0].id;
  return { persistence, options, repo: createLocalWorkspaceRepository(options), values };
}

test('local demo persists bounded WebP only, with CAS/replay/removal and reload', async () => {
  const h = await localSetup();
  const command = (input, version, key = crypto.randomUUID()) => h.repo.command('update_workspace', { input, expectedVersion: version, idempotencyKey: key });
  const version = (await h.repo.workspaces())[0].version;
  const saved = await command({ logoDataUrl: dataUrl }, version, 'save');
  assert.equal(saved.data.logoPath, dataUrl);
  assert.deepEqual(await command({ logoDataUrl: dataUrl }, version, 'save'), saved);
  assert.equal((await createLocalWorkspaceRepository(h.options).workspaces())[0].logoPath, dataUrl);
  await rejects(command({ logoDataUrl: null }, version), 'version_conflict');
  for (const logoDataUrl of [
    '',
    'https://example.test/logo.webp',
    'data:image/svg+xml;base64,AAAA',
    'data:image/png;base64,AAAA',
    'data:image/webp;base64,!!!',
    'data:image/webp;base64,' + 'A'.repeat(65536),
    1,
    {},
  ])
    await rejects(command({ logoDataUrl }, version + 1), 'validation_error');
  await rejects(command({ logoPath: null }, version + 1), 'validation_error');
  const record = await h.persistence.load(h.options.workspaceId);
  record.data.me = member;
  await h.persistence.save(h.options.workspaceId, record.data, record.revision);
  await rejects(command({ logoDataUrl: dataUrl }, version, 'save'), 'forbidden');
  await rejects(command({ logoDataUrl: null }, version + 1), 'forbidden');
  const current = await h.persistence.load(h.options.workspaceId);
  current.data.me = owner;
  await h.persistence.save(h.options.workspaceId, current.data, current.revision);
  const freshVersion = (await h.repo.workspaces())[0].version;
  const cleared = await command({ logoDataUrl: null }, freshVersion);
  assert.equal(cleared.data.logoPath, null);
  assert.equal((await createLocalWorkspaceRepository(h.options).workspaces())[0].logoPath, null);
});
