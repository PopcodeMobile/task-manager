import { localFiles } from '../local-dto.js';
import { RepositoryError } from '../normalized.ts';
const fail = code => {
  throw new RepositoryError(code);
};
export function copyTask(task, project, keyFor) {
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

export function protectRemoval(data, taskIds, projectId) {
  const fileIds = new Set(
    localFiles(data)
      .filter(f => taskIds.has(f.task) || (projectId && f.project === projectId))
      .map(f => f.id),
  );
  if (data.tasks.some(t => !taskIds.has(t.id) && ((t.deps ?? []).some(id => taskIds.has(id)) || (t.attachments ?? []).some(f => fileIds.has(f.id)))))
    fail('validation_error');
}

/** Freeze canonical provenance before adding any cloned embedded links. */
export function copyTaskGraph(data, task, input, keyFor) {
  data.files = structuredClone(localFiles(data));
  const stamp = Date.now();
  return {
    ...structuredClone(task),
    id: crypto.randomUUID(),
    project: input.projectId,
    key: keyFor(input.projectId),
    title: input.title ?? task.title,
    status: input.mode === 'task' ? task.status : 'todo',
    completedAt: input.mode === 'task' && task.status === 'done' ? (task.completedAt ?? null) : null,
    archived: false,
    archivedAt: null,
    executorAgentId: null,
    reservation: null,
    subtasks: (task.subtasks ?? []).map(s => ({ ...structuredClone(s), id: crypto.randomUUID() })),
    created: stamp,
    updated: stamp,
  };
}
/** Device authority is the current real local member, including receipt replay. */
export function assertTaskGraphActor(data, operation, eventId) {
  if (operation !== 'duplicate_task_graph') return;
  if (!data.members?.some(member => member.id === data.me) || (eventId && data._panel.events.find(event => event.id === eventId)?.actorUserId !== data.me))
    fail('forbidden');
}
