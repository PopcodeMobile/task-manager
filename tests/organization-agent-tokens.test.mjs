import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const owner = '00000000-0000-0000-0000-000000000001',
  member = '00000000-0000-0000-0000-000000000003';
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
  const ws = await q(`select public.create_workspace('Tokens','tokens','{"projects":[],"tasks":[]}') result`);
  const other = await q(`select public.create_workspace('Other','other','{"projects":[],"tasks":[]}') result`);
  await db.query('select public.migrate_workspace($1,0),public.migrate_workspace($2,0)', [ws, other]);
  await db.exec('reset role');
  await db.query("insert into public.workspace_memberships values($1,$2,'member')", [ws, member]);
  await as();
  await q(`select public.execute_operation($1,'create_project','{"id":"p1","key":"TOK","name":"Fixture"}','project',null) result`, [ws]);
  return {
    db,
    q,
    as,
    ws,
    other,
    issue: (cap = 'write', days = 90, name = 'Fixture') => q('select public.create_organization_agent_token($1,$2,$3,$4) result', [ws, name, cap, days]),
    auth: token => q('select public.authenticate_organization_agent_token($1) result', [token]),
    read: (token, op = 'list_tasks', query = {}, workspace = ws) =>
      q('select public.read_organization_agent_operation($1,$2,$3,$4) result', [token, workspace, op, query]),
    exec: (token, op, input, key = crypto.randomUUID(), version = null, workspace = ws) =>
      q('select public.execute_organization_agent_operation($1,$2,$3,$4,$5,$6) result', [token, workspace, op, input, key, version]),
    rotate: (id, days = 90) => q('select public.rotate_organization_agent_token($1,$2,$3) result', [ws, id, days]),
    revoke: id => q('select public.revoke_organization_agent_token($1,$2) result', [ws, id]),
  };
}
test('real SQL issues private organization credentials and stable, accurate agent effects', async () => {
  const h = await setup();
  try {
    const issued = await h.issue();
    assert.match(issued.token, /^krs_[0-9a-f]{32}_[A-Za-z0-9_-]{43}$/);
    assert.equal(issued.connection.status, 'active');
    const a = await h.auth(issued.token);
    assert.equal(a.userId, null);
    assert.equal(a.clientId, null);
    assert.equal(a.agentId, issued.connection.agentId);
    const created = await h.exec(issued.token, 'create_task', { projectId: 'p1', title: 'Agent task' }, 'one');
    assert.deepEqual(await h.exec(issued.token, 'create_task', { projectId: 'p1', title: 'Agent task' }, 'one'), created);
    const comment = await h.exec(issued.token, 'add_task_comment', { taskId: created.data.id, body: 'Agent comment' });
    assert.equal(comment.data.authorUserId, null);
    assert.equal(comment.data.authorAgentId, a.agentId);
    const events = await h.read(issued.token, 'list_task_activity', { taskId: created.data.id });
    assert.equal(events.items[0].actorUserId, null);
    assert.equal(events.items[0].actorKind, 'organization_token');
    const list = await h.q('select public.list_organization_agent_tokens($1) result', [h.ws]);
    assert.equal(JSON.stringify(list).includes(issued.token), false);
    assert.equal(list.items.length, 1);
    const rotated = await h.rotate(issued.connection.id);
    assert.equal(rotated.connection.agentId, a.agentId);
    await reject(h.auth(issued.token), 'PT401');
    assert.deepEqual(await h.exec(rotated.token, 'create_task', { projectId: 'p1', title: 'Agent task' }, 'one'), created);
    await h.revoke(issued.connection.id);
    await h.revoke(issued.connection.id);
    await reject(h.exec(rotated.token, 'create_task', { projectId: 'p1', title: 'Agent task' }, 'one'), 'PT401');
    await reject(h.rotate(issued.connection.id), 'PT403');
  } finally {
    await h.db.close();
  }
});
test('real roles deny management, spoofed context, cross-org, read writes and expired replay', async () => {
  const h = await setup();
  try {
    const issued = await h.issue('read', null);
    assert.equal(issued.connection.expiresAt, null);
    await reject(h.exec(issued.token, 'create_task', { projectId: 'p1', title: 'Denied' }), 'PT403');
    await reject(h.read(issued.token, 'list_tasks', {}, h.other), 'PT403');
    await reject(h.read(issued.token, 'get_workspace'), 'PT403');
    await reject(h.exec(issued.token, 'create_project', { name: 'Denied' }), 'PT403');
    for (const name of ['', '\t\n', 'x'.repeat(101)]) await reject(h.issue('read', 90, name), 'PT422');
    for (const days of [0, 1, 60]) await reject(h.issue('read', days), 'PT422');
    await reject(h.issue('admin'), 'PT422');
    await h.as(member);
    for (const sql of ["select public.create_organization_agent_token($1,'No','read') result", 'select public.list_organization_agent_tokens($1) result'])
      await reject(h.q(sql, [h.ws]), 'PT403');
    await reject(h.rotate(issued.connection.id), 'PT403');
    await reject(h.revoke(issued.connection.id), 'PT403');
    await h.as(owner, '10000000-0000-0000-0000-000000000001');
    await reject(h.issue(), 'PT403');
    await reject(h.q('select public.list_organization_agent_tokens($1) result', [h.ws]), 'PT403');
    await h.as('');
    await h.db.exec('reset role;set role anon');
    for (const t of ['organization_agent_credentials', 'organization_agent_connections', 'organization_agent_context'])
      await reject(h.db.query(`select * from public.${t}`), '42501');
    await h.db.query("select set_config('kairos.organization_agent_id',$1,false),set_config('request.jwt.claims',$2,false)", [
      issued.connection.agentId,
      JSON.stringify({ connectionId: issued.connection.id, kind: 'organization_token' }),
    ]);
    await reject(h.q("select public.read_operation($1,'list_tasks') result", [h.ws]), '42501');
    await h.db.exec('reset role;set role authenticated');
    await reject(h.q("select public.read_operation($1,'list_tasks') result", [h.ws]), 'PT401');
    await reject(h.auth(issued.token.slice(0, -1) + '!'), 'PT401');
    await h.db.exec('reset role');
    await h.db.query("update public.organization_agent_credentials set expires_at=clock_timestamp()-interval '1 second' where connection_id=$1", [
      issued.connection.id,
    ]);
    await reject(h.auth(issued.token), 'PT401');
  } finally {
    await h.db.close();
  }
});
test('claims, CAS, rotation, creator deletion and revoked execution preserve reservations', async () => {
  const h = await setup();
  try {
    const issued = await h.issue();
    const t = (await h.exec(issued.token, 'create_task', { projectId: 'p1', title: 'Claim' })).data;
    const claim = await h.exec(issued.token, 'claim_task', { id: t.id }, 'claim', 1);
    assert.equal(claim.data.task.execution.active, true);
    await reject(h.exec(issued.token, 'update_task', { id: t.id, title: 'Bad', claimToken: claim.data.claimToken }, 'stale', 1), 'PT409');
    const next = await h.rotate(issued.connection.id);
    const blocked = await h.exec(
      next.token,
      'renew_task_claim',
      { id: t.id, claimToken: claim.data.claimToken, executionState: 'blocked', blockingReason: 'Waiting' },
      'block',
      2,
    );
    assert.equal(blocked.data.task.execution.state, 'blocked');
    const other = await h.issue();
    await reject(h.exec(other.token, 'complete_task', { id: t.id, claimToken: claim.data.claimToken }, 'steal', 3), 'PT409');
    await h.db.exec('reset role');
    await h.db.query("update public.workspace_memberships set role='admin' where workspace_id=$1 and user_id=$2", [h.ws, member]);
    await h.db.query('update public.workspaces set created_by=$1 where created_by=$2', [member, owner]);
    await h.db.query('update public.workspace_migrations set migrated_by=$1 where migrated_by=$2', [member, owner]);
    await h.db.query('delete from auth.users where id=$1', [owner]);
    assert.equal((await h.auth(next.token)).agentId, issued.connection.agentId);
    await h.as(member);
    await h.revoke(issued.connection.id);
    const view = await h.read(other.token, 'get_task', { id: t.id });
    assert.equal(view.data.execution.active, false);
    assert.equal(view.data.reservation.active, true);
    await reject(h.exec(other.token, 'claim_task', { id: t.id }, 'locked', 3), 'PT409');
  } finally {
    await h.db.close();
  }
});

