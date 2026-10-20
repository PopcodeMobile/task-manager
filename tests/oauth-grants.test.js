import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const uid = '00000000-0000-0000-0000-000000000001';
const client = '10000000-0000-0000-0000-000000000001';
async function setup() {
  const db = new PGlite();
  for (const file of [
    'supabase/tests/bootstrap.sql',
    'supabase/migrations/202610160001_workspaces.sql',
    'supabase/migrations/202610200001_normalized_work.sql',
    'supabase/migrations/202610200002_agent_operations.sql',
  ])
    await db.exec(await readFile(file, 'utf8'));
  await db.exec(
    `create table auth.oauth_clients(id uuid primary key,client_name text,deleted_at timestamptz); create table auth.oauth_authorizations(authorization_id text primary key,user_id uuid,client_id uuid,status text,expires_at timestamptz); create table auth.oauth_consents(user_id uuid,client_id uuid,revoked_at timestamptz);`,
  );
  const migration = await readFile('supabase/migrations/202610200003_integration_grants.sql', 'utf8').catch(() => null);
  assert.ok(migration, 'OAuth grants migration must exist');
  await db.exec(migration);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  const w = (
    await db.query(
      'select public.create_workspace(\'OAuth\',\'oauth\',\'{"projects":[{"id":"p1","name":"P","key":"O"}],"tasks":[{"id":"t1","project":"p1","title":"Task"}]}\') id',
    )
  ).rows[0].id;
  await db.query('select public.migrate_workspace($1,0)', [w]);
  await db.query("insert into auth.oauth_clients values ($1,'Claude',null)", [client]);
  await db.query("insert into auth.oauth_authorizations values('real-auth',$1,$2,'pending',now()+interval '10 minutes')", [uid, client]);
  return { db, w };
}
const denied = p => assert.rejects(p, e => e.message === 'forbidden');
async function prepare(db, w, capability = 'read') {
  return (await db.query('select public.prepare_integration_consent($1,$2::jsonb) data', ['real-auth', JSON.stringify([{ workspaceId: w, capability }])]))
    .rows[0].data;
}
async function activate(db) {
  await db.exec("update auth.oauth_authorizations set status='approved';");
  await db.query('insert into auth.oauth_consents values($1,$2,null)', [uid, client]);
  await db.query("select public.activate_integration_consent('real-auth')");
}
async function delegated(db) {
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: uid, client_id: client })]);
}
test('consent resolves Auth request, stages inactive grants, and readonly creates no executor', async () => {
  const { db, w } = await setup();
  try {
    await denied(db.query('select public.prepare_integration_consent($1,$2::jsonb)', ['forged', JSON.stringify([{ workspaceId: w, capability: 'write' }])]));
    await prepare(db, w);
    await delegated(db);
    await denied(db.query("select public.read_operation($1,'list_tasks')", [w]));
    await db.exec("select set_config('request.jwt.claims','{}',false)");
    await denied(db.query("select public.activate_integration_consent('real-auth')"));
    await activate(db);
    assert.equal((await db.query('select count(*) n from public.agents')).rows[0].n, 0);
    await delegated(db);
    assert.equal((await db.query("select public.read_operation($1,'list_tasks') data", [w])).rows[0].data.items.length, 1);
    await denied(db.query("select public.execute_operation($1,'claim_task','{\"id\":\"t1\"}','claim',1)", [w]));
    await denied(db.query("select public.prepare_integration_consent('real-auth','[]')"));
  } finally {
    await db.close();
  }
});
test('write connection binds executor and revocation/membership defeats direct RPC and replay', async () => {
  const { db, w } = await setup();
  try {
    const c = await prepare(db, w, 'write');
    await activate(db);
    await delegated(db);
    const claim = (await db.query("select public.execute_operation($1,'claim_task','{\"id\":\"t1\"}','claim',1) data", [w])).rows[0].data;
    assert.ok(claim.data.task.executorAgentId);
    assert.equal((await db.query('select actor_connection_id from public.domain_events')).rows[0].actor_connection_id, c.connectionId);
    await db.exec("select set_config('request.jwt.claims','{}',false)");
    await db.query('select public.revoke_integration_connection($1)', [c.connectionId]);
    await delegated(db);
    await denied(db.query('select public.read_operation($1,\'get_task\',\'{"taskId":"t1"}\')', [w]));
    await denied(db.query("select public.execute_operation($1,'claim_task','{\"id\":\"t1\"}','claim',1)", [w]));
    await db.exec("update public.integration_connections set status='active'; delete from public.workspace_memberships;");
    await denied(db.query("select public.read_operation($1,'list_tasks')", [w]));
    assert.equal((await db.query('select count(*) n from public.domain_events')).rows[0].n, 1);
  } finally {
    await db.close();
  }
});
test('denied/cancelled authorization never activates and Auth revocation is immediate', async () => {
  const { db, w } = await setup();
  try {
    await prepare(db, w, 'write');
    await db.query("select public.cancel_integration_consent('real-auth')");
    await db.exec("update auth.oauth_authorizations set status='denied'");
    await denied(db.query("select public.activate_integration_consent('real-auth')"));
    assert.equal((await db.query("select count(*) n from public.integration_connections where status='active'")).rows[0].n, 0);
    await db.exec("update auth.oauth_authorizations set status='pending'");
    await prepare(db, w, 'write');
    await activate(db);
    await delegated(db);
    await db.exec('update auth.oauth_consents set revoked_at=now()');
    await denied(db.query("select public.read_operation($1,'list_tasks')", [w]));
  } finally {
    await db.close();
  }
});

