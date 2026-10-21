import { useRef, useState } from 'react';
import type { Task, Project, Json, Label, TaskLabel, TaskDependency, Subtask } from '../../domain/contracts';
import type { Agent, Member } from '../../workspace/normalized';
import type { Translate } from '../auth/ConsentPage';
import { Button } from '../../components/ui/button';
import { TaskLabelChoices } from './TaskRelationSection';
import { priorities, taskStatuses, metadataStrings, type Column } from './task-view-model';
import { statusLabel, priorityLabel } from './TaskList';
import { fieldLabel } from './TaskViewToolbar';
export function TaskCell({
  task,
  column,
  projects,
  members,
  agents,
  t,
  open,
  edit,
  disabled,
  graph,
  tasks,
}: {
  task: Task;
  column: Column;
  projects: Project[];
  members: Member[];
  agents: Agent[];
  t: Translate;
  open: (id: string) => void;
  edit: (task: Task, patch: Record<string, Json>, operation?: string) => void;
  disabled: boolean;
  tasks: Task[];
  graph?: { labels: Label[]; taskLabels: TaskLabel[]; dependencies: TaskDependency[]; subtasks: Subtask[] };
}) {
  const [renaming, setRenaming] = useState(false),
    [title, setTitle] = useState(task.title);
  const cancelled = useRef(false);
  const label = fieldLabel(column, t) + ': ' + (task.key ?? task.id);
  if (column === 'title')
    return renaming ? (
      <input
        aria-label={t('Renomear tarefa', 'Rename task')}
        autoFocus
        defaultValue={title}
        disabled={disabled}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            cancelled.current = true;
            e.currentTarget.blur();
          }
          if (e.key === 'Enter' && title.trim()) e.currentTarget.blur();
        }}
        onBlur={() => {
          setRenaming(false);
          if (!cancelled.current && title.trim() && title !== task.title) edit(task, { title });
        }}
      />
    ) : (
      <div className="task-title-cell">
        <Button className="task-title" variant="ghost" onClick={() => open(task.id)}>
          <small>{task.key}</small>
          <span>{task.title}</span>
        </Button>
        {!!graph?.subtasks.some(s => s.taskId === task.id) && (
          <details className="task-cell-details">
            <summary>{t('Subtarefas', 'Subtasks')}</summary>
            {graph.subtasks
              .filter(s => s.taskId === task.id)
              .map(s => (
                <label key={s.id}>
                  <input
                    type="checkbox"
                    checked={s.done}
                    disabled={disabled}
                    onChange={() => edit(task, { id: s.id, taskId: task.id, done: !s.done }, 'update_subtask')}
                  />
                  {s.title}
                </label>
              ))}
          </details>
        )}
        <Button
          variant="ghost"
          disabled={disabled}
          aria-label={t('Renomear', 'Rename') + ': ' + (task.key ?? task.id)}
          onClick={() => {
            cancelled.current = false;
            setTitle(task.title);
            setRenaming(true);
          }}
        >
          ✎
        </Button>
      </div>
    );
  if (column === 'status')
    return (
      <select aria-label={label} disabled={disabled} value={task.status} onChange={e => edit(task, { status: e.target.value })}>
        {taskStatuses.map(s => (
          <option key={s} value={s}>
            {statusLabel(s, t)}
          </option>
        ))}
      </select>
    );
  if (column === 'priority')
    return (
      <select aria-label={label} disabled={disabled} value={task.priority} onChange={e => edit(task, { priority: e.target.value })}>
        {priorities.map(p => (
          <option key={p} value={p}>
            {priorityLabel(p, t)}
          </option>
        ))}
      </select>
    );
  if (column === 'assignee')
    return (
      <div>
        <select aria-label={label} disabled={disabled} value={task.assigneeUserId ?? ''} onChange={e => edit(task, { assigneeUserId: e.target.value || null })}>
          <option value="">{t('Sem responsável', 'Unassigned')}</option>
          {members.map(m => (
            <option key={m.user_id} value={m.user_id}>
              {m.name}
            </option>
          ))}
          {task.assigneeUserId && !members.some(m => m.user_id === task.assigneeUserId) && <option value={task.assigneeUserId}>{task.assigneeUserId}</option>}
        </select>
        {task.executorAgentId && <small className="task-executor">{agents.find(a => a.id === task.executorAgentId)?.name ?? t('Agente', 'Agent')}</small>}
      </div>
    );
  if (column === 'project')
    return (
      <select aria-label={label} disabled={disabled} value={task.projectId} onChange={e => edit(task, { projectId: e.target.value }, 'move_task')}>
        {projects.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    );
  if (column === 'due' || column === 'start')
    return (
      <input
        type="date"
        aria-label={label}
        disabled={disabled}
        value={(column === 'due' ? task.dueDate : task.startDate) ?? ''}
        onChange={e => edit(task, { [column === 'due' ? 'dueDate' : 'startDate']: e.target.value || null })}
      />
    );
  if (column === 'estimate')
    return (
      <input
        aria-label={label}
        key={`${task.id}:${task.version}`}
        disabled={disabled}
        defaultValue={String(task.legacyMetadata.estimate ?? '')}
        maxLength={120}
        onBlur={e => {
          if (e.target.value !== String(task.legacyMetadata.estimate ?? '')) edit(task, { attributes: { estimate: e.target.value } });
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    );
  if (column === 'created') return <span>{task.createdAt.slice(0, 10)}</span>;
  if (column === 'labels' && graph)
    return (
      <details className="task-cell-details">
        <summary>
          {graph.labels
            .filter(l => graph.taskLabels.some(link => link.taskId === task.id && link.labelId === l.id))
            .map(l => l.name)
            .join(', ') || t('Etiquetas', 'Labels')}
        </summary>
        <TaskLabelChoices
          task={task}
          labels={graph.labels}
          links={graph.taskLabels}
          disabled={disabled}
          t={t}
          change={(id, selected) => edit(task, { labelId: id }, selected ? 'remove_task_label' : 'set_task_label')}
        />
      </details>
    );
  if (column === 'deps' && graph)
    return (
      <details className="task-cell-details">
        <summary>
          {graph.dependencies
            .filter(d => d.taskId === task.id)
            .map(d => tasks.find(x => x.id === d.dependsOnTaskId)?.title ?? d.dependsOnTaskId)
            .join(', ') || t('Dependências', 'Dependencies')}
        </summary>
        {tasks
          .filter(x => x.id !== task.id)
          .map(x => {
            const selected = graph.dependencies.some(d => d.taskId === task.id && d.dependsOnTaskId === x.id);
            return (
              <label key={x.id}>
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={disabled}
                  onChange={() => edit(task, { dependsOnTaskId: x.id }, selected ? 'remove_task_dependency' : 'set_task_dependency')}
                />
                {x.title}
              </label>
            );
          })}
      </details>
    );
  return (
    <Button variant="ghost" aria-label={label} onClick={() => open(task.id)}>
      {metadataStrings(task, column === 'deps' ? 'deps' : 'labels').join(', ') || t('Ver detalhes', 'View details')}
    </Button>
  );
}
