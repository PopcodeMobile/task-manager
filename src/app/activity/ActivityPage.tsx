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
