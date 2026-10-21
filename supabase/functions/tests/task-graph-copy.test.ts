import assert from 'node:assert/strict';
import { validateCommand } from '../_shared/validation.ts';
import { acceptedFileIds, rejectedFileIds, unrepresentableFileIds } from '../../../tests/fixtures/file-duplication-ids.js';
Deno.test('task graph command is strict, versioned, bounded, exact-ID and batch eligible', () => {
  const envelope = {
    workspaceId: '00000000-0000-0000-0000-000000000001',
    idempotencyKey: 'copy',
    expectedVersion: 1,
    input: { id: 'source', projectId: 'destination', mode: 'task' },
  };
  assert.deepEqual(validateCommand('duplicate_task_graph', envelope), envelope);
  for (const mode of ['task', 'project']) validateCommand('duplicate_task_graph', { ...envelope, input: { ...envelope.input, mode } });
  for (const field of ['id', 'projectId']) {
    for (const value of acceptedFileIds)
      assert.equal(validateCommand('duplicate_task_graph', { ...envelope, input: { ...envelope.input, [field]: value } }).input[field], value);
    for (const value of [...rejectedFileIds, ...unrepresentableFileIds])
      assert.throws(() => validateCommand('duplicate_task_graph', { ...envelope, input: { ...envelope.input, [field]: value } }), { code: 'validation_error' });
  }
  for (const extra of [{ mode: 'other' }, { mode: null }, { title: '' }, { claimToken: 'invalid' }, { metadata: {} }, { newId: 'new' }, { status: 'done' }])
    assert.throws(() => validateCommand('duplicate_task_graph', { ...envelope, input: { ...envelope.input, ...extra } }), { code: 'validation_error' });
  assert.throws(() => validateCommand('duplicate_task_graph', { ...envelope, expectedVersion: undefined }), { code: 'validation_error' });
  const child = { operation: 'duplicate_task_graph', input: envelope.input, expectedVersion: 1 };
  validateCommand('batch', { ...envelope, input: { commands: Array(100).fill(child) } });
  assert.throws(() => validateCommand('batch', { ...envelope, input: { commands: Array(101).fill(child) } }), { code: 'validation_error' });
});
