import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const owner = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000003';
async function setup() {
  const migration = await readFile(new URL('../supabase/migrations/202610200002_agent_operations.sql', import.meta.url), 'utf8').catch(() => null);
  assert.ok(migration, 'transactional operations migration must exist');
  const db = new PGlite();
  for (const file of [
    'supabase/tests/bootstrap.sql',
    'supabase/migrations/202610160001_workspaces.sql',
    'supabase/migrations/202610200001_normalized_work.sql',
  ])
    await db.exec(await readFile(file, 'utf8'));
  await db.exec(migration);
  await db.exec(await readFile('supabase/migrations/202610200005_ui_contracts.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/202610200006_file_duplication.sql', 'utf8'));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  const ws = (
    await db.query(
      'select public.create_workspace(\'Test\',\'test\',\'{"projects":[{"id":"p1","key":"WEB","name":"P"}],"tasks":[{"id":"t1","project":"p1","title":"T"}]}\') as id',
    )
  ).rows[0].id;
  await db.query('select public.migrate_workspace($1,0)', [ws]);
  await db.query("insert into public.workspace_memberships values ($1,$2,'member')", [ws, other]);
  return { db, ws };
}
async function actor(db, uid) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
}
async function command(db, ws, op, input = {}, version = null, key = crypto.randomUUID()) {
  return (await db.query('select public.execute_operation($1,$2,$3::jsonb,$4,$5) as result', [ws, op, JSON.stringify(input), key, version])).rows[0].result;
}
const rejects = (promise, code) => assert.rejects(promise, e => e.message === code);

test('claims fence edits, takeover, stale completion and human intervention with CAS', async () => {
  const { db, ws } = await setup();
  try {
    await db.query("insert into public.agents(workspace_id,id,name,auth_user_id) values ($1,'a1','One',$2),($1,'a2','Two',$3)", [ws, owner, other]);
    await rejects(command(db, ws, 'update_task', { id: 't1', title: 'No lease' }, 1), 'claim_expired');
    const first = await command(db, ws, 'claim_task', { id: 't1' }, 1);
    assert.equal(first.data.task.executorAgentId, 'a1');
    assert.equal(new Date(first.data.expiresAt) - new Date(first.data.claimedAt), 15 * 60 * 1000);
    await actor(db, other);
    await rejects(command(db, ws, 'claim_task', { id: 't1' }, 2), 'already_claimed');
    await rejects(command(db, ws, 'update_task', { id: 't1', title: 'Intrusion', claimToken: first.data.claimToken }, 2), 'claim_expired');
    await db.query("update public.task_claims set expires_at=now()-interval '1 second' where workspace_id=$1", [ws]);
    const second = await command(db, ws, 'claim_task', { id: 't1' }, 2);
    await actor(db, owner);
    await rejects(command(db, ws, 'complete_task', { id: 't1', claimToken: first.data.claimToken }, 3), 'claim_expired');
    await actor(db, other);
    await rejects(command(db, ws, 'update_task', { id: 't1', status: 'done', claimToken: second.data.claimToken }, 3), 'validation_error');
    await rejects(command(db, ws, 'update_task', { id: 't1', executorAgentId: 'a1', claimToken: second.data.claimToken }, 3), 'validation_error');
    const renewed = await command(db, ws, 'renew_task_claim', { id: 't1', claimToken: second.data.claimToken }, 3);
    assert.equal(renewed.data.task.version, 4);
    await db.query('delete from public.agents where workspace_id=$1 and id=$2', [ws, 'unused']).catch(() => {});
    // A human is determined by server identity, never by input flags.
    await db.query('update public.agents set auth_user_id=null where workspace_id=$1 and id=$2', [ws, 'a1']);
    await actor(db, owner);
    await rejects(command(db, ws, 'delete_task', { id: 't1' }, 4), 'already_claimed');
    await rejects(command(db, ws, 'intervene_task', { id: 't1', action: 'complete' }, 3), 'version_conflict');
    const intervention = await command(db, ws, 'intervene_task', { id: 't1', action: 'complete' }, 4);
    assert.equal(intervention.data.status, 'done');
    await actor(db, other);
    await rejects(command(db, ws, 'complete_task', { id: 't1', claimToken: second.data.claimToken }, 5), 'claim_expired');
  } finally {
    await db.close();
  }
});

