import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
const hooks = registerHooks({
  load(url, context, next) {
    if (url.endsWith('.ts'))
      return { format: 'module', shortCircuit: true, source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8'), { mode: 'transform' }) };
    return next(url, context);
  },
});
const { taskServer } = await import('../supabase/functions/mcp/tools.ts');
const { authenticate } = await import('../supabase/functions/_shared/auth.ts');
hooks.deregister();
import { taskCreateCommand } from '../src/app/tasks/task-create-command.ts';
const owner = '00000000-0000-0000-0000-000000000001',
  member = '00000000-0000-0000-0000-000000000003';
async function setup() {
  const db = new PGlite();
  for (const file of [
    'supabase/tests/bootstrap.sql',
    ...['202610160001_workspaces', '202610200001_normalized_work', '202610200002_agent_operations'].map(n => `supabase/migrations/${n}.sql`),
  ])
    await db.exec(await readFile(file, 'utf8'));
  await db.exec(
    'create table auth.oauth_clients(id uuid primary key,client_name text,deleted_at timestamptz);create table auth.oauth_authorizations(authorization_id text primary key,user_id uuid,client_id uuid,status text,expires_at timestamptz);create table auth.oauth_consents(user_id uuid,client_id uuid,revoked_at timestamptz);',
  );
  for (const n of [
    '202610200003_integration_grants',
    '202610200005_ui_contracts',
    '202610200006_file_duplication',
    '202610200007_task_graph_copy',
    '202610200008_team_membership_baselines',
    '202610200009_task_context_execution',
  ])
    await db.exec(await readFile(`supabase/migrations/${n}.sql`, 'utf8'));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  const ws = (
    await db.query(
      'select public.create_workspace(\'Fix\',\'fix\',\'{"projects":[{"id":"p1","name":"P"}],"tasks":[{"id":"t1","project":"p1","title":"T"}]}\') id',
    )
  ).rows[0].id;
  await db.query('select public.migrate_workspace($1,0)', [ws]);
  await db.query("insert into public.workspace_memberships values($1,$2,'member')", [ws, member]);
  const cmd = async (op, input, version = null, key = crypto.randomUUID()) =>
    (await db.query('select public.execute_operation($1,$2,$3,$4,$5) result', [ws, op, JSON.stringify(input), key, version])).rows[0].result;
  const read = async (op, q = {}, w = ws) => (await db.query('select public.read_operation($1,$2,$3) result', [w, op, JSON.stringify(q)])).rows[0].result;
  return { db, ws, cmd, read };
}
test('009 MCP SDK context pages exact human instructions, task cursor binding and revocation', async () => {
  const { db, ws, cmd, read } = await setup();
  const originalFetch = globalThis.fetch,
    originalDeno = globalThis.Deno;
  let server, client;
  try {
    const cid = crypto.randomUUID(),
      connection = crypto.randomUUID();
    await db.query("insert into auth.oauth_clients values($1,'SDK',null);", [cid]);
    await db.query('insert into auth.oauth_consents values($1,$2,null)', [member, cid]);
    await db.query(
      "insert into public.integration_connections(id,user_id,client_id,client_name,status,authorization_id) values($1,$2,$3,'SDK','active','fixture')",
      [connection, member, cid],
    );
    await db.query("insert into public.agents(workspace_id,id,name,auth_user_id,client_id) values($1,'agent','Agent',$2,$3)", [ws, member, cid]);
    await db.query("insert into public.integration_grants(connection_id,workspace_id,capability,agent_id) values($1,$2,'write','agent')", [connection, ws]);
    await cmd('create_subtask', { id: 'sub', taskId: 't1', title: 'Current subtask' }, 1);
    await cmd('create_task', { id: 'dependency', projectId: 'p1', title: 'Dependency' });
    await cmd('set_task_dependency', { id: 't1', dependsOnTaskId: 'dependency' }, 2);
    await cmd('create_file', { id: 'file', taskId: 't1', name: 'Current file', fileType: 'doc' });
    await cmd('set_task_attachment', { id: 't1', fileId: 'file' }, 3);
    // Human instructions are committed after connection; generated bulk historical rows do not consume command quota.
    await db.query(
      "insert into public.comments(workspace_id,id,task_id,author_user_id,body) select $1,'c'||lpad(i::text,3,'0'),'t1',$2,'Historical '||i from generate_series(1,101)i",
      [ws, owner],
    );
    await cmd('add_task_comment', { id: 'z-new', taskId: 't1', body: 'Exact new instruction <b>retain</b> & text' });
    globalThis.Deno = { env: { get: key => ({ SUPABASE_URL: 'http://fixture', SUPABASE_ANON_KEY: 'fixture', AUTH_ISSUER: 'http://fixture/auth/v1' })[key] } };
    const token = [
      Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'),
      Buffer.from(JSON.stringify({ sub: member, client_id: cid, iss: 'http://fixture/auth/v1', aud: 'authenticated', exp: 9999999999 })).toString('base64url'),
      'fixture',
    ].join('.');
    globalThis.fetch = async (url, options) => {
      if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: member });
      const args = JSON.parse(options.body);
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.client_id',$2,false)", [member, cid]);
      try {
        return Response.json(await read(args.p_operation, args.p_query, args.p_workspace_id));
      } catch (error) {
        return Response.json({ code: error.code, message: error.message }, { status: 403 });
      }
    };
    const actor = await authenticate(new Request('http://fixture', { headers: { authorization: `Bearer ${token}` } }));
    server = taskServer(actor);
    client = new Client({ name: 'final-fix-proof', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    await client.connect(b);
    assert.equal((await client.listTools()).tools.length, 12);
    const first = (await client.callTool({ name: 'get_task', arguments: { workspace_id: ws, id: 't1', context: 'comments', limit: 100 } })).structuredContent;
    assert.equal(first.context.items.length, 100);
    assert.ok(first.context.nextCursor);
    const second = (
      await client.callTool({ name: 'get_task', arguments: { workspace_id: ws, id: 't1', context: 'comments', cursor: first.context.nextCursor } })
    ).structuredContent;
    assert.equal(second.context.items.at(-1).body, 'Exact new instruction <b>retain</b> & text');
    assert.equal(second.context.items.at(-1).authorUserId, owner);
    assert.equal(second.context.nextCursor, null);
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.client_id','',false)", [owner]);
    await cmd('delete_comment', { id: 'z-new' }, 1);
    const afterDelete = (
      await client.callTool({ name: 'get_task', arguments: { workspace_id: ws, id: 't1', context: 'comments', cursor: first.context.nextCursor } })
    ).structuredContent;
    assert.equal(
      afterDelete.context.items.some(c => c.id === 'z-new'),
      false,
    );
    assert.equal((await client.callTool({ name: 'get_task', arguments: { workspace_id: crypto.randomUUID(), id: 't1', context: 'comments' } })).isError, true);
    assert.equal(
      (await client.callTool({ name: 'get_task', arguments: { workspace_id: ws, id: 't1', context: 'subtasks', cursor: first.context.nextCursor } })).isError,
      true,
    );
    const malformedCursor = JSON.stringify([null, null, null, JSON.parse(first.context.nextCursor)[3]]);
    assert.equal(
      (await client.callTool({ name: 'get_task', arguments: { workspace_id: ws, id: 't1', context: 'comments', cursor: malformedCursor } })).isError,
      true,
    );
    for (const kind of ['subtasks', 'dependencies', 'files', 'attachments']) {
      const context = (await client.callTool({ name: 'get_task', arguments: { workspace_id: ws, id: 't1', context: kind } })).structuredContent.context;
      assert.equal(context.kind, kind);
      assert.equal(context.items.length, 1);
      assert.equal(context.nextCursor, null);
    }
    await db.query("update public.integration_connections set status='revoked' where id=$1", [connection]);
    assert.equal((await client.callTool({ name: 'get_task', arguments: { workspace_id: ws, id: 't1', context: 'comments' } })).isError, true);
  } finally {
    await client?.close();
    await server?.close();
    globalThis.fetch = originalFetch;
    globalThis.Deno = originalDeno;
    await db.close();
  }
});
test('009 blocked execution preserves renewal, clears on running/intervention, fences stale claimant and receipts', async () => {
  const { db, ws, cmd, read } = await setup();
  try {
    await db.query("insert into public.agents(workspace_id,id,name,auth_user_id) values($1,'agent','Agent',$2)", [ws, member]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [member]);
    const claim = (await cmd('claim_task', { id: 't1' }, 1)).data;
    const input = { id: 't1', claimToken: claim.claimToken, executionState: 'blocked', blockingReason: 'Need human decision' };
    const blocked = await cmd('renew_task_claim', input, 2, 'blocked');
    assert.deepEqual(await cmd('renew_task_claim', input, 2, 'blocked'), blocked);
    assert.deepEqual((await read('get_task', { id: 't1' })).data.execution, { state: 'blocked', reason: 'Need human decision', active: true });
    assert.equal((await db.query("select count(*)::int n from public.domain_events where payload->>'executionState'='blocked'")).rows[0].n, 1);
    await cmd('renew_task_claim', { id: 't1', claimToken: claim.claimToken }, 3);
    assert.equal((await read('get_task', { id: 't1' })).data.execution.reason, 'Need human decision');
    await assert.rejects(cmd('renew_task_claim', input, 3), /version_conflict/);
    await cmd('renew_task_claim', { id: 't1', claimToken: claim.claimToken, executionState: 'running' }, 4);
    assert.equal((await read('get_task', { id: 't1' })).data.execution.reason, null);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await cmd('intervene_task', { id: 't1', action: 'release' }, 5);
    assert.equal((await read('get_task', { id: 't1' })).data.execution, null);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [member]);
    await assert.rejects(cmd('renew_task_claim', input, 6), /claim_expired/);
  } finally {
    await db.close();
  }
});
test('009 completed creation is atomic, replay safe, and deletion cascades calendar/notifications', async () => {
  const { db, ws, cmd, read } = await setup();
  try {
    const before = (
      await db.query('select (select count(*)::int from public.domain_events) events, (select count(*)::int from public.idempotency_requests) receipts')
    ).rows[0];
    const command = taskCreateCommand({ id: 'completed', projectId: 'p1', title: 'Completed', status: 'done' });
    const first = await cmd(command.operation, command.input, null, 'complete-create');
    assert.equal(first.data.results.at(-1).data.status, 'done');
    assert.deepEqual(await cmd(command.operation, command.input, null, 'complete-create'), first);
    assert.equal((await read('list_tasks')).items.filter(t => t.id === 'completed').length, 1);
    const after = (
      await db.query('select (select count(*)::int from public.domain_events) events, (select count(*)::int from public.idempotency_requests) receipts')
    ).rows[0];
    assert.equal(after.events - before.events, 3);
    assert.equal(after.receipts - before.receipts, 3);
    await assert.rejects(cmd('create_task', { id: 'bad', projectId: 'p1', title: 'Bad', status: 'done' }), /validation_error/);
    await cmd('create_calendar_event', { id: 'cal', taskId: 't1', title: 'Calendar' });
    await db.query("insert into public.notifications(workspace_id,id,task_id,notification_type) values($1,'note','t1','comment')", [ws]);
    await cmd('delete_task', { id: 't1' }, 1);
    assert.deepEqual((await read('list_calendar_events')).items, []);
    assert.deepEqual((await read('list_notifications')).items, []);
  } finally {
    await db.close();
  }
});
test('residual revoked authority keeps an unexpired reservation locked until explicit human intervention', async () => {
  const { db, ws, cmd, read } = await setup();
  try {
    await db.query("insert into public.agents(workspace_id,id,name,auth_user_id) values($1,'agent','Agent',$2)", [ws, member]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [member]);
    await cmd('claim_task', { id: 't1' }, 1);
    await db.query("update public.workspace_memberships set role='guest' where workspace_id=$1 and user_id=$2", [ws, member]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    const task = (await read('get_task', { id: 't1' })).data;
    assert.equal(task.execution.active, false);
    assert.equal(task.reservation.active, true);
    await assert.rejects(cmd('complete_task', { id: 't1' }, task.version), /already_claimed/);
    await cmd('intervene_task', { id: 't1', action: 'release' }, task.version);
    const released = (await read('get_task', { id: 't1' })).data;
    assert.equal(released.reservation, null);
    assert.equal(released.execution, null);
    await cmd('complete_task', { id: 't1' }, released.version);
    assert.equal((await read('get_task', { id: 't1' })).data.status, 'done');
  } finally {
    await db.close();
  }
});
