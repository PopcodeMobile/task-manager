import test from 'node:test';
import assert from 'node:assert/strict';
import { removeTasks, removeProject, removeFile, renameFile } from '../src/core/task-operations.js';

const fixture = () => ({
  projects: [{ id: 'p1' }, { id: 'p2' }],
  projOrder: ['p1', 'p2'],
  tasks: [
    { id: 't1', project: 'p1', deps: [], attachments: [{ id: 'f1', name: 'same.pdf' }] },
    { id: 't2', project: 'p1', archived: true, deps: ['t1'], attachments: [] },
    { id: 't3', project: 'p2', deps: ['t1', 't2'], attachments: [{ id: 'f2', name: 'same.pdf' }] },
  ],
  comments: [
    { id: 'c1', task: 't1' },
    { id: 'c3', task: 't3' },
  ],
  files: [
    { id: 'f1', project: 'p1', task: 't1', name: 'same.pdf' },
    { id: 'f2', project: 'p2', task: 't3', name: 'same.pdf' },
  ],
  notifs: [{ task: 't1' }, { project: 'p1' }, { task: 't3' }],
  activity: [
    { task: 't1', project: 'p1' },
    { task: 't3', project: 'p2' },
  ],
  events: [{ project: 'p1' }, { project: 'p2' }],
  savedViews: [{ project: 'p1' }, { project: 'p2' }],
});

test('removing a task removes its dependent records without touching another project', () => {
  const data = fixture();
  removeTasks(data, ['t1']);
  assert.deepEqual(
    data.tasks.map(x => x.id),
    ['t2', 't3'],
  );
  assert.deepEqual(data.tasks[1].deps, ['t2']);
  assert.deepEqual(data.comments, [{ id: 'c3', task: 't3' }]);
  assert.deepEqual(
    data.files.map(x => x.id),
    ['f2'],
  );
  assert.equal(
    data.notifs.some(x => x.task === 't1'),
    false,
  );
  assert.equal(
    data.activity.some(x => x.task === 't1'),
    false,
  );
});

test('removing a project cleans archived tasks, views, calendar entries and relations', () => {
  const data = fixture();
  removeProject(data, 'p1');
  assert.deepEqual(data.projects, [{ id: 'p2' }]);
  assert.deepEqual(data.projOrder, ['p2']);
  assert.deepEqual(
    data.tasks.map(x => x.id),
    ['t3'],
  );
  assert.deepEqual(data.tasks[0].deps, []);
  assert.deepEqual(data.notifs, [{ task: 't3' }]);
  assert.deepEqual(data.events, [{ project: 'p2' }]);
  assert.deepEqual(data.savedViews, [{ project: 'p2' }]);
  assert.deepEqual(
    data.files.map(x => x.id),
    ['f2'],
  );
});

test('file operations use identity, preserving a different attachment with the same name', () => {
  const data = fixture();
  renameFile(data, 'f1', 'renamed.pdf', 'pdf');
  assert.equal(data.tasks[0].attachments[0].name, 'renamed.pdf');
  assert.equal(data.files[0].name, 'renamed.pdf');
  removeFile(data, 'f1');
  assert.deepEqual(data.tasks[0].attachments, []);
  assert.equal(data.tasks[2].attachments[0].id, 'f2');
  assert.deepEqual(
    data.files.map(x => x.id),
    ['f2'],
  );
});