test('idempotency authenticates before replay, binds payload and retains immutable audit', async () => {
  const { db, ws } = await setup();
  try {
    const input = { projectId: 'p1', title: 'New' },
      key = 'same-command';
    const one = await command(db, ws, 'create_task', input, null, key);
    assert.deepEqual(await command(db, ws, 'create_task', input, null, key), one);
    await rejects(command(db, ws, 'create_task', { ...input, title: 'Different' }, null, key), 'idempotency_conflict');
    assert.equal(Number((await db.query('select count(*) n from public.domain_events')).rows[0].n), 1);
    const ttl = (await db.query('select expires_at-created_at as ttl from public.idempotency_requests')).rows[0].ttl;
    assert.ok(ttl);
    await db.query('delete from public.workspace_memberships where workspace_id=$1 and user_id=$2', [ws, owner]);
    await rejects(command(db, ws, 'create_task', input, null, key), 'forbidden');
    assert.equal((await db.query('select actor_user_id from public.domain_events')).rows[0].actor_user_id, owner);
  } finally {
    await db.close();
  }
});

test('versioning, project sequences, recurrence, graph references and direct RPC authorization', async () => {
  const { db, ws } = await setup();
  try {
    const a = await command(db, ws, 'create_task', { projectId: 'p1', title: 'A', recurrence: 'Weekly', dueDate: '2026-10-20' });
    const b = await command(db, ws, 'create_task', { projectId: 'p1', title: 'B' });
    assert.notEqual(a.data.key, b.data.key);
    await rejects(command(db, ws, 'update_task', { id: 't1', title: 'CAS' }, 99), 'version_conflict');
    await rejects(command(db, ws, 'create_task', { projectId: 'missing', title: 'No' }), 'validation_error');
    await rejects(command(db, ws, 'update_task', { id: 't1', status: 'done' }, 1), 'validation_error');
    const done = await command(db, ws, 'complete_task', { id: a.data.id }, 1);
    assert.equal(done.data.status, 'done');
    const recurring = (await db.query("select * from public.tasks where title='A' and status='todo'")).rows;
    assert.equal(recurring.length, 1);
    assert.equal(new Date(recurring[0].due_date).toISOString().slice(0, 10), '2026-10-27');
    await rejects(command(db, ws, 'set_task_dependency', { id: 't1', dependsOnTaskId: 'missing' }, 1), 'validation_error');
    await rejects(command(db, ws, 'update_task', { id: 't1', title: 'Spoof', actorUserId: other }, 1), 'validation_error');
    await db.exec('set role authenticated');
    await rejects(db.query("update public.tasks set title='Bypass'"), 'permission denied for table tasks');
    await db.exec('reset role');
    await actor(db, other);
    await db.query('select set_config(\'request.jwt.claims\',\'{"client_id":"ungranted"}\',false)');
    await rejects(command(db, ws, 'create_task', { projectId: 'p1', title: 'OAuth' }), 'forbidden');
    await rejects(db.query('select public.read_operation($1,$2,$3)', [ws, 'list_tasks', '{}']), 'forbidden');
  } finally {
    await db.close();
  }
});

test('read APIs omit legacy workspace data, isolate preferences and enforce bounded pages', async () => {
  const { db, ws } = await setup();
  try {
    const read = async (op, q = {}) => (await db.query('select public.read_operation($1,$2,$3::jsonb) result', [ws, op, JSON.stringify(q)])).rows[0].result;
    const page = await read('list_tasks', { limit: 1 });
    assert.equal(page.items.length, 1);
    await rejects(read('list_tasks', { limit: 101 }), 'validation_error');
    const workspaces = await read('list_workspaces');
    assert.equal(workspaces.items[0].legacyMetadata, undefined);
    await command(db, ws, 'set_preferences', { preferences: { favoriteTaskIds: ['t1'] } });
    await actor(db, other);
    assert.equal((await read('get_preferences')).data, null);
  } finally {
    await db.close();
  }
});

