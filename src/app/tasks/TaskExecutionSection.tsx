import { Bot, Check } from 'lucide-react';
import type { Task } from '../../domain/contracts';
import type { Agent } from '../../workspace/normalized';
import type { Translate } from '../auth/ConsentPage';
import { Button } from '../../components/ui/button';
export function TaskExecutionSection({
  current,
  active,
  agent,
  agents,
  setAgent,
  readOnly,
  busy,
  t,
  onAssign,
  onResume,
  onComplete,
}: {
  current: Task;
  active: boolean;
  agent: string;
  agents: Agent[];
  setAgent: (id: string) => void;
  readOnly: boolean;
  busy: boolean;
  t: Translate;
  onAssign: () => void;
  onResume: () => void;
  onComplete: () => void;
}) {
  return (
    <section className="drawer-section">
      <h3>
        <Bot size={16} />
        {t('Execução', 'Execution')}
      </h3>
      <p className={active ? 'reservation-warning' : 'permission-note'}>
        {active
          ? t('Execução reservada', 'Execution reserved')
          : current.executorAgentId
            ? t('Atribuído, sem reserva ativa', 'Assigned, no active reservation')
            : t('Sem agente executor', 'No executor agent')}
      </p>
      {current.execution?.state === 'blocked' && (
        <p role="status">
          {current.execution.active && active
            ? t('Execução bloqueada: ', 'Execution blocked: ')
            : t('Bloqueio anterior, sem execução ativa: ', 'Previous block, no active execution: ')}
          {current.execution.reason}
        </p>
      )}
      {current.reservation && (
        <p className="permission-note">
          {active ? t('Reserva até', 'Reserved until') : t('Reserva expirada em', 'Reservation expired on')}{' '}
          {new Intl.DateTimeFormat(document.documentElement.lang, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(current.reservation.expiresAt))}
        </p>
      )}
      <label className="form-field">
        {t('Agente executor', 'Executor agent')}
        <select value={agent} onChange={e => setAgent(e.target.value)} disabled={readOnly || busy}>
          <option value="">{t('Nenhum', 'None')}</option>
          {agents.map(a => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <div className="button-row">
        <Button variant="outline" disabled={busy || readOnly || !agent} onClick={onAssign}>
          {t('Atribuir agente', 'Assign agent')}
        </Button>
        <Button variant="outline" disabled={busy || readOnly || (!current.executorAgentId && !active)} onClick={onResume}>
          {t('Retomar controle humano', 'Resume human control')}
        </Button>
        <Button variant="outline" disabled={busy || readOnly || active || current.status === 'done'} onClick={onComplete}>
          <Check size={15} />
          {t('Concluir tarefa', 'Complete task')}
        </Button>
      </div>
      {active && (
        <p className="permission-note">
          {t(
            'A conclusão está bloqueada enquanto o agente tem a reserva. A retomada libera a execução e registra sua intervenção.',
            'Completion is blocked while the agent holds its reservation. Resuming releases execution and records your intervention.',
          )}
        </p>
      )}
    </section>
  );
}
