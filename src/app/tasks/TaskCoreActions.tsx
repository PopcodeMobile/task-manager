import { useEffect, useState } from 'react';
import type { Project, Task } from '../../domain/contracts';
import type { Translate } from '../auth/ConsentPage';
import { Button } from '../../components/ui/button';
export function TaskCoreActions({
  task,
  projects,
  t,
  disabled,
  run,
}: {
  task: Task;
  projects: Project[];
  t: Translate;
  disabled: boolean;
  run: (operation: string, input: Record<string, unknown>, after?: 'open' | 'close') => void;
}) {
  const [project, setProject] = useState(task.projectId);
  useEffect(() => setProject(task.projectId), [task.projectId]);
  return (
    <section className="drawer-section">
      <h3>{t('Ações da tarefa', 'Task actions')}</h3>
      <label className="form-field">
        {t('Mover para projeto', 'Move to project')}
        <select aria-label={t('Projeto de destino', 'Destination project')} value={project} disabled={disabled} onChange={e => setProject(e.target.value)}>
          {projects.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="button-row">
        <Button variant="outline" disabled={disabled || project === task.projectId} onClick={() => run('move_task', { projectId: project })}>
          {t('Mover tarefa', 'Move task')}
        </Button>
        <Button variant="outline" disabled={disabled} onClick={() => run('duplicate_task', {}, 'open')}>
          {t('Duplicar tarefa', 'Duplicate task')}
        </Button>
        <Button variant="outline" disabled={disabled} onClick={() => run(task.archived ? 'restore_task' : 'archive_task', {}, 'close')}>
          {task.archived ? t('Restaurar tarefa', 'Restore task') : t('Arquivar tarefa', 'Archive task')}
        </Button>
        {task.status === 'done' && (
          <Button variant="outline" disabled={disabled} onClick={() => run('update_task', { status: 'todo' })}>
            {t('Reabrir tarefa', 'Reopen task')}
          </Button>
        )}
      </div>
    </section>
  );
}
