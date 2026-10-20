import { Circle, CircleCheck, CircleDot, Bot, List, Columns3 } from 'lucide-react';
import type { Task, Project } from '../../domain/contracts';
import type { Agent, Member } from '../../workspace/normalized';
import type { Translate } from '../auth/ConsentPage';
import { Button } from '../../components/ui/button';
export const statuses = ['backlog', 'todo', 'progress', 'review', 'done'] as const;
export function statusLabel(status: string, t: Translate) {
  return (
    (
      {
        backlog: t('Backlog', 'Backlog'),
        todo: t('A fazer', 'To do'),
        progress: t('Em andamento', 'In progress'),
        review: t('Em revisão', 'In review'),
        done: t('Concluídas', 'Done'),
      } as Record<string, string>
    )[status] ?? status
  );
}
export function priorityLabel(priority: string, t: Translate) {
  return (
    (
      {
        none: t('Sem prioridade', 'No priority'),
        low: t('Baixa', 'Low'),
        medium: t('Média', 'Medium'),
        high: t('Alta', 'High'),
        urgent: t('Urgente', 'Urgent'),
      } as Record<string, string>
    )[priority] ?? priority
  );
}
export function TaskList({
  tasks,
  projects,
  agents,
  members,
  board,
  href,
  open,
  view,
  t,
  canCreate,
}: {
  tasks: Task[];
  projects: Project[];
  agents: Agent[];
  members: Member[];
  board: boolean;
  href: (params: Record<string, string>) => string;
  open: (id: string) => void;
  view: (href: string) => void;
  t: Translate;
  canCreate: boolean;
}) {
  const label = (task: Task) =>
    task.executorAgentId
      ? (agents.find(a => a.id === task.executorAgentId)?.name ?? t('Agente', 'Agent'))
      : (members.find(m => m.user_id === task.assigneeUserId)?.name ?? t('Sem responsável', 'Unassigned'));
  const icon = (task: Task) =>
    task.status === 'done' ? <CircleCheck size={16} /> : task.status === 'progress' ? <CircleDot size={16} /> : <Circle size={16} />;
  return (
    <>
      <div className="work-toolbar">
        <div className="view-tabs">
          {[
            [false, t('Lista', 'List'), List],
            [true, t('Quadro', 'Board'), Columns3],
          ].map(([isBoard, name, Icon]) => {
            const I = Icon as typeof List;
            return (
              <a
                key={String(isBoard)}
                href={href({ view: isBoard ? 'board' : 'list' })}
                aria-current={board === isBoard ? 'page' : undefined}
                onClick={e => {
                  e.preventDefault();
                  view(e.currentTarget.href);
                }}
              >
                <I size={15} />
                {String(name)}
              </a>
            );
          })}
        </div>
        <span>
          {tasks.length} {t('tarefas', 'tasks')}
        </span>
      </div>
      {!tasks.length ? (
        <div className="work-empty">
          <CircleCheck size={28} />
          <h2>{t('Nenhuma tarefa por aqui', 'No tasks here yet')}</h2>
          <p>
            {canCreate
              ? t('Crie uma tarefa para começar o trabalho.', 'Create a task to start working.')
              : t('As tarefas desta organização aparecerão aqui.', 'Workspace tasks will appear here.')}
          </p>
        </div>
      ) : board ? (
        <div className="task-board">
          {statuses.map(status => (
            <section key={status} className="board-column">
              <h2>
                <span className={`status-dot status-${status}`} />
                {statusLabel(status, t)}
                <small>{tasks.filter(task => task.status === status).length}</small>
              </h2>
              {tasks
                .filter(task => task.status === status)
                .map(task => (
                  <button className="task-card" key={task.id} onClick={() => open(task.id)}>
                    <small>{task.key}</small>
                    <strong>{task.title}</strong>
                    <span>{priorityLabel(task.priority, t)}</span>
                    <footer>
                      {task.executorAgentId && <Bot size={14} />} {label(task)}
                    </footer>
                  </button>
                ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="task-table" role="table" aria-label={t('Tarefas', 'Tasks')}>
          <div className="task-row task-head" role="row">
            <span role="columnheader">{t('Título', 'Title')}</span>
            <span role="columnheader">{t('Projeto', 'Project')}</span>
            <span role="columnheader">{t('Prioridade', 'Priority')}</span>
            <span role="columnheader">{t('Responsável', 'Assignee')}</span>
            <span role="columnheader">{t('Prazo', 'Due date')}</span>
          </div>
          {tasks.map(task => (
            <div className="task-row" role="row" key={task.id}>
              <span role="cell" className="task-title-cell">
                <Button variant="ghost" className="task-title" onClick={() => open(task.id)}>
                  {icon(task)}
                  <small>{task.key}</small>
                  <span>{task.title}</span>
                </Button>
              </span>
              <span role="cell" className="task-project">
                {projects.find(p => p.id === task.projectId)?.name ?? task.projectId}
              </span>
              <span role="cell" className={`priority priority-${task.priority}`}>
                {priorityLabel(task.priority, t)}
              </span>
              <span role="cell" className="task-assignee">
                {task.executorAgentId && <Bot size={14} />} {label(task)}
              </span>
              <span role="cell">
                {task.dueDate
                  ? new Intl.DateTimeFormat(document.documentElement.lang, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
                      new Date(task.dueDate + 'T00:00:00Z'),
                    )
                  : t('Sem prazo', 'No due date')}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
