import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
function harness() {
  const slots = [],
    effects = [];
  let index = 0;
  const react = {
    useState(initial) {
      const i = index++;
      if (!(i in slots)) slots[i] = initial;
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
    useEffect(fn, deps) {
      const i = index++,
        old = slots[i];
      if (!old || deps.some((value, j) => value !== old.deps[j])) {
        old?.cleanup?.();
        slots[i] = { deps };
        effects.push(() => {
          slots[i].cleanup = fn();
        });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  function compile(file, imports = {}) {
    const source = ts.transpileModule(readFileSync(file, 'utf8'), {
      fileName: file,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const exports = {};
    new Function('require', 'exports', source)(
      name => (name === 'react' ? react : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx } : (imports[name] ?? {})),
      exports,
    );
    return exports;
  }
  const paging = compile('src/app/shell/usePagedCollection.ts');
  const { ContextHistory } = compile('src/app/activity/ContextHistory.tsx', {
    '../shell/usePagedCollection': paging,
    './ActivityPage': { ActivityPage: 'feed' },
    '../../components/ui/button': { Button: 'button' },
  });
  return props => {
    index = 0;
    const tree = ContextHistory(props);
    for (const effect of effects.splice(0)) effect();
    return tree;
  };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const event = (id, operation = 'update_task') => ({
  id,
  operation,
  entityId: 't',
  actorUserId: 'u',
  actorAgentId: null,
  createdAt: '2026-10-01T00:00:00Z',
  payload: { taskId: 't', projectId: 'p' },
});
test('residual contextual history pages actual sources, keeps pending context visible, and merges polled events without duplicate comment entries', async () => {
  const calls = [];
  let fail = false;
  const snapshot = {
    historyComplete: false,
    tasks: [{ id: 't', projectId: 'p' }],
    projects: [{ id: 'p' }],
    members: [],
    agents: [],
    events: [],
    comments: [],
    activity: [],
  };
  const repo = {
    mode: 'cloud',
    workspaceId: 'w',
    controller: new AbortController(),
    query: async (operation, q) => {
      calls.push({ operation, ...q });
      if (fail && operation === 'list_activity') throw Error('offline');
      if (operation === 'list_domain_events') return { items: [{ ...event('comment-event', 'add_task_comment'), entityId: 'comment-id' }], nextCursor: null };
      if (operation === 'list_comments')
        return { items: [{ id: 'comment-id', taskId: 't', authorUserId: 'u', createdAt: '2026-10-01T00:00:00Z' }], nextCursor: null };
      return q.cursor
        ? { items: [{ id: 'later', projectId: 'p', actorUserId: 'u', verb: 'Later match', createdAt: '2026-10-02T00:00:00Z' }], nextCursor: null }
        : { items: [{ id: 'other', projectId: 'other', actorUserId: 'other', verb: 'Other context', createdAt: '2026-10-01T00:00:00Z' }], nextCursor: 'next' };
    },
  };
  const render = harness();
  const props = { repo, snapshot, projectId: 'p', t: (_pt, en) => en, openTask() {} };
  let tree = render(props);
  assert.equal(nodes(tree).filter(n => n.type === 'feed').length, 0, 'unknown history must not render a final empty feed');
  await flush();
  tree = render(props);
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => call.limit === 100));
  assert.equal(nodes(tree).find(n => n.type === 'feed').props.events.length, 1, 'canonical comment and its event appear once');
  fail = true;
  nodes(tree)
    .find(n => n.type === 'button')
    .props.onClick();
  await flush();
  tree = render(props);
  assert.ok(nodes(tree).some(n => n.props.role === 'alert'));
  fail = false;
  nodes(tree)
    .find(n => n.type === 'button')
    .props.onClick();
  await flush();
  tree = render(props);
  assert.ok(
    nodes(tree)
      .find(n => n.type === 'feed')
      .props.events.some(e => e.operation === 'Later match'),
  );
  assert.equal(calls.at(-1).cursor, 'next');
  assert.equal(nodes(tree).filter(n => n.type === 'button').length, 0);
  snapshot.events = [event('polled')];
  tree = render(props);
  assert.ok(
    nodes(tree)
      .find(n => n.type === 'feed')
      .props.events.some(e => e.id === 'polled'),
  );
  await flush();
  tree = render({ ...props, actorId: 'missing' });
  assert.equal(nodes(tree).filter(n => n.type === 'feed').length, 0, 'no actor match on partial pages is not empty final history');
});
