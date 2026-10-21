import assert from 'node:assert/strict';
import { validateCommand } from '../_shared/validation.ts';
const userId = 'abcdef00-0000-0000-0000-000000000001';
Deno.test('team baseline shared validation accepts exact sets, enforces shape and preserves bounded batch', () => {
  const envelope = {
    workspaceId: userId,
    idempotencyKey: 'guard',
    expectedVersion: 1,
    input: { id: 'a', expectedMemberships: [{ userId, teamIds: ['β/team', '1', '😀'] }] },
  };
  assert.deepEqual(validateCommand('update_team', envelope), envelope);
  validateCommand('create_team', { ...envelope, input: { name: 'A', expectedMemberships: [] } });
  for (
    const expectedMemberships of [
      null,
      {},
      [null],
      Array(1),
      [{}],
      [{ userId }],
      [{ userId, teamIds: [], extra: true }],
      [{ userId: 'historical', teamIds: [] }],
      [{ userId, teamIds: Array(1) }],
      [{ userId, teamIds: ['a', 'a'] }],
      [{ userId, teamIds: [] }, { userId: userId.toUpperCase(), teamIds: [] }],
      ...[1, null, '', '\u00a0', 'x'.repeat(129), '\u0000', '\ud800', '😀'.repeat(65)].map(
        (id) => [{ userId, teamIds: [id] }],
      ),
    ]
  ) {
    assert.throws(() => validateCommand('update_team', { ...envelope, input: { id: 'a', expectedMemberships } }), {
      code: 'validation_error',
    });
  }
  assert.throws(
    () => validateCommand('set_team_member', { ...envelope, input: { id: 'a', userId, expectedMemberships: [] } }),
    { code: 'validation_error' },
  );
  const child = { operation: 'update_team', input: envelope.input, expectedVersion: 1 };
  validateCommand('batch', { ...envelope, input: { commands: Array(100).fill(child) } });
  assert.throws(() => validateCommand('batch', { ...envelope, input: { commands: Array(101).fill(child) } }), {
    code: 'validation_error',
  });
});
