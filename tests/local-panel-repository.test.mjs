import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalRepository } from '../src/workspace/local.js';
import { seed } from '../src/data/seed.js';
import { emptyWorkspace } from '../src/data/workspace.js';
import * as module from '../src/workspace/local-panel.js';
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function fixture() {
  const data = seed();
  data.tasks[0].custom = { literal: '<img src=x>', deep: ['original'] };
  data.tasks[0].subtasks = [{ id: 'old-sub', title: 'Nested', done: true, note: 'retained' }];
  data.tasks[0].deps = [data.tasks[1].id];
  data.tasks[0].status = 'todo';
  data.tasks[0].recur = 'Weekly';
  data.tasks[0].due = '2026-10-20';
  return data;
}
async function setup(saved = fixture()) {
  assert.equal(typeof module.createLocalPanelAdapter, 'function', 'local normalized adapter must exist');
  const disk = storage({
    'gr8r.v2': JSON.stringify({ data: saved, prefs: { lang: 'en', theme: 'dark', custom: 5 }, views: { p1: { sort: 'due' } }, collapsed: true }),
  });
  const persistence = createLocalRepository({ storage: disk, seed, blank: emptyWorkspace });
  const make = id => module.createLocalPanelAdapter({ persistence, workspaceId: id, storage: disk, identity: 'local' });
  const discovery = make(null);
  const workspaces = await discovery.workspaces();
  return { disk, persistence, make, discovery, repo: make(workspaces[0].id), saved, workspaces };
}
const command = (repo, op, input, expectedVersion, idempotencyKey = crypto.randomUUID()) => repo.command(op, { input, expectedVersion, idempotencyKey });
test('maps existing graph with text IDs and metadata, preserves original bytes and reload edits', async () => {
  const { repo, disk, saved, make } = await setup();
  const original = disk.getItem('gr8r.v2');
  const task = (await repo.list('list_tasks'))[0];
  assert.equal(task.id, saved.tasks[0].id);
  assert.equal(task.projectId, saved.tasks[0].project);
  assert.deepEqual(task.legacyMetadata.custom, saved.tasks[0].custom);
  assert.equal((await repo.list('list_subtasks', { taskId: task.id }))[0].id, 'old-sub');
  assert.equal((await repo.list('list_dependencies'))[0].dependsOnTaskId, saved.tasks[1].id);
  await command(repo, 'update_task', { id: task.id, title: 'Home <literal>' }, task.version);
  const stored = JSON.parse(disk.getItem('gr8r.workspaces.v1')).records[repo.workspaceId];
  assert.equal(stored.revision, 1);
  assert.deepEqual(stored.data.tasks[0].custom, saved.tasks[0].custom);
  assert.deepEqual(stored.data.tasks[0].subtasks, saved.tasks[0].subtasks);
  assert.equal((await make(repo.workspaceId).query('get_task', { id: task.id })).data.title, 'Home <literal>');
  assert.equal(disk.getItem('gr8r.v2'), original);
});
test('atomic ordered batch rolls back writes, history and idempotency on stale child CAS', async () => {
  const { repo, disk } = await setup();
  const task = (await repo.list('list_tasks'))[0];
  const before = disk.getItem('gr8r.workspaces.v1');
  const commands = [
    { operation: 'update_task', input: { id: task.id, title: 'first' }, expectedVersion: task.version },
    { operation: 'update_task', input: { id: task.id, title: 'second' }, expectedVersion: task.version },
  ];
  await assert.rejects(command(repo, 'batch', { commands }), { code: 'version_conflict' });
  assert.equal(disk.getItem('gr8r.workspaces.v1'), before);
  commands[1].expectedVersion++;
  await command(repo, 'batch', { commands });
  assert.equal((await repo.query('get_task', { id: task.id })).data.title, 'second');
  assert.equal(JSON.parse(disk.getItem('gr8r.workspaces.v1')).records[repo.workspaceId].revision, 1);
});
test('two adapters serialize CAS and persist deduplication across reload without losing unrelated writes', async () => {
  const { repo, make } = await setup();
  const other = make(repo.workspaceId),
    tasks = await repo.list('list_tasks');
  const results = await Promise.allSettled([
    command(repo, 'update_task', { id: tasks[0].id, title: 'winner' }, 1),
    command(other, 'update_task', { id: tasks[0].id, title: 'loser' }, 1),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'version_conflict');
  const input = { id: tasks[1].id, title: 'unrelated' };
  const first = await command(other, 'update_task', input, 1, 'retry');
  assert.deepEqual(await command(make(repo.workspaceId), 'update_task', input, 1, 'retry'), first);
  await assert.rejects(command(repo, 'update_task', { ...input, title: 'different' }, 1, 'retry'), { code: 'idempotency_conflict' });
  assert.equal((await repo.query('get_task', { id: tasks[0].id })).data.title, 'winner');
});
test('completion recurrence and protected relations are atomic and retry safe', async () => {
  const { repo } = await setup();
  const task = (await repo.list('list_tasks'))[0];
  await assert.rejects(command(repo, 'delete_task', { id: (await repo.list('list_tasks'))[1].id }, 1), { code: 'validation_error' });
  const count = (await repo.list('list_tasks')).length;
  await command(repo, 'complete_task', { id: task.id }, 1, 'complete');
  await command(repo, 'complete_task', { id: task.id }, 1, 'complete');
  const tasks = await repo.list('list_tasks');
  assert.equal(tasks.length, count + 1);
  const next = tasks.at(-1);
  assert.equal(next.dueDate, '2026-10-27');
  assert.equal(next.status, 'todo');
  assert.equal((await repo.list('list_subtasks', { taskId: next.id }))[0].done, false);
  assert.notEqual((await repo.list('list_subtasks', { taskId: next.id }))[0].id, 'old-sub');
});
test('existing workspace records and personal preferences retain unknown fields and isolate identities/views', async () => {
  const { discovery, repo, disk, make } = await setup();
  const personal = await discovery.personal();
  assert.equal(personal.prefs.lang, 'en');
  assert.equal(personal.collapsed, true);
  await repo.savePersonal({ prefs: { density: 'compact' }, views: { special: { sort: 'title' } }, collapsed: false });
  const created = await discovery.rpc('create_workspace_v2', { p_name: 'Second', p_slug: 'second', p_idempotency_key: 'workspace' });
  const second = make(created.data.id);
  await second.savePersonal({ views: { other: { filter: 'todo' } } });
  assert.equal((await repo.personal()).prefs.custom, 5);
  assert.deepEqual((await repo.personal()).views, { special: { sort: 'title' } });
  assert.deepEqual((await second.personal()).views, { other: { filter: 'todo' } });
  const other = module.createLocalPanelAdapter({
    persistence: createLocalRepository({ storage: disk, seed, blank: emptyWorkspace }),
    storage: disk,
    identity: 'other',
    workspaceId: repo.workspaceId,
  });
  assert.deepEqual(await other.preferences(), { favoriteProjectIds: [], favoriteTaskIds: [], notificationReadStates: {} });
  assert.deepEqual((await other.personal()).prefs, {});
  assert.equal((await second.list('list_tasks')).length, 0);
  assert.equal((await make(repo.workspaceId).list('list_tasks')).length > 0, true);
});
test('corrupt/unavailable storage fails without resets, and disposed in-flight work never rehydrates', async () => {
  const { disk, persistence, repo } = await setup();
  disk.setItem('gr8r.workspaces.v1', '{broken');
  await assert.rejects(repo.list('list_tasks'), { code: 'corrupt' });
  assert.equal(disk.getItem('gr8r.workspaces.v1'), '{broken');
  const unavailable = module.createLocalPanelAdapter({
    persistence,
    storage: {
      getItem() {
        throw Error('private');
      },
      setItem() {
        throw Error('private');
      },
    },
    identity: 'local',
    workspaceId: repo.workspaceId,
  });
  await assert.rejects(unavailable.personal(), { code: 'storage' });
  const fresh = await setup();
  const pending = fresh.repo.list('list_tasks');
  fresh.repo.dispose();
  fresh.repo.activate();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.ok((await fresh.repo.list('list_tasks')).length);
  await assert.rejects(fresh.repo.rpc('list_integration_connections'), { code: 'cloud_required' });
});
test('pre-auth language and account appearance preserve unknown keys without crossing identities', async () => {
  const appearance = await import('../src/workspace/device-preferences.js').catch(() => ({}));
  assert.equal(typeof appearance.loadAppearance, 'function');
  const disk = storage({
    'gr8r.auth.preferences': JSON.stringify({ lang: 'en', unknown: 4 }),
    'gr8r.preferences.alice': JSON.stringify({ prefs: { theme: 'dark', custom: true }, views: { w: { a: 1 } } }),
  });
  assert.equal(appearance.loadAppearance(disk, 'anonymous').lang, 'en');
  assert.equal(appearance.loadAppearance(disk, 'alice').theme, 'dark');
  assert.notEqual(appearance.loadAppearance(disk, 'bob').theme, 'dark');
  appearance.saveAppearance(disk, 'alice', { lang: 'pt-BR', density: 'compact' });
  const value = JSON.parse(disk.getItem('gr8r.preferences.alice'));
  assert.equal(value.prefs.custom, true);
  assert.deepEqual(value.views, { w: { a: 1 } });
  assert.equal(JSON.parse(disk.getItem('gr8r.auth.preferences')).unknown, 4);
});
test('rejects invalid new values, missing local references and private executor fields without changing bytes', async () => {
  const { repo, disk } = await setup();
  const task = (await repo.list('list_tasks'))[0];
  const before = disk.getItem('gr8r.workspaces.v1');
  for (const input of [
    { id: task.id, status: 'invalid' },
    { id: task.id, assigneeUserId: 'outside' },
    { id: task.id, dueDate: '2026-02-31' },
    { id: task.id, claimToken: 'private' },
  ]) {
    await assert.rejects(command(repo, 'update_task', input, 1), { code: 'validation_error' });
    assert.equal(disk.getItem('gr8r.workspaces.v1'), before);
  }
});
test('existing v1 records with unknown envelope metadata survive commands and storage failure', async () => {
  const initial = await setup();
  const envelope = JSON.parse(initial.disk.getItem('gr8r.workspaces.v1'));
  envelope.custom = { retained: true };
  envelope.records[initial.repo.workspaceId].custom = ['record'];
  initial.disk.setItem('gr8r.workspaces.v1', JSON.stringify(envelope));
  const task = (await initial.repo.list('list_tasks'))[0];
  const before = initial.disk.getItem('gr8r.workspaces.v1');
  const setItem = initial.disk.setItem;
  initial.disk.setItem = () => {
    throw Error('quota');
  };
  await assert.rejects(command(initial.repo, 'update_task', { id: task.id, title: 'draft' }, 1, 'retry'), { code: 'storage' });
  assert.equal(initial.disk.getItem('gr8r.workspaces.v1'), before);
  initial.disk.setItem = setItem;
  await command(initial.repo, 'update_task', { id: task.id, title: 'draft' }, 1, 'retry');
  const after = JSON.parse(initial.disk.getItem('gr8r.workspaces.v1'));
  assert.deepEqual(after.custom, envelope.custom);
  assert.deepEqual(after.records[initial.repo.workspaceId].custom, ['record']);
});
test('adapter bookkeeping stays outside graph and a legacy writer cannot bypass React CAS', async () => {
  const { repo, disk, persistence } = await setup();
  const original = JSON.parse(disk.getItem('gr8r.workspaces.v1')).records[repo.workspaceId].data;
  const task = (await repo.list('list_tasks'))[0];
  await command(repo, 'update_task', { id: task.id, title: 'react' }, task.version);
  const current = await persistence.load(repo.workspaceId);
  assert.deepEqual(Object.keys(current.data).sort(), Object.keys(original).sort());
  current.data.tasks[0].title = 'legacy';
  await persistence.save(repo.workspaceId, current.data, current.revision);
  await assert.rejects(command(repo, 'update_task', { id: task.id, title: 'stale react' }, task.version + 1), { code: 'version_conflict' });
  assert.equal((await repo.query('get_task', { id: task.id })).data.title, 'legacy');
});
test('workspace creation retries return one blank workspace', async () => {
  const { discovery } = await setup();
  const args = { p_name: 'New', p_slug: 'new', p_idempotency_key: 'retry-create' };
  const first = await discovery.rpc('create_workspace_v2', args);
  assert.deepEqual(await discovery.rpc('create_workspace_v2', args), first);
  assert.equal((await discovery.workspaces()).filter(w => w.name === 'New').length, 1);
});
test('scalar/null and malformed persisted envelopes never seed or reset existing bytes', async () => {
  for (const value of ['null', 'false', '0', '[]', JSON.stringify({ version: 1, order: ['w1'], records: {} })]) {
    const disk = storage({ 'gr8r.workspaces.v1': value });
    const persistence = createLocalRepository({ storage: disk, seed, blank: emptyWorkspace });
    await assert.rejects(persistence.list(), { code: 'corrupt' });
    assert.equal(disk.getItem('gr8r.workspaces.v1'), value);
  }
});
test('a disposed queued command cannot commit into a reactivated repository', async () => {
  const { repo: source, disk, persistence } = await setup();
  let release;
  const gate = new Promise(resolve => {
    release = resolve;
  });
  const delayed = {
    ...persistence,
    async transact(...args) {
      await gate;
      return persistence.transact(...args);
    },
  };
  const repo = module.createLocalPanelAdapter({ persistence: delayed, storage: disk, workspaceId: source.workspaceId });
  const task = (await repo.list('list_tasks'))[0];
  const before = disk.getItem('gr8r.workspaces.v1');
  const pending = command(repo, 'update_task', { id: task.id, title: 'late' }, 1);
  repo.dispose();
  repo.activate();
  release();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(disk.getItem('gr8r.workspaces.v1'), before);
});
test('attributes cannot change identities and dependency cycles roll back without touching the graph', async () => {
  const { repo, disk } = await setup();
  const tasks = await repo.list('list_tasks');
  const before = disk.getItem('gr8r.workspaces.v1');
  await assert.rejects(command(repo, 'update_task', { id: tasks[0].id, attributes: { id: 'replacement' } }, 1), { code: 'validation_error' });
  await assert.rejects(command(repo, 'set_task_dependency', { id: tasks[1].id, dependsOnTaskId: tasks[0].id }, 1), { code: 'validation_error' });
  assert.equal(disk.getItem('gr8r.workspaces.v1'), before);
});
test('an older writer replacing the record envelope preserves command deduplication and forces stale CAS recovery', async () => {
  const { repo, disk, make } = await setup();
  const task = (await repo.list('list_tasks'))[0];
  const input = { taskId: task.id, body: 'Only once' };
  const saved = await command(repo, 'add_task_comment', input, undefined, 'persisted-retry');
  const state = JSON.parse(disk.getItem('gr8r.workspaces.v1'));
  const old = state.records[repo.workspaceId];
  // Exact original local.js writer shape, predating React metadata awareness.
  state.records[repo.workspaceId] = { id: old.id, data: old.data, revision: old.revision + 1 };
  state.records[repo.workspaceId].data.tasks[0].title = 'Older writer';
  disk.setItem('gr8r.workspaces.v1', JSON.stringify(state));
  const reloaded = make(repo.workspaceId);
  assert.deepEqual(await command(reloaded, 'add_task_comment', input, undefined, 'persisted-retry'), saved);
  assert.equal((await reloaded.list('list_comments', { taskId: task.id })).filter(c => c.body === 'Only once').length, 1);
  assert.equal((await reloaded.query('get_task', { id: task.id })).data.version, task.version + 1);
  await assert.rejects(command(reloaded, 'update_task', { id: task.id, title: 'stale' }, task.version), { code: 'version_conflict' });
});
test('deleting a task or project requires unlinking files referenced by surviving tasks', async () => {
  const saved = fixture();
  const victim = saved.tasks[0];
  const survivor = saved.tasks.find(t => t.project !== victim.project);
  const file = { id: 'shared-file', task: victim.id, project: victim.project, name: 'Shared', type: 'pdf', size: '1 KB', by: saved.me };
  saved.files.push(file);
  survivor.attachments = [file];
  const { repo, disk } = await setup(saved);
  const before = disk.getItem('gr8r.workspaces.v1');
  await assert.rejects(command(repo, 'delete_task', { id: victim.id }, 1), { code: 'validation_error' });
  await assert.rejects(command(repo, 'delete_project', { id: victim.project }, 1), { code: 'validation_error' });
  assert.equal(disk.getItem('gr8r.workspaces.v1'), before);
});
test('an existing identity language takes precedence over the shared pre-auth fallback', async () => {
  const { loadAppearance } = await import('../src/workspace/device-preferences.js');
  const disk = storage({ 'gr8r.auth.preferences': JSON.stringify({ lang: 'en' }), 'gr8r.preferences.alice': JSON.stringify({ prefs: { lang: 'pt-BR' } }) });
  assert.equal(loadAppearance(disk, 'alice').lang, 'pt-BR');
  assert.equal(loadAppearance(disk, 'new-account').lang, 'en');
});
