import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDays, navigateCalendar, scheduleCommand, readScheduleDrag, milestones } from '../src/app/schedules/schedule-model.ts';
const task = { id: 'same', workspaceId: 'a', version: 7, startDate: '2026-03-07', dueDate: '2026-03-10', legacyMetadata: {} };
test('calendar uses local dates, preferred week start and month boundary navigation', () => {
  assert.equal(calendarDays('2026-02-20', 'month', 1)[0], '2026-01-26');
  assert.equal(calendarDays('2026-02-20', 'month', 1).length, 35);
  assert.deepEqual(calendarDays('2026-03-08', 'week', 0), ['2026-03-08', '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13', '2026-03-14']);
  assert.equal(navigateCalendar('2026-01-31', 'month', 1), '2026-02-01');
  assert.equal(navigateCalendar('2026-12-31', 'week', 1), '2027-01-07');
});
test('rescheduling preserves duration across DST and captured CAS; missing start stays null', () => {
  const before = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    assert.deepEqual(scheduleCommand(task, '2026-03-12'), {
      operation: 'update_task',
      input: { id: 'same', dueDate: '2026-03-12', startDate: '2026-03-09' },
      expectedVersion: 7,
    });
    assert.equal(scheduleCommand({ ...task, startDate: null }, '2026-03-12').input.startDate, null);
    assert.equal(scheduleCommand(task, task.dueDate), null);
    assert.throws(() => scheduleCommand(task, '2026-02-31'), { code: 'validation_error' });
    assert.throws(() => scheduleCommand({ ...task, reservation: { active: true, expiresAt: '2099-01-01' } }, '2026-03-12'), { code: 'already_claimed' });
  } finally {
    process.env.TZ = before;
  }
});
test('drag payload cannot cross workspace/session/controller lifetime or silently adopt newer version', () => {
  const value = JSON.stringify({ scope: 'old-repo', task });
  assert.equal(readScheduleDrag(value, 'new-repo'), null);
  assert.equal(readScheduleDrag('{broken', 'old-repo'), null);
  assert.equal(readScheduleDrag(JSON.stringify({ scope: 'old-repo', task: { id: 'same' } }), 'old-repo'), null);
  const captured = readScheduleDrag(value, 'old-repo');
  assert.equal(scheduleCommand(captured, '2026-03-12').expectedVersion, 7);
});
test('milestones preserve literal names and group only valid dates for accessible project scope', () => {
  const projects = [
    {
      id: 'p',
      name: '<project>',
      legacyMetadata: {
        milestones: [
          { name: '<literal>', date: '2026-01-01' },
          { name: 'other', date: '2026-01-01' },
          { name: 'invalid', date: 'bad' },
        ],
      },
    },
  ];
  assert.equal(milestones(projects)[0].items.length, 2);
  assert.equal(milestones(projects)[0].items[0].name, '<literal>');
});

test('captured schedule command rejects a later local version without changing duration or metadata', async () => {
  const { seed } = await import('../src/data/seed.js');
  const { emptyWorkspace } = await import('../src/data/workspace.js');
  const { createLocalRepository } = await import('../src/workspace/local.js');
  const { createLocalWorkspaceRepository } = await import('../src/workspace/local-panel-repository.ts');
  const values = new Map(),
    storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const persistence = createLocalRepository({ storage, seed, blank: emptyWorkspace });
  const discovery = createLocalWorkspaceRepository({ storage, persistence, workspaceId: null });
  const repo = createLocalWorkspaceRepository({ storage, persistence, workspaceId: (await discovery.workspaces())[0].id });
  const before = (await repo.list('list_tasks')).find(t => t.dueDate && t.startDate);
  const captured = scheduleCommand(before, '2026-12-20');
  await repo.command('update_task', { input: { id: before.id, title: 'Another writer' }, expectedVersion: before.version, idempotencyKey: 'writer' });
  await assert.rejects(repo.command(captured.operation, { input: captured.input, expectedVersion: captured.expectedVersion, idempotencyKey: 'drag' }), {
    code: 'version_conflict',
  });
  const after = (await repo.list('list_tasks')).find(t => t.id === before.id);
  assert.equal(after.startDate, before.startDate);
  assert.equal(after.dueDate, before.dueDate);
  assert.equal(after.title, 'Another writer');
  repo.dispose();
  await assert.rejects(repo.command(captured.operation, { input: captured.input, expectedVersion: captured.expectedVersion, idempotencyKey: 'drag' }), {
    name: 'AbortError',
  });
});
