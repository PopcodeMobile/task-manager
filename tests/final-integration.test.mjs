import test from 'node:test';
import assert from 'node:assert/strict';
import { NormalizedRepository } from '../src/workspace/normalized.ts';

test('fresh preferences preserve sequential changes from another repository', async () => {
  let preferences = { favoriteProjectIds: [], favoriteTaskIds: ['first'], notificationReadStates: {} };
  let calls = 0;
  const client = {
    rpc: () => ({
      abortSignal: async () => {
        calls++;
        return { data: { data: { userId: 'user', preferences: structuredClone(preferences) } }, error: null };
      },
    }),
  };
  const a = new NormalizedRepository(client, 'user', 'workspace');
  const b = new NormalizedRepository(client, 'user', 'workspace');
  await a.preferences();
  preferences = { ...(await b.preferences(true)), favoriteTaskIds: ['first', 'other'], notificationReadStates: { other: true } };
  const fresh = await a.preferences(true);
  assert.deepEqual(fresh.favoriteTaskIds, ['first', 'other']);
  assert.deepEqual(fresh.notificationReadStates, { other: true });
  assert.equal(calls, 3);
});
