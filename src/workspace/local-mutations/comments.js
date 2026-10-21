import { RepositoryError } from '../normalized.ts';
const fail = code => {
  throw new RepositoryError(code);
};
export function mutateComment({ data, find, cas, dto, initialize }, operation, input) {
  if (!data.members?.some(member => member.id === data.me)) fail('forbidden');
  if (operation === 'add_task_comment') {
    find('task', input.taskId);
    if (!input.body?.trim()) fail('validation_error');
    const row = { id: input.id ?? crypto.randomUUID(), task: input.taskId, text: input.body, by: data.me, at: Date.now(), re: {} };
    if ((data.comments ?? []).some(c => c.id === row.id)) fail('validation_error');
    initialize('comment', row);
    (data.comments ??= []).push(row);
    return dto('comment', row);
  }
  if (operation === 'add_reaction' || operation === 'remove_reaction') {
    const row = find('comment', input.commentId);
    row.re ??= {};
    const users = row.re[input.reaction] ?? [];
    row.re[input.reaction] = operation === 'add_reaction' ? [...new Set([...users, data.me])] : users.filter(id => id !== data.me);
    return { commentId: row.id, reaction: input.reaction, userId: data.me };
  }
  if (operation === 'delete_comment') {
    const row = find('comment', input.id);
    cas('comment', row);
    if (row.by !== data.me) fail('forbidden');
    data.comments = data.comments.filter(c => c.id !== row.id);
    return { id: row.id, taskId: row.task, authorUserId: row.by, deleted: true };
  }
}

/** Local ownership is the actual legacy member, independent of the personal cache namespace. */
export function assertCommentReplay(data, operation, result) {
  if (['add_task_comment', 'delete_comment', 'add_reaction', 'remove_reaction'].includes(operation) && !data.members?.some(member => member.id === data.me))
    fail('forbidden');
  if (operation === 'delete_comment' && result?.authorUserId !== data.me) fail('forbidden');
  if ((operation === 'add_reaction' || operation === 'remove_reaction') && result?.userId !== data.me) fail('forbidden');
  if (operation === 'add_task_comment' && result?.authorUserId !== data.me) fail('forbidden');
}
