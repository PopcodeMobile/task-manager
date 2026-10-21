import test from 'node:test';
import assert from 'node:assert/strict';

const modules = await Promise.allSettled([import('../src/workspace/local.js'), import('./fixtures/legacy-workspace-controller.js')]);
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
const blank = ({ id = 'w1', name = 'Workspace' } = {}) => ({
  ws: { id, name },
  me: 'm1',
  members: [{ id: 'm1', role: 'Owner' }],
  tasks: [],
  projects: [],
  comments: [],
  files: [],
  events: [],
  activity: [],
  notifs: [],
  teams: [],
  projOrder: [],
  savedViews: [],
});
const local = () => {
  assert.equal(modules[0].status, 'fulfilled', 'local persistence module must exist');
  return modules[0].value;
};
const controller = () => {
  assert.equal(modules[1].status, 'fulfilled', 'workspace controller module must exist');
  return modules[1].value;
};

test('legacy data migrates only to first workspace; other workspaces start empty', async () => {
  const s = storage();
  const old = blank();
  old.tasks.push({ id: 'task-a', title: 'User content' });
  old.workspaces = [
    { id: 'w1', name: 'One' },
    { id: 'w2', name: 'Two' },
  ];
  s.setItem('gr8r.v2', JSON.stringify({ data: old, prefs: { lang: 'English (US)' } }));
  const repo = local().createLocalRepository({ storage: s, seed: blank, blank });
  const list = await repo.list();
  assert.equal(list.length, 2);
  assert.equal((await repo.load('w1')).data.tasks[0].title, 'User content');
  assert.deepEqual((await repo.load('w2')).data.tasks, []);
  const fresh = await repo.create({ name: 'New' });
  assert.deepEqual(fresh.data.tasks, []);
});

test('local revision conflict preserves the winning tab data', async () => {
  const s = storage();
  const repo = local().createLocalRepository({ storage: s, seed: blank, blank });
  const [{ id }] = await repo.list();
  const first = await repo.load(id);
  await repo.save(id, { ...first.data, tasks: [{ id: 'winner' }] }, first.revision);
  await assert.rejects(repo.save(id, { ...first.data, tasks: [{ id: 'loser' }] }, first.revision), { code: 'conflict' });
  assert.equal((await repo.load(id)).data.tasks[0].id, 'winner');
});

test('pending save flushes original tenant before switching and stale scopes are refused', async () => {
  const repo = local().createLocalRepository({ storage: storage(), seed: blank, blank });
  const first = (await repo.list())[0];
  const second = await repo.create({ name: 'Second' });
  const c = controller().createWorkspaceController({ repository: repo, delay: 10000 });
  await c.switch(first.id);
  const scope = c.scope();
  c.save({ ...c.current.data, tasks: [{ id: 'first-only' }] });
  await c.switch(second.id);
  assert.equal((await repo.load(first.id)).data.tasks[0].id, 'first-only');
  assert.deepEqual(c.current.data.tasks, []);
  assert.equal(c.isCurrent(scope), false);
  assert.throws(() => c.save({ ...c.current.data, tasks: [{ id: 'leak' }] }, scope), { code: 'stale_scope' });
});

test('failed persistence blocks switch and retains unsaved data for retry', async () => {
  const s = storage();
  const repo = local().createLocalRepository({ storage: s, seed: blank, blank });
  const first = (await repo.list())[0];
  const second = await repo.create({ name: 'Second' });
  const c = controller().createWorkspaceController({ repository: repo, delay: 10000 });
  await c.switch(first.id);
  const write = s.setItem;
  s.setItem = () => {
    throw new Error('quota');
  };
  c.save({ ...c.current.data, tasks: [{ id: 'not-lost' }] });
  await assert.rejects(c.switch(second.id), { code: 'storage' });
  assert.equal(c.current.id, first.id);
  assert.equal(c.status.status, 'error');
  s.setItem = write;
  await c.flush();
  assert.equal((await repo.load(first.id)).data.tasks[0].id, 'not-lost');
});

