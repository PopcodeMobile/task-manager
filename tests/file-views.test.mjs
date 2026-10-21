import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteFileCommands, fileTypeForName, filterFiles } from '../src/app/files/file-view-model.ts';
const file = { id: 'f', version: 9, name: '<literal>.pdf', fileType: 'pdf', projectId: 'p', createdAt: '2026-01-01T00:00:00Z' };
const task = id => ({ id, version: 5 });
test('explicit file deletion atomically unlinks every surviving consumer using parent CAS', () => {
  assert.deepEqual(
    deleteFileCommands(
      file,
      [
        { taskId: 'a', fileId: 'f' },
        { taskId: 'b', fileId: 'f' },
      ],
      [task('a'), task('b')],
    ),
    [
      { operation: 'remove_task_attachment', input: { id: 'a', fileId: 'f' }, expectedVersion: 5 },
      { operation: 'remove_task_attachment', input: { id: 'b', fileId: 'f' }, expectedVersion: 5 },
      { operation: 'delete_file', input: { id: 'f' }, expectedVersion: 9 },
    ],
  );
  assert.throws(() => deleteFileCommands(file, [{ taskId: 'absent', fileId: 'f' }], []), { code: 'version_conflict' });
  assert.throws(() => deleteFileCommands(file, [{ taskId: 'a', fileId: 'f' }], [{ ...task('a'), reservation: { active: true, expiresAt: '2099-01-01' } }]), {
    code: 'already_claimed',
  });
  const tasks = Array.from({ length: 100 }, (_, i) => task(String(i)));
  assert.throws(
    () =>
      deleteFileCommands(
        file,
        tasks.map(t => ({ taskId: t.id, fileId: 'f' })),
        tasks,
      ),
    { code: 'batch_limit' },
  );
});
test('file filtering keeps literal metadata, project scope and historical dates honest', () => {
  const rows = [file, { ...file, id: 'b', createdAt: '', projectId: 'other' }, { ...file, id: 'c', name: 'new.pdf', createdAt: '2026-10-01T00:00:00Z' }];
  assert.deepEqual(
    filterFiles(rows, { q: '', type: 'all', sort: 'date' }, 'p').map(f => f.id),
    ['c', 'f'],
  );
  assert.equal(filterFiles(rows, { q: '<literal>', type: 'pdf', sort: 'name' }).length, 2);
  assert.equal(fileTypeForName('renamed.ZIP'), 'zip');
  assert.equal(fileTypeForName('README'), 'other');
  assert.equal(rows[0].name, '<literal>.pdf');
});
