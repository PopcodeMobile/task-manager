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

Deno.test('duplicate IDs accept punctuation and preserve UTF-16/nonblank boundaries for source, target and batch', async () => {
  const { acceptedFileIds, rejectedFileIds, unrepresentableFileIds } = await import('../../../tests/fixtures/file-duplication-ids.js');
  const envelope = { workspaceId: crypto.randomUUID(), idempotencyKey: 'ids', expectedVersion: 1 };
  for (const field of ['id', 'newId']) {
    for (const value of acceptedFileIds) {
      const input = { id: 'source', [field]: value };
      assert.deepEqual(validateCommand('duplicate_file', { ...envelope, input }).input, input);
    }
    for (const value of [...rejectedFileIds, ...unrepresentableFileIds])
      assert.throws(() => validateCommand('duplicate_file', { ...envelope, input: { id: 'source', [field]: value } }), { code: 'validation_error' });
  }
  const child = { operation: 'duplicate_file', input: { id: '.source', newId: '/copy.v2' }, expectedVersion: 1 };
  validateCommand('batch', { ...envelope, input: { commands: [child] } });
  assert.throws(() => validateCommand('batch', { ...envelope, input: { commands: [child, { ...child, input: { id: '\t' } }] } }), { code: 'validation_error' });
});
