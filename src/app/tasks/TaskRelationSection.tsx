import { useState } from 'react';
import type { Task, Label, TaskDependency, TaskLabel } from '../../domain/contracts';
import type { Translate } from '../auth/ConsentPage';
import type { Execute } from '../projects/ProjectsPage';
import { Tag, Link2 } from 'lucide-react';
import { TaskFieldControl } from './TaskFieldPopover';
import { TaskStatusIcon, labelVisual } from './TaskVisual';
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
    [newId, setNewId] = useState(() => crypto.randomUUID());
  const chosenLabels = labels.filter(label => links.some(link => link.taskId === task.id && link.labelId === label.id));
  const chosenDependencies = dependencies.filter(link => link.taskId === task.id).map(link => link.dependsOnTaskId);
  return (
    <>
      <div className="task-property">
        <span>
          <Tag size={14} />
          {t('Etiquetas', 'Labels')}
        </span>
        <TaskFieldControl
          triggerLabel={t('Alterar etiquetas', 'Change labels') + ': ' + (task.key ?? task.id)}
          menuLabel={t('Etiquetas', 'Labels')}
          value=""
          selectedValues={chosenLabels.map(label => label.id)}
          disabled={disabled}
          t={t}
          onChange={() => {}}
          searchLabel={t('Filtrar etiquetas', 'Filter labels')}
          choices={labels.map(label => ({
            id: label.id,
            label: labelVisual(label, t).name,
            icon: <span className="pdot" style={{ '--c': labelVisual(label, t).color } as React.CSSProperties} />,
          }))}
          onToggle={(id, selected) =>
            void action(() => execute(selected ? 'remove_task_label' : 'set_task_label', { id: task.id, labelId: id }, task.version), true)
          }
          footer={
            <form
              className="task-label-create"
              onSubmit={event => {
                event.preventDefault();
                event.stopPropagation();
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
                onChange={event => setName(event.target.value)}
                required
                maxLength={500}
                disabled={disabled}
              />
              <Button type="submit" variant="ghost" disabled={disabled}>
                {t('Criar e aplicar etiqueta', 'Create and apply label')}
              </Button>
            </form>
          }
        >
          {chosenLabels.length ? (
            chosenLabels.map(label => (
              <span className="lbl" key={label.id} style={{ '--c': labelVisual(label, t).color } as React.CSSProperties}>
                <i />
                {labelVisual(label, t).name}
              </span>
            ))
          ) : (
            <span className="faint">{t('Adicionar', 'Add')}</span>
          )}
        </TaskFieldControl>
      </div>
      <div className="task-property">
        <span>
          <Link2 size={14} />
          {t('Bloqueada por', 'Blocked by')}
        </span>
        <TaskFieldControl
          triggerLabel={t('Alterar dependências', 'Change dependencies') + ': ' + (task.key ?? task.id)}
          menuLabel={t('Dependências', 'Dependencies')}
          value=""
          selectedValues={chosenDependencies}
          disabled={disabled}
          t={t}
          onChange={() => {}}
          searchLabel={t('Bloqueada por', 'Blocked by')}
          choices={tasks
            .filter(item => item.id !== task.id)
            .map(item => ({ id: item.id, label: `${item.key ?? ''} ${item.title}`, icon: <TaskStatusIcon status={item.status} /> }))}
          onToggle={(id, selected) =>
            void action(() => execute(selected ? 'remove_task_dependency' : 'set_task_dependency', { id: task.id, dependsOnTaskId: id }, task.version), true)
          }
          footer={
            chosenDependencies.length > 0 ? (
              <div className="task-dependency-links">
                {chosenDependencies.map(id => (
                  <Button key={id} type="button" variant="ghost" onClick={() => open(id)}>
                    {t('Abrir', 'Open')} {tasks.find(item => item.id === id)?.key ?? id}
                  </Button>
                ))}
              </div>
            ) : undefined
          }
        >
          {chosenDependencies.length ? (
            chosenDependencies.map(id => (
              <span className="depchip" key={id}>
                {tasks.find(item => item.id === id)?.key ?? id}
              </span>
            ))
          ) : (
            <span className="faint">—</span>
          )}
        </TaskFieldControl>
      </div>
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
