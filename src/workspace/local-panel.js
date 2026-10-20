import { RepositoryError } from './normalized.ts';
import { localDTO, localWorkspaceDTO, entityVersion } from './local-dto.js';
import { localCommandRules as commandRules } from './local-command-rules.js';
import { mutateTask } from './local-mutations/tasks.js';
import { mutateProject } from './local-mutations/projects.js';
import { mutateComment } from './local-mutations/comments.js';
import { mutateSubtask } from './local-mutations/subtasks.js';
import { mutateDependency } from './local-mutations/dependencies.js';
const fail = code => {
  throw new RepositoryError(code);
};
const collections = {
  task: 'tasks',
  project: 'projects',
  comment: 'comments',
  team: 'teams',
  file: 'files',
  calendar_event: 'events',
  view: 'savedViews',
  label: 'labels',
};
const emptyPreferences = () => ({ favoriteProjectIds: [], favoriteTaskIds: [], notificationReadStates: {} });
const abortCheck = controller => {
  if (controller.signal.aborted) throw new DOMException('Disposed', 'AbortError');
};
function readPersonal(storage, identity) {
  try {
    const raw = storage.getItem(`gr8r.preferences.${identity}`);
    const value = raw ? JSON.parse(raw) : {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('corrupt');
    return value;
  } catch (error) {
    if (error instanceof RepositoryError) throw error;
    fail('storage');
  }
}
function writePersonal(storage, identity, value) {
  try {
    storage.setItem(`gr8r.preferences.${identity}`, JSON.stringify(value));
  } catch {
    fail('storage');
  }
}
/** Local identity is a device namespace, never a fabricated Supabase session. */
export function createLocalPanelAdapter({ persistence, workspaceId, storage, identity = 'local' }) {
  let controller = new AbortController();
  const guarded = async run => {
    const captured = controller;
    abortCheck(captured);
    try {
      const result = await run(captured);
      abortCheck(captured);
      return result;
    } catch (error) {
      abortCheck(captured);
      if (error.code === 'conflict') fail('version_conflict');
      throw error;
    }
  };
  async function personal() {
    return guarded(async () => {
      let value = readPersonal(storage, identity);
      if (!storage.getItem(`gr8r.preferences.${identity}`) && identity === 'local') {
        const legacy = await persistence.legacyPreferences();
        value = { prefs: legacy.prefs, collapsed: legacy.collapsed, views: {} };
        // Legacy views belong to the original graph, even on a first-entry deep link.
        const rows = await persistence.list();
        if (rows[0]) value.views[rows[0].id] = legacy.views;
        // Another bootstrap may have saved personal choices while the reads awaited.
        // Fill only missing legacy defaults; current workspace views/choices win.
        const latest = readPersonal(storage, identity);
        value = { ...value, ...latest, prefs: { ...value.prefs, ...latest.prefs }, views: { ...value.views, ...latest.views } };
        writePersonal(storage, identity, value);
      }
      return { ...value, prefs: value.prefs ?? {}, views: value.views?.[workspaceId] ?? {} };
    });
  }
  async function savePersonal(patch) {
    return guarded(async () => {
      await personal();
      const previous = readPersonal(storage, identity);
      const next = { ...previous, ...patch, prefs: { ...previous.prefs, ...patch.prefs }, views: { ...previous.views } };
      if (workspaceId && patch.views) next.views[workspaceId] = patch.views;
      writePersonal(storage, identity, next);
    });
  }
  async function rows(operation, query = {}) {
    const record = await persistence.loadPanel(workspaceId);
    const data = { ...record.data, _panel: panelState(record) };
    if (operation === 'list_agents') return [];
    if (operation === 'list_domain_events') {
      let events = data._panel?.events ?? [];
      if (query.cursor) {
        const [at, id] = JSON.parse(query.cursor);
        events = events.filter(e => e.createdAt > at || (e.createdAt === at && e.id > id));
      }
      return events;
    }
    if (operation === 'list_members')
      return (data.members ?? []).map(m => ({ user_id: m.id, name: m.name, email: m.email, role: String(m.role).toLowerCase() }));
    if (operation === 'list_subtasks')
      return data.tasks.flatMap(t => (t.subtasks ?? []).map(s => localDTO(data, workspaceId, 'subtask', { ...s, taskId: t.id })));
    if (operation === 'list_dependencies') return data.tasks.flatMap(t => (t.deps ?? []).map(id => ({ workspaceId, taskId: t.id, dependsOnTaskId: id })));
    if (operation === 'list_task_labels') return data.tasks.flatMap(t => (t.labels ?? []).map(id => ({ workspaceId, taskId: t.id, labelId: id })));
    if (operation === 'list_attachments') return data.tasks.flatMap(t => (t.attachments ?? []).map(f => ({ workspaceId, taskId: t.id, fileId: f.id })));
    if (operation === 'list_reactions')
      return (data.comments ?? []).flatMap(c =>
        Object.entries(c.re ?? {}).flatMap(([reaction, users]) =>
          users.map(user => ({ workspaceId, commentId: c.id, reaction, legacyUserId: user, userId: user })),
        ),
      );
    if (operation === 'list_team_members' || operation === 'list_project_members') {
      const team = operation === 'list_team_members';
      return (data[team ? 'teams' : 'projects'] ?? []).flatMap(row =>
        (row.members ?? []).map(userId => ({ workspaceId, [team ? 'teamId' : 'projectId']: row.id, userId })),
      );
    }
    if (operation === 'list_notifications' || operation === 'list_activity' || operation === 'list_task_activity')
      return structuredClone(data[operation === 'list_notifications' ? 'notifs' : 'activity'] ?? []);
    const kind = Object.keys(collections).find(k => `list_${k === 'calendar_event' ? 'calendar_events' : k === 'view' ? 'views' : `${k}s`}` === operation);
    if (!kind) fail('validation_error');
    return (data[collections[kind]] ?? []).map(row => localDTO(data, workspaceId, kind, row));
  }
  const adapter = {
    mode: /** @type {const} */ ('local'),
    userId: identity,
    workspaceId,
    get controller() {
      return controller;
    },
    activate() {
      if (controller.signal.aborted) controller = new AbortController();
    },
    dispose() {
      controller.abort();
    },
    personal,
    savePersonal,
    async workspaces() {
      return guarded(async () => (await persistence.list()).map(localWorkspaceDTO));
    },
    async preferences() {
      const value = await personal();
      return { ...emptyPreferences(), ...value.preferences?.[workspaceId] };
    },
    async list(operation, query = {}) {
      return guarded(async () => {
        const values = await rows(operation, query);
        return structuredClone(
          values.filter(
            row =>
              (!query.taskId || row.taskId === query.taskId || row.task === query.taskId) &&
              (!query.projectId || row.projectId === query.projectId || row.project === query.projectId),
          ),
        );
      });
    },
    async query(operation, query = {}) {
      if (operation === 'get_preferences') return { data: { userId: identity, workspaceId, preferences: await adapter.preferences() } };
      if (operation === 'get_task' || operation === 'get_project') {
        const values = await adapter.list(operation === 'get_task' ? 'list_tasks' : 'list_projects');
        return { data: values.find(row => row.id === query.id) ?? fail('not_found') };
      }
      const items = await adapter.list(operation, query);
      return { items, nextCursor: null };
    },
    async rpc(name, args = {}) {
      if (name === 'list_workspace_members') return adapter.list('list_members');
      if (name === 'create_workspace_v2')
        return guarded(async () => ({
          data: localWorkspaceDTO(
            (
              await persistence.create({
                name: args.p_name,
                url: args.p_slug,
                idempotencyKey: args.p_idempotency_key ? JSON.stringify([identity, args.p_idempotency_key]) : undefined,
              })
            ).data.ws,
          ),
        }));
      fail('cloud_required');
    },
    async command(operation, command) {
      return guarded(captured =>
        persistence.transact(workspaceId, (data, revision, record) => {
          abortCheck(captured);
          const originalPanel = data._panel;
          const hadPanel = Object.hasOwn(data, '_panel');
          const panel = (record.reactPanel = panelState(record));
          data._panel = panel;
          try {
            const signature = JSON.stringify([operation, command.input, command.expectedVersion]);
            const requestKey = JSON.stringify([identity, command.idempotencyKey]);
            const previous = panel.requests[requestKey];
            if (previous) {
              if (previous.signature !== signature) fail('idempotency_conflict');
              return { changed: false, value: previous.result };
            }
            if (!command.idempotencyKey) fail('validation_error');
            const apply = (op, input, expectedVersion) => mutate(data, workspaceId, op, input, expectedVersion);
            let value;
            if (operation === 'batch') {
              if (!Array.isArray(command.input.commands) || !command.input.commands.length || command.input.commands.length > 100) fail('validation_error');
              value = {
                results: command.input.commands.map(c => {
                  if (c.operation === 'batch') fail('validation_error');
                  return { data: apply(c.operation, c.input, c.expectedVersion), eventId: appendEvent(data, c.operation, c.input) };
                }),
              };
            } else value = apply(operation, command.input, command.expectedVersion);
            const result = { data: value, eventId: appendEvent(data, operation, command.input), requestId: command.idempotencyKey };
            panel.requests[requestKey] = { signature, result };
            panel.storageRevision = revision + 1;
            return { changed: true, value: result };
          } finally {
            if (hadPanel) data._panel = originalPanel;
            else delete data._panel;
          }
        }),
      );
    },
  };
  return adapter;
}
function appendEvent(data, operation, input) {
  const events = data._panel.events;
  const createdAt = new Date(Math.max(Date.now(), events.length ? Date.parse(events.at(-1).createdAt) + 1 : 0)).toISOString();
  const id = crypto.randomUUID();
  events.push({
    id,
    operation,
    entityId: input.id ?? input.taskId ?? null,
    actorUserId: data.me,
    actorAgentId: null,
    createdAt,
    payload: { taskId: input.taskId ?? (operation.includes('task') ? input.id : undefined), projectId: input.projectId },
  });
  return id;
}
function mutate(data, workspaceId, operation, input, expectedVersion) {
  if (/claim|intervene|executor|webhook|connection/.test(operation)) fail('cloud_required');
  validateLocalInput(data, operation, input);
  const find = (kind, id) => (data[collections[kind]] ?? []).find(row => row.id === id) ?? fail('not_found');
  const cas = (kind, row) => {
    if (expectedVersion !== entityVersion(data, kind, row.id)) fail('version_conflict');
  };
  const bump = (kind, row) => {
    data._panel.versions[`${kind}:${row.id}`] = entityVersion(data, kind, row.id) + 1;
    row.updated = Date.now();
  };
  const dto = (kind, row) => localDTO(data, workspaceId, kind, row);
  const initialize = (kind, row) => {
    data._panel.versions[`${kind}:${row.id}`] = 1;
    if (kind === 'task') for (const subtask of row.subtasks ?? []) initialize('subtask', subtask);
    return row;
  };
  const keyFor = project => {
    const p = find('project', project);
    p.seq =
      Math.max(
        Number(p.seq) || 0,
        ...data.tasks
          .filter(t => t.project === project)
          .map(
            t =>
              Number(
                String(t.key ?? '')
                  .split('-')
                  .at(-1),
              ) || 0,
          ),
      ) + 1;
    return `${p.key ?? 'TASK'}-${p.seq}`;
  };
  const context = { data, find, cas, bump, dto, initialize, keyFor };
  if (['create_task', 'update_task', 'complete_task', 'move_task', 'duplicate_task', 'delete_task', 'archive_task', 'restore_task'].includes(operation))
    return mutateTask(context, operation, input);
  if (['create_project', 'update_project', 'delete_project', 'archive_project', 'restore_project'].includes(operation))
    return mutateProject(context, operation, input);
  if (operation === 'add_task_comment' || operation === 'delete_comment') return mutateComment(context, operation, input);
  if (['create_subtask', 'update_subtask', 'delete_subtask'].includes(operation)) return mutateSubtask(context, operation, input);
  if (operation === 'set_task_dependency' || operation === 'remove_task_dependency') return mutateDependency(context, operation, input);
  fail('validation_error');
}
function validateLocalInput(data, operation, input) {
  const rule = Object.hasOwn(commandRules, operation) && commandRules[operation];
  const safe = value => {
    if (!value || typeof value !== 'object') return value === null || ['string', 'boolean', 'number'].includes(typeof value);
    if (Array.isArray(value)) return value.every(safe);
    return Object.entries(value).every(([key, value]) => !['__proto__', 'prototype', 'constructor'].includes(key) && safe(value));
  };
  if (
    !rule ||
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    !safe(input) ||
    Object.keys(input).some(key => !rule.fields.includes(key) || key === 'claimToken') ||
    rule.required.some(key => input[key] === undefined || input[key] === null)
  )
    fail('validation_error');
  if (input.attributes !== undefined) {
    const allowed = operation.endsWith('subtask')
      ? ['assignee', 'due', 'note']
      : operation.endsWith('task')
        ? ['estimate']
        : operation.endsWith('project')
          ? ['icon', 'color', 'milestones']
          : [];
    if (
      !input.attributes ||
      typeof input.attributes !== 'object' ||
      Array.isArray(input.attributes) ||
      Object.keys(input.attributes).some(key => !allowed.includes(key))
    )
      fail('validation_error');
  }
  for (const [key, value] of Object.entries(input)) {
    if (value == null) {
      if (!['assigneeUserId', 'recurrence', 'dueDate', 'startDate', 'teamId', 'leadUserId'].includes(key)) fail('validation_error');
      continue;
    }
    if (
      ['id', 'projectId', 'taskId', 'dependsOnTaskId', 'teamId'].includes(key) &&
      (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value))
    )
      fail('validation_error');
    if (['done', 'archived'].includes(key) && typeof value !== 'boolean') fail('validation_error');
    if (key === 'sortOrder' && (typeof value !== 'number' || !Number.isFinite(value))) fail('validation_error');
    if (
      ['description', 'title', 'name', 'body', 'key'].includes(key) &&
      (typeof value !== 'string' || value.length > (key === 'description' ? 100000 : key === 'body' ? 20000 : 500))
    )
      fail('validation_error');
    if (key === 'teamId' && !data.teams?.some(t => t.id === value)) fail('validation_error');
    if (['title', 'name', 'body'].includes(key) && (typeof value !== 'string' || !value.trim())) fail('validation_error');
    if (
      ['dueDate', 'startDate', 'eventDate'].includes(key) &&
      (typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        Number.isNaN(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value)
    )
      fail('validation_error');
    if (['assigneeUserId', 'leadUserId', 'userId'].includes(key) && !data.members?.some(m => m.id === value)) fail('validation_error');
    if (
      key === 'status' &&
      !(operation.endsWith('project') ? ['planning', 'active', 'risk', 'hold', 'complete'] : ['backlog', 'todo', 'progress', 'review', 'done']).includes(value)
    )
      fail('validation_error');
    if (key === 'priority' && !['none', 'low', 'medium', 'high', 'urgent'].includes(value)) fail('validation_error');
    if (key === 'recurrence' && !['Daily', 'Weekly', 'Every 2 weeks', 'Monthly'].includes(value)) fail('validation_error');
  }
}

// A legacy whole-workspace write has no entity versions. Conservatively advance
// every known entity version when that writer changes the storage revision.
function panelState(record) {
  const panel = structuredClone(record.reactPanel ?? { versions: {}, events: [], requests: {}, storageRevision: record.revision });
  const drift = Math.max(0, record.revision - panel.storageRevision);
  for (const [kind, collection] of Object.entries({ ...collections, subtask: null })) {
    const rows = kind === 'subtask' ? record.data.tasks.flatMap(task => task.subtasks ?? []) : (record.data[collection] ?? []);
    for (const row of rows) {
      panel.versions[`${kind}:${row.id}`] = (panel.versions[`${kind}:${row.id}`] ?? panel.storageRevision + 1) + drift;
    }
  }
  panel.storageRevision = record.revision;
  return panel;
}
