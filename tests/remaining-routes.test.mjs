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
  return { repo: make(id), data, storage, persistence, make };
}
const run = (repo, op, input, version, key = crypto.randomUUID()) => repo.command(op, { input, expectedVersion: version, idempotencyKey: key });
test('teams project canonical member.team without mutating graph and stale legacy relation saves fail', async () => {
  const { repo, data, persistence, storage } = await setup();
  const before = storage.getItem('gr8r.workspaces.v1');
  const teams = await repo.list('list_teams');
  const relations = await repo.list('list_team_members');
  assert.deepEqual(
    relations.map(r => [r.userId, r.teamId]).sort(),
    data.members
      .filter(m => m.team)
      .map(m => [m.id, m.team])
      .sort(),
  );
  assert.equal(storage.getItem('gr8r.workspaces.v1'), before);
  const team = teams[0];
  const record = await persistence.load(repo.workspaceId);
  record.data.members[0].team = team.id;
  await persistence.save(repo.workspaceId, record.data, record.revision);
  await assert.rejects(run(repo, 'update_team', { id: team.id, name: 'stale' }, team.version), { code: 'version_conflict' });
});
test('team replacement atomic plan includes cross-team removal, preserves unknown fields and deletion unlinks', async () => {
  const model = await import('../src/app/panel/panel-model.ts').catch(() => ({}));
  assert.equal(typeof model.teamCommands, 'function');
  const { repo, persistence } = await setup();
  const teams = await repo.list('list_teams'),
    members = await repo.rpc('list_workspace_members'),
    relations = await repo.list('list_team_members');
  const draft = { id: 'new-team', name: 'Home <b>', description: 'literal', icon: 'users', color: 'teal', members: [members[0].user_id] };
  const commands = model.teamCommands(draft, teams, relations);
  assert.ok(commands.some(c => c.operation === 'remove_team_member'));
  await run(repo, 'batch', { commands });
  assert.deepEqual(
    (await repo.list('list_team_members')).filter(r => r.userId === members[0].user_id).map(r => r.teamId),
    ['new-team'],
  );
  let team = (await repo.list('list_teams')).find(x => x.id === 'new-team');
  const project = (await repo.list('list_projects'))[0];
  await run(repo, 'update_project', { id: project.id, teamId: team.id }, project.version);
  await run(repo, 'delete_team', { id: team.id }, team.version);
  assert.equal((await repo.list('list_projects')).find(x => x.id === project.id).teamId, null);
  assert.ok((await repo.rpc('list_workspace_members')).some(m => m.user_id === members[0].user_id));
  assert.equal((await persistence.load(repo.workspaceId)).data.members.find(m => m.id === members[0].user_id).team, '');
  assert.throws(() => model.teamCommands({ ...draft, members: Array.from({ length: 100 }, (_, i) => 'm' + i) }, teams, []), /batch_limit/);
  assert.throws(() => model.teamCommands({ ...draft, description: 'x'.repeat(262145) }, teams, []), /payload_limit/);
});
test('local profile and workspace edits persist graph, reject unknown fields and preserve scope', async () => {
  const { repo, persistence, make, data } = await setup();
  const ws = (await repo.workspaces()).find(w => w.id === repo.workspaceId);
  await run(repo, 'update_workspace', { name: 'Literal Home', slug: 'literal-home', color: 'teal' }, ws.version);
  assert.equal((await make(repo.workspaceId).workspaces())[0].name, 'Literal Home');
  await run(repo, 'local_update_profile', { name: 'Home <script>', title: 'Engineer', avatar: 'https://example.test/a.png' });
  const me = (await repo.rpc('list_workspace_members')).find(m => m.user_id === data.me);
  assert.equal(me.name, 'Home <script>');
  assert.equal(me.title, 'Engineer');
  assert.equal((await persistence.load(repo.workspaceId)).data.members.find(m => m.id === data.me).name, me.name);
  await assert.rejects(run(repo, 'local_update_profile', { name: 'Bad', role: 'owner' }), { code: 'validation_error' });
});
test('notification projection and initial local read map preserve unknown IDs across read updates', async () => {
  const { repo, data } = await setup();
  const rows = await repo.list('list_notifications');
  assert.equal(rows[0].notificationType, data.notifs[0].type);
  assert.equal(rows[0].taskId, data.notifs[0].task ?? null);
  const first = await repo.preferences();
  for (const n of data.notifs) assert.equal(first.notificationReadStates[n.id], !!n.read);
  await repo.savePersonal({ preferences: { notificationReadStates: { ...first.notificationReadStates, unknown: true } } });
  const model = await import('../src/app/panel/panel-model.ts');
  const map = model.readStates((await repo.preferences()).notificationReadStates, [rows[0].id], false);
  assert.equal(map.unknown, true);
  assert.equal(map[rows[0].id], false);
});
test('date preferences preserve Saturday and short date behavior without inventing launch/default effects', async () => {
  const model = await import('../src/app/panel/panel-model.ts').catch(() => ({}));
  assert.equal(typeof model.weekStartsOn, 'function');
  assert.equal(model.weekStartsOn(6), 6);
  assert.equal(model.weekStartsOn(0), 0);
  assert.equal(model.weekStartsOn('1'), 1);
  assert.equal(model.preferredDate('2026-10-24', { dateFmt: 'd/M' }, 'en'), '24/10');
  assert.equal(model.defaultProjectTab({ defaultTab: 'table' }), 'table');
  assert.equal(model.defaultProjectTab({}), 'board');
  assert.equal(model.defaultProjectTab({ defaultTab: 'garbage' }), 'board');
  assert.equal(model.notificationDay(Date.parse('2026-10-24T12:00:00Z')), model.notificationDay(Date.parse('2026-10-24T18:00:00Z')));
  assert.notEqual(model.notificationDay(Date.parse('2026-10-24T12:00:00Z')), model.notificationDay(Date.parse('2026-10-25T12:00:00Z')));
});
test('reset is workspace-scoped and keeps monotonic versions and idempotency receipts', async () => {
  const { repo, persistence, make } = await setup();
  const second = await make(null).rpc('create_workspace_v2', { p_name: 'Other', p_slug: 'other' });
  const beforeOther = await persistence.load(second.data.id);
  const task = (await repo.list('list_tasks'))[0];
  const old = await run(repo, 'update_task', { id: task.id, title: 'Before reset' }, task.version, 'before-reset');
  const latest = (await repo.list('list_tasks')).find(t => t.id === task.id);
  await run(repo, 'local_reset_demo', { confirmWorkspaceId: repo.workspaceId }, undefined, 'reset');
  const reset = (await repo.list('list_tasks')).find(t => t.id === task.id);
  assert.ok(reset.version > latest.version);
  await assert.rejects(run(repo, 'update_task', { id: task.id, title: 'Stale draft' }, latest.version), { code: 'version_conflict' });
  assert.deepEqual(await run(repo, 'update_task', { id: task.id, title: 'Before reset' }, task.version, 'before-reset'), old);
  assert.equal((await repo.list('list_tasks')).find(t => t.id === task.id).title, reset.title);
  assert.deepEqual(await persistence.load(second.data.id), beforeOther);
  const before = await persistence.load(repo.workspaceId);
  await assert.rejects(run(repo, 'local_reset_demo', { confirmWorkspaceId: second.data.id }), { code: 'validation_error' });
  assert.deepEqual(await persistence.load(repo.workspaceId), before);
});
test('team replacement stale relationship snapshots and oversize batches leave entire storage unchanged', async () => {
  const { repo, persistence, storage } = await setup();
  const model = await import('../src/app/panel/panel-model.ts');
  const teams = await repo.list('list_teams'),
    relations = await repo.list('list_team_members');
  const draft = {
    id: teams[0].id,
    name: 'planned',
    description: '',
    icon: 'users',
    color: 'teal',
    members: relations.filter(r => r.teamId === teams[0].id).map(r => r.userId),
  };
  const commands = model.teamCommands(draft, teams, relations);
  const legacy = await persistence.load(repo.workspaceId);
  legacy.data.members[0].team = teams[1].id;
  await persistence.save(repo.workspaceId, legacy.data, legacy.revision);
  const before = storage.getItem('gr8r.workspaces.v1');
  await assert.rejects(run(repo, 'batch', { commands }), { code: 'version_conflict' });
  assert.equal(storage.getItem('gr8r.workspaces.v1'), before);
  await assert.rejects(run(repo, 'batch', { commands: [{ operation: 'create_team', input: { name: 'x'.repeat(262145) } }] }), { code: 'validation_error' });
  assert.equal(storage.getItem('gr8r.workspaces.v1'), before);
});
test('personal local favorites project actual fav values and retain them when changing read states', async () => {
  const { repo, data } = await setup();
  const initial = await repo.preferences();
  assert.deepEqual(
    initial.favoriteTaskIds,
    data.tasks.filter(t => t.fav).map(t => t.id),
  );
  assert.deepEqual(
    initial.favoriteProjectIds,
    data.projects.filter(p => p.fav).map(p => p.id),
  );
  await repo.savePersonal({ preferences: { notificationReadStates: { unknown: true } } });
  const next = await repo.preferences();
  assert.deepEqual(next.favoriteTaskIds, initial.favoriteTaskIds);
  assert.deepEqual(next.favoriteProjectIds, initial.favoriteProjectIds);
});
test('reset invalidates implicit seeded teams and workspace discovery returns effective drift version', async () => {
  const { repo, persistence } = await setup();
  const team = (await repo.list('list_teams'))[0];
  await run(repo, 'local_reset_demo', { confirmWorkspaceId: repo.workspaceId });
  await assert.rejects(run(repo, 'update_team', { id: team.id, name: 'stale' }, team.version), { code: 'version_conflict' });
  const record = await persistence.load(repo.workspaceId);
  record.data.ws.name = 'External';
  await persistence.save(repo.workspaceId, record.data, record.revision);
  const workspace = (await repo.workspaces()).find(w => w.id === repo.workspaceId);
  await run(repo, 'update_workspace', { name: 'After legacy' }, workspace.version);
  assert.equal((await repo.workspaces()).find(w => w.id === repo.workspaceId).name, 'After legacy');
});
test('password verification closes only temporary session before update; failures and disposed identities cannot update', async () => {
  const { changeAccountPassword } = await import('../src/app/panel/password-model.ts');
  const calls = [];
  const main = {
    getUser: async () => ({ data: { user: { id: 'actor' } }, error: null }),
    updateUser: async () => {
      calls.push('update');
      return { error: null };
    },
  };
  const verifier = {
    signInWithPassword: async () => ({ data: { user: { id: 'actor' } }, error: null }),
    signOut: async options => {
      assert.deepEqual(options, { scope: 'local' });
      calls.push('cleanup');
      return { error: null };
    },
  };
  await changeAccountPassword(main, verifier, 'actor', 'person@example.test', 'old', 'next', new AbortController().signal);
  assert.deepEqual(calls, ['cleanup', 'update']);
  calls.length = 0;
  const controller = new AbortController();
  const delayed = {
    ...verifier,
    signInWithPassword: async () => {
      controller.abort();
      return { data: { user: { id: 'actor' } }, error: null };
    },
  };
  await assert.rejects(changeAccountPassword(main, delayed, 'actor', 'person@example.test', 'old', 'next', controller.signal), { name: 'AbortError' });
  assert.deepEqual(calls, ['cleanup']);
  calls.length = 0;
  await assert.rejects(
    changeAccountPassword(
      main,
      { ...verifier, signInWithPassword: async () => ({ data: { user: { id: 'other' } }, error: null }) },
      'actor',
      'person@example.test',
      'old',
      'next',
      new AbortController().signal,
    ),
    { code: 'unauthorized' },
  );
  assert.deepEqual(calls, ['cleanup']);
  calls.length = 0;
  await assert.rejects(
    changeAccountPassword(
      main,
      { ...verifier, signOut: async () => ({ error: new Error('offline') }) },
      'actor',
      'person@example.test',
      'old',
      'next',
      new AbortController().signal,
    ),
    { code: 'network' },
  );
  assert.deepEqual(calls, []);
});
test('aggregate routes never expose inaccessible private project children or archived private entities', async () => {
  const { visiblePanelSnapshot } = await import('../src/app/panel/panel-model.ts');
  const s = {
    actorId: 'me',
    projects: [
      { id: 'public', legacyMetadata: {} },
      { id: 'private', archived: true, legacyMetadata: { private: true } },
    ],
    projectMembers: [],
    tasks: [
      { id: 'visible', projectId: 'public' },
      { id: 'hidden', projectId: 'private', archived: true },
    ],
    files: [{ id: 'file', projectId: 'private', taskId: 'hidden' }],
    comments: [{ id: 'comment', taskId: 'hidden' }],
    notifications: [{ id: 'n', projectId: null, taskId: 'hidden' }],
    activity: [{ id: 'a', projectId: 'private', taskId: null }],
    events: [{ id: 'e', entityId: 'hidden', payload: {} }],
  };
  const result = visiblePanelSnapshot(s, true);
  assert.deepEqual(
    result.tasks.map(t => t.id),
    ['visible'],
  );
  for (const key of ['files', 'comments', 'notifications', 'activity', 'events']) assert.deepEqual(result[key], []);
  assert.equal(visiblePanelSnapshot(s, false).projects.length, 2);
  assert.equal(s.projects.length, 2);
});
