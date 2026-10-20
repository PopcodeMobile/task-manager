import { RepositoryError } from '../normalized.ts';
import { patchLocal } from '../local-dto.js';
const fail = code => {
  throw new RepositoryError(code);
};
export function mutateSubtask({ data, find, cas, bump, dto, initialize }, operation, input) {
  if (/^(create|update|delete)_subtask$/.test(operation)) {
    const task = find('task', input.taskId);
    cas('task', task);
    task.subtasks ??= [];
    let row = task.subtasks.find(s => s.id === input.id);
    if (operation === 'create_subtask') {
      if (!input.title?.trim()) fail('validation_error');
      row = { id: input.id ?? crypto.randomUUID(), title: input.title, done: false };
      if (data.tasks.some(t => (t.subtasks ?? []).some(s => s.id === row.id))) fail('validation_error');
      initialize('subtask', row);
      task.subtasks.push(row);
    } else if (!row) fail('not_found');
    if (operation === 'delete_subtask') task.subtasks = task.subtasks.filter(s => s.id !== row.id);
    else patchLocal(row, input);
    bump('task', task);
    return dto('subtask', { ...row, taskId: task.id });
  }
}
