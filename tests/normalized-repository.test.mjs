import test from 'node:test';
import assert from 'node:assert/strict';
import { NormalizedRepository, RepositoryError } from '../src/workspace/normalized.ts';
function client(handler) {
  return {
    rpc(name, args) {
      return {
        abortSignal(signal) {
          return handler(name, args, signal);
        },
      };
    },
  };
}
test('normalized repository follows cursor pages, caches queries and isolates identities', async () => {
  const calls = [];
  const transport = client(async (name, args) => {
    calls.push(args);
    return {
      data: args.p_query.cursor
        ? { items: [{ id: 'last' }], nextCursor: null }
        : { items: Array.from({ length: 100 }, (_, i) => ({ id: String(i) })), nextCursor: 'page2' },
      error: null,
    };
  });
  const first = new NormalizedRepository(transport, 'user-a', 'workspace-a');
  assert.equal((await first.list('list_tasks')).length, 101);
  assert.equal(calls.length, 2);
  await first.list('list_tasks');
  assert.equal(calls.length, 2);
  const second = new NormalizedRepository(transport, 'user-b', 'workspace-a');
  await second.list('list_tasks');
  assert.equal(calls.length, 4);
  assert.equal(calls[1].p_query.cursor, 'page2');
  assert.equal(calls[0].p_query.limit, 100);
});
test('disposed requests cannot hydrate a reactivated session repository', async () => {
  let release;
  let number = 0;
  const old = new Promise(resolve => {
    release = resolve;
  });
  const repo = new NormalizedRepository(
    client(async () => (++number === 1 ? old : { data: { data: { id: 'current' } }, error: null })),
    'user',
    'workspace',
  );
  const pending = repo.query('get_task', { id: 'task' });
  repo.dispose();
  repo.activate();
  release({ data: { data: { id: 'previous' } }, error: null });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal((await repo.query('get_task', { id: 'task' })).data.id, 'current');
});
test('archived preferences never become personal preferences and shared rows remain intact', async () => {
  const shared = Object.freeze({ legacyMetadata: { favorites: ['legacy-secret-task'] } });
  const repo = new NormalizedRepository(
    client(async () => ({ data: { data: null, legacyMetadata: shared.legacyMetadata }, error: null })),
    'current-user',
    'workspace',
  );
  assert.deepEqual(await repo.preferences(), { favoriteProjectIds: [], favoriteTaskIds: [], notificationReadStates: {} });
  assert.deepEqual(shared.legacyMetadata.favorites, ['legacy-secret-task']);
});
test('safe repository exposes CAS failures without backend details and forbids executor credentials', async () => {
  const repo = new NormalizedRepository(
    client(async () => ({ data: null, error: { code: 'PT409', message: 'version_conflict', details: 'private sql' } })),
    'user',
    'workspace',
  );
  await assert.rejects(
    repo.command('update_task', { input: { id: 't', title: 'draft' }, expectedVersion: 3, idempotencyKey: 'retry' }),
    err => err instanceof RepositoryError && err.code === 'version_conflict' && !err.message.includes('sql'),
  );
  await assert.rejects(repo.command('claim_task', { input: { id: 't' }, expectedVersion: 3, idempotencyKey: 'retry' }), { code: 'forbidden' });
});
