import { RepositoryError } from '../normalized.ts';
import { patchLocal } from '../local-dto.js';
const fail = code => {
  throw new RepositoryError(code);
};
import { removeTasks } from '../../core/task-operations.js';
import { copyTask, copyTaskGraph, protectRemoval } from './task-graph.js';
export function mutateTask({ data, find, cas, bump, dto, initialize, keyFor }, operation, input) {
  if (operation === 'create_task') {
    find('project', input.projectId);
    if (!input.title?.trim()) fail('validation_error');
    const row = {
      id: input.id ?? crypto.randomUUID(),
      key: keyFor(input.projectId),
      project: input.projectId,
      title: input.title,
      desc: '',
      status: 'todo',
      priority: 'none',
      subtasks: [],
      deps: [],
      labels: [],
      attachments: [],
      created: Date.now(),
    };
    if (data.tasks.some(t => t.id === row.id)) fail('validation_error');
    patchLocal(row, input);
    initialize('task', row);
    data.tasks.push(row);
    return dto('task', row);
  }
  if (
    ['update_task', 'complete_task', 'move_task', 'duplicate_task', 'duplicate_task_graph', 'delete_task', 'archive_task', 'restore_task'].includes(operation)
  ) {
    const task = find('task', input.id);
    cas('task', task);
    if (input.title !== undefined && !input.title.trim()) fail('validation_error');
    if (operation === 'delete_task') {
      protectRemoval(data, new Set([task.id]));
      removeTasks(data, [task.id]);
      return { id: task.id, deleted: true };
    }
    if (operation === 'move_task') {
      find('project', input.projectId);
      if (task.project !== input.projectId) task.key = keyFor(input.projectId);
    }
    if (operation === 'archive_task' || operation === 'restore_task') {
      task.archived = operation === 'archive_task';
      task.archivedAt = task.archived ? Date.now() : null;
    }
    if (operation === 'duplicate_task_graph') {
      find('project', input.projectId);
      const next = copyTaskGraph(data, task, input, keyFor);
      initialize('task', next);
      data.tasks.push(next);
      return { ...dto('task', next), taskId: next.id };
    }
    if (operation === 'duplicate_task') {
      const next = copyTask(task, input.projectId ?? task.project, keyFor);
      next.title = input.title ?? task.title;
      initialize('task', next);
      data.tasks.push(next);
      return dto('task', next);
    }
    const completing = operation === 'complete_task' || (input.status === 'done' && task.status !== 'done');
    if (operation === 'complete_task' && task.status === 'done') fail('validation_error');
    patchLocal(task, input);
    if (completing) {
      task.status = 'done';
      task.completedAt = Date.now();
      if (task.recur && task.due) {
        const next = copyTask(task, task.project, keyFor);
        const date = new Date(`${task.due}T12:00:00Z`);
        date.setUTCDate(date.getUTCDate() + ({ Daily: 1, Weekly: 7, 'Every 2 weeks': 14, Monthly: 30 }[task.recur] ?? 7));
        next.due = next.start = date.toISOString().slice(0, 10);
        initialize('task', next);
        data.tasks.push(next);
      }
    }
    bump('task', task);
    return dto('task', task);
  }
}
