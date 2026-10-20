import { RepositoryError } from './normalized.ts';
import { localDTO, localWorkspaceDTO, entityVersion, patchLocal } from './local-dto.js';
import { localCommandRules as commandRules } from './local-command-rules.js';
import { removeTasks, removeProject } from '../core/task-operations.js';
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
        value = { prefs: legacy.prefs, collapsed: legacy.collapsed, views: { ...(workspaceId ? { [workspaceId]: legacy.views } : {}) } };
        // Discovery imports views to the original workspace only, exactly once.
        if (!workspaceId) {
          const rows = await persistence.list();
          if (rows[0]) value.views[rows[0].id] = legacy.views;
        }
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
    mode: 'local',
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
  if (operation === 'create_task') {
    find('project', input.projectId);
    if (!input.title?.trim()) fail('validation_error');
    const row = {
      id: input.id ?? crypto.randomUUID(),
      key: keyFor(input.projectId),
      project: input.projectId,
      title: input.title,
      desc: '',
      status: 'todo',
      priority: 'none',
      subtasks: [],
      deps: [],
      labels: [],
      attachments: [],
      created: Date.now(),
    };
    if (data.tasks.some(t => t.id === row.id)) fail('validation_error');
    patchLocal(row, input);
    data.tasks.push(row);
    return dto('task', row);
  }
  if (operation === 'add_task_comment') {
    find('task', input.taskId);
    if (!input.body?.trim()) fail('validation_error');
    const row = { id: input.id ?? crypto.randomUUID(), task: input.taskId, text: input.body, by: data.me, at: Date.now(), re: {} };
    if ((data.comments ?? []).some(c => c.id === row.id)) fail('validation_error');
    (data.comments ??= []).push(row);
    return dto('comment', row);
  }
  if (operation === 'delete_comment') {
    const row = find('comment', input.id);
    cas('comment', row);
    if (row.by !== data.me) fail('forbidden');
    data.comments = data.comments.filter(c => c.id !== row.id);
    return { id: row.id, deleted: true };
  }
  if (/^(create|update|delete)_subtask$/.test(operation)) {
    const task = find('task', input.taskId);
    cas('task', task);
    task.subtasks ??= [];
    let row = task.subtasks.find(s => s.id === input.id);
    if (operation === 'create_subtask') {
      if (!input.title?.trim()) fail('validation_error');
      row = { id: input.id ?? crypto.randomUUID(), title: input.title, done: false };
      if (data.tasks.some(t => (t.subtasks ?? []).some(s => s.id === row.id))) fail('validation_error');
      task.subtasks.push(row);
    } else if (!row) fail('not_found');
    if (operation === 'delete_subtask') task.subtasks = task.subtasks.filter(s => s.id !== row.id);
    else patchLocal(row, input);
    bump('task', task);
    return dto('subtask', { ...row, taskId: task.id });
  }
  if (operation === 'set_task_dependency' || operation === 'remove_task_dependency') {
    const task = find('task', input.id);
    cas('task', task);
    find('task', input.dependsOnTaskId);
    if (task.id === input.dependsOnTaskId) fail('validation_error');
    const visits = new Set();
    const reaches = id => {
      if (id === task.id) return true;
      if (visits.has(id)) return false;
      visits.add(id);
      return (find('task', id).deps ?? []).some(reaches);
    };
    if (operation === 'set_task_dependency' && reaches(input.dependsOnTaskId)) fail('validation_error');
    task.deps =
      operation === 'set_task_dependency'
        ? [...new Set([...(task.deps ?? []), input.dependsOnTaskId])]
        : (task.deps ?? []).filter(id => id !== input.dependsOnTaskId);
    bump('task', task);
    return dto('task', task);
  }
  if (['update_task', 'complete_task', 'move_task', 'duplicate_task', 'delete_task', 'archive_task', 'restore_task'].includes(operation)) {
    const task = find('task', input.id);
    cas('task', task);
    if (input.title !== undefined && !input.title.trim()) fail('validation_error');
    if (operation === 'delete_task') {
      protectRemoval(data, new Set([task.id]));
      removeTasks(data, [task.id]);
      return { id: task.id, deleted: true };
    }
    if (operation === 'move_task') {
      find('project', input.projectId);
      if (task.project !== input.projectId) task.key = keyFor(input.projectId);
    }
    if (operation === 'archive_task' || operation === 'restore_task') {
      task.archived = operation === 'archive_task';
      task.archivedAt = task.archived ? Date.now() : null;
    }
    if (operation === 'duplicate_task') {
      const next = copyTask(task, input.projectId ?? task.project, keyFor);
      next.title = input.title ?? task.title;
      data.tasks.push(next);
      return dto('task', next);
    }
    if (operation === 'complete_task' || (input.status === 'done' && task.status !== 'done')) {
      if (task.status === 'done') fail('validation_error');
      task.completedAt = Date.now();
      if (task.recur && task.due) {
        const next = copyTask(task, task.project, keyFor);
        const date = new Date(`${task.due}T12:00:00Z`);
        date.setUTCDate(date.getUTCDate() + ({ Daily: 1, Weekly: 7, 'Every 2 weeks': 14, Monthly: 30 }[task.recur] ?? 7));
        next.due = next.start = date.toISOString().slice(0, 10);
        data.tasks.push(next);
      }
      task.status = 'done';
    }
    patchLocal(task, input);
    bump('task', task);
    return dto('task', task);
  }
  if (/^(create|update|delete|archive|restore)_project$/.test(operation)) {
    let project;
    if (operation === 'create_project') {
      if (!input.name?.trim()) fail('validation_error');
      project = {
        id: input.id ?? crypto.randomUUID(),
        name: input.name,
        key:
          input.key ??
          input.name
            .replace(/[^a-z]/gi, '')
            .slice(0, 4)
            .toUpperCase(),
        status: 'active',
        seq: 0,
      };
      if (data.projects.some(p => p.id === project.id)) fail('validation_error');
      data.projects.push(project);
      (data.projOrder ??= []).push(project.id);
    } else {
      project = find('project', input.id);
      cas('project', project);
    }
    if (operation === 'delete_project') {
      const ids = new Set(data.tasks.filter(t => t.project === project.id).map(t => t.id));
      protectRemoval(data, ids, project.id);
      removeProject(data, project.id);
      return { id: project.id, deleted: true };
    }
    if (operation === 'archive_project' || operation === 'restore_project') project.archived = operation === 'archive_project';
    patchLocal(project, input);
    if (operation !== 'create_project') bump('project', project);
    return dto('project', project);
  }
  fail('validation_error');
}
function copyTask(task, project, keyFor) {
  return {
    ...structuredClone(task),
    id: crypto.randomUUID(),
    project,
    key: keyFor(project),
    status: 'todo',
    completedAt: null,
    archived: false,
    archivedAt: null,
    subtasks: (task.subtasks ?? []).map(s => ({ ...s, id: crypto.randomUUID(), done: false })),
    deps: [],
    attachments: [],
    created: Date.now(),
    updated: Date.now(),
  };
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
  for (const [kind, collection] of Object.entries(collections)) {
    for (const row of record.data[collection] ?? []) {
      panel.versions[`${kind}:${row.id}`] = (panel.versions[`${kind}:${row.id}`] ?? panel.storageRevision + 1) + drift;
    }
  }
  panel.storageRevision = record.revision;
  return panel;
}

function protectRemoval(data, taskIds, projectId) {
  const fileIds = new Set((data.files ?? []).filter(f => taskIds.has(f.task) || (projectId && f.project === projectId)).map(f => f.id));
  if (data.tasks.some(t => !taskIds.has(t.id) && ((t.deps ?? []).some(id => taskIds.has(id)) || (t.attachments ?? []).some(f => fileIds.has(f.id)))))
    fail('validation_error');
}
