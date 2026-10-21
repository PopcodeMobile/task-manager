import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const owner = '00000000-0000-0000-0000-000000000001';
const member = '00000000-0000-0000-0000-000000000003';
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
    'create table auth.oauth_clients(id uuid primary key,client_name text,deleted_at timestamptz);create table auth.oauth_authorizations(authorization_id text primary key,user_id uuid,client_id uuid,status text,expires_at timestamptz);create table auth.oauth_consents(user_id uuid,client_id uuid,revoked_at timestamptz);',
  );
  await db.exec(await readFile('supabase/migrations/202610200003_integration_grants.sql', 'utf8'));
  const migration = await readFile('supabase/migrations/202610200005_ui_contracts.sql', 'utf8').catch(() => null);
  if (migration) await db.exec(migration);
  await db.exec(await readFile('supabase/migrations/202610200006_file_duplication.sql', 'utf8'));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  const ws = (
    await db.query(
      'select public.create_workspace(\'Test\',\'test\',\'{"projects":[{"id":"p1","key":"T","name":"P"}],"tasks":[{"id":"t1","project":"p1","title":"T","subtasks":[{"id":"s1","title":"S","done":true,"assignee":"legacy-person","due":"2026-12-01","note":"preserve"}]}]}\') id',
    )
  ).rows[0].id;
  await db.query('select public.migrate_workspace($1,0)', [ws]);
  await db.query("insert into public.workspace_memberships values($1,$2,'member')", [ws, member]);
  await db.exec('set role authenticated');
  const cmd = async (op, input = {}, version = null, key = crypto.randomUUID()) =>
    (await db.query('select public.execute_operation($1,$2,$3,$4,$5) result', [ws, op, JSON.stringify(input), key, version])).rows[0].result;
  const read = async (op, q = {}) => (await db.query('select public.read_operation($1,$2,$3) result', [ws, op, JSON.stringify(q)])).rows[0].result;
  return { db, ws, cmd, read };
}
const rejects = (p, code) => assert.rejects(p, e => e.message === code);
test('005 reads whitelist live/expired reservation independently from assignment', async () => {
  const { db, ws, cmd, read } = await setup();
  try {
    assert.equal((await read('get_task', { id: 't1' })).data.reservation, null);
    await db.exec('reset role');
    await db.query("insert into public.agents(workspace_id,id,name,auth_user_id) values($1,'agent','Agent',$2)", [ws, owner]);
    await db.exec('set role authenticated');
    const claim = await cmd('claim_task', { id: 't1' }, 1);
    const dto = (await read('get_task', { id: 't1' })).data;
    assert.deepEqual(Object.keys(dto.reservation).sort(), ['active', 'agentId', 'claimedAt', 'expiresAt']);
    assert.equal(dto.reservation.active, true);
    assert.equal(JSON.stringify(await read('list_tasks')).includes(claim.data.claimToken), false);
    await db.exec("reset role;update public.task_claims set expires_at=now()-interval '1 second';set role authenticated");
    assert.equal((await read('list_tasks')).items[0].reservation.active, false);
    assert.equal((await read('get_task', { id: 't1' })).data.executorAgentId, 'agent');
  } finally {
    await db.close();
  }
});
test('005 clear descriptions and edit subtask details with parent CAS and lease', async () => {
  const { db, ws, cmd, read } = await setup();
  try {
    await cmd('update_task', { id: 't1', description: '' }, 1);
    await rejects(cmd('update_task', { id: 't1', title: ' ' }, 2), 'validation_error');
    await cmd('update_subtask', { id: 's1', taskId: 't1', attributes: { assignee: 'unmapped-person', due: '', note: '' } }, 2);
    const sub = (await read('list_subtasks', { taskId: 't1' })).items[0];
    assert.equal(sub.version, 2);
    assert.deepEqual([sub.legacyMetadata.assignee, sub.legacyMetadata.due, sub.legacyMetadata.note], ['unmapped-person', '', '']);
    await rejects(cmd('update_subtask', { id: 's1', taskId: 't1', done: false }, 2), 'version_conflict');
    await db.exec('reset role');
    await db.query("insert into public.agents(workspace_id,id,name,auth_user_id) values($1,'agent','Agent',$2)", [ws, member]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [member]);
    await db.exec('set role authenticated');
    await rejects(cmd('update_subtask', { id: 's1', taskId: 't1', attributes: { note: 'no lease' } }, 3), 'claim_expired');
    const claim = await cmd('claim_task', { id: 't1' }, 3);
    await cmd('update_subtask', { id: 's1', taskId: 't1', claimToken: claim.data.claimToken, attributes: { note: 'leased' } }, 4);
    const batchInput = {
      commands: [
        {
          operation: 'update_subtask',
          input: { id: 's1', taskId: 't1', claimToken: claim.data.claimToken, attributes: { note: 'batch leased' } },
          expectedVersion: 5,
        },
      ],
    };
    const batch = await cmd('batch', batchInput, null, 'agent-batch');
    assert.equal(JSON.stringify(batch).includes(claim.data.claimToken), false);
    await db.exec('reset role');
    await db.query('delete from public.workspace_memberships where workspace_id=$1 and user_id=$2', [ws, member]);
    await db.exec('set role authenticated');
    await rejects(cmd('batch', batchInput, null, 'agent-batch'), 'forbidden');
  } finally {
    await db.close();
  }
});
test('005 explicit comment author/admin deletion has CAS and replay after row deletion', async () => {
  const { db, ws, cmd, read } = await setup();
  try {
    const comment = await cmd('add_task_comment', { id: 'c1', taskId: 't1', body: 'Hi' });
    assert.equal(comment.data.version, 1);
    assert.equal(comment.data.authorUserId, owner);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [member]);
    await rejects(cmd('delete_comment', { id: 'c1' }, 1), 'forbidden');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await rejects(cmd('delete_comment', { id: 'c1' }, 2), 'version_conflict');
    const deleted = await cmd('delete_comment', { id: 'c1' }, 1, 'delete');
    assert.equal(deleted.data.taskId, 't1');
    assert.deepEqual(await cmd('delete_comment', { id: 'c1' }, 1, 'delete'), deleted);
    assert.equal((await read('list_comments')).items.length, 0);
    assert.equal((await read('list_domain_events')).items.filter(e => e.operation === 'delete_comment').length, 1);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [member]);
    await cmd('add_task_comment', { id: 'member-comment', taskId: 't1', body: 'Member' });
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    const adminDelete = { commands: [{ operation: 'delete_comment', input: { id: 'member-comment' }, expectedVersion: 1 }] };
    await cmd('batch', adminDelete, null, 'admin-comment');
    await db.exec('reset role');
    await db.query("update public.workspace_memberships set role='member' where workspace_id=$1 and user_id=$2", [ws, owner]);
    await db.exec('set role authenticated');
    await rejects(cmd('batch', adminDelete, null, 'admin-comment'), 'forbidden');
    assert.deepEqual(await cmd('delete_comment', { id: 'c1' }, 1, 'delete'), deleted);
  } finally {
    await db.close();
  }
});
test('005 batches atomically compose IDs, isolate internal keys, rollback, replay and recheck capabilities', async () => {
  const { db, ws, cmd, read } = await setup();
  try {
    const child = { operation: 'update_task', input: { id: 't1', title: 'Changed' }, expectedVersion: 1 };
    await cmd('update_task', { id: 't1', description: 'preseed' }, 1, 'batch:0');
    const input = {
      commands: [
        { ...child, expectedVersion: 2 },
        { operation: 'create_task', input: { id: 'linked', projectId: 'p1', title: 'New' } },
        { operation: 'create_subtask', input: { id: 'linked-sub', taskId: 'linked', title: 'New sub' }, expectedVersion: 1 },
      ],
    };
    const out = await cmd('batch', input, null, 'batch');
    assert.equal(out.data.results.length, 3);
    assert.deepEqual(await cmd('batch', input, null, 'batch'), out);
    await rejects(cmd('batch', { commands: [child] }, null, 'batch'), 'idempotency_conflict');
    await rejects(cmd('batch', { commands: [{ operation: 'create_subtask', input: { taskId: 't1', title: 'Missing CAS' } }] }), 'validation_error');
    const before = await read('list_domain_events');
    await rejects(
      cmd('batch', { commands: [{ operation: 'create_task', input: { id: 'rolled-back', projectId: 'p1', title: 'Rollback' } }, child] }, null, 'fail'),
      'version_conflict',
    );
    assert.deepEqual(await read('list_domain_events'), before);
    await rejects(read('get_task', { id: 'rolled-back' }), 'not_found');
    for (const operation of ['batch', 'create_workspace', 'claim_task', 'renew_task_claim', 'release_task_claim'])
      await rejects(cmd('batch', { commands: [{ operation, input: { id: 't1' }, expectedVersion: 3 }] }), 'validation_error');
    await rejects(cmd('batch', { commands: Array(101).fill(child) }), 'validation_error');
    const adminInput = { commands: [{ operation: 'update_workspace', input: { name: 'Renamed', slug: 'renamed', color: '#abcdef' }, expectedVersion: 1 }] };
    const admin = await cmd('batch', adminInput, null, 'admin');
    assert.equal(admin.data.results[0].data.version, 2);
    await db.exec('reset role');
    await db.query("update public.workspace_memberships set role='member' where workspace_id=$1 and user_id=$2", [ws, owner]);
    await db.exec('set role authenticated');
    await rejects(cmd('batch', adminInput, null, 'admin'), 'forbidden');
    await rejects(cmd('update_workspace', { name: 'no' }, 2), 'forbidden');
    const hundred = await cmd('batch', {
      commands: Array.from({ length: 100 }, (_, i) => ({ operation: 'create_label', input: { id: `bulk-${i}`, name: `Label ${i}` } })),
    });
    assert.equal(hundred.data.results.length, 100);
  } finally {
    await db.close();
  }
});
test('005 recurrence requires due date, Monthly adds30 days and copies subtask details', async () => {
  const { db, cmd, read } = await setup();
  try {
    await cmd('update_task', { id: 't1', recurrence: 'Monthly', dueDate: '2026-01-31' }, 1);
    await cmd('complete_task', { id: 't1' }, 2);
    const successor = (await read('list_tasks')).items.find(t => t.id !== 't1');
    assert.equal(successor.dueDate, '2026-03-02');
    assert.equal(successor.startDate, '2026-03-02');
    const sub = (await read('list_subtasks', { taskId: successor.id })).items[0];
    assert.equal(sub.done, false);
    assert.equal(sub.legacyMetadata.assignee, 'legacy-person');
    assert.equal(sub.legacyMetadata.note, 'preserve');
    assert.equal(sub.legacyMetadata.due, '2026-12-01');
    const noDue = await cmd('create_task', { projectId: 'p1', title: 'No due', recurrence: 'Weekly' });
    await cmd('complete_task', { id: noDue.data.id }, 1);
    assert.equal((await read('list_tasks')).items.length, 3);
    const duplicate = await cmd('duplicate_task', { id: successor.id }, 1);
    assert.equal((await read('list_subtasks', { taskId: duplicate.data.id })).items[0].legacyMetadata.note, 'preserve');
  } finally {
    await db.close();
  }
});
