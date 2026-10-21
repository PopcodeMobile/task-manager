import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { seed } from '../src/data/seed.js';
import { emptyWorkspace } from '../src/data/workspace.js';
import { createLocalRepository } from '../src/workspace/local.js';
import { createLocalWorkspaceRepository } from '../src/workspace/local-panel-repository.ts';
const owner = '00000000-0000-0000-0000-000000000001';
const member = '00000000-0000-0000-0000-000000000003';
const source = {
  id: 'source',
  project: 'p1',
  key: 'P-1',
  title: 'Literal <task>',
  desc: '<p>Body</p>',
  status: 'done',
  priority: 'high',
  created: 1000,
  updated: 2000,
  completedAt: 3000,
  archivedAt: 4000,
  archived: true,
  recur: 'Weekly',
  due: '2026-12-01',
  start: '2026-11-01',
  estimate: 13,
  custom: { nested: [42] },
  created_at: 'historical',
  order: 7,
  subtasks: [{ id: 's1', title: 'Done detail', done: true, order: 9, note: 'Keep', custom: [1, 2] }],
  labels: ['l1'],
  deps: ['target'],
  attachments: [{ id: 'f1', name: 'embedded.pdf', type: 'pdf', custom: { relation: true }, order: 4 }],
};
async function setup(kind, nullOwner = false) {
  const payload = {
    projects: [
      { id: 'p1', key: 'P', name: 'Source' },
      { id: 'p2', key: 'D', name: 'Destination' },
    ],
    tasks: [structuredClone(source), { id: 'target', project: 'p1', title: 'Target' }],
    files: [],
    comments: [],
  };
  if (nullOwner) payload.tasks[0].attachments[0].task = null;
  if (kind === 'local') {
    const data = { ...seed(), ...payload };
    const values = new Map([['gr8r.v2', JSON.stringify({ data })]]);
    const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
    const persistence = createLocalRepository({ storage, seed, blank: emptyWorkspace });
    const options = { persistence, storage, identity: 'local', workspaceId: null };
    options.workspaceId = (await createLocalWorkspaceRepository(options).workspaces())[0].id;
    const repo = () => createLocalWorkspaceRepository(options);
    return {
      command: (op, input, expectedVersion, idempotencyKey = crypto.randomUUID()) => repo().command(op, { input, expectedVersion, idempotencyKey }),
      list: op => repo().list(op),
      close: async () => {},
      persistence,
      repo,
      storage,
    };
  }
  const db = new PGlite();
  for (const f of [
    'supabase/tests/bootstrap.sql',
    ...['202610160001_workspaces', '202610200001_normalized_work', '202610200002_agent_operations'].map(n => `supabase/migrations/${n}.sql`),
  ])
    await db.exec(await readFile(f, 'utf8'));
  await db.exec(
    'create table auth.oauth_clients(id uuid primary key,client_name text,deleted_at timestamptz);create table auth.oauth_authorizations(authorization_id text primary key,user_id uuid,client_id uuid,status text,expires_at timestamptz);create table auth.oauth_consents(user_id uuid,client_id uuid,revoked_at timestamptz);',
  );
  for (const n of ['202610200003_integration_grants', '202610200005_ui_contracts', '202610200006_file_duplication'])
    await db.exec(await readFile(`supabase/migrations/${n}.sql`, 'utf8'));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  const ws = (await db.query('select public.create_workspace($1,$2,$3) id', ['Copy', 'copy', JSON.stringify(payload)])).rows[0].id;
  await db.query('select public.migrate_workspace($1,0)', [ws]);
  await db.query('update public.subtasks set sort_order=9 where workspace_id=$1', [ws]);
  await db.query('update public.task_attachments set sort_order=4 where workspace_id=$1', [ws]);
  if (nullOwner) await db.query('update public.files set task_id=null where workspace_id=$1', [ws]);
  await db.query("insert into public.workspace_memberships values($1,$2,'member')", [ws, member]);
  const command = async (op, input, version = null, key = crypto.randomUUID(), workspace = ws) =>
    (await db.query('select public.execute_operation($1,$2,$3,$4,$5) result', [workspace, op, JSON.stringify(input), key, version])).rows[0].result;
  await db.exec('begin;set role authenticated');
  await command('duplicate_task', { id: 'source' }, 1, 'warm');
  await command('batch', { commands: [{ operation: 'duplicate_file', input: { id: 'f1' }, expectedVersion: 1 }] }, null, 'warm-006-graph');
  await db.exec('rollback');
  const migration = await readFile('supabase/migrations/202610200007_task_graph_copy.sql', 'utf8').catch(() => null);
  if (migration) await db.exec(migration);
  await db.exec('set role authenticated');
  return {
    db,
    ws,
    command,
    list: async op => (await db.query("select public.read_operation($1,$2,'{}') result", [ws, op])).rows[0].result.items,
    close: () => db.close(),
  };
}
const reject = (promise, code) => assert.rejects(promise, e => e.code === code || e.message === code);
for (const kind of ['local', 'sql']) {
  for (const mode of ['task', 'project'])
    test(`${kind}: ${mode} copy preserves complete graph and source, fresh identity and temporal semantics`, async () => {
      const h = await setup(kind);
      try {
        const before = await h.list('list_tasks');
        const files = await h.list('list_files');
        const attachments = await h.list('list_attachments');
        const subtasks = await h.list('list_subtasks');
        const input = { id: 'source', projectId: 'p2', mode };
        const result = await h.command('duplicate_task_graph', input, 1, 'copy');
        const copy = result.data;
        assert.notEqual(copy.id, 'source');
        assert.equal(copy.taskId, copy.id);
        assert.equal(copy.key, 'D-1');
        assert.equal(copy.projectId, 'p2');
        assert.equal(copy.status, mode === 'task' ? 'done' : 'todo');
        assert.equal(copy.completedAt == null ? null : Date.parse(copy.completedAt), mode === 'task' ? 3000 : null);
        assert.ok(Date.parse(copy.createdAt) > 4000);
        assert.ok(Date.parse(copy.updatedAt) > 4000);
        assert.equal(copy.archived, false);
        assert.equal(copy.archivedAt, null);
        assert.equal(copy.executorAgentId, null);
        assert.equal(copy.reservation, null);
        for (const field of ['title', 'description', 'priority', 'recurrence', 'dueDate', 'startDate', 'sortOrder'])
          assert.deepEqual(copy[field], before.find(t => t.id === 'source')[field]);
        assert.deepEqual(copy.legacyMetadata.custom, source.custom);
        assert.equal(copy.legacyMetadata.created_at, 'historical');
        const child = (await h.list('list_subtasks')).find(s => s.taskId === copy.id);
        assert.notEqual(child.id, 's1');
        assert.equal(child.done, true);
        assert.equal(child.sortOrder, 9);
        assert.equal(child.legacyMetadata.note, 'Keep');
        assert.deepEqual(child.legacyMetadata.custom, [1, 2]);
        assert.deepEqual(
          (await h.list('list_subtasks')).filter(s => s.taskId === 'source'),
          subtasks,
        );
        const links = (await h.list('list_attachments')).filter(a => a.taskId === copy.id);
        assert.deepEqual(
          links.map(a => ({ ...a, taskId: 'source' })),
          attachments,
        );
        assert.equal(links[0].sortOrder, attachments[0].sortOrder);
        assert.deepEqual(links[0].legacyMetadata.custom, { relation: true });
        assert.deepEqual(await h.list('list_files'), files);
        for (const [op, field, value] of [
          ['list_dependencies', 'dependsOnTaskId', 'target'],
          ['list_task_labels', 'labelId', 'l1'],
        ])
          assert.equal((await h.list(op)).find(r => r.taskId === copy.id)[field], value);
        assert.deepEqual(
          (await h.list('list_tasks')).filter(t => t.id !== copy.id),
          before,
        );
        assert.equal((await h.list('list_tasks')).length, 3, 'copy never creates recurrence successor');
        assert.deepEqual(await h.command('duplicate_task_graph', input, 1, 'copy'), result);
        const events = await h.list('list_domain_events');
        const event = events.find(e => e.id === result.eventId);
        assert.equal(event.entityId, copy.id);
        assert.equal(event.payload.taskId, copy.id);
        assert.equal(event.payload.projectId, 'p2');
        assert.equal(events.filter(e => e.operation === 'duplicate_task_graph').length, 1);
        const old = (await h.command('duplicate_task', { id: 'source' }, 1)).data;
        assert.equal(old.status, 'todo');
        assert.equal((await h.list('list_subtasks')).find(s => s.taskId === old.id).done, false);
        assert.equal((await h.list('list_attachments')).filter(a => a.taskId === old.id).length, 0);
      } finally {
        await h.close();
      }
    });
  test(`${kind}: strict input, CAS, atomic create-project batch rollback/retry and stable IDs`, async () => {
    const h = await setup(kind);
    try {
      const input = { id: 'source', projectId: 'p2', mode: 'task' };
      await reject(h.command('duplicate_task_graph', input, 2), 'version_conflict');
      await reject(h.command('duplicate_task_graph', input), 'version_conflict');
      for (const patch of [{ mode: 'other' }, { projectId: null }, { id: null }, { title: '' }, { attributes: {} }, { newId: 'spoof' }, { status: 'done' }])
        await reject(h.command('duplicate_task_graph', { ...input, ...patch }, 1), 'validation_error');
      const operations = [
        'list_tasks',
        'list_projects',
        'list_subtasks',
        'list_files',
        'list_attachments',
        'list_dependencies',
        'list_task_labels',
        'list_domain_events',
      ];
      const before = await Promise.all(operations.map(h.list));
      const batch = {
        commands: [
          { operation: 'create_project', input: { id: 'fresh', key: 'F', name: 'Fresh' } },
          { operation: 'duplicate_task_graph', input: { ...input, projectId: 'fresh', mode: 'project' }, expectedVersion: 1 },
          { operation: 'update_task', input: { id: 'source', title: 'fail' }, expectedVersion: 99 },
        ],
      };
      await reject(h.command('batch', batch, undefined, 'atomic'), 'version_conflict');
      assert.deepEqual(await Promise.all(operations.map(h.list)), before);
      batch.commands.pop();
      const result = await h.command('batch', batch, undefined, 'atomic');
      assert.equal(result.data.results[1].data.key, 'F-1');
      assert.deepEqual(await h.command('batch', batch, undefined, 'atomic'), result);
    } finally {
      await h.close();
    }
  });
}

