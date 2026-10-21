import { useRef, useState } from 'react';
import type { Task, Project, Json } from '../../domain/contracts';
import type { Agent, Member } from '../../workspace/normalized';
import type { Translate } from '../auth/ConsentPage';
import { Button } from '../../components/ui/button';
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
  // Graph families are owned by Task6b2; these cells open the shared authoritative editor.
  return (
    <Button variant="ghost" aria-label={label} onClick={() => open(task.id)}>
      {metadataStrings(task, column === 'deps' ? 'deps' : 'labels').join(', ') || t('Ver detalhes', 'View details')}
    </Button>
  );
}
