// @ts-check
import { RepositoryError } from './normalized.ts';
import { localDTO, localWorkspaceDTO, entityVersion, localFiles } from './local-dto.js';
import { localCommandRules as commandRules } from './local-command-rules.js';
import { mutateTask } from './local-mutations/tasks.js';
import { mutateProject } from './local-mutations/projects.js';
import { mutateComment, assertCommentReplay } from './local-mutations/comments.js';
import { mutateSubtask } from './local-mutations/subtasks.js';
import { mutateTaskDetails, assertFileDuplicationActor } from './local-mutations/task-details.js';
import { mutateDependency } from './local-mutations/dependencies.js';
/** @param {string} code @returns {never} */
const fail = code => {
  throw new RepositoryError(code);
};
/** @type {Record<string, string>} */
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
/** @param {AbortController} controller */
const abortCheck = controller => {
  if (controller.signal.aborted) throw new DOMException('Disposed', 'AbortError');
};
/** @param {Pick<Storage, 'getItem'>} storage
 * @param {string} identity
 * @returns {import('./local-panel-types').LocalPersonalRecord}
 */
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
/** @param {Pick<Storage, 'setItem'>} storage
 * @param {string} identity
 * @param {import('./local-panel-types').LocalPersonalRecord} value
 */
function writePersonal(storage, identity, value) {
  try {
    storage.setItem(`gr8r.preferences.${identity}`, JSON.stringify(value));
  } catch {
    fail('storage');
  }
}
/** Local identity is a device namespace, never a fabricated Supabase session.
 * @param {import('./local-panel-types').LocalRepositoryOptions} options
 */
