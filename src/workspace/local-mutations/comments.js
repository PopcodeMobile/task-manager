import { RepositoryError } from '../normalized.ts';
const fail = code => {
  throw new RepositoryError(code);
};
export function mutateComment({ data, find, cas, dto, initialize }, operation, input) {
  if (operation === 'add_task_comment') {
    find('task', input.taskId);
    if (!input.body?.trim()) fail('validation_error');
    const row = { id: input.id ?? crypto.randomUUID(), task: input.taskId, text: input.body, by: data.me, at: Date.now(), re: {} };
    if ((data.comments ?? []).some(c => c.id === row.id)) fail('validation_error');
    initialize('comment', row);
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
}
