import type { Project, Task } from '../../domain/contracts';
import type { Member } from '../../workspace/normalized';
import type { Translate } from '../auth/ConsentPage';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { columns, metadataStrings, priorities, taskStatuses, type TaskView } from './task-view-model';
import { priorityLabel, statusLabel } from './TaskList';
export function fieldLabel(field: string, t: Translate) {
  return (
    {
      title: t('Título', 'Title'),
      status: t('Status', 'Status'),
      priority: t('Prioridade', 'Priority'),
      assignee: t('Responsável', 'Assignee'),
      project: t('Projeto', 'Project'),
      due: t('Prazo', 'Due date'),
      start: t('Início', 'Start date'),
      created: t('Criada em', 'Created'),
      updated: t('Atualizada em', 'Updated'),
      labels: t('Etiquetas', 'Labels'),
      deps: t('Dependências', 'Dependencies'),
      estimate: t('Estimativa', 'Estimate'),
      none: t('Nenhum', 'None'),
      manual: t('Manual', 'Manual'),
    }[field] ?? field
  );
}
export function groupLabel(key: string, group: string, projects: Project[], members: Member[], t: Translate): string {
  return group === 'status'
    ? statusLabel(key, t)
    : group === 'priority'
      ? priorityLabel(key, t)
      : group === 'project'
        ? (projects.find(p => p.id === key)?.name ?? key)
        : group === 'assignee'
          ? (members.find(m => m.user_id === key)?.name ?? (key === 'none' ? t('Sem responsável', 'Unassigned') : key))
          : ({
              overdue: t('Atrasadas', 'Overdue'),
              today: t('Hoje', 'Today'),
              week: t('Próximos 7 dias', 'Next 7 days'),
              later: t('Mais tarde', 'Later'),
              nodate: t('Sem prazo', 'No due date'),
              all: t('Todas as tarefas', 'All tasks'),
            }[key] ?? key);
}
export function TaskViewToolbar({
  view,
  setView,
  projects,
  members,
  tasks,
  t,
  table,
}: {
  view: TaskView;
  setView: (v: TaskView) => void;
  projects: Project[];
  members: Member[];
  tasks: Task[];
  t: Translate;
  table: boolean;
}) {
  const options = (f: string) =>
    f === 'status'
      ? taskStatuses.map(id => ({ id, name: statusLabel(id, t) }))
      : f === 'priority'
        ? priorities.map(id => ({ id, name: priorityLabel(id, t) }))
        : f === 'assignee'
          ? [{ id: 'none', name: t('Sem responsável', 'Unassigned') }, ...members.map(m => ({ id: m.user_id, name: m.name }))]
          : f === 'project'
            ? projects.map(p => ({ id: p.id, name: p.name }))
            : f === 'due'
              ? ['overdue', 'today', 'week', 'later', 'nodate'].map(id => ({ id, name: groupLabel(id, 'due', projects, members, t) }))
              : f === 'labels'
                ? [...new Set(tasks.flatMap(task => metadataStrings(task, 'labels')))].map(id => ({ id, name: id }))
                : ['1', '7', '30'].map(id => ({ id, name: t(`Últimos ${id} dias`, `Last ${id} days`) }));
  const patch = (next: Partial<TaskView>) => setView({ ...view, ...next });
  return (
    <div className="task-view-tools" aria-label={t('Controles da visualização', 'View controls')}>
      <Input
        aria-label={t('Buscar tarefas', 'Search tasks')}
        placeholder={t('Buscar tarefas...', 'Search tasks...')}
        value={view.q}
        onChange={e => patch({ q: e.target.value })}
      />
      <details className="view-options">
        <summary>
          {t('Filtros', 'Filters')} ({view.filters.length})
        </summary>
        <div className="view-options-body">
          {view.filters.map((filter, index) => (
            <div className="filter-editor" key={index}>
              <select
                aria-label={t('Campo do filtro', 'Filter field') + ` ${index + 1}`}
                value={filter.f}
                onChange={e => patch({ filters: view.filters.map((f, i) => (i === index ? { ...f, f: e.target.value, v: [] } : f)) })}
              >
                {['status', 'priority', 'assignee', 'project', 'due', 'labels', 'created', 'updated'].map(f => (
                  <option key={f} value={f}>
                    {fieldLabel(f, t)}
                  </option>
                ))}
              </select>
              <select
                aria-label={t('Operador do filtro', 'Filter operator') + ` ${index + 1}`}
                value={filter.op}
                onChange={e => patch({ filters: view.filters.map((f, i) => (i === index ? { ...f, op: e.target.value as 'is' | 'not' } : f)) })}
              >
                <option value="is">{t('é', 'is')}</option>
                <option value="not">{t('não é', 'is not')}</option>
              </select>
              <fieldset>
                <legend className="sr-only">{t('Valores do filtro', 'Filter values') + ` ${index + 1}`}</legend>
                {options(filter.f).map(o => (
                  <label key={o.id}>
                    <input
                      type="checkbox"
                      checked={filter.v.includes(o.id)}
                      onChange={e =>
                        patch({
                          filters: view.filters.map((f, i) =>
                            i === index ? { ...f, v: e.target.checked ? [...f.v, o.id] : f.v.filter(id => id !== o.id) } : f,
                          ),
                        })
                      }
                    />
                    {o.name}
                  </label>
                ))}
              </fieldset>
              <Button variant="ghost" onClick={() => patch({ filters: view.filters.filter((_, i) => i !== index) })}>
                {t('Remover filtro', 'Remove filter')}
              </Button>
            </div>
          ))}
          <Button variant="outline" onClick={() => patch({ filters: [...view.filters, { f: 'status', op: 'is', v: [] }] })}>
            {t('Adicionar filtro', 'Add filter')}
          </Button>
          <Button variant="ghost" onClick={() => patch({ filters: [], q: '' })}>
            {t('Limpar filtros', 'Clear filters')}
          </Button>
        </div>
      </details>
      <label>
        {t('Ordenar', 'Sort')}
        <select aria-label={t('Ordenar', 'Sort')} value={view.sort.f} onChange={e => patch({ sort: { ...view.sort, f: e.target.value } })}>
          {['manual', 'title', 'due', 'start', 'priority', 'status', 'assignee', 'project', 'created', 'updated', 'estimate'].map(f => (
            <option key={f} value={f}>
              {fieldLabel(f, t)}
            </option>
          ))}
        </select>
      </label>
      <Button variant="ghost" aria-label={t('Inverter ordem', 'Reverse sort')} onClick={() => patch({ sort: { ...view.sort, dir: -view.sort.dir } })}>
        {view.sort.dir === 1 ? '↑' : '↓'}
      </Button>
      <label>
        {t('Agrupar', 'Group')}
        <select aria-label={t('Agrupar', 'Group')} value={view.group} onChange={e => patch({ group: e.target.value })}>
          {['status', 'priority', 'assignee', 'project', 'due', 'none'].map(f => (
            <option key={f} value={f}>
              {fieldLabel(f, t)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input type="checkbox" checked={view.showDone} onChange={e => patch({ showDone: e.target.checked })} />
        {t('Mostrar concluídas', 'Show completed')}
      </label>
      {table && (
        <details className="view-options">
          <summary>{t('Colunas', 'Columns')}</summary>
          <div className="view-options-body">
            {columns.map(c => (
              <div key={c}>
                <label>
                  <input
                    type="checkbox"
                    aria-label={t('Mostrar coluna', 'Show column') + ': ' + fieldLabel(c, t)}
                    disabled={c === 'title'}
                    checked={c === 'title' || !view.hidden.includes(c)}
                    onChange={e => patch({ hidden: e.target.checked ? view.hidden.filter(x => x !== c) : [...view.hidden, c] })}
                  />
                  {fieldLabel(c, t)}
                </label>
                <input
                  type="range"
                  min="64"
                  max="800"
                  step="8"
                  value={view.colW[c] ?? (c === 'title' ? 300 : 150)}
                  aria-label={t('Largura', 'Width') + ': ' + fieldLabel(c, t)}
                  onChange={e => patch({ colW: { ...view.colW, [c]: Number(e.target.value) } })}
                />
              </div>
            ))}
            <Button variant="ghost" onClick={() => patch({ hidden: ['start', 'created', 'deps'], colW: {} })}>
              {t('Restaurar colunas', 'Reset columns')}
            </Button>
          </div>
        </details>
      )}
      {view.filters.length > 0 && (
        <div className="view-filter-chips">
          {view.filters.map((f, i) => (
            <Button key={i} variant="outline" onClick={() => patch({ filters: view.filters.filter((_, n) => n !== i) })}>
              {fieldLabel(f.f, t)} {f.op === 'not' ? t('não é', 'is not') : t('é', 'is')}{' '}
              {f.v.map(v => options(f.f).find(o => o.id === v)?.name ?? v).join(', ') || t('qualquer', 'any')} ×
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