test('clearing identity during an in-flight save cannot restore old state', async () => {
  let release;
  const real = local().createLocalRepository({ storage: storage(), seed: blank, blank });
  const repo = {
    ...real,
    save: (...args) =>
      new Promise(resolve => {
        release = () => resolve(real.save(...args));
      }),
  };
  const c = controller().createWorkspaceController({ repository: repo, delay: 10000 });
  await c.switch((await repo.list())[0].id);
  c.save({ ...c.current.data, tasks: [{ id: 'old-user' }] });
  const pending = c.flush();
  c.clear();
  release();
  await pending;
  assert.equal(c.current, null);
  assert.equal(c.dirty, false);
  assert.equal(c.status.status, 'idle');
});

test('explicit cloud configuration rejects partial config and privileged keys', async () => {
  const { workspaceConfig } = await import('./fixtures/legacy-workspace-config.js');
  assert.deepEqual(workspaceConfig({}), { mode: 'local' });
  assert.throws(() => workspaceConfig({ VITE_DATA_MODE: 'supabase', VITE_SUPABASE_URL: 'https://test.supabase.co' }), { code: 'configuration' });
  assert.throws(
    () => workspaceConfig({ VITE_DATA_MODE: 'supabase', VITE_SUPABASE_URL: 'https://test.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_secret_forbidden' }),
    { code: 'configuration' },
  );
  assert.equal(
    workspaceConfig({ VITE_DATA_MODE: 'supabase', VITE_SUPABASE_URL: 'https://test.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_publishable_example' }).mode,
    'supabase',
  );
});

test('scope from a previous signed-in controller never matches a new session', async () => {
  const repo = local().createLocalRepository({ storage: storage(), seed: blank, blank });
  const id = (await repo.list())[0].id;
  const first = controller().createWorkspaceController({ repository: repo });
  await first.switch(id);
  const captured = first.scope();
  first.clear();
  const second = controller().createWorkspaceController({ repository: repo });
  await second.switch(id);
  assert.equal(second.isCurrent(captured), false);
});

test('local save reaches storage before the next navigation event without debounce', async () => {
  const repo = local().createLocalRepository({ storage: storage(), seed: blank, blank });
  const id = (await repo.list())[0].id;
  const c = controller().createWorkspaceController({ repository: repo, delay: 10000 });
  await c.switch(id);
  c.save({ ...c.current.data, tasks: [{ id: 'reload-survives' }] });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal((await repo.load(id)).data.tasks[0]?.id, 'reload-survives');
  c.clear();
});

test('edits made while another workspace loads are flushed to the original tenant', async () => {
  const real = local().createLocalRepository({ storage: storage(), seed: blank, blank });
  const first = (await real.list())[0];
  const second = await real.create({ name: 'Second' });
  let release;
  const repo = {
    ...real,
    mode: 'supabase',
    load: id =>
      id === second.id
        ? new Promise(resolve => {
            release = async () => resolve(await real.load(id));
          })
        : real.load(id),
  };
  const c = controller().createWorkspaceController({ repository: repo, delay: 10000 });
  await c.switch(first.id);
  const switching = c.switch(second.id);
  await new Promise(resolve => setTimeout(resolve, 0));
  c.save({ ...c.current.data, tasks: [{ id: 'late-edit' }] });
  await release();
  await switching;
  assert.equal((await real.load(first.id)).data.tasks[0]?.id, 'late-edit');
  assert.deepEqual(c.current.data.tasks, []);
});

test('logout while a workspace loads cannot rehydrate its private data', async () => {
  const real = local().createLocalRepository({ storage: storage(), seed: blank, blank });
  const id = (await real.list())[0].id;
  let release;
  const repo = {
    ...real,
    load: () =>
      new Promise(resolve => {
        release = async () => resolve(await real.load(id));
      }),
  };
  const c = controller().createWorkspaceController({ repository: repo });
  const switching = c.switch(id);
  await new Promise(resolve => setTimeout(resolve, 0));
  c.clear();
  await release();
  await assert.rejects(switching, { code: 'stale_scope' });
  assert.equal(c.current, null);
});

