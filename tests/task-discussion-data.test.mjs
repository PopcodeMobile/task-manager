import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTaskDiscussion } from '../src/app/tasks/task-discussion-data.ts';
const graph = {
  comments: [
    { id: 'c1', taskId: 't1', body: 'first' },
    { id: 'c2', taskId: 't2', body: 'other' },
  ],
  reactions: [
    { commentId: 'c1', reaction: 'thumbs' },
    { commentId: 'c2', reaction: 'heart' },
  ],
  activity: [
    { id: 'a1', taskId: 't1' },
    { id: 'a2', taskId: 't2' },
  ],
};
test('complete workspace discussion avoids duplicate reads and retains exact task scope', async () => {
  const repo = {
    list() {
      assert.fail('complete snapshot must not query again');
    },
  };
  assert.deepEqual(await loadTaskDiscussion(repo, 't1', graph), {
    comments: [graph.comments[0]],
    reactions: [graph.reactions[0]],
    history: [graph.activity[0]],
  });
  assert.deepEqual(await loadTaskDiscussion(repo, 't1', { comments: [], reactions: [], activity: [] }), { comments: [], reactions: [], history: [] });
  const updated = {
    ...graph,
    comments: [...graph.comments, { id: 'c3', taskId: 't1', body: 'polled' }],
    activity: [...graph.activity, { id: 'a3', taskId: 't1' }],
  };
  assert.equal((await loadTaskDiscussion(repo, 't1', updated)).comments.at(-1).body, 'polled');
  assert.equal((await loadTaskDiscussion(repo, 't1', updated)).history.at(-1).id, 'a3');
});
test('partial collections retain cursor-exhausting fallback and explicit retry reads fresh authoritative data', async () => {
  const calls = [];
  let fail = false;
  const repo = {
    async list(operation, query, all) {
      calls.push({ operation, query, all });
      if (fail) throw new Error('offline');
      return operation === 'list_comments'
        ? [{ id: 'fresh', taskId: 't1', body: 'fresh' }]
        : operation === 'list_reactions'
          ? [{ commentId: 'fresh', reaction: 'new' }]
          : [{ id: 'fresh-history', taskId: 't1' }];
    },
  };
  await loadTaskDiscussion(repo, 't1', { comments: [], activity: [] });
  assert.deepEqual(calls, [{ operation: 'list_reactions', query: {}, all: true }]);
  calls.length = 0;
  fail = true;
  await assert.rejects(loadTaskDiscussion(repo, 't1', graph, true), /offline/);
  fail = false;
  const result = await loadTaskDiscussion(repo, 't1', graph, true);
  assert.equal(result.comments[0].body, 'fresh');
  assert.equal(result.reactions[0].reaction, 'new');
  assert.equal(result.history[0].id, 'fresh-history');
  assert.ok(calls.every(call => call.all));
  assert.deepEqual(
    calls.slice(-3).map(call => call.query),
    [{ taskId: 't1' }, {}, { taskId: 't1' }],
  );
});
