import { clone, WorkspaceError } from './errors.js';
import { workspaceSlug } from './metadata.js';

const KEY = 'gr8r.workspaces.v1';
export function createLocalRepository({ storage, seed, blank, lock = globalThis.navigator?.locks }) {
  const guarded = fn => (lock ? lock.request(KEY, async () => fn()) : Promise.resolve().then(fn));
  const readJSON = key => {
    try {
      const raw = storage.getItem(key);
      if (raw === null) return null;
      const value = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WorkspaceError('corrupt');
      return value;
    } catch {
      throw new WorkspaceError('corrupt');
    }
  };
  const write = value => {
    try {
      storage.setItem(KEY, JSON.stringify(value));
    } catch {
      throw new WorkspaceError('storage');
    }
  };
  function read() {
    const current = readJSON(KEY);
    if (current) {
      if (current.version !== 1 || !Array.isArray(current.order) || !current.records) throw new WorkspaceError('corrupt');
      for (const id of current.order) {
        const record = current.records[id];
        if (
          !record ||
          record.id !== id ||
          record.data?.ws?.id !== id ||
          !Array.isArray(record.data?.tasks) ||
          !Array.isArray(record.data?.projects) ||
          !Number.isSafeInteger(record.revision) ||
          record.revision < 0
        )
          throw new WorkspaceError('corrupt');
      }
      return current;
    }
    const legacy = readJSON('gr8r.v2');
    const data = legacy?.data || seed();
    if (!Array.isArray(data.tasks) || !Array.isArray(data.projects)) throw new WorkspaceError('corrupt');
    const workspaces = data.workspaces?.length ? data.workspaces : [{ id: data.ws?.id || 'w1', name: data.ws?.name || 'Meu espaço' }];
    const state = { version: 1, order: [], records: {}, legacyPrefs: legacy?.prefs || {}, legacyViews: legacy?.views || {}, collapsed: !!legacy?.collapsed };
    workspaces.forEach((workspace, i) => {
      const id = workspace.id || crypto.randomUUID();
      const ws = { ...workspace, id, url: i === 0 ? data.ws?.url : workspace.url, c: workspace.c || '#5A67D8', plan: workspace.plan || 'Free' };
      const content =
        i === 0
          ? clone(data)
          : blank(
              ws,
              data.members?.find(member => member.id === data.me),
            );
      content.ws = { ...content.ws, ...ws };
      delete content.workspaces;
      state.order.push(id);
      state.records[id] = { id, data: content, revision: 0 };
    });
    write(state);
    return state;
  }
  return {
    mode: 'local',
    /** @returns {Promise<import('./local-panel-types').LocalWorkspaceRecord[]>} */
    async list() {
      return guarded(() => {
        const state = read();
        return state.order.map(id => ({ ...state.records[id].data.ws, role: 'owner' }));
      });
    },
    async legacyPreferences() {
      return guarded(() => {
        const state = read();
        return { prefs: state.legacyPrefs, views: state.legacyViews, collapsed: state.collapsed };
      });
    },
    async load(id) {
      return guarded(() => {
        const record = read().records[id];
        if (!record) throw new WorkspaceError('not_found');
        return { ...clone(record), membership: { role: 'owner', userId: record.data.me } };
      });
    },
    async loadPanel(id) {
      return guarded(() => {
        const state = read();
        const record = state.records[id];
        if (!record) throw new WorkspaceError('not_found');
        return { ...clone(record), reactPanel: clone(state.reactPanels?.[id] ?? null) };
      });
    },
    async save(id, data, revision) {
      return guarded(() => {
        const state = read();
        const previous = state.records[id];
        if (!previous) throw new WorkspaceError('not_found');
        if (previous.revision !== revision) throw new WorkspaceError('conflict');
        if (data.ws?.id !== id) throw new WorkspaceError('stale_scope');
        const content = clone(data);
        delete content.workspaces;
        state.records[id] = { ...previous, id, data: content, revision: revision + 1 };
        write(state);
        return revision + 1;
      });
    },
    // The callback is synchronous and the whole read/change/write runs under the
    // same browser lock as the legacy writer. Throwing leaves storage untouched.
    /** @template T
     * @param {string | null} id
     * @param {(data: any, revision: number, record: any) => {changed: boolean, value: T}} change
     * @returns {Promise<T>}
     */
    async transact(id, change) {
      return guarded(() => {
        const state = read();
        const record = state.records[id];
        if (!record) throw new WorkspaceError('not_found');
        const context = { ...record, reactPanel: clone(state.reactPanels?.[id] ?? null) };
        const result = change(record.data, record.revision, context);
        if (result.changed) {
          if (context.reactPanel) (state.reactPanels ??= {})[id] = context.reactPanel;
          record.revision++;
          write(state);
        }
        return clone(result.value);
      });
    },
    async create({ name, url, idempotencyKey }) {
      if (!name?.trim()) throw new WorkspaceError('invalid');
      return guarded(() => {
        const state = read();
        const signature = JSON.stringify([name.trim(), url]);
        const prior = idempotencyKey && state.creationRequests?.[idempotencyKey];
        if (prior) {
          if (prior.signature !== signature) throw new WorkspaceError('conflict');
          return { ...clone(prior.record), membership: { role: 'owner', userId: prior.record.data.me } };
        }
        const id = crypto.randomUUID();
        const source = state.records[state.order[0]].data;
        const data = blank(
          { id, name: name.trim(), url: workspaceSlug(url || name), c: '#5A67D8', plan: 'Free' },
          source.members?.find(member => member.id === source.me),
        );
        data.ws.id = id;
        const record = { id, data, revision: 0 };
        state.records[id] = record;
        state.order.push(id);
        if (idempotencyKey) (state.creationRequests ??= {})[idempotencyKey] = { signature, record: clone(record) };
        write(state);
        return { ...clone(record), membership: { role: 'owner', userId: data.me } };
      });
    },
  };
}
