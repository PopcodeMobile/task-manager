import { TEAMS_SEED } from '../core/constants.js';
// Read projections only. The browser's legacy graph remains the storage authority.
const iso = value => (value == null ? null : typeof value === 'number' ? new Date(value).toISOString() : value);
export const entityVersion = (data, kind, id) => data._panel?.versions?.[`${kind}:${id}`] ?? 1;
export function localDTO(data, workspaceId, kind, row) {
  const common = { id: row.id, workspaceId, version: entityVersion(data, kind, row.id), legacyMetadata: structuredClone(row) };
  if (kind === 'task')
    return {
      ...common,
      projectId: row.project,
      key: row.key ?? null,
      title: row.title,
      description: row.desc ?? '',
      status: row.status ?? 'todo',
      priority: row.priority ?? 'none',
      assigneeUserId: row.assignee || null,
      executorAgentId: null,
      reservation: null,
      recurrence: row.recur ?? null,
      dueDate: row.due ?? null,
      startDate: row.start ?? null,
      sortOrder: row.order ?? 0,
      archived: !!row.archived,
      createdAt: iso(row.created) ?? '',
      updatedAt: iso(row.updated) ?? '',
      completedAt: iso(row.completedAt),
      archivedAt: iso(row.archivedAt),
    };
  if (kind === 'project')
    return {
      ...common,
      key: row.key ?? null,
      name: row.name,
      description: row.desc ?? '',
      status: row.status ?? 'active',
      teamId: row.team || null,
      leadUserId: row.lead || null,
      dueDate: row.due ?? null,
      startDate: row.start ?? null,
      sortOrder: data.projOrder?.indexOf(row.id) ?? 0,
      archived: !!row.archived,
    };
  if (kind === 'comment') return { ...common, taskId: row.task, authorUserId: row.by ?? null, body: row.text, createdAt: iso(row.at) ?? '' };
  if (kind === 'subtask') return { ...common, taskId: row.taskId, title: row.title, done: !!row.done, sortOrder: row.order ?? row.sortOrder ?? 0 };
  if (kind === 'file')
    return {
      ...common,
      projectId: row.project ?? null,
      taskId: row.task ?? null,
      name: row.name,
      fileType: row.type,
      sizeLabel: row.size ?? null,
      createdAt: iso(row.at) ?? '',
      authorUserId: row.by ?? null,
    };
  if (kind === 'calendar_event')
    return { ...common, projectId: row.project ?? null, title: row.title, eventDate: row.date ?? null, eventTime: row.time ?? null };
  if (kind === 'view') return { ...common, projectId: row.project ?? null, name: row.name, viewType: row.type, filters: row.filters ?? [] };
  return { ...common, name: row.name, description: row.desc ?? '' };
}
export const localWorkspaceDTO = row => ({
  id: row.id,
  name: row.name,
  slug: row.url ?? '',
  color: row.c,
  logoPath: row.logoPath ?? null,
  version: row.version ?? 1,
  storageVersion: 1,
  role: /** @type {const} */ ('owner'),
});
export const fieldMap = {
  projectId: 'project',
  description: 'desc',
  assigneeUserId: 'assignee',
  recurrence: 'recur',
  dueDate: 'due',
  startDate: 'start',
  sortOrder: 'order',
  teamId: 'team',
  leadUserId: 'lead',
  taskId: 'task',
  body: 'text',
  fileType: 'type',
  sizeLabel: 'size',
  eventDate: 'date',
  eventTime: 'time',
  viewType: 'type',
};
export function patchLocal(row, input) {
  for (const [key, value] of Object.entries(input)) {
    if (key === 'attributes') Object.assign(row, value);
    else if (key !== 'id' && key !== 'taskId') row[fieldMap[key] ?? key] = value;
  }
}

/** Canonical projection: global records win; embedded-only records retain first-parent provenance.
 * @param {any} data @returns {any[]}
 */
export function localFiles(data) {
  const files = new Map((data.files ?? []).map((/** @type {any} */ file) => [file.id, file]));
  for (const task of data.tasks)
    for (const file of task.attachments ?? [])
      if (!files.has(file.id))
        files.set(file.id, {
          ...file,
          project: Object.hasOwn(file, 'project') ? file.project : task.project,
          task: Object.hasOwn(file, 'task') ? file.task : task.id,
        });
  return [...files.values()];
}

export const localTeams = data => (Object.hasOwn(data, 'teams') ? data.teams : TEAMS_SEED.map(team => ({ ...team })));
