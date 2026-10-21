import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { affectedCollections } from '../src/app/shell/refresh-dependencies.ts';
function harness(path, imports = {}, effectsEnabled = false) {
  const slots = [],
    layoutEffects = [],
    effects = [];
  let index = 0;
  function registerEffect(fn, deps, queue) {
    const i = index++;
    if (!effectsEnabled) return;
    const old = slots[i];
    if (!old || deps.some((v, j) => v !== old.deps[j])) {
      old?.cleanup?.();
      slots[i] = { deps };
      queue.push(() => {
        slots[i].cleanup = fn();
      });
    }
  }
  const react = {
    useState(initial) {
      const i = index++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [
        slots[i],
        value => {
          slots[i] = typeof value === 'function' ? value(slots[i]) : value;
        },
      ];
    },
    useRef(initial) {
      const i = index++;
      return (slots[i] ??= { current: initial });
    },
    useCallback(fn) {
      index++;
      return fn;
    },
    useEffect(fn, deps) {
      registerEffect(fn, deps, effects);
    },
    useLayoutEffect(fn, deps) {
      registerEffect(fn, deps, layoutEffects);
    },
  };
  const source = ts.transpileModule(readFileSync(path, 'utf8'), {
    fileName: path,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', source)(name => (name === 'react' ? react : (imports[name] ?? {})), exports);
  return {
    render(name, ...args) {
      index = 0;
      const result = exports[name](...args);
      for (const effect of layoutEffects.splice(0)) effect();
      for (const effect of effects.splice(0)) effect();
      return result;
    },
  };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
test('real workspace hook captures high-water before hydration without exhausting 24,001 history rows and refreshes cascades', async () => {
  const calls = [];
  let deleted = false;
  const repo = {
    mode: 'cloud',
    userId: 'user',
    workspaceId: 'workspace',
    controller: new AbortController(),
    activate() {},
    dispose() {},
    query: async op => {
      calls.push(op);
      assert.equal(op, 'get_event_cursor');
      return { data: { cursor: 'boundary-before-hydration' } };
    },
    list: async op => {
      calls.push(op);
      if (['list_domain_events', 'list_activity', 'list_comments', 'list_reactions'].includes(op)) throw Error('241-page history must not hydrate');
      return deleted ? [] : [{ id: op, version: 1 }];
    },
    rpc: async () => [],
    preferences: async () => ({ favoriteTaskIds: [], favoriteProjectIds: [], notificationReadStates: {} }),
  };
  const h = harness('src/app/shell/useWorkspaceData.ts', {
    '../../workspace/normalized': { eventCursor: e => e.id },
    './refresh-dependencies': { affectedCollections },
    './messages': { errorMessage: e => e.message },
  });
  let state = h.render('useWorkspaceData', repo, 'workspace', 'workspace', (_, en) => en);
  assert.equal(await state.refresh(true), true);
  assert.equal(calls[0], 'get_event_cursor');
  assert.ok(calls.length < 25);
  state = h.render('useWorkspaceData', repo, 'workspace', 'workspace', (_, en) => en);
  assert.equal(state.snapshot.historyComplete, false);
  for (const operation of ['delete_task', 'delete_project', 'intervene_task']) {
    deleted = false;
    await state.refresh(true);
    deleted = true;
    calls.length = 0;
    await state.refresh(false, [operation]);
    state = h.render('useWorkspaceData', repo, 'workspace', 'workspace', (_, en) => en);
    for (const family of [
      'tasks',
      'subtasks',
      'dependencies',
      'taskLabels',
      'files',
      'attachments',
      'calendarEvents',
      'notifications',
      'comments',
      'reactions',
    ])
      assert.deepEqual(state.snapshot[family], [], `${operation}: ${family}`);
    assert.ok(calls.includes('list_calendar_events'));
    assert.ok(calls.includes('list_notifications'));
  }
});
test('real paging hook consumes explicit retry then reuses complete graph; continuation failure retains cursor and retries', async () => {
  const calls = [];
  let fail = false;
  const repo = {
    workspaceId: 'w',
    controller: new AbortController(),
    query: async (op, q) => {
      calls.push(q);
      if (fail) throw Error('offline');
      return q.cursor ? { items: [{ id: 'later' }], nextCursor: null } : { items: [{ id: 'first' }], nextCursor: 'next' };
    },
  };
  const h = harness('src/app/shell/usePagedCollection.ts', {}, true);
  let page = h.render('usePagedCollection', repo, 'list_comments', {}, 1, [{ id: 'complete' }]);
  await flush();
  page = h.render('usePagedCollection', repo, 'list_comments', {}, 1, [{ id: 'complete' }]);
  assert.equal(calls.length, 0);
  page.retry();
  h.render('usePagedCollection', repo, 'list_comments', {}, 1, [{ id: 'complete' }]);
  await flush();
  assert.equal(calls.length, 1);
  page = h.render('usePagedCollection', repo, 'list_comments', {}, 2, [{ id: 'new-complete' }]);
  await flush();
  page = h.render('usePagedCollection', repo, 'list_comments', {}, 2, [{ id: 'new-complete' }]);
  assert.equal(calls.length, 1);
  assert.equal(page.items[0].id, 'new-complete');
  page = h.render('usePagedCollection', repo, 'list_comments', {}, 3);
  await flush();
  page = h.render('usePagedCollection', repo, 'list_comments', {}, 3);
  fail = true;
  await page.loadMore();
  page = h.render('usePagedCollection', repo, 'list_comments', {}, 3);
  assert.equal(page.items[0].id, 'first');
  assert.equal(page.more, true);
  fail = false;
  await page.loadMore();
  page = h.render('usePagedCollection', repo, 'list_comments', {}, 3);
  assert.deepEqual(
    page.items.map(x => x.id),
    ['first', 'later'],
  );
  assert.equal(page.complete, true);
  assert.equal(calls.at(-1).cursor, 'next');
});
test('event committed during mutable hydration is applied from pre-hydration boundary', async () => {
  const oldDocument = globalThis.document,
    oldSet = globalThis.setTimeout,
    oldClear = globalThis.clearTimeout;
  const timers = [];
  globalThis.document = { visibilityState: 'visible' };
  globalThis.setTimeout = fn => {
    timers.push(fn);
    return timers.length;
  };
  globalThis.clearTimeout = () => {};
  try {
    const history = Array.from({ length: 24001 }, (_, i) => ({ id: String(i), createdAt: '2026-01-01', operation: 'update_task', payload: { taskId: 't' } }));
    let hydration = 0;
    let reads = 0;
    const repo = {
      mode: 'cloud',
      workspaceId: 'w',
      userId: 'u',
      controller: new AbortController(),
      activate() {},
      dispose() {},
      preferences: async () => ({}),
      rpc: async () => [],
      query: async (op, q) => {
        reads++;
        if (op === 'get_event_cursor') return { data: { cursor: 'old-boundary' } };
        assert.equal(q.cursor, 'old-boundary');
        return { items: history.slice(24001), nextCursor: null };
      },
      list: async op => {
        if (op === 'list_tasks') {
          hydration++;
          if (hydration === 1) history.push({ id: 'new', createdAt: '2026-02-01', operation: 'update_task', payload: { taskId: 't' } });
          return [{ id: 't', title: hydration === 1 ? 'Old snapshot' : 'New event applied', version: hydration }];
        }
        return [];
      },
    };
    const h = harness(
      'src/app/shell/useWorkspaceData.ts',
      {
        '../../workspace/normalized': { eventCursor: e => e.id },
        './refresh-dependencies': { affectedCollections },
        './messages': { errorMessage: e => e.message },
      },
      true,
    );
    const t = (_, en) => en;
    h.render('useWorkspaceData', repo, 'w', 'w', t);
    await flush();
    h.render('useWorkspaceData', repo, 'w', 'w', t);
    await flush();
    await timers.shift()();
    await flush();
    const state = h.render('useWorkspaceData', repo, 'w', 'w', t);
    assert.equal(state.snapshot.tasks[0].title, 'New event applied');
    assert.equal(reads, 2);
    assert.equal(state.snapshot.events[0].id, 'new');
  } finally {
    globalThis.document = oldDocument;
    globalThis.setTimeout = oldSet;
    globalThis.clearTimeout = oldClear;
  }
});
test('actual preference callers read fresh before replacing favorite and notification collections', async () => {
  let server = { favoriteTaskIds: ['other-tab'], favoriteProjectIds: [], notificationReadStates: { 'other-tab': true } };
  const flags = [];
  const repo = {
    mode: 'cloud',
    userId: 'user',
    workspaceId: 'workspace',
    controller: new AbortController(),
    preferences: async fresh => {
      flags.push(fresh);
      return structuredClone(server);
    },
    command: async (_op, command) => {
      server = { ...server, ...command.input.preferences };
      return { data: server, eventId: 'event' };
    },
    query: async () => ({ items: [], nextCursor: null }),
    list: async () => [],
    rpc: async () => [],
  };
  const h = harness('src/app/shell/useWorkspaceData.ts', {
    '../../workspace/normalized': { eventCursor: e => e.id },
    './refresh-dependencies': { affectedCollections },
    './messages': { errorMessage: e => e.message },
  });
  const state = h.render('useWorkspaceData', repo, 'workspace', 'workspace', (_, en) => en);
  await state.toggleFavorite('mine');
  await state.markNotifications(['mine'], true);
  assert.deepEqual(server.favoriteTaskIds, ['other-tab', 'mine']);
  assert.deepEqual(server.notificationReadStates, { 'other-tab': true, mine: true });
  assert.ok(flags.every(Boolean));
});

test('failed refresh of a complete history exposes retry and replaces rather than duplicates first page', async () => {
  let fail = false;
  const repo = {
    workspaceId: 'w',
    controller: new AbortController(),
    query: async () => {
      if (fail) throw Error('offline');
      return { items: [{ id: 'only' }], nextCursor: null };
    },
  };
  const h = harness('src/app/shell/usePagedCollection.ts', {}, true);
  h.render('usePagedCollection', repo, 'list_activity', {}, 1);
  await flush();
  fail = true;
  h.render('usePagedCollection', repo, 'list_activity', {}, 2);
  await flush();
  let page = h.render('usePagedCollection', repo, 'list_activity', {}, 2);
  assert.equal(page.more, true);
  assert.equal(page.complete, false);
  fail = false;
  await page.loadMore();
  page = h.render('usePagedCollection', repo, 'list_activity', {}, 2);
  assert.deepEqual(page.items, [{ id: 'only' }]);
  assert.equal(page.complete, true);
});
