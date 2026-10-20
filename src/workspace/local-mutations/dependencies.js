import { RepositoryError } from '../normalized.ts';
const fail = code => {
  throw new RepositoryError(code);
};
export function mutateDependency({ find, cas, bump, dto }, operation, input) {
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
}