test('graph commands mutate typed entities with CAS and preserve whitelisted ancillary fields', async () => {
  const { db, ws } = await setup();
  try {
    const project = await command(
      db,
      ws,
      'update_project',
      { id: 'p1', attributes: { icon: 'rocket', color: 'indigo', milestones: [{ name: 'Launch', date: '2026-12-01' }] } },
      1,
    );
    assert.equal(project.data.legacyMetadata.icon, 'rocket');
    const task = await command(db, ws, 'update_task', { id: 't1', attributes: { estimate: '2h' } }, 1);
    assert.equal(task.data.legacyMetadata.estimate, '2h');
    const read = (await db.query('select public.read_operation($1,$2,$3) result', [ws, 'get_task', '{"id":"t1"}'])).rows[0].result;
    assert.equal(read.data.legacyMetadata.estimate, '2h');
    await rejects(command(db, ws, 'update_task', { id: 't1', attributes: { actorUserId: other } }, 2), 'validation_error');
    const team = await command(db, ws, 'create_team', { name: 'Team' });
    await command(db, ws, 'update_team', { id: team.data.id, description: 'New' }, 1);
    await rejects(command(db, ws, 'update_team', { id: team.data.id, name: 'Stale' }, 1), 'version_conflict');
    await command(db, ws, 'set_team_member', { id: team.data.id, userId: other }, 2);
    await command(db, ws, 'remove_team_member', { id: team.data.id, userId: other }, 3);
    await command(db, ws, 'delete_team', { id: team.data.id }, 4);
    const label = await command(db, ws, 'create_label', { name: 'Bug' });
    await command(db, ws, 'set_task_label', { id: 't1', labelId: label.data.id }, 2);
    await command(db, ws, 'remove_task_label', { id: 't1', labelId: label.data.id }, 3);
    const sub = await command(db, ws, 'create_subtask', { taskId: 't1', title: 'Sub' }, 4);
    await command(db, ws, 'update_subtask', { id: sub.data.id, taskId: 't1', done: true }, 5);
    await command(db, ws, 'delete_subtask', { id: sub.data.id, taskId: 't1' }, 6);
    const view = await command(db, ws, 'create_view', { projectId: 'p1', name: 'Board', viewType: 'board', filters: [] });
    await command(db, ws, 'update_view', { id: view.data.id, name: 'Table', viewType: 'table' }, 1);
    await command(db, ws, 'delete_view', { id: view.data.id }, 2);
    const file = await command(db, ws, 'create_file', { taskId: 't1', projectId: 'p1', name: 'Doc', fileType: 'doc' });
    assert.equal(file.data.authorUserId, owner);
    await command(db, ws, 'update_file', { id: file.data.id, name: 'Updated' }, 1);
    await command(db, ws, 'delete_file', { id: file.data.id }, 2);
    const calendar = await command(db, ws, 'create_calendar_event', { taskId: 't1', projectId: 'p1', title: 'Event', eventDate: '2026-12-01' });
    await command(db, ws, 'update_calendar_event', { id: calendar.data.id, title: 'Next' }, 1);
    await command(db, ws, 'delete_calendar_event', { id: calendar.data.id }, 2);
    const comment = await command(db, ws, 'add_task_comment', { taskId: 't1', body: 'Hi' });
    await command(db, ws, 'add_reaction', { commentId: comment.data.id, reaction: 'ok' });
    await actor(db, other);
    await command(db, ws, 'remove_reaction', { commentId: comment.data.id, reaction: 'ok' });
    assert.equal(Number((await db.query('select count(*) n from public.comment_reactions')).rows[0].n), 1);
    await actor(db, owner);
    await command(db, ws, 'remove_reaction', { commentId: comment.data.id, reaction: 'ok' });
    await command(db, ws, 'set_project_member', { id: 'p1', userId: other }, 2);
    await command(db, ws, 'remove_project_member', { id: 'p1', userId: other }, 3);
    const created = (await db.query("select public.create_workspace_v2('New','new','create') result")).rows[0].result;
    assert.equal(created.data.storageVersion, 2);
    assert.deepEqual((await db.query("select public.create_workspace_v2('New','new','create') result")).rows[0].result, created);
  } finally {
    await db.close();
  }
});

