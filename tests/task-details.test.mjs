import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/data/seed.js';
import { emptyWorkspace } from '../src/data/workspace.js';
import { createLocalRepository } from '../src/workspace/local.js';
import { createLocalWorkspaceRepository } from '../src/workspace/local-panel-repository.ts';
async function setup() {
  const data = seed();
  data.tasks[0].subtasks = [{ id: 'detail-sub', title: 'Promote', done: true, note: '<b>Note</b>', custom: 'kept' }];
  const values = new Map([['gr8r.v2', JSON.stringify({ data })]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const persistence = createLocalRepository({ storage, seed, blank: emptyWorkspace });
  const options = { persistence, storage, identity: 'local', workspaceId: null };
  const discovery = createLocalWorkspaceRepository(options);
  const workspaceId = (await discovery.workspaces())[0].id;
  const repo = createLocalWorkspaceRepository({ ...options, workspaceId });
  return { repo, storage, data, persistence };
}
const command = (repo, operation, input, expectedVersion, idempotencyKey = crypto.randomUUID()) =>
  repo.command(operation, { input, expectedVersion, idempotencyKey });
test('detail relations preserve metadata, initialize versions, CAS and roll back batch', async () => {
  const { repo, storage } = await setup();
  const task = (await repo.list('list_tasks'))[0];
  const label = await command(repo, 'create_label', { id: 'detail-label', name: '<literal>' });
  assert.equal(label.data.version, 1);
  await command(repo, 'set_task_label', { id: task.id, labelId: label.data.id }, task.version);
  const before = storage.getItem('gr8r.workspaces.v1');
  await assert.rejects(
    command(repo, 'batch', {
      commands: [
        { operation: 'create_file', input: { id: 'detail-file', name: 'metadata', fileType: 'doc', projectId: task.projectId } },
        { operation: 'set_task_attachment', input: { id: task.id, fileId: 'detail-file' }, expectedVersion: task.version },
      ],
    }),
    { code: 'version_conflict' },
  );
  assert.equal(storage.getItem('gr8r.workspaces.v1'), before);
  const attached = await command(
    repo,
    'batch',
    {
      commands: [
        { operation: 'create_file', input: { id: 'detail-file', name: 'metadata', fileType: 'doc', projectId: task.projectId } },
        { operation: 'set_task_attachment', input: { id: task.id, fileId: 'detail-file' }, expectedVersion: task.version + 1 },
      ],
    },
    undefined,
    'attachment-retry',
  );
  assert.equal(attached.data.results[0].data.version, 1);
  await assert.rejects(command(repo, 'delete_file', { id: 'detail-file' }, 1), { code: 'validation_error' });
  await command(repo, 'remove_task_attachment', { id: task.id, fileId: 'detail-file' }, task.version + 2);
  await command(repo, 'delete_file', { id: 'detail-file' }, 1);
  assert.equal(
    (await repo.list('list_files')).some(f => f.id === 'detail-file'),
    false,
  );
});
test('reactions affect only current local actor and replay survives old writer', async () => {
  const { repo, persistence, data } = await setup();
  const task = (await repo.list('list_tasks'))[0];
  const comment = await command(repo, 'add_task_comment', { id: 'detail-comment', taskId: task.id, body: '<b>Hello</b>' });
  const first = await command(repo, 'add_reaction', { commentId: comment.data.id, reaction: '👍' }, undefined, 'reaction-retry');
  const loaded = await persistence.load(repo.workspaceId);
  await persistence.save(repo.workspaceId, loaded.data, loaded.revision);
  assert.deepEqual(await command(repo, 'add_reaction', { commentId: comment.data.id, reaction: '👍' }, undefined, 'reaction-retry'), first);
  const rows = await repo.list('list_reactions');
  assert.equal(rows.find(r => r.commentId === comment.data.id).userId, data.me);
  await command(repo, 'remove_reaction', { commentId: comment.data.id, reaction: '👍' });
  assert.equal((await repo.list('list_reactions')).filter(r => r.commentId === comment.data.id).length, 0);
});
test('local task activity returns canonical events for only the requested task', async () => {
  const { repo } = await setup();
  const tasks = await repo.list('list_tasks');
  await command(repo, 'update_task', { id: tasks[0].id, title: 'Changed' }, tasks[0].version);
  await command(repo, 'add_task_comment', { taskId: tasks[1].id, body: 'Elsewhere' });
  const events = await repo.list('list_task_activity', { taskId: tasks[0].id });
  assert.equal(events.filter(e => e.operation === 'update_task').length, 1);
  assert.equal(
    events.some(e => e.operation === 'add_task_comment'),
    false,
  );
});

test('inline subtask command preserves subtask ID and checks the parent reservation/CAS', async () => {
  const { bulkCommands } = await import('../src/app/tasks/task-view-model.ts');
  const { repo } = await setup();
  const parent = (await repo.list('list_tasks'))[0];
  const commands = bulkCommands([parent], 'update_subtask', { id: 'detail-sub', taskId: parent.id, done: false });
  assert.equal(commands[0].input.id, 'detail-sub');
  assert.equal(commands[0].expectedVersion, parent.version);
  await command(repo, 'batch', { commands });
  assert.equal((await repo.list('list_subtasks', { taskId: parent.id }))[0].done, false);
});

test('comment deletion retry rechecks the current author after local actor changes', async () => {
  const { repo, persistence, data } = await setup();
  const parent = (await repo.list('list_tasks'))[0];
  await command(repo, 'add_task_comment', { id: 'own-comment', taskId: parent.id, body: 'Mine' });
  await command(repo, 'delete_comment', { id: 'own-comment' }, 1, 'delete-own');
  const loaded = await persistence.load(repo.workspaceId);
  loaded.data.me = data.members.find(m => m.id !== data.me).id;
  await persistence.save(repo.workspaceId, loaded.data, loaded.revision);
  await assert.rejects(command(repo, 'delete_comment', { id: 'own-comment' }, 1, 'delete-own'), { code: 'forbidden' });
});
test('subtask details validate dates, retain unknown fields and increment row/parent versions', async () => {
  const { repo, storage } = await setup();
  const parent = (await repo.list('list_tasks'))[0];
  const before = storage.getItem('gr8r.workspaces.v1');
  await assert.rejects(command(repo, 'update_subtask', { taskId: parent.id, id: 'detail-sub', attributes: { due: '2026-02-30' } }, parent.version), {
    code: 'validation_error',
  });
  assert.equal(storage.getItem('gr8r.workspaces.v1'), before);
  const next = await command(repo, 'update_subtask', { taskId: parent.id, id: 'detail-sub', attributes: { note: '' } }, parent.version);
  assert.equal(next.data.version, 2);
  assert.equal(next.data.legacyMetadata.custom, 'kept');
});
test('personal preferences merge current envelope, isolate identities/workspaces and report storage failure', async () => {
  const { repo, storage, persistence } = await setup();
  await repo.personal();
  const raw = JSON.parse(storage.getItem('gr8r.preferences.local'));
  raw.unknown = { literal: '<retain>' };
  raw.preferences = { another: { favoriteTaskIds: ['elsewhere'], unknown: 12 }, [repo.workspaceId]: { unknown: 'same-workspace' } };
  storage.setItem('gr8r.preferences.local', JSON.stringify(raw));
  await repo.savePersonal({ preferences: { favoriteTaskIds: ['t1'], favoriteProjectIds: [], notificationReadStates: {} } });
  const saved = JSON.parse(storage.getItem('gr8r.preferences.local'));
  assert.deepEqual(saved.unknown, raw.unknown);
  assert.deepEqual(saved.preferences.another, raw.preferences.another);
  assert.equal(saved.preferences[repo.workspaceId].unknown, 'same-workspace');
  const other = createLocalWorkspaceRepository({ persistence, storage, identity: 'another', workspaceId: repo.workspaceId });
  assert.deepEqual((await other.preferences()).favoriteTaskIds, []);
  assert.deepEqual((await repo.preferences()).favoriteTaskIds, ['t1']);
  const fail = createLocalWorkspaceRepository({
    persistence,
    storage: {
      getItem: storage.getItem,
      setItem: () => {
        throw Error('full');
      },
    },
    identity: 'local',
    workspaceId: repo.workspaceId,
  });
  await assert.rejects(fail.savePersonal({ preferences: { favoriteTaskIds: [], favoriteProjectIds: [], notificationReadStates: {} } }), { code: 'storage' });
  assert.deepEqual((await repo.preferences()).favoriteTaskIds, ['t1']);
});

test('embedded-only file metadata survives read, unlink, reattach and update without duplicate IDs or unknown-field loss', async () => {
  const { repo, storage, persistence } = await setup();
  const loaded = await persistence.load(repo.workspaceId);
  const parent = loaded.data.tasks.find(t => t.attachments?.length);
  const embedded = parent.attachments[0];
  embedded.unknown = { deep: ['kept'] };
  await persistence.save(repo.workspaceId, loaded.data, loaded.revision);
  const before = storage.getItem('gr8r.workspaces.v1');
  const files = await repo.list('list_files');
  assert.equal(files.filter(f => f.id === embedded.id).length, 1);
  assert.deepEqual(files.find(f => f.id === embedded.id).legacyMetadata.unknown, embedded.unknown);
  assert.equal(storage.getItem('gr8r.workspaces.v1'), before);
  let task = (await repo.query('get_task', { id: parent.id })).data;
  await command(repo, 'remove_task_attachment', { id: task.id, fileId: embedded.id }, task.version);
  let file = (await repo.list('list_files')).find(f => f.id === embedded.id);
  assert.ok(file, 'detaching must preserve the metadata record');
  assert.deepEqual(file.legacyMetadata.unknown, embedded.unknown);
  assert.equal(file.taskId, parent.id);
  task = (await repo.query('get_task', { id: parent.id })).data;
  await command(repo, 'set_task_attachment', { id: task.id, fileId: file.id }, task.version);
  await command(repo, 'update_file', { id: file.id, name: 'renamed.fig' }, file.version);
  file = (await repo.list('list_files')).find(f => f.id === embedded.id);
  assert.equal(file.name, 'renamed.fig');
  assert.deepEqual(file.legacyMetadata.unknown, embedded.unknown);
  assert.equal((await repo.list('list_files')).filter(f => f.id === embedded.id).length, 1);
});
test('legacy label IDs remain available without a stored label collection or read-time normalization', async () => {
  const { repo, storage, data } = await setup();
  const ids = [...new Set(data.tasks.flatMap(t => t.labels ?? []))];
  const before = storage.getItem('gr8r.workspaces.v1');
  const labels = await repo.list('list_labels');
  for (const id of ids) assert.ok(labels.some(label => label.id === id));
  assert.equal(storage.getItem('gr8r.workspaces.v1'), before);
});

test('embedded metadata preserves explicit ownership and replay rejects a removed current member', async () => {
  const { repo, persistence } = await setup();
  let loaded = await persistence.load(repo.workspaceId);
  const parent = loaded.data.tasks.find(t => t.attachments?.length);
  const embedded = parent.attachments[0];
  embedded.task = null;
  await persistence.save(repo.workspaceId, loaded.data, loaded.revision);
  let file = (await repo.list('list_files')).find(f => f.id === embedded.id);
  assert.equal(file.taskId, null);
  await command(repo, 'update_file', { id: file.id, name: 'updated.fig' }, file.version);
  file = (await repo.list('list_files')).find(f => f.id === embedded.id);
  assert.equal(file.taskId, null);
  await command(repo, 'add_task_comment', { id: 'current-member-comment', taskId: parent.id, body: 'saved' }, undefined, 'member-retry');
  loaded = await persistence.load(repo.workspaceId);
  loaded.data.members = loaded.data.members.filter(m => m.id !== loaded.data.me);
  await persistence.save(repo.workspaceId, loaded.data, loaded.revision);
  await assert.rejects(command(repo, 'add_task_comment', { id: 'current-member-comment', taskId: parent.id, body: 'saved' }, undefined, 'member-retry'), {
    code: 'forbidden',
  });
});

test('virtual legacy labels support explicit mutations and embedded file CAS survives old writers', async () => {
  const { repo, persistence, data, storage } = await setup();
  const parent = (await repo.list('list_tasks')).find(t => t.legacyMetadata.labels?.length);
  const id = parent.legacyMetadata.labels[0];
  const label = (await repo.list('list_labels')).find(l => l.id === id);
  assert.ok(Number.isInteger(label.version));
  await command(repo, 'remove_task_label', { id: parent.id, labelId: id }, parent.version);
  await command(repo, 'set_task_label', { id: parent.id, labelId: id }, parent.version + 1);
  await command(repo, 'update_label', { id, name: 'Persisted legacy label' }, label.version);
  assert.equal((await repo.list('list_labels')).find(l => l.id === id).version, label.version + 1);
  const embeddedId = data.tasks.find(t => t.attachments?.length).attachments[0].id;
  const before = (await repo.list('list_files')).find(f => f.id === embeddedId);
  const loaded = await persistence.load(repo.workspaceId);
  loaded.data.tasks.find(t => t.attachments?.some(f => f.id === embeddedId)).attachments.find(f => f.id === embeddedId).size = 'changed externally';
  await persistence.save(repo.workspaceId, loaded.data, loaded.revision);
  const raw = storage.getItem('gr8r.workspaces.v1');
  const after = (await repo.list('list_files')).find(f => f.id === embeddedId);
  assert.ok(after.version > before.version);
  assert.equal(storage.getItem('gr8r.workspaces.v1'), raw);
  await assert.rejects(command(repo, 'update_file', { id: embeddedId, name: 'stale' }, before.version), { code: 'version_conflict' });
});

test('unlinking an embedded shared attachment preserves its canonical owner and protects surviving relations', async () => {
  const { repo, persistence } = await setup();
  const loaded = await persistence.load(repo.workspaceId);
  const owner = loaded.data.tasks.find(t => t.attachments?.length);
  const survivor = loaded.data.tasks.find(t => t.id !== owner.id && loaded.data.tasks.indexOf(t) > loaded.data.tasks.indexOf(owner));
  const embedded = owner.attachments[0];
  survivor.attachments.push(structuredClone(embedded));
  survivor.deps = [];
  for (const task of loaded.data.tasks) task.deps = (task.deps ?? []).filter(id => id !== owner.id);
  await persistence.save(repo.workspaceId, loaded.data, loaded.revision);
  let parent = (await repo.query('get_task', { id: owner.id })).data;
  const other = (await repo.query('get_task', { id: survivor.id })).data;
  await assert.rejects(command(repo, 'delete_task', { id: owner.id }, parent.version), { code: 'validation_error' });
  await command(repo, 'remove_task_attachment', { id: survivor.id, fileId: embedded.id }, other.version);
  const file = (await repo.list('list_files')).find(f => f.id === embedded.id);
  assert.equal(file.taskId, owner.id);
  assert.equal(file.projectId, owner.project);
  assert.equal(
    (await repo.list('list_attachments')).some(link => link.taskId === owner.id && link.fileId === file.id),
    true,
  );
  parent = (await repo.query('get_task', { id: owner.id })).data;
  await command(repo, 'delete_task', { id: owner.id }, parent.version);
});

test('deleting a task that only links another task file does not transfer ownership or delete metadata', async () => {
  const { repo, persistence } = await setup();
  const loaded = await persistence.load(repo.workspaceId);
  const owner = loaded.data.tasks.find(t => t.attachments?.length);
  const linked = loaded.data.tasks.find(t => t.id !== owner.id && loaded.data.tasks.indexOf(t) > loaded.data.tasks.indexOf(owner));
  const embedded = owner.attachments[0];
  linked.attachments = [structuredClone(embedded)];
  for (const task of loaded.data.tasks) task.deps = [];
  await persistence.save(repo.workspaceId, loaded.data, loaded.revision);
  const task = (await repo.query('get_task', { id: linked.id })).data;
  await command(repo, 'delete_task', { id: task.id }, task.version);
  const file = (await repo.list('list_files')).find(f => f.id === embedded.id);
  assert.equal(file.taskId, owner.id);
});
