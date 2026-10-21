import assert from 'node:assert/strict';
import { validateCommand } from '../_shared/validation.ts';
Deno.test('strict shared duplicate command permits only source/new ID/name and requires source CAS, including batch', () => {
  const envelope = { workspaceId: crypto.randomUUID(), idempotencyKey: 'dup', expectedVersion: 1, input: { id: 'source', newId: 'copy', name: 'New' } };
  assert.deepEqual(validateCommand('duplicate_file', envelope), envelope);
  validateCommand('batch', { ...envelope, input: { commands: [{ operation: 'duplicate_file', input: { id: 'source' }, expectedVersion: 1 }] } });
  for (const input of [
    {},
    { id: 'source', by: 'spoof' },
    { id: 'source', createdAt: 'spoof' },
    { id: 'source', metadata: {} },
    { id: 'source', projectId: 'p' },
    { id: 'source', newId: null },
    { id: 'source', newId: '' },
    { id: 'source', newId: 1 },
    { id: 'source', name: ' ' },
  ])
    assert.throws(() => validateCommand('duplicate_file', { ...envelope, input }), { code: 'validation_error' });
  assert.throws(() => validateCommand('duplicate_file', { ...envelope, expectedVersion: undefined }), { code: 'validation_error' });
});
