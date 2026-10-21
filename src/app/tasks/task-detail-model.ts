import type { BatchCommand, Subtask, Task } from '../../domain/contracts';
/** Preallocated target ID remains stable for failed/lost-response retries. */
export function promoteSubtask(task: Task, subtask: Subtask, targetId: string, memberIds: string[]): BatchCommand[] {
  const attrs = subtask.legacyMetadata;
  const assignee = typeof attrs.assignee === 'string' && memberIds.includes(attrs.assignee) ? attrs.assignee : null;
  const commands: BatchCommand[] = [
    {
      operation: 'create_task',
      input: {
        id: targetId,
        projectId: task.projectId,
        title: subtask.title,
        description: typeof attrs.note === 'string' ? attrs.note : '',
        assigneeUserId: assignee,
        dueDate: typeof attrs.due === 'string' && attrs.due ? attrs.due : null,
      },
    },
  ];
  if (subtask.done) commands.push({ operation: 'complete_task', input: { id: targetId }, expectedVersion: 1 });
  commands.push({ operation: 'delete_subtask', input: { id: subtask.id, taskId: task.id }, expectedVersion: task.version });
  return commands;
}
export function taskLink(task: Task, local: boolean, origin: string) {
  return `${origin}${local ? '/app-local' : '/app'}/w/${encodeURIComponent(task.workspaceId)}/tasks?task=${encodeURIComponent(task.id)}`;
}
