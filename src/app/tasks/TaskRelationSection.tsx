import { useState } from 'react';
import type { Task, Label, TaskDependency, TaskLabel } from '../../domain/contracts';
import type { Translate } from '../auth/ConsentPage';
import type { Execute } from '../projects/ProjectsPage';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
export type DetailAction = (run: () => Promise<unknown>, parent?: boolean) => Promise<void>;
export function TaskRelationSection({
  task,
  tasks,
  labels,
  links,
  dependencies,
  execute,
  action,
  disabled,
  t,
  open,
}: {
  task: Task;
  tasks: Task[];
  labels: Label[];
  links: TaskLabel[];
  dependencies: TaskDependency[];
  execute: Execute;
  action: DetailAction;
  disabled: boolean;
  t: Translate;
  open: (id: string) => void;
}) {
  const [name, setName] = useState(''),
    [newId, setNewId] = useState(() => crypto.randomUUID()),
    [dependency, setDependency] = useState('');
  return (
    <>
      <section className="drawer-section">
        <h3>{t('Etiquetas', 'Labels')}</h3>
        <TaskLabelChoices
          task={task}
          labels={labels}
          links={links}
          disabled={disabled}
          t={t}
          change={(id, selected) =>
            void action(() => execute(selected ? 'remove_task_label' : 'set_task_label', { id: task.id, labelId: id }, task.version), true)
          }
        />
        <form
          className="inline-form"
          onSubmit={e => {
            e.preventDefault();
            void action(async () => {
              await execute('batch', {
                commands: [
                  { operation: 'create_label', input: { id: newId, name } },
                  { operation: 'set_task_label', input: { id: task.id, labelId: newId }, expectedVersion: task.version },
                ],
              });
              setName('');
              setNewId(crypto.randomUUID());
            }, true);
          }}
        >
          <Input
            aria-label={t('Nova etiqueta', 'New label')}
            value={name}
            onChange={e => setName(e.target.value)}
            required
            maxLength={500}
            disabled={disabled}
          />
          <Button type="submit" variant="outline" disabled={disabled}>
            {t('Criar e aplicar etiqueta', 'Create and apply label')}
          </Button>
        </form>
      </section>
      <section className="drawer-section">
        <h3>{t('Dependências', 'Dependencies')}</h3>
        {dependencies
          .filter(d => d.taskId === task.id)
          .map(d => (
            <div className="subtask-row" key={d.dependsOnTaskId}>
              <Button variant="ghost" onClick={() => open(d.dependsOnTaskId)}>
                {tasks.find(x => x.id === d.dependsOnTaskId)?.title ?? d.dependsOnTaskId}
              </Button>
              <Button
                variant="ghost"
                disabled={disabled}
                onClick={() => void action(() => execute('remove_task_dependency', { id: task.id, dependsOnTaskId: d.dependsOnTaskId }, task.version), true)}
              >
                {t('Desvincular dependência', 'Unlink dependency')}
              </Button>
            </div>
          ))}
        <form
          className="inline-form"
          onSubmit={e => {
            e.preventDefault();
            void action(async () => {
              await execute('set_task_dependency', { id: task.id, dependsOnTaskId: dependency }, task.version);
              setDependency('');
            }, true);
          }}
        >
          <select
            aria-label={t('Adicionar dependência', 'Add dependency')}
            required
            value={dependency}
            onChange={e => setDependency(e.target.value)}
            disabled={disabled}
          >
            <option value="">{t('Selecionar tarefa', 'Select task')}</option>
            {tasks
              .filter(x => x.id !== task.id && !dependencies.some(d => d.taskId === task.id && d.dependsOnTaskId === x.id))
              .map(x => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
          </select>
          <Button type="submit" variant="outline" disabled={disabled}>
            {t('Vincular tarefa', 'Link task')}
          </Button>
        </form>
        {dependencies
          .filter(d => d.dependsOnTaskId === task.id)
          .map(d => (
            <p className="configuration-note" key={d.taskId}>
              {t('Desvincule na tarefa dependente antes de excluir:', 'Unlink in the dependent task before deleting:')}
              <Button variant="ghost" onClick={() => open(d.taskId)}>
                {tasks.find(x => x.id === d.taskId)?.title ?? d.taskId}
              </Button>
            </p>
          ))}
      </section>
    </>
  );
}
export function TaskLabelChoices({
  task,
  labels,
  links,
  disabled,
  t,
  change,
}: {
  task: Task;
  labels: Label[];
  links: TaskLabel[];
  disabled: boolean;
  t: Translate;
  change: (id: string, selected: boolean) => void;
}) {
  return (
    <div className="task-label-choices">
      {labels.map(label => {
        const selected = links.some(link => link.taskId === task.id && link.labelId === label.id);
        return (
          <label key={label.id}>
            <input
              type="checkbox"
              aria-label={t('Etiqueta: ', 'Label: ') + label.name}
              checked={selected}
              disabled={disabled}
              onChange={() => change(label.id, selected)}
            />
            {label.name}
          </label>
        );
      })}
    </div>
  );
}
