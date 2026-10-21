import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTaskView,
  groupTaskView,
  readTaskView,
  bulkCommands,
  reorderTask,
  saveTaskView,
  loadTaskView,
  taskDragId,
} from '../src/app/tasks/task-view-model.ts';
const task = (id, patch = {}) => ({
  id,
  title: id,
  key: id,
  projectId: 'p1',
  status: 'todo',
  priority: 'none',
  assigneeUserId: null,
  dueDate: null,
  startDate: null,
  sortOrder: 0,
  version: 3,
  archived: false,
  legacyMetadata: {},
  createdAt: '2026-10-20T00:00:00Z',
  updatedAt: '2026-10-20T00:00:00Z',
  ...patch,
});
test('multi-value AND filters, negation, literal query, dates and sorting preserve input', () => {
  const rows = [
    task('a', { title: '<literal>', priority: 'urgent', dueDate: '2026-10-19', sortOrder: 9 }),
    task('b', { priority: 'low', assigneeUserId: 'm1' }),
    task('c', { status: 'done', dueDate: '2026-10-19' }),
  ];
  const view = readTaskView({
    q: '<literal>',
    filters: [
      { f: 'priority', op: 'not', v: ['low'] },
      { f: 'due', op: 'is', v: ['overdue'] },
    ],
    sort: { f: 'priority', dir: 1 },
  });
  assert.deepEqual(
    applyTaskView(rows, view, [], [], new Date('2026-10-20T12:00:00Z')).map(t => t.id),
    ['a'],
  );
  assert.equal(rows[0].sortOrder, 9);
  assert.deepEqual(
    groupTaskView(rows, 'assignee', [], []).map(g => [g.key, g.tasks.length]),
    [
      ['m1', 1],
      ['none', 2],
    ],
  );
  assert.equal(readTaskView({ hidden: ['title', 'start'], sort: 'due', colW: { due: 10 } }).colW.due, 64);
});
test('100-child bound, reservation guard and exact ordered CAS never partially select', () => {
  assert.throws(
    () =>
      bulkCommands(
        Array.from({ length: 101 }, (_, i) => task(String(i))),
        'update_task',
        { priority: 'high' },
      ),
    /batch_limit/,
  );
  assert.throws(() => bulkCommands([task('a'), task('b', { reservation: { active: true, expiresAt: '2099-01-01' } })], 'archive_task'), /already_claimed/);
  assert.deepEqual(bulkCommands([task('a'), task('b')], 'complete_task'), [
    { operation: 'complete_task', input: { id: 'a' }, expectedVersion: 3 },
    { operation: 'complete_task', input: { id: 'b' }, expectedVersion: 3 },
  ]);
});
test('manual move uses target group and midpoint with ordered move then edit CAS', () => {
  const rows = [task('a', { sortOrder: 1 }), task('b', { sortOrder: 2, status: 'progress' }), task('c', { sortOrder: 4, status: 'progress' })];
  assert.deepEqual(reorderTask(rows, 'a', 'c', 'status', 'progress'), [
    { operation: 'update_task', input: { id: 'a', sortOrder: 3, status: 'progress' }, expectedVersion: 3 },
  ]);
  assert.deepEqual(reorderTask(rows, 'a', 'b', 'project', 'p2'), [
    { operation: 'move_task', input: { id: 'a', projectId: 'p2', sortOrder: 1 }, expectedVersion: 3 },
  ]);
});
test('personal view writes merge unknown fields, workspace/view and identity isolation', () => {
  const values = new Map();
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  storage.setItem('gr8r.preferences.local', JSON.stringify({ prefs: { custom: 17 }, views: { w1: { legacy: { unknown: true } } }, custom: 'retained' }));
  saveTaskView(storage, 'local', 'w1', 'tasks:list', readTaskView({ q: 'first' }));
  saveTaskView(storage, 'local', 'w2', 'tasks:list', readTaskView({ q: 'second' }));
  assert.equal(loadTaskView(storage, 'local', 'w1', 'tasks:list').q, 'first');
  assert.equal(loadTaskView(storage, 'other', 'w1', 'tasks:list').q, '');
  assert.equal(JSON.parse(values.get('gr8r.preferences.local')).views.w1.legacy.unknown, true);
  assert.equal(JSON.parse(values.get('gr8r.preferences.local')).custom, 'retained');
});
test('drag to done composes sort edit then completion with ordered CAS and counts actual children', () => {
  const rows = [task('a', { sortOrder: 1 }), task('b', { sortOrder: 3, status: 'done' })];
  assert.deepEqual(reorderTask(rows, 'a', 'b', 'status', 'done'), [
    { operation: 'update_task', input: { id: 'a', sortOrder: 2 }, expectedVersion: 3 },
    { operation: 'complete_task', input: { id: 'a' }, expectedVersion: 4 },
  ]);
  assert.throws(
    () =>
      bulkCommands(
        Array.from({ length: 51 }, (_, i) => task(String(i))),
        'update_task',
        { status: 'done', sortOrder: 4 },
      ),
    /batch_limit/,
  );
});
test('manual ties rebalance atomically with CAS instead of silently retaining the old order', () => {
  const rows = [task('a'), task('b'), task('c')];
  const commands = reorderTask(rows, 'c', 'b', 'none', 'all');
  const result = rows.map(t => ({ ...t }));
  for (const c of commands)
    Object.assign(
      result.find(t => t.id === c.input.id),
      c.input,
    );
  assert.deepEqual(
    result.sort((a, b) => a.sortOrder - b.sortOrder).map(t => t.id),
    ['a', 'c', 'b'],
  );
  assert.ok(commands.every(c => c.expectedVersion === 3));
});