for (const kind of ['local', 'sql']) {
  test(`${kind}: explicit-null file ownership and all task statuses survive copy semantics`, async () => {
    const h = await setup(kind, true);
    try {
      const files = await h.list('list_files');
      assert.equal(files.find(f => f.id === 'f1').taskId, null);
      const first = (await h.command('duplicate_task_graph', { id: 'source', projectId: 'p2', mode: 'task', title: 'Named copy' }, 1)).data;
      assert.equal(first.title, 'Named copy');
      assert.deepEqual(await h.list('list_files'), files);
      let version = 1;
      for (const status of ['backlog', 'todo', 'progress', 'review']) {
        const updated = await h.command('update_task', { id: 'source', status }, version++);
        assert.equal(updated.data.version, version);
        const copy = (await h.command('duplicate_task_graph', { id: 'source', projectId: 'p2', mode: 'task' }, version)).data;
        assert.equal(copy.status, status);
        assert.equal(copy.completedAt, null);
      }
    } finally {
      await h.close();
    }
  });
  test(`${kind}: exact graph IDs preserve punctuation and enforce Unicode boundaries`, async () => {
    const { acceptedFileIds, rejectedFileIds, unrepresentableFileIds } = await import('./fixtures/file-duplication-ids.js');
    const h = await setup(kind);
    try {
      for (const field of ['id', 'projectId']) {
        if (kind === 'local') {
          const loaded = await h.persistence.load(h.repo().workspaceId);
          if (field === 'id') loaded.data.tasks.push(...acceptedFileIds.map(id => ({ id, project: 'p1', title: 'Boundary' })));
          else loaded.data.projects.push(...acceptedFileIds.map(id => ({ id, name: 'Boundary', key: 'ID' })));
          await h.persistence.save(h.repo().workspaceId, loaded.data, loaded.revision);
        } else {
          await h.db.exec('reset role');
          for (const id of acceptedFileIds)
            await h.db.query(
              field === 'id'
                ? "insert into public.tasks(workspace_id,id,project_id,title) values($1,$2,'p1','Boundary')"
                : "insert into public.projects(workspace_id,id,name) values($1,$2,'Boundary')",
              [h.ws, id],
            );
          await h.db.exec('set role authenticated');
        }
        for (const value of acceptedFileIds) {
          const input = { id: 'source', projectId: 'p2', mode: 'task', [field]: value };
          const version = (await h.list('list_tasks')).find(t => t.id === input.id).version;
          const result = await h.command('duplicate_task_graph', input, version);
          assert.equal(result.data.projectId, input.projectId);
        }
        for (const value of rejectedFileIds)
          await reject(h.command('duplicate_task_graph', { id: 'source', projectId: 'p2', mode: 'task', [field]: value }, 1), 'validation_error');
        for (const value of unrepresentableFileIds)
          await assert.rejects(h.command('duplicate_task_graph', { id: 'source', projectId: 'p2', mode: 'task', [field]: value }, 1), e =>
            kind === 'local' ? e.code === 'validation_error' : ['22P05', '22P02', '22021'].includes(e.code),
          );
      }
    } finally {
      await h.close();
    }
  });
}

