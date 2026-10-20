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
  const fileIds = new Set((data.files ?? []).filter(f => taskIds.has(f.task) || (projectId && f.project === projectId)).map(f => f.id));
  if (data.tasks.some(t => !taskIds.has(t.id) && ((t.deps ?? []).some(id => taskIds.has(id)) || (t.attachments ?? []).some(f => fileIds.has(f.id)))))
    fail('validation_error');
}