test('all twelve allowed operations retain context pages, CAS, claims and the stable principal namespace', async () => {
  const h = await setup();
  try {
    const issued = await h.issue();
    const { token } = issued;
    const auth = await h.auth(token);
    assert.match(auth.agentId, /^[0-9a-f-]{36}$/);
    const workspaces = await h.read(token, 'list_workspaces', {}, null);
    assert.equal(workspaces.items.length, 1);
    assert.equal(workspaces.items[0].id, h.ws);
    assert.equal((await h.read(token, 'list_projects')).items[0].id, 'p1');
    const created = await h.exec(token, 'create_task', { projectId: 'p1', title: 'All operations' });
    const id = created.data.id;
    assert.equal((await h.read(token)).items[0].id, id);
    assert.equal((await h.read(token, 'get_task', { id })).data.title, 'All operations');
    const comment = await h.exec(token, 'add_task_comment', { taskId: id, body: 'Page content' });
    const context = await h.read(token, 'get_task', { id, context: 'comments', limit: 1 });
    assert.equal(context.context.items[0].authorAgentId, issued.connection.agentId);
    assert.equal(context.context.items[0].id, comment.data.id);
    const claim = await h.exec(token, 'claim_task', { id }, 'all-claim', 1);
    const claimToken = claim.data.claimToken;
    const updated = await h.exec(token, 'update_task', { id, title: 'Updated', claimToken }, 'all-update', 2);
    assert.equal(updated.data.version, 3);
    const renewed = await h.exec(token, 'renew_task_claim', { id, claimToken }, 'all-renew', 3);
    assert.equal(renewed.data.task.version, 4);
    const released = await h.exec(token, 'release_task_claim', { id, claimToken }, 'all-release', 4);
    assert.equal(released.data.task.reservation, null);
    assert.equal(released.data.task.version, 5);
    const second = await h.exec(token, 'claim_task', { id }, 'second-claim', 5);
    const completed = await h.exec(token, 'complete_task', { id, claimToken: second.data.claimToken }, 'complete', 6);
    assert.equal(completed.data.status, 'done');
    await h.db.exec('reset role');
    const row = (
      await h.db.query(
        'select actor_user_id,actor_kind,actor_client_id,actor_connection_id from public.idempotency_requests where workspace_id=$1 and key=$2',
        [h.ws, 'all-claim'],
      )
    ).rows[0];
    assert.equal(row.actor_user_id, auth.principalId);
    assert.equal(row.actor_kind, 'organization_token');
    assert.equal(row.actor_client_id, 'organization_token');
    assert.equal(row.actor_connection_id, issued.connection.id);
    assert.equal(Number((await h.db.query('select count(*) n from public.workspace_memberships where workspace_id=$1', [h.ws])).rows[0].n), 2);
    assert.equal(Number((await h.db.query('select count(*) n from public.organization_agent_context')).rows[0].n), 0);
  } finally {
    await h.db.close();
  }
});
test('metadata paging is workspace-bound, never includes credentials, and authority is live before replay', async () => {
  const h = await setup();
  try {
    const first = await h.issue('write', 30, ' First ');
    await h.issue('read', 365);
    assert.equal(first.connection.name, 'First');
    const list = (limit = 1, cursor = null, workspace = h.ws) =>
      h.q('select public.list_organization_agent_tokens($1,$2,$3) result', [workspace, limit, cursor]);
    const page = await list();
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].id, first.connection.id);
    assert.equal(typeof page.nextCursor, 'string');
    const next = await list(1, page.nextCursor);
    assert.equal(next.items.length, 1);
    assert.notEqual(next.items[0].id, first.connection.id);
    assert.equal(next.nextCursor, null);
    await reject(list(1, page.nextCursor, h.other), 'PT422');
    await reject(list(101), 'PT422');
    await reject(list(1, '{}'), 'PT422');
    const secret = first.token.split('_').at(-1);
    assert.equal(JSON.stringify(page).includes(secret), false);
    assert.equal(JSON.stringify(page).includes('secretHash'), false);
    const created = await h.exec(first.token, 'create_task', { projectId: 'p1', title: 'Expiry replay' }, 'expiry');
    await h.db.exec('reset role');
    await h.db.query("update public.organization_agent_credentials set expires_at=clock_timestamp()-interval '1 second' where connection_id=$1", [
      first.connection.id,
    ]);
    await reject(h.exec(first.token, 'create_task', { projectId: 'p1', title: 'Expiry replay' }, 'expiry'), 'PT401');
    await h.as();
    const rotated = await h.rotate(first.connection.id, null);
    assert.equal(rotated.connection.expiresAt, null);
    assert.deepEqual(await h.exec(rotated.token, 'create_task', { projectId: 'p1', title: 'Expiry replay' }, 'expiry'), created);
    await h.db.exec('reset role');
    await h.db.query("update public.workspace_memberships set role='member' where workspace_id=$1 and user_id=$2", [h.ws, owner]);
    await h.as();
    await reject(list(), 'PT403');
    await reject(h.rotate(first.connection.id), 'PT403');
    await reject(h.revoke(first.connection.id), 'PT403');
    assert.equal((await h.auth(rotated.token)).workspaceId, h.ws);
  } finally {
    await h.db.close();
  }
});
test('private helpers and transaction authority cannot be installed by public roles or claimed IDs', async () => {
  const h = await setup();
  try {
    const issued = await h.issue();
    for (const role of ['anon', 'authenticated']) {
      await h.db.exec(`reset role;set role ${role}`);
      for (const [sql, params] of [
        ['select public.organization_agent_actor()', []],
        ['select public.organization_agent_verify($1)', [issued.token]],
        ['select public.organization_agent_admin($1::uuid)', [h.ws]],
        ['select public.organization_agent_metadata($1::uuid)', [issued.connection.id]],
        ['select public.organization_agent_issue($1::uuid,90)', [issued.connection.id]],
        ['select public.operation_authorize($1::uuid,true)', [h.ws]],
      ])
        await reject(h.db.query(sql, params), '42501');
      await reject(
        h.db.query('insert into public.organization_agent_context values(pg_backend_pid(),txid_current(),$1)', [
          { userId: issued.connection.id, agentId: issued.connection.agentId, workspaceId: h.ws, role: 'owner', capability: 'write' },
        ]),
        '42501',
      );
    }
    await h.as('');
    await h.db.query(
      "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false),set_config('kairos.organization_agent_context',$2,false)",
      [
        issued.connection.id,
        JSON.stringify({
          kind: 'organization_token',
          principalId: issued.connection.id,
          workspaceId: h.ws,
          capability: 'write',
          agentId: issued.connection.agentId,
        }),
      ],
    );
    await reject(h.q('select public.execute_operation($1,\'create_task\',\'{"projectId":"p1","title":"Spoof"}\',\'spoof\',null) result', [h.ws]), 'PT403');
    await h.as('');
    await h.db.exec('begin');
    await h.exec(issued.token, 'create_task', { projectId: 'p1', title: 'Transactional' }, 'transaction');
    await reject(h.q("select public.read_operation($1,'list_tasks') result", [h.ws]), 'PT401');
    await h.db.exec('rollback');
  } finally {
    await h.db.close();
  }
});

test('issuance is no-store, invalid credentials never touch usage, and token reads retain rate fences', async () => {
  const h = await setup();
  try {
    await h.db.exec('begin');
    const issued = await h.issue();
    const headers = await h.q("select current_setting('response.headers')::jsonb result");
    assert.deepEqual(headers, [{ 'Cache-Control': 'no-store' }]);
    await h.db.exec('commit');
    const invalid = issued.token.slice(0, -1) + (issued.token.endsWith('A') ? 'B' : 'A');
    await reject(h.auth(invalid), 'PT401');
    await h.db.exec('reset role');
    assert.equal(
      (await h.db.query('select last_used_at from public.organization_agent_credentials where connection_id=$1', [issued.connection.id])).rows[0].last_used_at,
      null,
    );
    await h.db.query(
      "insert into public.operation_rate_limits(actor_user_id,client_id,window_start,requests) values($1,$2,date_trunc('minute',clock_timestamp()),240)",
      [issued.connection.id, 'organization_token:' + issued.connection.id],
    );
    await h.as('');
    await reject(h.read(issued.token), 'PT429');
  } finally {
    await h.db.close();
  }
});