test('delayed reload cannot resurrect workspace data after logout', async () => {
  const real = local().createLocalRepository({ storage: storage(), seed: blank, blank });
  const id = (await real.list())[0].id;
  let delay = false,
    release;
  const repo = {
    ...real,
    load: target =>
      delay
        ? new Promise(resolve => {
            release = async () => resolve(await real.load(target));
          })
        : real.load(target),
  };
  const c = controller().createWorkspaceController({ repository: repo });
  await c.switch(id);
  delay = true;
  const reload = c.reload();
  await new Promise(resolve => setTimeout(resolve, 0));
  c.clear();
  await release();
  await assert.rejects(reload, { code: 'stale_scope' });
  assert.equal(c.current, null);
});

test('workspace normalization rejects executable structural fields while retaining user text', async () => {
  const { normalizeWorkspace } = await import('../src/data/workspace.js');
  const cases = [
    { tasks: [{ id: 'x" onclick="alert(1)' }] },
    { teams: [{ id: 'team', c: 'red;position:fixed;inset:0' }] },
    { projects: [{ id: 'project', status: '<img src=x onerror=alert(1)>' }] },
    { tasks: [{ id: 'task', subtasks: [{ id: 'x"><svg/onload=alert(1)>' }] }] },
    { comments: [{ id: 'comment', re: { '"><img src=x onerror=alert(1)>': ['m1'] } }] },
    { files: [{ id: 'file', size: '<img src=x onerror=alert(1)>' }] },
  ];
  for (const patch of cases) assert.throws(() => normalizeWorkspace({ ...blank(), ...patch }, { id: 'w1' }), { code: 'invalid' });
  assert.equal(normalizeWorkspace({ ...blank(), tasks: [{ id: 'task', title: '<Draft> & revisão' }] }, { id: 'w1' }).tasks[0].title, '<Draft> & revisão');
});

test('auth locale survives identity changes without leaking profile data; saved identity preferences take precedence', async () => {
  const { loadAppearance, saveAppearance } = await import('../src/workspace/device-preferences.js');
  const s = storage();
  saveAppearance(s, 'first-user', { lang: 'en', name: 'Private profile' });
  assert.equal(loadAppearance(s, 'anonymous').lang, 'en');
  assert.equal(loadAppearance(s, 'anonymous').name, undefined);
  assert.deepEqual(JSON.parse(s.getItem('gr8r.auth.preferences')), { lang: 'en' });
  saveAppearance(s, 'second-user', { lang: 'pt-BR' });
  assert.equal(loadAppearance(s, 'first-user').lang, 'en');
  assert.equal(loadAppearance(s, 'second-user').lang, 'pt-BR');
  assert.equal(loadAppearance(s, 'second-user').name, undefined);
});

test('workspace slug generation handles Portuguese names and keeps migrated URLs intact', async () => {
  const { emptyWorkspace } = await import('../src/data/workspace.js');
  const repo = local().createLocalRepository({ storage: storage(), seed: blank, blank: emptyWorkspace });
  const accented = await repo.create({ name: 'Árvore e Ação' });
  const punctuation = await repo.create({ name: '***' });
  assert.equal(accented.data.ws.url, 'arvore-e-acao');
  assert.equal(punctuation.data.ws.url, 'workspace');
  const s = storage();
  s.setItem('gr8r.v2', JSON.stringify({ data: { ...blank(), ws: { id: 'w1', name: 'Legacy', url: 'my.existing-url' } } }));
  const migrated = local().createLocalRepository({ storage: s, seed: blank, blank: emptyWorkspace });
  assert.equal((await migrated.load('w1')).data.ws.url, 'my.existing-url');
});
