import { Activity, Bot } from 'lucide-react';
import type { DomainEvent, Member, Agent } from '../../workspace/normalized';
import type { Task } from '../../domain/contracts';
import type { Translate } from '../auth/ConsentPage';
export function ActivityPage({
  events,
  members,
  agents,
  t,
  tasks,
  openTask,
}: {
  events: DomainEvent[];
  members: Member[];
  agents: Agent[];
  tasks: Task[];
  t: Translate;
  openTask: (id: string) => void;
}) {
  const verbs: Record<string, string> = {
    create_task: t('criou a tarefa', 'created the task'),
    update_task: t('alterou a tarefa', 'updated the task'),
    complete_task: t('concluiu a tarefa', 'completed the task'),
    intervene_task: t('interveio na tarefa', 'intervened in the task'),
    add_task_comment: t('comentou na tarefa', 'commented on the task'),
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
  return (
    <div className="activity-feed">
      {[...events].reverse().map(event => {
        const taskId = event.payload?.taskId ?? event.entityId,
          task = tasks.find(item => item.id === taskId);
        return (
          <article key={event.id}>
            <span className="activity-avatar">{event.actorAgentId ? <Bot size={16} /> : <Activity size={16} />}</span>
            <div>
              <p>
                <strong>
                  {event.actorAgentId ? t('Agente', 'Agent') : (members.find(m => m.user_id === event.actorUserId)?.name ?? t('Membro', 'Member'))}
                </strong>{' '}
                {verbs[event.operation] ?? event.operation}
                {task && (
                  <>
                    {' '}
                    <button className="inline-link" onClick={() => openTask(task.id)}>
                      {task.title}
                    </button>
                  </>
                )}
              </p>
              {event.actorAgentId && <small>{agents.find(a => a.id === event.actorAgentId)?.name ?? event.actorAgentId}</small>}
              <time dateTime={event.createdAt}>
                {new Intl.DateTimeFormat(document.documentElement.lang, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(event.createdAt))}
              </time>
            </div>
          </article>
        );
      })}
      {!events.length && (
        <p className="work-empty">{t('As alterações de pessoas e agentes aparecerão aqui.', 'Updates from people and agents will appear here.')}</p>
      )}
    </div>
  );
}