test('event failure rolls back mutation, generated recurrence and idempotency atomically', async () => {
  const { db, ws } = await setup();
  try {
    await db.exec(
      "create function public.reject_test_event() returns trigger language plpgsql as $$ begin raise exception 'outbox_failed';end $$;create trigger test_outbox_failure before insert on public.domain_events for each row execute function public.reject_test_event();",
    );
    await rejects(command(db, ws, 'create_task', { projectId: 'p1', title: 'Rollback' }, null, 'rollback'), 'outbox_failed');
    assert.equal(Number((await db.query("select count(*) n from public.tasks where title='Rollback'")).rows[0].n), 0);
    assert.equal(Number((await db.query('select count(*) n from public.idempotency_requests')).rows[0].n), 0);
    await db.exec('drop trigger test_outbox_failure on public.domain_events');
    const created = await command(
      db,
      ws,
      'create_task',
      { projectId: 'p1', title: 'Rollback', recurrence: 'Weekly', dueDate: '2026-12-01', attributes: { estimate: '3h' } },
      null,
      'rollback',
    );
    const duplicated = await command(db, ws, 'duplicate_task', { id: created.data.id }, 1);
    assert.equal(duplicated.data.legacyMetadata.estimate, '3h');
    await db.exec('create trigger test_outbox_failure before insert on public.domain_events for each row execute function public.reject_test_event();');
    await rejects(command(db, ws, 'complete_task', { id: created.data.id }, 1), 'outbox_failed');
    assert.equal((await db.query('select status from public.tasks where id=$1', [created.data.id])).rows[0].status, 'todo');
    assert.equal(Number((await db.query("select count(*) n from public.tasks where title='Rollback'")).rows[0].n), 2);
  } finally {
    await db.close();
  }
});

test('SQL limits successful activity persistently and keeps claim tokens private', async () => {
  const { db, ws } = await setup();
  try {
    await db.query("insert into public.agents(workspace_id,id,name,auth_user_id) values($1,'a1','Agent',$2)", [ws, owner]);
    const claimed = await command(db, ws, 'claim_task', { id: 't1' }, 1);
    const events = (await db.query('select * from public.domain_events')).rows;
    assert.equal(JSON.stringify(events).includes(claimed.data.claimToken), false);
    await db.query('update public.operation_rate_limits set requests=240');
    await rejects(command(db, ws, 'add_task_comment', { taskId: 't1', body: 'Too many' }), 'rate_limited');
    assert.equal(Number((await db.query('select count(*) n from public.comments')).rows[0].n), 0);
  } finally {
    await db.close();
  }
});

test('human workspace discovery includes safe legacy candidates and OAuth remains closed', async () => {
  const { db, ws } = await setup();
  try {
    const legacy = (await db.query('select public.create_workspace(\'Legacy\',\'legacy\',\'{"projects":[],"tasks":[],"future":"hidden"}\') id')).rows[0].id;
    const read = async () => (await db.query("select public.read_operation(null,'list_workspaces','{}') result")).rows[0].result;
    const page = await read();
    const item = page.items.find(x => x.id === legacy);
    assert.equal(item.storageVersion, 1);
    assert.equal(item.role, 'owner');
    assert.equal(Object.hasOwn(item, 'legacyMetadata'), false);
    assert.equal(Object.hasOwn(item, 'legacy_metadata'), false);
    assert.equal(Object.hasOwn(item, 'payload'), false);
    await db.query('select set_config(\'request.jwt.claims\',\'{"client_id":"no-grant"}\',false)');
    assert.equal((await read()).items.length, 0);
    await db.query("select set_config('request.jwt.claims','{}',false)");
    assert.equal((await db.query('select storage_version from public.workspaces where id=$1', [legacy])).rows[0].storage_version, 1);
    assert.equal((await db.query('select storage_version from public.workspaces where id=$1', [ws])).rows[0].storage_version, 2);
  } finally {
    await db.close();
  }
});

test('attachments and labels cannot let an agent alter unrelated reserved tasks', async () => {
  const { db, ws } = await setup();
  try {
    const file = await command(db, ws, 'create_file', { name: 'Reference', fileType: 'doc' });
    await command(db, ws, 'set_task_attachment', { id: 't1', fileId: file.data.id, sortOrder: 0 }, 1);
    const label = await command(db, ws, 'create_label', { name: 'Protected' });
    await command(db, ws, 'set_task_label', { id: 't1', labelId: label.data.id }, 2);
    await db.query("insert into public.agents(workspace_id,id,name,auth_user_id) values($1,'a2','Agent',$2)", [ws, other]);
    await actor(db, other);
    await rejects(command(db, ws, 'delete_file', { id: file.data.id }, 1), 'forbidden');
    await rejects(command(db, ws, 'delete_label', { id: label.data.id }, 1), 'forbidden');
    await rejects(command(db, ws, 'remove_task_attachment', { id: 't1', fileId: file.data.id }, 3), 'claim_expired');
    await actor(db, owner);
    await command(db, ws, 'remove_task_attachment', { id: 't1', fileId: file.data.id }, 3);
    assert.equal(Number((await db.query('select count(*) n from public.task_attachments')).rows[0].n), 0);
  } finally {
    await db.close();
  }
});

