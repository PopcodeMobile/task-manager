import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

async function inspector() {
  assert.ok(existsSync(new URL('../src/domain/legacy-map.ts', import.meta.url)), 'legacy inspector must exist');
  return (await import('../src/domain/legacy-map.ts')).inspectLegacyWorkspace;
}
test('legacy inspection inventories nested records without silently dropping unknown fields', async () => {
  const inspect = await inspector();
  const result = inspect({
    projects: [{ id: 'p1', name: 'Project', future: 1 }],
    tasks: [
      {
        id: 't1',
        project: 'p1',
        title: 'Task',
        status: 'todo',
        priority: 'high',
        subtasks: [{ id: 's1', title: 'Sub' }],
        attachments: [{ id: 'f1', name: 'File' }],
        labels: ['design'],
      },
    ],
    comments: [{ id: 'c1', task: 't1' }],
    mystery: true,
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.counts, {
    projects: 1,
    tasks: 1,
    comments: 1,
    files: 0,
    events: 0,
    teams: 0,
    savedViews: 0,
    activity: 0,
    notifs: 0,
    subtasks: 1,
    attachments: 1,
  });
  assert.deepEqual(result.unmappedFields.sort(), ['mystery', 'projects[0].future']);
});
test('legacy inspection reports duplicate identities, orphan relations and invalid enums', async () => {
  const inspect = await inspector();
  const result = inspect({
    projects: [{ id: 'p1' }, { id: 'p1' }],
    tasks: [{ id: 't1', project: 'missing', deps: ['missing-task'], status: 'blocked', priority: 'critical' }],
    savedViews: [{ id: 'v1', project: 'missing' }],
  });
  assert.equal(result.valid, false);
  assert.deepEqual(result.duplicateIds, ['projects:p1']);
  assert.equal(result.orphans.length, 3);
  assert.ok(result.errors.includes('tasks[0].status'));
  assert.ok(result.errors.includes('tasks[0].priority'));
});
test('legacy inspection keeps fictitious people unresolved and rejects malformed nested containers', async () => {
  const inspect = await inspector();
  const result = inspect({ projects: [{ id: 'p1', lead: 'm1' }], tasks: [{ id: 't1', project: 'p1', assignee: 'm2', deps: {} }] });
  assert.equal(result.valid, false);
  assert.deepEqual(result.unresolvedUsers.sort(), ['m1', 'm2']);
  assert.ok(result.errors.includes('tasks[0].deps'));
});
test('legacy inspection validates team mappings, nested relations, project states and reaction containers', async () => {
  const inspect = await inspector();
  const result = inspect({
    projects: [{ id: 'p1', status: 'blocked' }],
    tasks: [{ id: 't1', project: 'p1', subtasks: [{ id: 's1', custom: true }] }],
    memberTeams: { m1: 'missing' },
    comments: [{ id: 'c1', task: 't1', re: { '👍': 'm1' } }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('projects[0].status'));
  assert.ok(result.errors.includes('comments[0].re.👍'));
  assert.ok(result.orphans.includes('memberTeams.m1:missing'));
  assert.ok(result.unmappedFields.includes('tasks[0].subtasks[0].custom'));
});
