import { Bot } from 'lucide-react';
import { PersonAvatar } from '../panel/PanelVisual';
import type { DomainEvent, Member, Agent } from '../../workspace/normalized';
import type { Task, Project, ActivityEntry } from '../../domain/contracts';
import type { Translate } from '../auth/ConsentPage';
export function ActivityPage({
  events,
  members,
  agents,
  t,
  tasks,
  openTask,
  history = [],
  projects = [],
  openProject,
  limit,
  grouped = false,
  actorId,
  contextProjectId,
}: {
  events: DomainEvent[];
  members: Member[];
  agents: Agent[];
  tasks: Task[];
  t: Translate;
  openTask: (id: string) => void;
  history?: ActivityEntry[];
  projects?: Project[];
  openProject?: (id: string) => void;
  limit?: number;
  grouped?: boolean;
  actorId?: string;
  contextProjectId?: string;
}) {
  const verbs: Record<string, string> = {
    create_task: t('criou a tarefa', 'created the task'),
    update_task: t('alterou a tarefa', 'updated the task'),
    complete_task: t('concluiu a tarefa', 'completed the task'),
    intervene_task: t('interveio na tarefa', 'intervened in the task'),
    add_task_comment: t('comentou em', 'commented on'),
    delete_comment: t('excluiu um comentário', 'deleted a comment'),
    claim_task: t('reservou a execução', 'reserved execution'),
    release_task_claim: t('liberou a execução', 'released execution'),
    create_project: t('criou um projeto', 'created a project'),
    update_project: t('alterou um projeto', 'updated a project'),
    archive_project: t('arquivou o projeto', 'archived the project'),
    restore_project: t('restaurou o projeto', 'restored the project'),
    delete_project: t('excluiu o projeto', 'deleted the project'),
    set_project_member: t('adicionou um membro ao projeto', 'added a project member'),
    remove_project_member: t('removeu um membro do projeto', 'removed a project member'),
    local_project_sharing: t('alterou o compartilhamento local', 'updated local sharing'),
    create_view: t('salvou uma visualização', 'saved a view'),
    update_view: t('renomeou uma visualização', 'renamed a view'),
    delete_view: t('excluiu uma visualização', 'deleted a view'),
    duplicate_task_graph: t('duplicou a tarefa', 'duplicated the task'),
    update_workspace: t('alterou o espaço de trabalho', 'updated the workspace'),
    create_team: t('criou uma equipe', 'created a team'),
    update_team: t('alterou uma equipe', 'updated a team'),
    delete_team: t('excluiu uma equipe', 'deleted a team'),
    set_team_member: t('adicionou uma pessoa à equipe', 'added a team member'),
    remove_team_member: t('removeu uma pessoa da equipe', 'removed a team member'),
    local_update_profile: t('alterou o perfil local', 'updated the local profile'),
    local_workspace_member: t('alterou um membro local', 'updated a local member'),
    local_demo_setting: t('alterou uma configuração da demonstração', 'updated a demo setting'),
    local_reset_demo: t('restaurou os dados da demonstração', 'reset the demo data'),
    set_preferences: t('alterou suas preferências', 'updated their preferences'),
  };
  const records = [
    ...events.map(event => ({
      id: 'event:' + event.id,
      createdAt: event.createdAt,
      actorUserId: event.actorUserId,
      actorAgentId: event.actorAgentId,
      verb: verbs[event.operation] ?? event.operation,
      taskId: event.payload.taskId ?? (tasks.some(task => task.id === event.entityId) ? event.entityId : null),
      projectId: event.payload.projectId ?? (projects.some(project => project.id === event.entityId) ? event.entityId : null),
      extra: '',
      historical: false,
    })),
    ...history.map(entry => ({
      id: 'history:' + entry.id,
      createdAt: entry.createdAt,
      actorUserId: entry.actorUserId,
      actorAgentId: null,
      verb: entry.verb,
      taskId: entry.taskId,
      projectId: entry.projectId,
      extra: String(entry.legacyMetadata.extra ?? ''),
      historical: true,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || Number(b.historical) - Number(a.historical));
  const shown = limit ? records.slice(0, limit) : records;
  const bucket = (date: string) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const then = new Date(date);
    then.setHours(0, 0, 0, 0);
    const days = Math.round((now.valueOf() - then.valueOf()) / 86400000);
    return days === 0 ? t('Hoje', 'Today') : days === 1 ? t('Ontem', 'Yesterday') : days < 7 ? t('Esta semana', 'This week') : t('Anterior', 'Earlier');
  };
  const groups = new Map<string, typeof shown>();
  for (const record of shown) {
    const key = grouped ? bucket(record.createdAt) : '';
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return (
    <div className="activity-feed">
      {[...groups].map(([label, rows]) => (
        <section className="activity-day" key={label}>
          {label && <h3 className="day-h">{label}</h3>}
          <div className="feed lined">
            {rows.map(record => {
              const task = tasks.find(task => task.id === record.taskId),
                project = projects.find(project => project.id === (record.projectId ?? task?.projectId));
              return (
                <article className={'fitem' + (record.historical ? ' panel-row' : '')} key={record.id}>
                  <span className="activity-avatar">
                    {record.actorAgentId ? <Bot size={16} /> : <PersonAvatar member={members.find(member => member.user_id === record.actorUserId)} />}
                  </span>
                  <div className="grow">
                    <b>
                      {record.actorAgentId
                        ? (agents.find(agent => agent.id === record.actorAgentId)?.name ?? t('Agente', 'Agent'))
                        : record.actorUserId === actorId
                          ? t('Você', 'You')
                          : (members.find(member => member.user_id === record.actorUserId)?.name ?? t('Membro', 'Member'))}
                    </b>{' '}
                    <span className="muted">{record.verb}</span>{' '}
                    {task ? (
                      <a
                        className="inline-link obj"
                        href={taskLink(task.id)}
                        onClick={event => {
                          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                          event.preventDefault();
                          openTask(task.id);
                        }}
                      >
                        {task.title}
                      </a>
                    ) : project && openProject ? (
                      <a
                        className="inline-link obj"
                        href={projectLink(project)}
                        onClick={event => {
                          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                          event.preventDefault();
                          openProject(project.id);
                        }}
                      >
                        {project.name}
                      </a>
                    ) : project ? (
                      <span className="obj">{project.name}</span>
                    ) : null}
                    {record.extra && (
                      <>
                        {' '}
                        <span className="muted">{record.extra}</span>
                      </>
                    )}
                    {task && project && !contextProjectId && (
                      <>
                        {' '}
                        <span className="faint">
                          {t('em', 'in')} {project.name}
                        </span>
                      </>
                    )}
                  </div>
                  <time dateTime={record.createdAt}>{activityTime(record.createdAt, t)}</time>
                </article>
              );
            })}
          </div>
        </section>
      ))}
      {!shown.length && (
        <p className="work-empty">{t('As alterações de pessoas e agentes aparecerão aqui.', 'Updates from people and agents will appear here.')}</p>
      )}
    </div>
  );
}
function taskLink(id: string) {
  const query = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
  query.set('task', id);
  return '?' + query;
}
function projectLink(project: Project) {
  const prefix = typeof location !== 'undefined' && location.pathname.startsWith('/app-local/') ? '/app-local' : '/app';
  return `${prefix}/w/${encodeURIComponent(project.workspaceId)}/project?project=${encodeURIComponent(project.id)}`;
}
function activityTime(value: string, t: Translate) {
  const date = new Date(value),
    minutes = Math.round((Date.now() - date.valueOf()) / 60000);
  if (minutes < 1) return t('agora', 'just now');
  if (minutes < 60) return `${minutes}m ${t('atrás', 'ago')}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ${t('atrás', 'ago')}`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ${t('atrás', 'ago')}`;
  return date.toLocaleDateString(t('pt-BR', 'en'), { month: 'short', day: 'numeric' });
}