test('reconsent write to read disables the existing executor and another request cannot activate it', async () => {
  const { db, w } = await setup();
  try {
    const connection = await prepare(db, w, 'write');
    await activate(db);
    assert.equal((await db.query('select count(*) n from public.agents')).rows[0].n, 1);
    await db.exec("update auth.oauth_authorizations set status='pending'");
    await prepare(db, w, 'read');
    await delegated(db);
    await denied(db.query("select public.read_operation($1,'list_tasks')", [w]));
    await db.exec("select set_config('request.jwt.claims','{}',false);update auth.oauth_authorizations set status='approved'");
    await db.query("select public.activate_integration_consent('real-auth')");
    assert.equal((await db.query('select agent_id from public.integration_grants where connection_id=$1', [connection.connectionId])).rows[0].agent_id, null);
    await delegated(db);
    await denied(db.query("select public.execute_operation($1,'claim_task','{\"id\":\"t1\"}','stale-writer',1)", [w]));
    await db.exec(
      "select set_config('request.jwt.claims','{}',false);update auth.oauth_authorizations set status='pending';insert into auth.oauth_authorizations select 'other-auth',user_id,client_id,'pending',expires_at from auth.oauth_authorizations where authorization_id='real-auth'",
    );
    await prepare(db, w, 'write');
    await db.query('select public.prepare_integration_consent($1,$2::jsonb)', ['other-auth', JSON.stringify([{ workspaceId: w, capability: 'read' }])]);
    await db.exec("update auth.oauth_authorizations set status='approved'");
    await denied(db.query("select public.activate_integration_consent('real-auth')"));
    assert.equal((await db.query('select status from public.integration_connections')).rows[0].status, 'pending');
  } finally {
    await db.close();
  }
});

test('failed activation rolls back executor creation and guest grants never widen membership', async () => {
  const { db, w } = await setup();
  try {
    await db.query("update public.workspace_memberships set role='guest' where workspace_id=$1", [w]);
    await denied(prepare(db, w, 'write'));
    await prepare(db, w, 'read');
    await activate(db);
    await delegated(db);
    await denied(db.query("select public.execute_operation($1,'claim_task','{\"id\":\"t1\"}','guest',1)", [w]));
    await db.exec(
      "select set_config('request.jwt.claims','{}',false);update public.workspace_memberships set role='owner';update auth.oauth_authorizations set status='pending'",
    );
    await prepare(db, w, 'write');
    await db.exec("update auth.oauth_authorizations set status='approved';delete from public.workspace_memberships");
    await denied(db.query("select public.activate_integration_consent('real-auth')"));
    assert.equal((await db.query('select count(*) n from public.agents')).rows[0].n, 0);
    assert.equal((await db.query('select status from public.integration_connections')).rows[0].status, 'pending');
    const helper = (await db.query("select has_function_privilege('authenticated','public.operation_authorize(uuid,boolean)','execute') allowed")).rows[0];
    assert.equal(helper.allowed, false);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select * from public.integration_connections'), e => e.code === '42501');
  } finally {
    await db.close();
  }
});

test('an incompatible Auth beta schema fails closed with a safe service error', async () => {
  const { db, w } = await setup();
  try {
    await prepare(db, w, 'read');
    await activate(db);
    await delegated(db);
    await db.exec('drop table auth.oauth_consents');
    await assert.rejects(db.query("select public.read_operation($1,'list_tasks')", [w]), e => e.message === 'temporarily_unavailable');
  } finally {
    await db.close();
  }
});