test('drag payload is fenced to its repository lifetime, including identical IDs in another workspace', () => {
  assert.equal(taskDragId(JSON.stringify({ id: 't1', scope: 'workspace-a-session-1' }), 'workspace-a-session-1'), 't1');
  assert.equal(taskDragId(JSON.stringify({ id: 't1', scope: 'workspace-a-session-1' }), 'workspace-b-session-1'), null);
  assert.equal(taskDragId(JSON.stringify({ id: 't1', scope: 'workspace-a-session-1' }), 'workspace-a-session-2'), null);
  assert.equal(taskDragId('t1', 'workspace-a-session-1'), null);
});
test('core task action preparation shares reservation and CAS guards while explicit intervention remains intentional', async () => {
  const { prepareTaskAction } = await import('../src/app/tasks/task-view-model.ts');
  assert.equal(typeof prepareTaskAction, 'function');
  const active = task('a', { reservation: { active: true, expiresAt: '2099-01-01' } });
  assert.throws(() => prepareTaskAction(active, 'duplicate_task', {}, 3), /already_claimed/);
  assert.deepEqual(prepareTaskAction(task('a'), 'archive_task', {}, 7), { operation: 'archive_task', input: { id: 'a' }, expectedVersion: 7 });
  assert.deepEqual(prepareTaskAction(active, 'intervene_task', { action: 'release' }, 3), {
    operation: 'intervene_task',
    input: { id: 'a', action: 'release' },
    expectedVersion: 3,
  });
});
test('due groups use the local calendar at 22:30 in Maceio and across daylight-saving changes', async () => {
  const { dueGroup } = await import('../src/app/tasks/task-view-model.ts');
  const previousTZ = process.env.TZ;
  try {
    process.env.TZ = 'America/Maceio';
    const now = new Date('2026-10-20T22:30:00-03:00');
    assert.equal(dueGroup(task('today', { dueDate: '2026-10-20' }), now), 'today');
    assert.equal(dueGroup(task('yesterday', { dueDate: '2026-10-19' }), now), 'overdue');
    assert.equal(dueGroup(task('week', { dueDate: '2026-10-27' }), now), 'week');
    assert.equal(dueGroup(task('later', { dueDate: '2026-10-28' }), now), 'later');
    process.env.TZ = 'America/New_York';
    const beforeDST = new Date('2026-03-07T22:30:00-05:00');
    assert.equal(dueGroup(task('localToday', { dueDate: '2026-03-07' }), beforeDST), 'today');
    assert.equal(dueGroup(task('weekAcrossDST', { dueDate: '2026-03-14' }), beforeDST), 'week');
    assert.equal(dueGroup(task('laterAcrossDST', { dueDate: '2026-03-15' }), beforeDST), 'later');
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
});
test('due filters overlap today and next seven days, exclude completed overdue, and negate the full predicate', () => {
  const previousTZ = process.env.TZ;
  try {
    process.env.TZ = 'America/Maceio';
    const now = new Date('2026-10-20T12:00:00-03:00');
    const rows = [
      task('today', { dueDate: '2026-10-20' }),
      task('plus7', { dueDate: '2026-10-27' }),
      task('plus8', { dueDate: '2026-10-28' }),
      task('overdue', { dueDate: '2026-10-19' }),
      task('completedOverdue', { dueDate: '2026-10-19', status: 'done' }),
      task('nodate'),
    ];
    for (const [value, expected] of [
      ['today', ['today']],
      ['week', ['today', 'plus7']],
      ['overdue', ['overdue']],
      ['later', ['plus8']],
      ['nodate', ['nodate']],
    ]) {
      for (const op of ['is', 'not']) {
        const view = readTaskView({ filters: [{ f: 'due', op, v: [value] }] });
        const ids = applyTaskView(rows, view, [], [], now).map(t => t.id);
        assert.deepEqual(ids, op === 'is' ? expected : rows.map(t => t.id).filter(id => !expected.includes(id)), `${op} ${value}`);
      }
    }
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
});
test('legacy calendar helper exports share the pure implementation without changing the existing API', async () => {
  const calendar = await import('../src/core/calendar.js');
  const legacy = await import('../src/core/utils.js');
  for (const name of ['DAY', 'sod', 'iso', 'parse', 'addD', 'diffD']) assert.equal(legacy[name], calendar[name], name);
});