export function createLocalPanelAdapter({ persistence, workspaceId, storage, identity = 'local' }) {
  let controller = new AbortController();
  /** @template T
   * @param {(controller: AbortController) => T | Promise<T>} run
   * @returns {Promise<T>}
   */
  const guarded = async run => {
    const captured = controller;
    abortCheck(captured);
    try {
      const result = await run(captured);
      abortCheck(captured);
      return result;
    } catch (error) {
      abortCheck(captured);
      if (/** @type {{code?: string}} */ (error).code === 'conflict') fail('version_conflict');
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
        if (rows[0]) /** @type {NonNullable<import('./local-panel-types').LocalPersonalRecord['views']>} */ (value.views)[rows[0].id] = legacy.views;
        // Another bootstrap may have saved personal choices while the reads awaited.
        // Fill only missing legacy defaults; current workspace views/choices win.
        const latest = readPersonal(storage, identity);
        value = { ...value, ...latest, prefs: { ...value.prefs, ...latest.prefs }, views: { ...value.views, ...latest.views } };
        writePersonal(storage, identity, value);
      }
      return {
        ...value,
        prefs: value.prefs ?? {},
        views: value.views?.[/** @type {string} */ (workspaceId)] ?? {},
        preferences: value.preferences?.[/** @type {string} */ (workspaceId)] ?? emptyPreferences(),
      };
    });
  }
  /** @param {Partial<import('./repository').PersonalState>} patch */
  async function savePersonal(patch) {
    return guarded(async () => {
      await personal();
      const previous = readPersonal(storage, identity);
      const next = {
        ...previous,
        prefs: { ...previous.prefs, ...patch.prefs },
        views: { ...previous.views },
        ...(patch.collapsed === undefined ? {} : { collapsed: patch.collapsed }),
        ...(patch.activeWorkspace === undefined ? {} : { activeWorkspace: patch.activeWorkspace }),
      };
      if (workspaceId && patch.preferences)
        next.preferences = { ...previous.preferences, [workspaceId]: { ...emptyPreferences(), ...previous.preferences?.[workspaceId], ...patch.preferences } };
      if (workspaceId && patch.views) next.views[workspaceId] = patch.views;
      writePersonal(storage, identity, next);
    });
  }
  /** @param {string} operation
   * @param {Record<string, string | number>} query
   * @returns {Promise<Record<string, unknown>[]>}
   */
  async function rows(operation, query = {}) {
    const record = await persistence.loadPanel(workspaceId);
    /** @type {Record<string, any> & {tasks: any[], members?: any[], comments?: any[], projects: any[], _panel: import('./local-panel-types').LocalPanelBookkeeping}} */
    const data = { ...record.data, _panel: panelState(record) };
    if (operation === 'list_task_activity')
      return data._panel.events.filter(event => event.entityId === query.taskId || event.payload?.taskId === query.taskId);
    if (operation === 'list_agents') return [];
    if (operation === 'list_domain_events') {
      let events = data._panel?.events ?? [];
      if (query.cursor) {
        const [at, id] = JSON.parse(/** @type {string} */ (query.cursor));
        events = events.filter(e => e.createdAt > at || (e.createdAt === at && e.id > id));
      }
      return events;
    }
    if (operation === 'list_members')
      return (data.members ?? []).map(m => ({ user_id: m.id, name: m.name, email: m.email, role: String(m.role).toLowerCase() }));
    if (operation === 'list_labels') {
      const labels = new Map((data.labels ?? []).map((/** @type {any} */ label) => [label.id, label]));
      for (const task of data.tasks) for (const id of task.labels ?? []) if (!labels.has(id)) labels.set(id, { id, name: id });
      return [...labels.values()].map(label => localDTO(data, workspaceId, 'label', label));
    }
    if (operation === 'list_files') return localFiles(data).map(file => localDTO(data, workspaceId, 'file', file));
    if (operation === 'list_subtasks')
      return data.tasks.flatMap(t => (t.subtasks ?? []).map(/** @param {any} s */ s => localDTO(data, workspaceId, 'subtask', { ...s, taskId: t.id })));
    if (operation === 'list_dependencies')
      return data.tasks.flatMap(t => (t.deps ?? []).map(/** @param {string} id */ id => ({ workspaceId, taskId: t.id, dependsOnTaskId: id })));
    if (operation === 'list_task_labels')
      return data.tasks.flatMap(t => (t.labels ?? []).map(/** @param {string} id */ id => ({ workspaceId, taskId: t.id, labelId: id })));
    if (operation === 'list_attachments')
      return data.tasks.flatMap(t => (t.attachments ?? []).map(/** @param {any} f */ f => ({ workspaceId, taskId: t.id, fileId: f.id })));
    if (operation === 'list_reactions')
      return (data.comments ?? []).flatMap(c =>
        Object.entries(c.re ?? {}).flatMap(([reaction, users]) =>
          /** @type {string[]} */ (users).map(user => ({ workspaceId, commentId: c.id, reaction, legacyUserId: user, userId: user })),
        ),
      );
    if (operation === 'list_team_members' || operation === 'list_project_members') {
      const team = operation === 'list_team_members';
      return (data[team ? 'teams' : 'projects'] ?? []).flatMap(
        /** @param {any} row */ row =>
          (row.members ?? []).map(/** @param {string} userId */ userId => ({ workspaceId, [team ? 'teamId' : 'projectId']: row.id, userId })),
      );
    }
    if (operation === 'list_activity')
      return (data.activity ?? []).map((/** @type {any} */ row) => ({
        id: row.id,
        workspaceId,
        projectId: row.project ?? null,
        taskId: row.task ?? null,
        actorUserId: row.by ?? null,
        verb: row.verb,
        createdAt: typeof row.at === 'number' ? new Date(row.at).toISOString() : row.at,
        legacyMetadata: structuredClone(row),
      }));
    if (operation === 'list_notifications') return structuredClone(data[operation === 'list_notifications' ? 'notifs' : 'activity'] ?? []);
    const kind = Object.keys(collections).find(k => `list_${k === 'calendar_event' ? 'calendar_events' : k === 'view' ? 'views' : `${k}s`}` === operation);
    if (!kind) fail('validation_error');
    return (data[collections[kind]] ?? []).map(/** @param {any} row */ row => localDTO(data, workspaceId, kind, row));
  }
  /** @type {import('./local-panel-types').LocalPanelTransport} */
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
      return { ...emptyPreferences(), ...value.preferences };
    },
    async list(operation, query = {}) {
      return guarded(async () => {
        const values = await rows(operation, query);
        return structuredClone(
          values.filter(
            row =>
              (!query.taskId || operation === 'list_task_activity' || row.taskId === query.taskId || row.task === query.taskId) &&
              (!query.projectId || row.projectId === query.projectId || row.project === query.projectId),
          ),
        );
      });
    },
    async query(operation, query = {}) {
      if (operation === 'get_preferences') return { data: { userId: identity, workspaceId, preferences: await adapter.preferences() } };
      if (operation === 'get_task' || operation === 'get_project') {
        const values = /** @type {Record<string, unknown>[]} */ (await adapter.list(operation === 'get_task' ? 'list_tasks' : 'list_projects'));
        return { data: values.find(row => row.id === query.id) ?? fail('not_found') };
      }
      const items = await adapter.list(operation, query);
      return { items, nextCursor: null };
    },
    async rpc(name, args = {}) {
      if (name === 'get_local_actor')
        return guarded(async () => {
          const { data } = await persistence.loadPanel(workspaceId);
          if (typeof data.me !== 'string' || !data.members?.some((/** @type {{id: string}} */ member) => member.id === data.me)) fail('not_found');
          return { currentMemberId: data.me };
        });
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
    /** @param {string} operation
     * @param {Omit<import('../domain/contracts').Command<Record<string, unknown>>, 'workspaceId'>} command
     */
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
              if (operation === 'batch' && Array.isArray(command.input.commands)) {
                const cached = /** @type {{results?: {data: unknown}[]}} */ (previous.result.data);
                command.input.commands.forEach((child, index) => {
                  assertCommentReplay(data, child.operation, cached.results?.[index]?.data);
                  assertFileDuplicationActor(data, child.operation, cached.results?.[index]?.data);
                });
              } else {
                assertCommentReplay(data, operation, previous.result.data);
                assertFileDuplicationActor(data, operation, previous.result.data);
              }
              return { changed: false, value: previous.result };
            }
            if (!command.idempotencyKey) fail('validation_error');
            /** @param {string} op @param {Record<string, unknown>} input @param {number | undefined} expectedVersion */
            const apply = (op, input, expectedVersion) => mutate(data, workspaceId, op, input, expectedVersion);
            let value;
            if (operation === 'batch') {
              if (!Array.isArray(command.input.commands) || !command.input.commands.length || command.input.commands.length > 100) fail('validation_error');
              value = {
                results: command.input.commands.map(c => {
                  if (c.operation === 'batch') fail('validation_error');
                  const dataResult = apply(c.operation, c.input, c.expectedVersion);
                  return { data: dataResult, eventId: appendEvent(data, c.operation, c.input, dataResult) };
                }),
              };
            } else value = apply(operation, command.input, command.expectedVersion);
            const result = { data: value, eventId: appendEvent(data, operation, command.input, value), requestId: command.idempotencyKey };
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
/** @param {any} data @param {string} operation @param {Record<string, unknown>} input @param {any} result */
function appendEvent(data, operation, input, result) {
  const events = data._panel.events;
  const createdAt = new Date(Math.max(Date.now(), events.length ? Date.parse(events.at(-1).createdAt) + 1 : 0)).toISOString();
  const id = crypto.randomUUID();
  events.push({
    id,
    operation,
    entityId: operation === 'duplicate_file' ? result.id : (input.id ?? input.taskId ?? null),
    actorUserId: data.me,
    actorAgentId: null,
    createdAt,
    payload: {
      taskId:
        input.taskId ??
        result?.taskId ??
        data.comments?.find((/** @type {any} */ c) => c.id === input.commentId)?.task ??
        (operation.includes('task') ? input.id : undefined),
      projectId: input.projectId,
    },
  });
  return id;
}
/** @param {any} data @param {string | null} workspaceId @param {string} operation @param {Record<string, any>} input @param {number | undefined} expectedVersion */
function mutate(data, workspaceId, operation, input, expectedVersion) {
  if (/claim|intervene|executor|webhook|connection/.test(operation)) fail('cloud_required');
  validateLocalInput(data, operation, input);
  /** @param {string} kind @param {string} id */
  const find = (kind, id) =>
    (data[collections[kind]] ?? []).find(/** @param {any} row */ row => row.id === id) ??
    (kind === 'file' ? localFiles(data).find(file => file.id === id) : null) ??
    (kind === 'label' && data.tasks.some((/** @type {any} */ task) => (task.labels ?? []).includes(id)) ? { id, name: id } : null) ??
    fail('not_found');
  /** @param {string} kind @param {any} row */
  const cas = (kind, row) => {
    if (expectedVersion !== entityVersion(data, kind, row.id)) fail('version_conflict');
  };
  /** @param {string} kind @param {any} row */
  const bump = (kind, row) => {
    data._panel.versions[`${kind}:${row.id}`] = entityVersion(data, kind, row.id) + 1;
    row.updated = Date.now();
  };
  /** @param {string} kind @param {any} row */
  const dto = (kind, row) => localDTO(data, workspaceId, kind, row);
  /** @param {string} kind @param {any} row */
  const initialize = (kind, row) => {
    data._panel.versions[`${kind}:${row.id}`] = 1;
    if (kind === 'task') for (const subtask of row.subtasks ?? []) initialize('subtask', subtask);
    return row;
  };
  /** @param {string} project */
  const keyFor = project => {
    const p = find('project', project);
    p.seq =
      Math.max(
        Number(p.seq) || 0,
        ...data.tasks
          .filter(/** @param {any} t */ t => t.project === project)
          .map(
            /** @param {any} t */ t =>
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
  if (['add_task_comment', 'delete_comment', 'add_reaction', 'remove_reaction'].includes(operation)) return mutateComment(context, operation, input);
  if (['create_subtask', 'update_subtask', 'delete_subtask'].includes(operation)) return mutateSubtask(context, operation, input);
  if (operation === 'set_task_dependency' || operation === 'remove_task_dependency') return mutateDependency(context, operation, input);
  if (operation === 'duplicate_file' || /^(set|remove)_task_(label|attachment)$/.test(operation) || /^(create|update|delete)_(label|file)$/.test(operation))
    return mutateTaskDetails(context, operation, input);
  fail('validation_error');
}
/** @param {any} data @param {string} operation @param {Record<string, any>} input */
function validateLocalInput(data, operation, input) {
  const rule = Object.hasOwn(commandRules, operation) && /** @type {Record<string, {fields: string[], required: string[]}>} */ (commandRules)[operation];
  /** @param {unknown} value @returns {boolean} */
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
    if (operation.endsWith('subtask'))
      for (const [key, value] of Object.entries(input.attributes)) {
        if (value !== null && (typeof value !== 'string' || value.length > (key === 'note' ? 20000 : 128))) fail('validation_error');
        if (
          key === 'due' &&
          value &&
          (typeof value !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
            Number.isNaN(Date.parse(value)) ||
            new Date(value).toISOString().slice(0, 10) !== value)
        )
          fail('validation_error');
      }
  }
  for (const [key, value] of Object.entries(input)) {
    if (value == null) {
      if (
        ![
          'assigneeUserId',
          'recurrence',
          'dueDate',
          'startDate',
          'teamId',
          'leadUserId',
          'sizeLabel',
          ...(/_file$/.test(operation) ? ['taskId', 'projectId'] : []),
        ].includes(key)
      )
        fail('validation_error');
      continue;
    }
    if (
      ['id', 'newId', 'projectId', 'taskId', 'dependsOnTaskId', 'teamId', 'labelId', 'fileId', 'commentId'].includes(key) &&
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
    if (key === 'teamId' && !data.teams?.some(/** @param {any} t */ t => t.id === value)) fail('validation_error');
    if (['title', 'name', 'body'].includes(key) && (typeof value !== 'string' || !value.trim())) fail('validation_error');
    if (
      ['dueDate', 'startDate', 'eventDate'].includes(key) &&
      (typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        Number.isNaN(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value)
    )
      fail('validation_error');
    if (['assigneeUserId', 'leadUserId', 'userId'].includes(key) && !data.members?.some(/** @param {any} m */ m => m.id === value)) fail('validation_error');
    if (
      key === 'status' &&
      !(operation.endsWith('project') ? ['planning', 'active', 'risk', 'hold', 'complete'] : ['backlog', 'todo', 'progress', 'review', 'done']).includes(value)
    )
      fail('validation_error');
    if (key === 'reaction' && (typeof value !== 'string' || !/^[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D]+$/u.test(value) || value.length > 32))
      fail('validation_error');
    if (key === 'fileType' && !['fig', 'pdf', 'zip', 'img', 'sheet', 'doc', 'code', 'other'].includes(value)) fail('validation_error');
    if (key === 'sizeLabel' && (typeof value !== 'string' || value.length > 120)) fail('validation_error');
    if (key === 'priority' && !['none', 'low', 'medium', 'high', 'urgent'].includes(value)) fail('validation_error');
    if (key === 'recurrence' && !['Daily', 'Weekly', 'Every 2 weeks', 'Monthly'].includes(value)) fail('validation_error');
  }
}

// A legacy whole-workspace write has no entity versions. Conservatively advance
// every known entity version when that writer changes the storage revision.
/** @param {any} record @returns {import('./local-panel-types').LocalPanelBookkeeping} */
function panelState(record) {
  const panel = structuredClone(record.reactPanel ?? { versions: {}, events: [], requests: {}, storageRevision: record.revision });
  const drift = Math.max(0, record.revision - panel.storageRevision);
  for (const [kind, collection] of Object.entries(/** @type {Record<string, string | null>} */ ({ ...collections, subtask: null }))) {
    let rows =
      kind === 'subtask'
        ? record.data.tasks.flatMap(/** @param {any} task */ task => task.subtasks ?? [])
        : (record.data[/** @type {string} */ (collection)] ?? []);
    // Embedded files and referenced labels are canonical records before materialization.
    if (kind === 'file') rows = localFiles(record.data);
    if (kind === 'label')
      rows = [...rows, ...record.data.tasks.flatMap((/** @type {any} */ task) => (task.labels ?? []).map((/** @type {string} */ id) => ({ id })))];
    const seen = new Set();
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      panel.versions[`${kind}:${row.id}`] = (panel.versions[`${kind}:${row.id}`] ?? panel.storageRevision + 1) + drift;
    }
  }
  panel.storageRevision = record.revision;
  return panel;
}
