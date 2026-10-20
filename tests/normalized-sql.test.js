import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const owner = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000003';
async function database() {
  const migration = await readFile(new URL('../supabase/migrations/202610200001_normalized_work.sql', import.meta.url), 'utf8').catch(() => null);
  assert.ok(migration, 'normalized SQL migration must exist');
  const db = new PGlite();
  await db.exec(await readFile(new URL('../supabase/tests/bootstrap.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/202610160001_workspaces.sql', import.meta.url), 'utf8'));
  await db.exec(migration);
  return db;
}
const fixture = () => ({
  ws: {},
  projects: [
    { id: 'p1', key: 'WEB', name: 'Project', status: 'active', fav: true, lead: 'm1', members: ['m1'], milestones: [{ name: 'Launch', date: '2026-12-01' }] },
  ],
  tasks: [
    {
      id: 't1',
      key: 'WEB-9',
      project: 'p1',
      title: 'Task',
      desc: '<p>Rich</p>',
      status: 'review',
      priority: 'urgent',
      assignee: 'm1',
      recur: 'Weekly',
      order: 7,
      archived: true,
      archivedAt: 1234,
      completedAt: 1200,
      created: 1000,
      updated: 1100,
      subtasks: [{ id: 's1', title: 'Subtask', done: true }],
      attachments: [{ id: 'a1', name: 'File', type: 'pdf', size: '2 KB' }],
      labels: ['design'],
      deps: ['t2'],
    },
    { id: 't2', project: 'p1', title: 'Other', status: 'todo', priority: 'none' },
  ],
  comments: [{ id: 'c1', task: 't1', by: 'm1', text: 'Comment', re: { '👍': ['m1'] } }],
  files: [{ id: 'f1', task: 't1', project: 'p1', name: 'Shared', type: 'pdf' }],
  events: [{ id: 'e1', project: 'p1', title: 'Meeting', date: '2026-12-01', time: '12:00' }],
  teams: [{ id: 'design', name: 'Design', members: ['m1'] }],
  savedViews: [{ id: 'v1', project: 'p1', name: 'View', type: 'board', filters: [{ f: 'priority', op: 'is', v: ['urgent'] }] }],
  activity: [{ id: 'act1', task: 't1', project: 'p1', by: 'm1', verb: 'created' }],
  notifs: [{ id: 'n1', task: 't1', read: true }],
  projOrder: ['p1'],
  future: { preserved: true },
});
async function workspace(db, payload = fixture()) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  return (await db.query("select public.create_workspace('Test','test',$1::jsonb) as id", [JSON.stringify(payload)])).rows[0].id;
}
test('migration preserves identities, all legacy fields and relations, is idempotent and freezes old writes', async () => {
  const db = await database();
  try {
    const payload = fixture();
    const id = await workspace(db, payload);
    const migrated = (await db.query('select public.migrate_workspace($1,0) as report', [id])).rows[0].report;
    assert.deepEqual(migrated.unresolvedUsers, ['m1']);
    await db.query('select public.migrate_workspace($1,999)', [id]);
    const task = (await db.query("select * from public.tasks where workspace_id=$1 and id='t1'", [id])).rows[0];
    assert.equal(task.project_id, 'p1');
    assert.equal(task.recurrence, 'Weekly');
    assert.equal(Number(task.sort_order), 7);
    assert.equal(task.assignee_user_id, null);
    assert.equal(task.description, '<p>Rich</p>');
    assert.equal(task.archived, true);
    assert.equal(Number(task.version), 1);
    assert.deepEqual(task.legacy_metadata, payload.tasks[0]);
    assert.deepEqual((await db.query('select legacy_metadata from public.workspaces where id=$1', [id])).rows[0].legacy_metadata.future, { preserved: true });
    for (const [table, source] of [
      ['projects', 'projects'],
      ['comments', 'comments'],
      ['calendar_events', 'events'],
      ['saved_views', 'savedViews'],
      ['activity_entries', 'activity'],
      ['teams', 'teams'],
    ]) {
      assert.deepEqual(
        (await db.query(`select legacy_metadata from public.${table} where workspace_id=$1 order by id`, [id])).rows.map(r => r.legacy_metadata),
        payload[source],
      );
    }
    assert.deepEqual((await db.query('select filters from public.saved_views where workspace_id=$1', [id])).rows[0].filters, [
      { f: 'priority', op: 'is', v: ['urgent'] },
    ]);
    assert.deepEqual((await db.query('select legacy_metadata from public.subtasks where workspace_id=$1', [id])).rows[0].legacy_metadata, {
      id: 's1',
      title: 'Subtask',
      done: true,
    });
    assert.equal(new Date(task.created_at).getTime(), 1000);
    assert.equal(new Date(task.completed_at).getTime(), 1200);
    for (const [table, count] of [
      ['projects', 1],
      ['tasks', 2],
      ['subtasks', 1],
      ['task_dependencies', 1],
      ['task_labels', 1],
      ['task_attachments', 1],
      ['comments', 1],
      ['comment_reactions', 1],
      ['files', 2],
      ['calendar_events', 1],
      ['saved_views', 1],
      ['activity_entries', 1],
      ['teams', 1],
    ])
      assert.equal(Number((await db.query(`select count(*) as n from public.${table} where workspace_id=$1`, [id])).rows[0].n), count, table);
    assert.equal((await db.query('select storage_version from public.workspaces where id=$1', [id])).rows[0].storage_version, 2);
    assert.deepEqual((await db.query('select payload from public.workspace_snapshots where workspace_id=$1', [id])).rows[0].payload.future, {
      preserved: true,
    });
    await db.query("update public.tasks set title='New data',version=2 where workspace_id=$1 and id='t1'", [id]);
    await db.query('select public.migrate_workspace($1,0)', [id]);
    await assert.rejects(
      db.query('select public.save_workspace_snapshot($1,0,$2::jsonb)', [id, JSON.stringify({ ...payload, tasks: [] })]),
      error => error.code === '55000',
    );
    assert.equal((await db.query("select title,version from public.tasks where workspace_id=$1 and id='t1'", [id])).rows[0].title, 'New data');
    assert.equal(Number((await db.query("select version from public.tasks where workspace_id=$1 and id='t1'", [id])).rows[0].version), 2);
    assert.equal((await db.query('select revision from public.workspace_snapshots where workspace_id=$1', [id])).rows[0].revision, 0);
    await assert.rejects(db.query("update public.workspace_snapshots set payload='{}' where workspace_id=$1", [id]), error => error.code === '55000');
    assert.equal((await db.query('select count(*)::int n from public.workspace_memberships where workspace_id=$1', [id])).rows[0].n, 1);
  } finally {
    await db.close();
  }
});
test('invalid references, enums and duplicate entities abort the entire cutover', async () => {
  const db = await database();
  try {
    for (const mutate of [
      p => (p.tasks[0].project = 'missing'),
      p => (p.tasks[0].deps = ['missing']),
      p => (p.comments[0].task = 'missing'),
      p => (p.tasks[0].status = 'blocked'),
      p => (p.tasks[0].priority = 'critical'),
      p => p.tasks.push({ ...p.tasks[0] }),
      p => (p.savedViews[0].project = 'missing'),
      p => (p.tasks[0].subtasks = {}),
    ]) {
      const payload = fixture();
      mutate(payload);
      const id = await workspace(db, payload);
      await assert.rejects(db.query('select public.migrate_workspace($1,0)', [id]));
      assert.equal((await db.query('select storage_version from public.workspaces where id=$1', [id])).rows[0].storage_version, 1);
      assert.equal((await db.query('select count(*)::int n from public.projects where workspace_id=$1', [id])).rows[0].n, 0);
    }
    const id = await workspace(db);
    await assert.rejects(db.query('select public.migrate_workspace($1,9)', [id]), error => error.code === '40001');
  } finally {
    await db.close();
  }
});
test('personal legacy values migrate only with admin recorded snapshot provenance and remain user scoped', async () => {
  const db = await database();
  try {
    const unowned = await workspace(db);
    await db.query('select public.migrate_workspace($1,0)', [unowned]);
    assert.equal((await db.query('select count(*)::int n from public.user_preferences')).rows[0].n, 0);
    const owned = await workspace(db);
    await db.query("insert into public.workspace_memberships values ($1,$2,'member')", [owned, other]);
    await db.query('insert into public.snapshot_personal_provenance(workspace_id,snapshot_revision,user_id) values ($1,0,$2)', [owned, owner]);
    await db.query('select public.migrate_workspace($1,0)', [owned]);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select count(*)::int n from public.user_preferences')).rows[0].n, 1);
    assert.deepEqual((await db.query('select preferences from public.user_preferences')).rows[0].preferences, {
      favoriteProjectIds: ['p1'],
      favoriteTaskIds: [],
      notificationReadStates: { n1: true },
    });
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    assert.equal((await db.query('select count(*)::int n from public.user_preferences')).rows[0].n, 0);
    await assert.rejects(db.query('insert into public.snapshot_personal_provenance values ($1,0,$2)', [unowned, other]), error => error.code === '42501');
  } finally {
    await db.close();
  }
});
