import { Bot, CircleDot } from 'lucide-react';
import type { Agent } from '../../workspace/normalized';
import type { Task } from '../../domain/contracts';
import type { Translate } from '../auth/ConsentPage';
import { Button } from '../../components/ui/button';
export function AgentsPage({ agents, tasks, t, openTask }: { agents: Agent[]; tasks: Task[]; t: Translate; openTask: (id: string) => void }) {
  return (
    <div className="agent-list">
      {agents.map(agent => {
        const assigned = tasks.filter(task => task.executorAgentId === agent.id && !task.archived);
        return (
          <article className="agent-card" key={agent.id}>
            <div className="agent-heading">
              <span className="project-icon">
                <Bot size={20} />
              </span>
              <div>
                <h2>{agent.name}</h2>
                <small>{agent.clientId ? t('Conectado por aplicativo', 'Connected through an app') : t('Executor do workspace', 'Workspace executor')}</small>
              </div>
              <span className="count-badge">{assigned.length}</span>
            </div>
            {assigned.map(task => (
              <Button variant="ghost" key={task.id} className="agent-task" onClick={() => openTask(task.id)}>
                <span>{task.title}</span>
                <small>
                  <CircleDot size={12} />
                  {task.reservation?.active && Date.parse(task.reservation.expiresAt) > Date.now()
                    ? t('Reserva ativa', 'Active reservation')
                    : task.reservation
                      ? t('Reserva expirada', 'Expired reservation')
                      : t('Atribuído', 'Assigned')}
                </small>
              </Button>
            ))}
            {!assigned.length && <p>{t('Sem tarefas atribuídas.', 'No assigned tasks.')}</p>}
          </article>
        );
      })}
      {!agents.length && (
        <div className="work-empty">
          <Bot size={28} />
          <h2>{t('Nenhum agente conectado', 'No connected agents')}</h2>
          <p>
            {t('Conecte um aplicativo para disponibilizar seus agentes nesta organização.', 'Connect an app to make its agents available in this workspace.')}
          </p>
        </div>
      )}
    </div>
  );
}
