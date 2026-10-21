import { useEffect, useState } from 'react';
import type { Project, Task, Json } from '../../domain/contracts';
import type { Translate } from '../auth/ConsentPage';
import { Button } from '../../components/ui/button';
export function coreTaskLabels(t: Translate) {
  return {
    complete_task: t('Concluir tarefa', 'Complete task'),
    move_task: t('Mover tarefa', 'Move task'),
    duplicate_task: t('Duplicar tarefa', 'Duplicate task'),
    archive_task: t('Arquivar tarefa', 'Archive task'),
    restore_task: t('Restaurar tarefa', 'Restore task'),
    reopen: t('Reabrir tarefa', 'Reopen task'),
    delete_task: t('Excluir tarefa…', 'Delete task…'),
  };
}
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
  run: (operation: string, input: Record<string, Json>, after?: 'open' | 'close') => void;
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
          {coreTaskLabels(t).move_task}
        </Button>
        <Button variant="outline" disabled={disabled} onClick={() => run('duplicate_task', {}, 'open')}>
          {coreTaskLabels(t).duplicate_task}
        </Button>
        <Button variant="outline" disabled={disabled} onClick={() => run(task.archived ? 'restore_task' : 'archive_task', {}, 'close')}>
          {task.archived ? coreTaskLabels(t).restore_task : coreTaskLabels(t).archive_task}
        </Button>
        {task.status === 'done' && (
          <Button variant="outline" disabled={disabled} onClick={() => run('update_task', { status: 'todo' })}>
            {coreTaskLabels(t).reopen}
          </Button>
        )}
      </div>
    </section>
  );
}
