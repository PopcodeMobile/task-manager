import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalRepository } from '../src/workspace/local.js';
import { createLocalWorkspaceRepository } from '../src/workspace/local-panel-repository.ts';
import { seed } from '../src/data/seed.js';
import { emptyWorkspace } from '../src/data/workspace.js';
async function setup() {
  const data = seed();
  const values = new Map([['gr8r.v2', JSON.stringify({ data })]]);
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  const persistence = createLocalRepository({ storage, seed, blank: emptyWorkspace });
  const make = id => createLocalWorkspaceRepository({ storage, persistence, workspaceId: id, identity: 'local' });
  const id = (await make(null).workspaces())[0].id;
  return { repo: make(id), reload: () => make(id), data, storage, persistence };
}
const run = (repo, operation, input, expectedVersion, idempotencyKey = crypto.randomUUID()) =>
  repo.command(operation, { input, expectedVersion, idempotencyKey });
test('local membership uses actual members, project CAS, idempotency and persisted removal', async () => {
  const { repo, reload, data } = await setup();
  const p = (await repo.list('list_projects'))[0];
  const member = data.members.find(m => !(p.legacyMetadata.members ?? []).includes(m.id)) ?? data.members.at(-1);
  const first = await run(repo, 'set_project_member', { id: p.id, userId: member.id }, p.version, 'member');
  assert.equal(first.data.version, p.version + 1);
  assert.deepEqual(await run(reload(), 'set_project_member', { id: p.id, userId: member.id }, p.version, 'member'), first);
  assert.ok((await reload().list('list_project_members', { projectId: p.id })).some(m => m.userId === member.id));
  await assert.rejects(run(repo, 'remove_project_member', { id: p.id, userId: member.id }, p.version), { code: 'version_conflict' });
  await assert.rejects(run(repo, 'set_project_member', { id: p.id, userId: 'unknown' }, first.data.version), { code: 'validation_error' });
  await run(repo, 'remove_project_member', { id: p.id, userId: member.id }, first.data.version);
  assert.ok(!(await reload().list('list_project_members', { projectId: p.id })).some(m => m.userId === member.id));
});
test('saved view JSON and version survive reload, stale rename/delete and cross-workspace IDs fail', async () => {
  const { repo, reload } = await setup();
  const p = (await repo.list('list_projects'))[0];
  const filters = [{ f: 'priority', op: 'not', v: ['low'], unknown: { literal: '<img src=x>' } }];
  const made = await run(repo, 'create_view', { id: 'my-view', projectId: p.id, name: '<b>Home</b>', viewType: 'calendar', filters });
  assert.equal(made.data.version, 1);
  assert.deepEqual((await reload().list('list_views')).find(v => v.id === 'my-view').filters, filters);
  await run(repo, 'update_view', { id: 'my-view', name: 'literal renamed' }, 1);
  await assert.rejects(run(repo, 'update_view', { id: 'my-view', name: 'stale' }, 1), { code: 'version_conflict' });
  await assert.rejects(run(repo, 'delete_view', { id: 'my-view' }, 1), { code: 'version_conflict' });
  await assert.rejects(run(repo, 'create_view', { projectId: 'foreign', name: 'bad', viewType: 'list', filters: [] }), { code: 'not_found' });
  await run(repo, 'delete_view', { id: 'my-view' }, 2);
  assert.ok(!(await reload().list('list_views')).some(v => v.id === 'my-view'));
});
test('project sortOrder changes the persistent order authority including archived positions', async () => {
  const { repo, reload, persistence } = await setup();
  const projects = await repo.list('list_projects');
  const target = projects.at(-1);
  await run(repo, 'update_project', { id: target.id, sortOrder: 0 }, target.version);
  const after = await reload().list('list_projects');
  assert.equal(after.find(p => p.id === target.id).sortOrder, 0);
  const record = await persistence.loadPanel(repo.workspaceId);
  assert.equal(record.data.projOrder[0], target.id);
  assert.equal(new Set(record.data.projOrder).size, projects.length);
});
test('explicit device sharing demo persists permissions/access/invited state without cloud claims', async () => {
  const { repo, reload } = await setup();
  const p = (await repo.list('list_projects'))[0];
  const result = await run(repo, 'local_project_sharing', { id: p.id, email: 'new@example.test', permission: 'Can view', access: 'private' }, p.version);
  const fresh = (await reload().list('list_projects')).find(x => x.id === p.id);
  assert.equal(fresh.legacyMetadata.access, 'private');
  assert.equal(fresh.legacyMetadata.perms[result.data.localMemberId], 'Can view');
  const member = (await reload().rpc('list_workspace_members')).find(m => m.user_id === result.data.localMemberId);
  assert.equal(member.email, 'new@example.test');
});
test('project plans preflight atomic bounds, exact defaults, source graph commands and preserved favorites mapping', async () => {
  const model = await import('../src/app/projects/project-model.ts').catch(() => ({}));
  assert.equal(typeof model.projectPlan, 'function', 'project plan must exist');
  const { repo, data } = await setup();
  const projects = await repo.list('list_projects');
  const p = projects[0];
  const tasks = await repo.list('list_tasks');
  const plan = model.projectPlan(
    {
      id: 'new-project',
      name: 'Home',
      description: '<b>literal</b>',
      icon: 'folder',
      color: 'indigo',
      teamId: p.teamId,
      leadUserId: p.leadUserId,
      dueDate: '',
      template: 'software',
    },
    projects,
    data.me,
    [],
    undefined,
    '2026-10-20',
    (_pt, en) => en,
  );
  assert.equal(plan[0].input.status, 'planning');
  assert.equal(plan[0].input.dueDate, '2026-11-19');
  assert.equal(plan.filter(c => c.operation === 'create_task').length, 6);
  assert.equal(plan.find(c => c.operation === 'create_task').input.assigneeUserId, data.me);
  const copy = model.projectPlan(
    {
      id: 'copy-project',
      name: 'Home copy',
      description: p.description,
      icon: 'folder',
      color: 'indigo',
      teamId: p.teamId,
      leadUserId: p.leadUserId,
      dueDate: p.dueDate,
      template: 'blank',
    },
    projects,
    data.me,
    tasks,
    p,
    '2026-10-20',
    (_pt, en) => en,
  );
  assert.equal(copy.filter(c => c.operation === 'duplicate_task_graph').length, tasks.filter(t => t.projectId === p.id && !t.archived).length);
  assert.ok(copy.filter(c => c.operation === 'duplicate_task_graph').every(c => c.input.mode === 'project' && c.expectedVersion));
  assert.throws(() => model.assertProjectBatch(Array.from({ length: 101 }, () => ({ operation: 'create_task', input: {} }))), /batch_limit/);
  assert.throws(() => model.assertProjectBatch([{ operation: 'create_project', input: { description: 'x'.repeat(262145) } }]), /payload_limit/);
});
test('shared individual copy action selects full task graph and literal suffix', async () => {
  const { prepareTaskAction } = await import('../src/app/tasks/task-view-model.ts');
  const task = { id: 'source', projectId: 'project', title: 'Home <b>', version: 4 };
  assert.deepEqual(prepareTaskAction(task, 'duplicate_task'), {
    operation: 'duplicate_task_graph',
    input: { id: 'source', projectId: 'project', mode: 'task', title: 'Home <b> (copy)' },
    expectedVersion: 4,
  });
});
test('legacy absent teams project read is pure; first relevant mutation materializes once and respects CAS', async () => {
  const { repo, storage, reload, persistence, data } = await setup();
  const before = storage.getItem('gr8r.workspaces.v1');
  assert.equal(
    (await repo.list('list_teams')).some(team => team.id === 'design'),
    true,
  );
  assert.equal(storage.getItem('gr8r.workspaces.v1'), before);
  assert.equal((await repo.rpc('get_local_actor')).teamId, data.members.find(m => m.id === data.me).team);
  const p = (await repo.list('list_projects'))[0];
  await assert.rejects(run(repo, 'update_project', { id: p.id, teamId: 'design' }, 0), { code: 'version_conflict' });
  assert.equal(storage.getItem('gr8r.workspaces.v1'), before);
  await run(repo, 'update_project', { id: p.id, teamId: 'design' }, p.version);
  const record = await persistence.loadPanel(repo.workspaceId);
  assert.equal(record.revision, 1);
  assert.equal(record.data.teams.length, 4);
  assert.equal((await reload().query('get_project', { id: p.id })).data.teamId, 'design');
  const other = await repo.rpc('create_workspace_v2', { p_name: 'Blank', p_slug: 'blank', p_idempotency_key: crypto.randomUUID() });
  const emptyRecord = await persistence.loadPanel(other.data.id);
  assert.deepEqual(emptyRecord.data.teams, []);
});