test('direct RPCs validate personal-state schemas and paginate immutable workspace activity', async () => {
  const { db, ws } = await setup();
  try {
    await rejects(command(db, ws, 'set_preferences', { preferences: { favoriteTaskIds: 42 } }), 'validation_error');
    await command(db, ws, 'add_task_comment', { taskId: 't1', body: 'One' });
    await command(db, ws, 'add_task_comment', { taskId: 't1', body: 'Two' });
    const read = async query =>
      (await db.query('select public.read_operation($1,$2,$3) result', [ws, 'list_domain_events', JSON.stringify(query)])).rows[0].result;
    const one = await read({ limit: 1 });
    assert.equal(one.items.length, 1);
    assert.ok(one.nextCursor);
    const two = await read({ limit: 1, cursor: one.nextCursor });
    assert.notEqual(one.items[0].id, two.items[0].id);
    assert.equal(two.nextCursor, null);
  } finally {
    await db.close();
  }
});

test('authenticated project deletion succeeds for empty/internal graphs and rejects an active descendant claim', async () => {
  const { db, ws } = await setup();
  try {
    await db.exec('set role authenticated');
    await command(db, ws, 'delete_task', { id: 't1' }, 1);
    const empty = await command(db, ws, 'delete_project', { id: 'p1' }, 1);
    assert.equal(empty.data.deleted, true);
    const project = await command(db, ws, 'create_project', { name: 'Internal graph' });
    const first = await command(db, ws, 'create_task', { projectId: project.data.id, title: 'First' });
    const second = await command(db, ws, 'create_task', { projectId: project.data.id, title: 'Second' });
    await command(db, ws, 'set_task_dependency', { id: second.data.id, dependsOnTaskId: first.data.id }, 1);
    const file = await command(db, ws, 'create_file', { name: 'Internal file', taskId: first.data.id, projectId: project.data.id });
    await command(db, ws, 'set_task_attachment', { id: second.data.id, fileId: file.data.id }, 2);
    assert.equal((await command(db, ws, 'delete_project', { id: project.data.id }, 1)).data.deleted, true);
    const reservedProject = await command(db, ws, 'create_project', { name: 'Reserved' });
    const reserved = await command(db, ws, 'create_task', { projectId: reservedProject.data.id, title: 'Reserved' });
    await db.exec('reset role');
    await db.query("insert into public.agents(workspace_id,id,name,auth_user_id) values($1,'a1','Agent',$2)", [ws, owner]);
    await db.exec('set role authenticated');
    await command(db, ws, 'claim_task', { id: reserved.data.id }, 1);
    await rejects(command(db, ws, 'delete_project', { id: reservedProject.data.id }, 1), 'already_claimed');
    assert.equal(
      (await db.query('select count(*)::integer n from public.projects where workspace_id=$1 and id=$2', [ws, reservedProject.data.id])).rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});

async function deletionBoundaryState(db, ws) {
  await db.exec('reset role');
  const state = (
    await db.query(
      `select jsonb_build_object(
    'tasks',(select jsonb_agg(to_jsonb(x) order by id) from public.tasks x where workspace_id=$1),
    'dependencies',(select jsonb_agg(to_jsonb(x) order by task_id,depends_on_task_id) from public.task_dependencies x where workspace_id=$1),
    'attachments',(select jsonb_agg(to_jsonb(x) order by task_id,file_id) from public.task_attachments x where workspace_id=$1),
    'files',(select jsonb_agg(to_jsonb(x) order by id) from public.files x where workspace_id=$1),
    'claims',(select jsonb_agg(to_jsonb(x) order by task_id) from public.task_claims x where workspace_id=$1),
    'events',(select jsonb_agg(to_jsonb(x) order by id) from public.domain_events x where workspace_id=$1),
    'replays',(select jsonb_agg(to_jsonb(x) order by key) from public.idempotency_requests x where workspace_id=$1)
  ) state`,
      [ws],
    )
  ).rows[0].state;
  await db.exec('set role authenticated');
  return state;
}

test('authenticated task/intervention/project deletion cannot cascade into another executor task', async () => {
  const { db, ws } = await setup();
  try {
    const project = await command(db, ws, 'create_project', { id: 'p2', name: 'Other project' });
    const survivor = await command(db, ws, 'create_task', { id: 't2', projectId: project.data.id, title: 'Survivor' });
    await command(db, ws, 'set_task_dependency', { id: survivor.data.id, dependsOnTaskId: 't1' }, 1);
    const file = await command(db, ws, 'create_file', { taskId: 't1', projectId: 'p1', name: 'Shared' });
    await command(db, ws, 'set_task_attachment', { id: survivor.data.id, fileId: file.data.id }, 2);
    await db.query("insert into public.agents(workspace_id,id,name,auth_user_id) values($1,'a1','One',$2),($1,'a2','Two',$3)", [ws, owner, other]);
    await db.exec('set role authenticated');
    await actor(db, other);
    await command(db, ws, 'claim_task', { id: survivor.data.id }, 3);
    await actor(db, owner);
    const claimed = await command(db, ws, 'claim_task', { id: 't1' }, 1);
    const before = await deletionBoundaryState(db, ws);
    await rejects(command(db, ws, 'delete_task', { id: 't1', claimToken: claimed.data.claimToken }, 2), 'validation_error');
    assert.deepEqual(await deletionBoundaryState(db, ws), before);
    await db.exec('reset role');
    await db.query("update public.agents set auth_user_id=null where workspace_id=$1 and id='a1'", [ws]);
    await db.exec('set role authenticated');
    await rejects(command(db, ws, 'intervene_task', { id: 't1', action: 'delete' }, 2), 'validation_error');
    assert.deepEqual(await deletionBoundaryState(db, ws), before);
    await command(db, ws, 'intervene_task', { id: 't1', action: 'release' }, 2);
    const released = await deletionBoundaryState(db, ws);
    await rejects(command(db, ws, 'delete_project', { id: 'p1' }, 1), 'validation_error');
    assert.deepEqual(await deletionBoundaryState(db, ws), released);
  } finally {
    await db.close();
  }
});

test('shared files and labels require explicit parent-CAS unlink before cascading deletion', async () => {
  const { db, ws } = await setup();
  try {
    const project = await command(db, ws, 'create_project', { id: 'p2', name: 'Surviving project' });
    await command(db, ws, 'create_task', { id: 't2', projectId: project.data.id, title: 'Survivor' });
    const file = await command(db, ws, 'create_file', { taskId: 't1', projectId: 'p1', name: 'Shared' });
    await command(db, ws, 'set_task_attachment', { id: 't2', fileId: file.data.id }, 1);
    const label = await command(db, ws, 'create_label', { name: 'Shared label' });
    await command(db, ws, 'set_task_label', { id: 't2', labelId: label.data.id }, 2);
    await db.exec('set role authenticated');
    const before = await deletionBoundaryState(db, ws);
    for (const [op, input, version] of [
      ['delete_task', { id: 't1' }, 1],
      ['intervene_task', { id: 't1', action: 'delete' }, 1],
      ['delete_project', { id: 'p1' }, 1],
      ['delete_file', { id: file.data.id }, 1],
      ['delete_label', { id: label.data.id }, 1],
    ]) {
      await rejects(command(db, ws, op, input, version), 'validation_error');
      assert.deepEqual(await deletionBoundaryState(db, ws), before);
    }
    await rejects(command(db, ws, 'remove_task_attachment', { id: 't2', fileId: file.data.id }, 2), 'version_conflict');
    await command(db, ws, 'remove_task_attachment', { id: 't2', fileId: file.data.id }, 3);
    await command(db, ws, 'remove_task_label', { id: 't2', labelId: label.data.id }, 4);
    assert.equal((await command(db, ws, 'delete_label', { id: label.data.id }, 1)).data.deleted, true);
    assert.equal((await command(db, ws, 'delete_task', { id: 't1' }, 1)).data.deleted, true);
    assert.equal((await command(db, ws, 'delete_project', { id: 'p1' }, 1)).data.deleted, true);
  } finally {
    await db.close();
  }
});
