import type { BatchCommand, Json, Project, Task } from '../../domain/contracts.ts';
import { RepositoryError, type Member } from '../../workspace/normalized.ts';
export const taskStatuses = ['backlog', 'todo', 'progress', 'review', 'done'] as const;
export const priorities = ['none', 'low', 'medium', 'high', 'urgent'] as const;
export const columns = ['title', 'status', 'project', 'priority', 'assignee', 'due', 'start', 'labels', 'deps', 'estimate', 'created'] as const;
export type Column = (typeof columns)[number];
export type Filter = { f: string; op: 'is' | 'not'; v: string[] };
export type TaskView = {
  q: string;
  filters: Filter[];
  sort: { f: string; dir: number };
  group: string;
  hidden: string[];
  colW: Record<string, number>;
  collapsed: string[];
  showDone: boolean;
};
const object = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
export function readTaskView(value: unknown): TaskView {
  const v = object(value),
    sort = object(v.sort);
  return {
    q: typeof v.q === 'string' ? v.q : '',
    filters: Array.isArray(v.filters)
      ? v.filters.flatMap(x => {
          const f = object(x);
          return typeof f.f === 'string' ? [{ f: f.f, op: f.op === 'not' ? ('not' as const) : ('is' as const), v: strings(f.v) }] : [];
        })
      : [],
    sort: { f: typeof sort.f === 'string' ? sort.f : typeof v.sort === 'string' ? v.sort : 'manual', dir: sort.dir === -1 ? -1 : 1 },
    group: typeof v.group === 'string' ? v.group : 'status',
    hidden: strings(v.hidden ?? ['start', 'created', 'deps']).filter(x => x !== 'title'),
    colW: Object.fromEntries(
      Object.entries(object(v.colW))
        .filter(([, n]) => typeof n === 'number' && Number.isFinite(n))
        .map(([k, n]) => [k, Math.max(64, Math.min(800, Number(n)))]),
    ),
    collapsed: strings(v.collapsed),
    showDone: v.showDone !== false,
  };
}
export function metadataStrings(task: Task, key: string): string[] {
  return strings(task.legacyMetadata[key]);
}
export function dueGroup(task: Task, now = new Date()): string {
  if (!task.dueDate) return 'nodate';
  const today = now.toISOString().slice(0, 10),
    days = (Date.parse(task.dueDate) - Date.parse(today)) / 86400000;
  return days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 7 ? 'week' : 'later';
}
function match(task: Task, filter: Filter, now: Date) {
  if (!filter.v.length) return true;
  const values: Record<string, string | null> = {
    status: task.status,
    priority: task.priority,
    assignee: task.assigneeUserId ?? 'none',
    project: task.projectId,
    due: dueGroup(task, now),
  };
  const hit =
    filter.f === 'labels'
      ? filter.v.some(v => metadataStrings(task, 'labels').includes(v))
      : ['created', 'updated'].includes(filter.f)
        ? filter.v.some(v => now.getTime() - Date.parse(filter.f === 'created' ? task.createdAt : task.updatedAt) <= Number(v) * 86400000)
        : filter.v.includes(values[filter.f] ?? '');
  return filter.op === 'not' ? !hit : hit;
}
export function applyTaskView(tasks: Task[], view: TaskView, projects: Project[] = [], members: Member[] = [], now = new Date()): Task[] {
  const key = (t: Task): string | number =>
    ({
      manual: t.sortOrder,
      title: t.title.toLocaleLowerCase(),
      due: t.dueDate ?? '9999',
      start: t.startDate ?? '9999',
      priority: -priorities.indexOf(t.priority),
      status: taskStatuses.indexOf(t.status),
      assignee: members.find(m => m.user_id === t.assigneeUserId)?.name ?? 'zzz',
      project: projects.find(p => p.id === t.projectId)?.name ?? '',
      created: -Date.parse(t.createdAt || '1970-01-01'),
      updated: -Date.parse(t.updatedAt || '1970-01-01'),
      estimate: String(t.legacyMetadata.estimate ?? 'zzz'),
    })[view.sort.f] ?? t.sortOrder;
  const q = view.q.toLocaleLowerCase();
  return tasks
    .filter(
      t =>
        !t.archived &&
        (view.showDone || t.status !== 'done') &&
        view.filters.every(f => match(t, f, now)) &&
        (!q || `${t.title} ${t.key ?? ''}`.toLocaleLowerCase().includes(q)),
    )
    .sort((a, b) => {
      const x = key(a),
        y = key(b);
      return (x > y ? 1 : x < y ? -1 : 0) * view.sort.dir;
    });
}
export function groupTaskView(tasks: Task[], group: string, projects: Project[], members: Member[]) {
  const ids =
    group === 'status'
      ? [...taskStatuses]
      : group === 'priority'
        ? [...priorities]
        : group === 'project'
          ? projects.map(p => p.id)
          : group === 'assignee'
            ? [...members.map(m => m.user_id), 'none']
            : group === 'due'
              ? ['overdue', 'today', 'week', 'later', 'nodate']
              : ['all'];
  const key = (t: Task) =>
    group === 'status'
      ? t.status
      : group === 'priority'
        ? t.priority
        : group === 'project'
          ? t.projectId
          : group === 'assignee'
            ? (t.assigneeUserId ?? 'none')
            : group === 'due'
              ? dueGroup(t)
              : 'all';
  // Keep historical identities visible without inventing members.
  for (const t of tasks) if (!ids.includes(key(t))) ids.splice(group === 'assignee' ? Math.max(0, ids.length - 1) : ids.length, 0, key(t));
  return ids.map(id => ({ key: id, tasks: tasks.filter(t => key(t) === id) })).filter(g => ['status', 'priority'].includes(group) || g.tasks.length > 0);
}
export function bulkCommands(tasks: Task[], operation: string, input: Record<string, Json> = {}): BatchCommand[] {
  if (!tasks.length || tasks.length > 100) throw new RepositoryError('batch_limit');
  if (tasks.some(t => t.reservation?.active && Date.parse(t.reservation.expiresAt) > Date.now())) throw new RepositoryError('already_claimed');
  const commands: BatchCommand[] = tasks.flatMap(t => {
    if (operation === 'update_task' && input.status === 'done' && t.status !== 'done') {
      const patch = { ...input };
      delete patch.status;
      return [
        ...(Object.keys(patch).length ? [{ operation: 'update_task', input: { ...patch, id: t.id }, expectedVersion: t.version }] : []),
        { operation: 'complete_task', input: { id: t.id }, expectedVersion: t.version + (Object.keys(patch).length ? 1 : 0) },
      ];
    }
    if (operation === 'complete_task' && t.status === 'done') return [];
    return [{ operation, input: { ...input, id: t.id }, expectedVersion: t.version }];
  });
  if (commands.length > 100) throw new RepositoryError('batch_limit');
  return commands;
}
export function reorderTask(tasks: Task[], id: string, before: string | null, group: string, groupId: string): BatchCommand[] {
  const task = tasks.find(t => t.id === id);
  if (!task) throw new RepositoryError('not_found');
  const peers = tasks.filter(t => t.id !== id).sort((a, b) => a.sortOrder - b.sortOrder),
    index = before ? peers.findIndex(t => t.id === before) : peers.length;
  if (index < 0) throw new RepositoryError('not_found');
  const next = peers[index],
    prev = peers[index - 1],
    sortOrder = next ? (prev ? (prev.sortOrder + next.sortOrder) / 2 : next.sortOrder - 1) : prev ? prev.sortOrder + 1 : task.sortOrder;
  const commandsFor = (order: number) => {
    const patch: Record<string, Json> = { sortOrder: order };
    if (group === 'project' && groupId !== task.projectId) return bulkCommands([task], 'move_task', { projectId: groupId, sortOrder: order });
    if (group === 'status') patch.status = groupId;
    if (group === 'priority') patch.priority = groupId;
    if (group === 'assignee') patch.assigneeUserId = groupId === 'none' ? null : groupId;
    return bulkCommands([task], 'update_task', patch);
  };
  if (prev && next && !(sortOrder > prev.sortOrder && sortOrder < next.sortOrder)) {
    // Equal/precision-exhausted imported orders have no representable midpoint.
    // Renumber in the same atomic batch; never silently move only a prefix.
    const ordered = [...peers];
    ordered.splice(index, 0, task);
    const commands = ordered.flatMap((row, i) =>
      row.id === task.id ? commandsFor(i) : row.sortOrder === i ? [] : bulkCommands([row], 'update_task', { sortOrder: i }),
    );
    if (commands.length > 100) throw new RepositoryError('batch_limit');
    return commands;
  }
  return commandsFor(sortOrder);
}
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export function loadTaskView(storage: StorageLike, identity: string, workspaceId: string, key: string) {
  const raw = storage.getItem(`gr8r.preferences.${identity}`);
  const personal = object(raw ? JSON.parse(raw) : {});
  const views = object(object(personal.views)[workspaceId]);
  const legacyKey = key.startsWith('project:') ? key.split(':')[1] : 'tasks';
  return readTaskView(views[key] ?? views[legacyKey]);
}
export function saveTaskView(storage: StorageLike, identity: string, workspaceId: string, key: string, view: TaskView) {
  const storageKey = `gr8r.preferences.${identity}`,
    raw = storage.getItem(storageKey),
    personal = object(raw ? JSON.parse(raw) : {}),
    views = object(personal.views),
    workspace = object(views[workspaceId]);
  storage.setItem(
    storageKey,
    JSON.stringify({ ...personal, views: { ...views, [workspaceId]: { ...workspace, [key]: { ...object(workspace[key]), ...view } } } }),
  );
}
/** A drag cannot cross a disposed repository/session/workspace lifetime. */
export function taskDragId(value: string, scope: string): string | null {
  try {
    const drag = object(JSON.parse(value));
    return drag.scope === scope && typeof drag.id === 'string' ? drag.id : null;
  } catch {
    return null;
  }
}
/** Shared drawer/context-menu preparation; intervention is an explicit human action. */
export function prepareTaskAction(task: Task, operation: string, input: Record<string, Json> = {}, expectedVersion = task.version): BatchCommand {
  if (operation === 'intervene_task') return { operation, input: { ...input, id: task.id }, expectedVersion };
  const commands = bulkCommands([{ ...task, version: expectedVersion }], operation, input);
  if (commands.length !== 1) throw new RepositoryError('validation_error');
  return commands[0];
}