test('local replay checks current member/actor, including graph children in cached batches', async () => {
  const h = await setup('local');
  try {
    const input = { id: 'source', projectId: 'p2', mode: 'task' };
    const batch = { commands: [{ operation: 'duplicate_task_graph', input, expectedVersion: 1 }] };
    await h.command('duplicate_task_graph', input, 1, 'receipt');
    await h.command('batch', batch, undefined, 'batch');
    const loaded = await h.persistence.load(h.repo().workspaceId);
    loaded.data.me = loaded.data.members.find(m => m.id !== loaded.data.me).id;
    await h.persistence.save(h.repo().workspaceId, loaded.data, loaded.revision);
    await reject(h.command('duplicate_task_graph', input, 1, 'receipt'), 'forbidden');
    await reject(h.command('batch', batch, undefined, 'batch'), 'forbidden');
    const removed = await h.persistence.load(h.repo().workspaceId);
    removed.data.me = 'absent';
    await h.persistence.save(h.repo().workspaceId, removed.data, removed.revision);
    await reject(h.command('duplicate_task_graph', input, 1), 'forbidden');
  } finally {
    await h.close();
  }
});

test('SQL source CAS, valid/expired/intervened leases, current authorization and private ACLs', async () => {
  const h = await setup('sql');
  const { db, ws } = h;
  try {
    await db.exec('reset role');
    await db.query("update public.tasks set status='todo',archived=false where workspace_id=$1 and id='source'", [ws]);
    await db.query("insert into public.agents(workspace_id,id,name,auth_user_id) values($1,'agent','Agent',$2)", [ws, member]);
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [member]);
    const input = { id: 'source', projectId: 'p2', mode: 'task' };
    await reject(h.command('duplicate_task_graph', input, 1), 'claim_expired');
    const claim = (await h.command('claim_task', { id: 'source' }, 1)).data;
    const withLease = { ...input, claimToken: claim.claimToken };
    await reject(h.command('duplicate_task_graph', withLease, 1), 'version_conflict');
    await reject(h.command('duplicate_task_graph', { ...input, claimToken: crypto.randomUUID() }, 2), 'claim_expired');
    const result = await h.command('duplicate_task_graph', withLease, 2, 'agent-copy');
    assert.equal(result.data.executorAgentId, null);
    assert.equal(result.data.reservation, null);
    await db.exec("reset role;update public.task_claims set expires_at=now()-interval '1 second';set role authenticated");
    await reject(h.command('duplicate_task_graph', withLease, 2), 'claim_expired');
    assert.deepEqual(await h.command('duplicate_task_graph', withLease, 2, 'agent-copy'), result, 'replay rechecks access, not obsolete CAS/lease');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    const intervention = await h.command('intervene_task', { id: 'source', action: 'release' }, 2);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [member]);
    await reject(h.command('duplicate_task_graph', withLease, intervention.data.version), 'claim_expired');
    await reject(h.command('duplicate_task_graph', withLease, 2, 'tenant', crypto.randomUUID()), 'forbidden');
    await db.exec('reset role');
    const helpers = (
      await db.query(
        "select proname,prosecdef,has_function_privilege('anon',oid,'execute') a,has_function_privilege('authenticated',oid,'execute') b from pg_proc where pronamespace='public'::regnamespace and proname like '%before_task_graph_copy' or pronamespace='public'::regnamespace and proname in ('operation_graph','operation_validate','operation_batch_allowed')",
      )
    ).rows;
    assert.equal(helpers.length, 6);
    for (const row of helpers) assert.deepEqual([row.prosecdef, row.a, row.b], [false, false, false], row.proname);
    await db.query('delete from public.workspace_memberships where workspace_id=$1 and user_id=$2', [ws, member]);
    await db.exec('set role authenticated');
    await reject(h.command('duplicate_task_graph', withLease, 2, 'agent-copy'), 'forbidden');
  } finally {
    await h.close();
  }
});

