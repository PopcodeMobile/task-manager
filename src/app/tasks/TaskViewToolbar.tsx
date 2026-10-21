import { useRef, useState, type ReactNode } from 'react';
import { AnchoredSurface } from './AnchoredSurface';
import { TaskFieldControl } from './TaskFieldPopover';
import {
  Filter,
  ArrowUp,
  ArrowDown,
  Group,
  ChevronDown,
  Trash2,
  Tag,
  User,
  Calendar,
  Folder,
  Circle,
  Flag,
  Clock,
  Search,
  ArrowUpDown,
  CircleDot,
  SignalHigh,
  Minus,
} from 'lucide-react';
import type { Project, Task } from '../../domain/contracts';
import type { Member } from '../../workspace/normalized';
import type { Translate } from '../auth/ConsentPage';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { columns, metadataStrings, priorities, taskStatuses, type TaskView, defaultTaskColumnWidths } from './task-view-model';
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
  grouping = true,
  right,
  extra,
  selectionControl,
}: {
  view: TaskView;
  setView: (v: TaskView) => void;
  projects: Project[];
  members: Member[];
  tasks: Task[];
  t: Translate;
  table: boolean;
  grouping?: boolean;
  right?: ReactNode;
  extra?: ReactNode;
  selectionControl?: ReactNode;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [editingFilter, setEditingFilter] = useState<number | null>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnsTrigger = useRef<HTMLButtonElement>(null);
  const filterTrigger = useRef<HTMLButtonElement>(null);
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
    <div className="task-view-tools toolbar" aria-label={t('Controles da visualização', 'View controls')}>
      <div className="inwrap task-search">
        <Search size={13} className="i" />
        <Input
          className="input search-sm"
          aria-label={t('Buscar tarefas', 'Search tasks')}
          placeholder={t('Buscar tarefas', 'Search tasks')}
          value={view.q}
          onChange={e => patch({ q: e.target.value })}
        />
      </div>
      <Button
        ref={filterTrigger}
        aria-label={t('Filtros', 'Filters')}
        type="button"
        variant="ghost"
        className="filter-trigger"
        aria-haspopup="dialog"
        aria-expanded={filterOpen}
        onClick={() => setFilterOpen(value => !value)}
      >
        <Filter size={13} />
        {t('Filtro', 'Filter')}
        {view.filters.length > 0 && ` (${view.filters.length})`}
      </Button>
      {filterOpen && (
        <AnchoredSurface anchor={filterTrigger} label={t('Filtros', 'Filters')} width={560} close={() => setFilterOpen(false)} className="task-filter-builder">
          <header className="fb-h">
            <strong>{t('Filtrar por', 'Filter by')}</strong>
            <div className="filter-more-options">
              <label>
                <input type="checkbox" checked={view.showDone} onChange={event => patch({ showDone: event.target.checked })} />
                {t('Mostrar concluídas', 'Show completed')}
              </label>
              {selectionControl}
            </div>
            {view.filters.length > 0 && (
              <Button variant="ghost" onClick={() => patch({ filters: [], q: '' })}>
                {t('Limpar filtros', 'Clear filters')}
              </Button>
            )}
          </header>
          {view.filters.length ? (
            <div className="fb-rows">
              {view.filters.map((filter, index) => (
                <div key={index}>
                  <div className="frow">
                    <span className="conj">{index ? t('e', 'and') : t('Onde', 'Where')}</span>
                    <select
                      aria-label={t('Campo do filtro', 'Filter field') + ` ${index + 1}`}
                      value={filter.f}
                      onChange={event => patch({ filters: view.filters.map((f, i) => (i === index ? { ...f, f: event.target.value, v: [] } : f)) })}
                    >
                      {['status', 'priority', 'assignee', 'project', 'due', 'labels', 'created', 'updated'].map(field => (
                        <option key={field} value={field}>
                          {fieldLabel(field, t)}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={t('Operador do filtro', 'Filter operator') + ` ${index + 1}`}
                      value={filter.op}
                      onChange={event => patch({ filters: view.filters.map((f, i) => (i === index ? { ...f, op: event.target.value as 'is' | 'not' } : f)) })}
                    >
                      <option value="is">{t('é', 'is')}</option>
                      <option value="not">{t('não é', 'is not')}</option>
                    </select>
                    <Button
                      variant="ghost"
                      className="valbtn"
                      aria-label={t('Valores do filtro', 'Filter values') + ` ${index + 1}`}
                      aria-expanded={editingFilter === index}
                      onClick={() => setEditingFilter(editingFilter === index ? null : index)}
                    >
                      <span className="trunc">
                        {filter.v.length ? filter.v.map(v => options(filter.f).find(o => o.id === v)?.name ?? v).join(', ') : t('Selecionar…', 'Select…')}
                      </span>
                      <ChevronDown size={12} />
                    </Button>
                    <Button
                      variant="ghost"
                      className="ibtn ibtn-xs"
                      aria-label={t('Remover filtro', 'Remove filter') + ` ${index + 1}`}
                      onClick={() => patch({ filters: view.filters.filter((_, i) => i !== index) })}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                  {editingFilter === index && (
                    <fieldset className="filter-values">
                      <legend className="sr-only">{t('Valores do filtro', 'Filter values') + ` ${index + 1}`}</legend>
                      {options(filter.f).map(option => (
                        <label key={option.id}>
                          <input
                            type="checkbox"
                            checked={filter.v.includes(option.id)}
                            onChange={event =>
                              patch({
                                filters: view.filters.map((f, i) =>
                                  i === index ? { ...f, v: event.target.checked ? [...f.v, option.id] : f.v.filter(id => id !== option.id) } : f,
                                ),
                              })
                            }
                          />
                          {option.name}
                        </label>
                      ))}
                    </fieldset>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="fb-empty">
              {t(
                'Nenhum filtro aplicado. Combine filtros para restringir a lista, por exemplo Status é Em andamento e Responsável é Sarah.',
                'No filters applied. Combine filters to narrow the task list, e.g. Status is In Progress and Assignee is Sarah.',
              )}
            </p>
          )}
          <div className="fb-add">
            <span>{t('Adicionar filtro:', 'Add filter:')}</span>
            {(['status', 'assignee', 'priority', 'due', 'project', 'labels', 'created', 'updated'] as const).map(field => {
              const Icon = {
                status: Circle,
                priority: Flag,
                assignee: User,
                project: Folder,
                due: Calendar,
                labels: Tag,
                created: Clock,
                updated: Clock,
                Search,
                ArrowUpDown,
                CircleDot,
                SignalHigh,
                Minus,
              }[field];
              return (
                <Button
                  variant="ghost"
                  className="badge"
                  key={field}
                  aria-label={t('Adicionar filtro', 'Add filter') + ': ' + fieldLabel(field, t)}
                  onClick={() => {
                    setEditingFilter(view.filters.length);
                    patch({ filters: [...view.filters, { f: field, op: 'is', v: [] }] });
                  }}
                >
                  <Icon size={11} />
                  {fieldLabel(field, t)}
                </Button>
              );
            })}
          </div>
        </AnchoredSurface>
      )}
      <TaskFieldControl
        triggerLabel={t('Ordenar', 'Sort')}
        menuLabel={t('Ordenar', 'Sort')}
        caption={t('Ordenar por', 'Sort by')}
        value={view.sort.f}
        disabled={false}
        onChange={f => patch({ sort: { ...view.sort, f } })}
        t={t}
        footer={
          <div className="sort-direction seg">
            {[1, -1].map(direction => (
              <Button
                type="button"
                variant="ghost"
                key={direction}
                aria-pressed={view.sort.dir === direction}
                className={view.sort.dir === direction ? 'on' : ''}
                onClick={() => patch({ sort: { ...view.sort, dir: direction } })}
              >
                {direction === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{' '}
                {direction === 1 ? t('Crescente', 'Ascending') : t('Decrescente', 'Descending')}
              </Button>
            ))}
          </div>
        }
        choices={['manual', 'priority', 'due', 'start', 'title', 'status', 'assignee', 'created', 'updated', 'project', 'estimate'].map(id => ({
          id,
          label: fieldLabel(id, t),
        }))}
      >
        <ArrowUpDown size={14} />
        <span className="hide-m">{t('Ordenar:', 'Sort:')}</span>
        <span>{fieldLabel(view.sort.f, t)}</span>
      </TaskFieldControl>
      {grouping && (
        <TaskFieldControl
          triggerLabel={t('Agrupar', 'Group')}
          menuLabel={t('Agrupar', 'Group')}
          caption={t('Agrupar por', 'Group by')}
          value={view.group}
          disabled={false}
          onChange={group => patch({ group })}
          t={t}
          choices={['status', 'priority', 'assignee', 'project', 'due', 'none'].map(id => {
            const Icon = (
              { status: CircleDot, priority: SignalHigh, assignee: User, project: Folder, due: Calendar, none: Minus } as Record<string, typeof Group>
            )[id];
            return { id, label: fieldLabel(id, t), icon: <Icon size={15} /> };
          })}
        >
          <Group size={13} />
          <span>
            <span className="hide-m">{t('Agrupar: ', 'Group: ')}</span>
            {fieldLabel(view.group, t)}
          </span>
        </TaskFieldControl>
      )}
      {table && (
        <>
          <Button ref={columnsTrigger} variant="ghost" aria-expanded={columnsOpen} onClick={() => setColumnsOpen(value => !value)}>
            {t('Colunas', 'Columns')}
          </Button>
          {columnsOpen && (
            <AnchoredSurface
              anchor={columnsTrigger}
              label={t('Colunas', 'Columns')}
              width={260}
              close={() => setColumnsOpen(false)}
              className="task-columns-popover"
            >
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
                      step="1"
                      value={view.colW[c] ?? defaultTaskColumnWidths[c]}
                      aria-label={t('Largura', 'Width') + ': ' + fieldLabel(c, t)}
                      onChange={e => patch({ colW: { ...view.colW, [c]: Number(e.target.value) } })}
                    />
                  </div>
                ))}
                <Button variant="ghost" onClick={() => patch({ hidden: ['start', 'created', 'deps'], colW: {} })}>
                  {t('Restaurar colunas', 'Reset columns')}
                </Button>
              </div>
            </AnchoredSurface>
          )}
        </>
      )}
      {extra}
      <span className="sp" />
      {right}
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
