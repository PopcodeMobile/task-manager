import { iso, addD } from '../../core/calendar.js';
import { Pencil, Calendar, ChevronRight, ListChecks, MessageSquare, Repeat2 } from 'lucide-react';
import { MemberAvatar, projectTone } from '../projects/ProjectVisual';
import { TaskFieldControl, taskDateLabel } from './TaskFieldPopover';
import { TaskStatusIcon, TaskPriorityIcon, labelVisual } from './TaskVisual';
import { useRef, useState } from 'react';
import type { Task, Project, Json, Label, TaskLabel, TaskDependency, Subtask, Comment } from '../../domain/contracts';
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
  graph,
  tasks,
  prefs = {},
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
  prefs?: Record<string, unknown>;
  graph?: { labels: Label[]; taskLabels: TaskLabel[]; dependencies: TaskDependency[]; subtasks: Subtask[]; comments?: Comment[] };
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
        <Button className="task-title" aria-label={task.title} variant="ghost" onClick={() => open(task.id)}>
          <small aria-hidden="true">{task.key}</small>
          <span>{task.title}</span>
        </Button>
        {!!graph?.subtasks.some(s => s.taskId === task.id) && (
          <details className="task-cell-details">
            <summary aria-label={t('Mostrar subtarefas', 'Show subtasks')}>
              <ChevronRight size={13} />
              <span className="meta-mini">
                <ListChecks size={11} />
                {graph.subtasks.filter(item => item.taskId === task.id && item.done).length}/{graph.subtasks.filter(item => item.taskId === task.id).length}
              </span>
            </summary>
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
        {task.recurrence && (
          <span className="meta-mini">
            <Repeat2 size={11} />
          </span>
        )}
        {!!graph?.comments?.filter(item => item.taskId === task.id).length && (
          <span className="meta-mini">
            <MessageSquare size={11} />
            {graph.comments.filter(item => item.taskId === task.id).length}
          </span>
        )}
        <Button
          variant="ghost"
          className="task-rename ibtn ibtn-xs"
          disabled={disabled}
          aria-label={t('Renomear', 'Rename') + ': ' + (task.key ?? task.id)}
          onClick={() => {
            cancelled.current = false;
            setTitle(task.title);
            setRenaming(true);
          }}
        >
          <Pencil size={12} />
        </Button>
      </div>
    );
  if (column === 'status')
    return (
      <TaskFieldControl
        triggerLabel={t('Alterar status', 'Change status') + ': ' + (task.key ?? task.id)}
        menuLabel={fieldLabel(column, t)}
        fieldId={`${task.id}:${column}`}
        value={task.status}
        disabled={disabled}
        onChange={status => edit(task, { status })}
        t={t}
        choices={taskStatuses.map((id, i) => ({ id, label: statusLabel(id, t), icon: <TaskStatusIcon status={id} />, shortcut: String(i + 1) }))}
      >
        <TaskStatusIcon status={task.status} />
        <span>{statusLabel(task.status, t)}</span>
      </TaskFieldControl>
    );
  if (column === 'priority')
    return (
      <TaskFieldControl
        triggerLabel={t('Alterar prioridade', 'Change priority') + ': ' + (task.key ?? task.id)}
        menuLabel={fieldLabel(column, t)}
        fieldId={`${task.id}:${column}`}
        value={task.priority}
        disabled={disabled}
        onChange={priority => edit(task, { priority })}
        t={t}
        choices={[...priorities].reverse().map(id => ({ id, label: priorityLabel(id, t), icon: <TaskPriorityIcon priority={id} /> }))}
      >
        <TaskPriorityIcon priority={task.priority} />
        <span>{priorityLabel(task.priority, t)}</span>
      </TaskFieldControl>
    );
  if (column === 'assignee')
    return (
      <div className="task-assignee-cell">
        <TaskFieldControl
          triggerLabel={t('Alterar responsável', 'Change assignee') + ': ' + (task.key ?? task.id)}
          menuLabel={fieldLabel(column, t)}
          fieldId={`${task.id}:${column}`}
          value={task.assigneeUserId ?? ''}
          disabled={disabled}
          onChange={assigneeUserId => edit(task, { assigneeUserId: assigneeUserId || null })}
          t={t}
          searchLabel={t('Buscar responsáveis', 'Search assignees')}
          choices={[
            { id: '', label: t('Sem responsável', 'Unassigned'), icon: <MemberAvatar /> },
            ...members.map(member => ({ id: member.user_id, label: member.name, icon: <MemberAvatar member={member} /> })),
            ...(task.assigneeUserId && !members.some(m => m.user_id === task.assigneeUserId) ? [{ id: task.assigneeUserId, label: task.assigneeUserId }] : []),
          ]}
        >
          <MemberAvatar member={members.find(member => member.user_id === task.assigneeUserId)} />
          <span className="trunc">
            {members.find(member => member.user_id === task.assigneeUserId)?.name ?? (task.assigneeUserId || t('Sem responsável', 'Unassigned'))}
          </span>
        </TaskFieldControl>
        {task.executorAgentId && (
          <small className="task-executor">{agents.find(agent => agent.id === task.executorAgentId)?.name ?? t('Agente', 'Agent')}</small>
        )}
      </div>
    );
  if (column === 'project')
    return (
      <TaskFieldControl
        triggerLabel={t('Alterar projeto', 'Change project') + ': ' + (task.key ?? task.id)}
        menuLabel={fieldLabel(column, t)}
        fieldId={`${task.id}:${column}`}
        value={task.projectId}
        disabled={disabled}
        onChange={projectId => edit(task, { projectId }, 'move_task')}
        t={t}
        searchLabel={t('Buscar projetos', 'Search projects')}
        choices={projects.map(project => ({
          id: project.id,
          label: project.name,
          icon: <span className="pdot" style={{ '--c': projectTone(project) } as React.CSSProperties} />,
        }))}
      >
        <span
          className="pdot"
          style={
            {
              '--c': projects.find(project => project.id === task.projectId)
                ? projectTone(projects.find(project => project.id === task.projectId)!)
                : 'var(--accent)',
            } as React.CSSProperties
          }
        />
        <span className="trunc">{projects.find(project => project.id === task.projectId)?.name ?? task.projectId}</span>
      </TaskFieldControl>
    );
  if (column === 'due' || column === 'start') {
    const value = (column === 'due' ? task.dueDate : task.startDate) ?? '';
    return (
      <TaskFieldControl
        triggerLabel={(column === 'due' ? t('Alterar prazo', 'Change due date') : t('Alterar início', 'Change start date')) + ': ' + (task.key ?? task.id)}
        menuLabel={fieldLabel(column, t)}
        fieldId={`${task.id}:${column}`}
        date
        value={value}
        disabled={disabled}
        onChange={date => edit(task, { [column === 'due' ? 'dueDate' : 'startDate']: date || null })}
        t={t}
        prefs={prefs}
      >
        <Calendar size={13} />
        <span
          className={`num ${column === 'due' && value && task.status !== 'done' ? (value < iso(new Date()) ? 'date-overdue' : value <= iso(addD(new Date(), 1)) ? 'date-soon' : '') : ''}`}
        >
          {taskDateLabel(value, t, prefs)}
        </span>
      </TaskFieldControl>
    );
  }
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
  if (column === 'labels' && graph) {
    const labels = graph.labels.filter(item => graph.taskLabels.some(link => link.taskId === task.id && link.labelId === item.id));
    return (
      <TaskFieldControl
        triggerLabel={t('Alterar etiquetas', 'Change labels') + ': ' + (task.key ?? task.id)}
        menuLabel={fieldLabel(column, t)}
        value=""
        selectedValues={labels.map(item => item.id)}
        onToggle={(id, selected) => edit(task, { labelId: id }, selected ? 'remove_task_label' : 'set_task_label')}
        onChange={() => {}}
        disabled={disabled}
        t={t}
        searchLabel={t('Filtrar etiquetas', 'Filter labels')}
        choices={graph.labels.map(item => ({
          id: item.id,
          label: labelVisual(item, t).name,
          icon: <span className="pdot" style={{ '--c': labelVisual(item, t).color } as React.CSSProperties} />,
        }))}
      >
        {labels.length ? (
          labels.map(item => (
            <span className="lbl" key={item.id} style={{ '--c': labelVisual(item, t).color } as React.CSSProperties}>
              <i />
              {labelVisual(item, t).name}
            </span>
          ))
        ) : (
          <span className="faint">{t('Adicionar', 'Add')}</span>
        )}
      </TaskFieldControl>
    );
  }
  if (column === 'deps' && graph) {
    const dependencies = graph.dependencies.filter(item => item.taskId === task.id).map(item => item.dependsOnTaskId);
    return (
      <TaskFieldControl
        triggerLabel={t('Alterar dependências', 'Change dependencies') + ': ' + (task.key ?? task.id)}
        menuLabel={fieldLabel(column, t)}
        value=""
        selectedValues={dependencies}
        onToggle={(id, selected) => edit(task, { dependsOnTaskId: id }, selected ? 'remove_task_dependency' : 'set_task_dependency')}
        onChange={() => {}}
        disabled={disabled}
        t={t}
        searchLabel={t('Bloqueada por', 'Blocked by')}
        choices={tasks
          .filter(item => item.id !== task.id)
          .map(item => ({ id: item.id, label: `${item.key ?? ''} ${item.title}`, icon: <TaskStatusIcon status={item.status} /> }))}
      >
        {dependencies.length ? (
          dependencies.map(id => (
            <span className="depchip" key={id}>
              {tasks.find(item => item.id === id)?.key ?? id}
            </span>
          ))
        ) : (
          <span className="faint">—</span>
        )}
      </TaskFieldControl>
    );
  }
  return (
    <Button variant="ghost" aria-label={label} onClick={() => open(task.id)}>
      {metadataStrings(task, column === 'deps' ? 'deps' : 'labels').join(', ') || t('Ver detalhes', 'View details')}
    </Button>
  );
}