for (const kind of ['local', 'sql'])
  test(`${kind}: 100 graph children are atomic and 101 rejected without any write`, async () => {
    const h = await setup(kind);
    try {
      const child = { operation: 'duplicate_task_graph', input: { id: 'source', projectId: 'p2', mode: 'project' }, expectedVersion: 1 };
      const before = await h.list('list_tasks');
      await reject(h.command('batch', { commands: Array(101).fill(child) }, undefined, 'limit'), 'validation_error');
      assert.deepEqual(await h.list('list_tasks'), before);
      const input = { commands: Array(100).fill(child) };
      const result = await h.command('batch', input, undefined, 'hundred');
      assert.equal(result.data.results.length, 100);
      assert.equal(new Set(result.data.results.map(r => r.data.id)).size, 100);
      assert.equal(new Set(result.data.results.map(r => r.data.key)).size, 100);
      assert.equal(result.data.results[99].data.key, 'D-100');
      assert.deepEqual(await h.command('batch', input, undefined, 'hundred'), result);
    } finally {
      await h.close();
    }
  });

test('local global file authority wins and source attachment metadata remains separate', async () => {
  const h = await setup('local');
  try {
    const loaded = await h.persistence.load(h.repo().workspaceId);
    loaded.data.files = [{ id: 'f1', name: 'Canonical global', project: 'p2', task: null, custom: 'global', at: 1000 }];
    await h.persistence.save(h.repo().workspaceId, loaded.data, loaded.revision);
    const files = await h.list('list_files');
    const task = (await h.list('list_tasks')).find(t => t.id === 'source');
    const result = await h.command('duplicate_task_graph', { id: 'source', projectId: 'p2', mode: 'task' }, task.version);
    assert.deepEqual(await h.list('list_files'), files);
    assert.equal(files[0].taskId, null);
    assert.equal(files[0].name, 'Canonical global');
    assert.deepEqual((await h.list('list_attachments')).find(a => a.taskId === result.data.id).legacyMetadata.custom, { relation: true });
  } finally {
    await h.close();
  }
});
