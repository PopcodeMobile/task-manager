import { useEffect, useMemo, useState } from 'react';
import { List, Columns3, Table2, Plus, GripVertical } from 'lucide-react';
import type { Task, Project, Json, BatchCommand } from '../../domain/contracts';
import type { Agent, Member } from '../../workspace/normalized';
import type { WorkspaceRepository } from '../../workspace/repository';
import type { Translate } from '../auth/ConsentPage';
import type { Execute } from '../projects/ProjectsPage';
import { Button } from '../../components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '../../components/ui/alert-dialog';
import { errorMessage } from '../shell/messages';
import { TaskViewToolbar, fieldLabel, groupLabel } from './TaskViewToolbar';
import { TaskContextMenu, type ExtraTaskMenuAction } from './TaskContextMenu';
import { TaskCell } from './TaskCells';
import {
  applyTaskView,
  groupTaskView,
  bulkCommands,
  reorderTask,
  loadTaskView,
  saveTaskView,
  readTaskView,
  taskDragId,
  columns,
  priorities,
  taskStatuses,
  type TaskView,
  type Column,
} from './task-view-model';
import { statusLabel, priorityLabel } from './TaskList';
export type TaskViewsProps = {
  tasks: Task[];
  projects: Project[];
  agents: Agent[];
  members: Member[];
  board: boolean;
  table?: boolean;
  href: (params: Record<string, string>) => string;
  open: (id: string) => void;
  view: (href: string) => void;
  t: Translate;
  canCreate: boolean;
  repo: WorkspaceRepository;
  execute: Execute;
  projectId?: string;
  viewKey?: string;
  initialView?: unknown;
  onViewChange?: (view: TaskView) => void;
  extraTaskMenuActions?: ExtraTaskMenuAction[];
};
export function TaskViews(props: TaskViewsProps) {
  const { tasks, projects, members, t, repo, execute, board, table, open, projectId } = props;
  const [context, setContext] = useState<{ task: Task; x: number; y: number; trigger: HTMLElement; scope: string } | null>(null);
  const dragScope = useMemo(() => crypto.randomUUID(), [repo]);
  const mode = board ? 'board' : table ? 'table' : 'list',
    key = props.viewKey ?? `${projectId ? `project:${projectId}` : 'tasks'}:${mode}`;
  const [view, setViewState] = useState<TaskView>(() => readTaskView(props.initialView)),
    [ready, setReady] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [remove, setRemove] = useState(false);
  useEffect(() => {
    let alive = true;
    setReady(false);
    setSelected([]);
    setContext(null);
    setError('');
    void (async () => {
      try {
        await repo.personal?.();
        if (!alive || repo.controller.signal.aborted) return;
        setViewState(props.initialView ? readTaskView(props.initialView) : loadTaskView(localStorage, repo.userId, repo.workspaceId!, key));
        setReady(true);
      } catch (err) {
        if (alive) setError(errorMessage(err, t));
      }
    })();
    return () => {
      alive = false;
    };
  }, [repo, key]);
  function setView(v: TaskView) {
    try {
      saveTaskView(localStorage, repo.userId, repo.workspaceId!, key, v);
      setViewState(v);
      props.onViewChange?.(v);
    } catch (err) {
      setError(errorMessage(err, t));
    }
  }
  const visible = applyTaskView(tasks, view, projects, members),
    groups = groupTaskView(visible, board ? 'status' : view.group, projects, members),
    chosen = tasks.filter(task => selected.includes(task.id)),
    limited = chosen.length > 100;
  useEffect(() => {
    setSelected(ids => ids.filter(id => tasks.some(task => task.id === id && !task.archived)));
  }, [tasks]);
  async function run(commands: BatchCommand[], after?: () => void) {
    if (busy || !props.canCreate || !commands.length) return;
    setBusy(true);
    setError('');
    try {
      await execute('batch', { commands });
      after?.();
      setSelected([]);
    } catch (err) {
      if (!repo.controller.signal.aborted) setError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }
  function bulk(rows: Task[], operation: string, input: Record<string, Json> = {}) {
    try {
      void run(bulkCommands(rows, operation, input));
    } catch (err) {
      setError(
        err instanceof Error && err.message === 'batch_limit'
          ? t('Selecione entre 1 e 100 tarefas. Nada foi alterado.', 'Select between 1 and 100 tasks. Nothing was changed.')
          : t(
              'Há uma reserva ativa. Abra a tarefa e retome o controle humano explicitamente.',
              'There is an active reservation. Open the task and explicitly resume human control.',
            ),
      );
    }
  }
  function edit(task: Task, patch: Record<string, Json>, operation = 'update_task') {
    bulk([task], operation, patch);
  }
  function drop(id: string, before: string | null, group: string, groupId: string) {
    try {
      const commands = reorderTask(tasks, id, before, group, groupId);
      void run(commands, () => setView({ ...view, sort: { f: 'manual', dir: 1 } }));
    } catch (err) {
      setError(
        err instanceof Error && err.message === 'batch_limit'
          ? t(
              'A ordenação exige mais de 100 alterações. Reduza o grupo; nada foi alterado.',
              'Ordering requires more than 100 changes. Reduce the group; nothing was changed.',
            )
          : errorMessage(err, t),
      );
    }
  }
  const active = (task: Task) => !!task.reservation?.active && Date.parse(task.reservation.expiresAt) > Date.now();
  const disabled = (task: Task) => busy || !props.canCreate || active(task);
  const toggle = (id: string) => setSelected(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]));
  const pick = (task: Task) => (
    <input
      type="checkbox"
      aria-label={t('Selecionar', 'Select') + ': ' + task.title}
      checked={selected.includes(task.id)}
      disabled={busy || !props.canCreate}
      onChange={() => toggle(task.id)}
    />
  );
  function closeContext(restoreFocus = true) {
    const previous = context;
    setContext(null);
    if (restoreFocus)
      requestAnimationFrame(() => {
        const current = previous?.trigger.isConnected
          ? previous.trigger
          : [...document.querySelectorAll<HTMLElement>('[data-task-menu]')].find(el => el.dataset.taskMenu === previous?.task.id);
        (current ?? document.querySelector<HTMLElement>('.work-content'))?.focus();
      });
  }
  function openContext(task: Task, trigger: HTMLElement, x: number, y: number) {
    setContext({ task, trigger, x, y, scope: dragScope });
  }
  function contextProps(task: Task) {
    return {
      onContextMenu: (event: React.MouseEvent<HTMLElement>) => {
        if ((event.target as HTMLElement).closest('input,textarea,select')) return;
        event.preventDefault();
        const trigger =
          (event.target as HTMLElement).closest<HTMLElement>('button') ??
          event.currentTarget.querySelector<HTMLElement>('[data-task-menu]') ??
          event.currentTarget;
        openContext(task, trigger, event.clientX, event.clientY);
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
          event.preventDefault();
          const trigger = event.target as HTMLElement,
            rect = trigger.getBoundingClientRect();
          openContext(task, trigger, rect.left, rect.bottom);
        }
      },
    };
  }
  function movement(task: Task, index: number, rows: Task[], group: string, groupId: string) {
    return (
      <div className="task-order-controls">
        <Button
          variant="ghost"
          data-task-menu={task.id}
          aria-label={t('Ações da tarefa', 'Task actions') + ': ' + (task.key ?? task.id)}
          aria-haspopup="menu"
          aria-expanded={context?.scope === dragScope && context.task.id === task.id}
          onClick={event => {
            const rect = event.currentTarget.getBoundingClientRect();
            openContext(task, event.currentTarget, rect.left, rect.bottom);
          }}
        >
          ⋯
        </Button>
        <Button variant="ghost" aria-label={t('Arrastar tarefa', 'Drag task') + ': ' + (task.key ?? task.id)} disabled={disabled(task)} {...dragProps(task)}>
          <GripVertical size={14} />
        </Button>
        <Button
          variant="ghost"
          aria-label={t('Mover para cima', 'Move up') + ': ' + (task.key ?? task.id)}
          disabled={disabled(task) || index === 0}
          onClick={() => drop(task.id, rows[index - 1].id, group, groupId)}
        >
          ↑
        </Button>
        <Button
          variant="ghost"
          aria-label={t('Mover para baixo', 'Move down') + ': ' + (task.key ?? task.id)}
          disabled={disabled(task) || index === rows.length - 1}
          onClick={() => drop(task.id, rows[index + 2]?.id ?? null, group, groupId)}
        >
          ↓
        </Button>
      </div>
    );
  }
  const dropProps = (group: string, groupId: string, before: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (props.canCreate && !busy && e.dataTransfer.types.includes('application/x-gr8r-task')) e.preventDefault();
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const id = taskDragId(e.dataTransfer.getData('application/x-gr8r-task'), dragScope);
      if (id && tasks.some(t => t.id === id)) drop(id, before, group, groupId);
    },
  });
  const dragProps = (task: Task) => ({
    draggable: !disabled(task),
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData('application/x-gr8r-task', JSON.stringify({ id: task.id, scope: dragScope }));
      e.dataTransfer.effectAllowed = 'move';
    },
  });
  const cell = (task: Task, column: Column) => (
    <TaskCell task={task} column={column} projects={projects} members={members} agents={props.agents} t={t} open={open} edit={edit} disabled={disabled(task)} />
  );
  if (!ready) return <p role="status">{t('Carregando visualização...', 'Loading view...')}</p>;
  return (
    <>
      <div className="work-toolbar">
        <div className="view-tabs">
          {[
            ['list', t('Lista', 'List'), List],
            ['board', t('Quadro', 'Board'), Columns3],
            ['table', t('Tabela', 'Table'), Table2],
          ].map(([id, name, Icon]) => {
            const I = Icon as typeof List;
            return (
              <a
                key={String(id)}
                href={props.href({ view: String(id) })}
                aria-current={mode === id ? 'page' : undefined}
                onClick={e => {
                  e.preventDefault();
                  props.view(e.currentTarget.href);
                }}
              >
                <I size={15} />
                {String(name)}
              </a>
            );
          })}
        </div>
        <span>
          {visible.length} / {tasks.length} {t('tarefas', 'tasks')}
        </span>
      </div>
      <TaskViewToolbar view={view} setView={setView} projects={projects} members={members} tasks={tasks} t={t} table={!!table} />
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <div className="task-selection">
        <label>
          <input
            type="checkbox"
            aria-label={t('Selecionar todas as tarefas visíveis', 'Select all visible tasks')}
            disabled={busy || !props.canCreate || !visible.length}
            checked={!!visible.length && visible.every(task => selected.includes(task.id))}
            onChange={e => setSelected(e.target.checked ? visible.map(task => task.id) : [])}
          />
          {t('Selecionar visíveis', 'Select visible')}
        </label>
        {selected.length > 0 && (
          <>
            <strong>
              {selected.length} {t('selecionadas', 'selected')}
            </strong>
            <Button variant="ghost" onClick={() => setSelected([])}>
              {t('Limpar seleção', 'Clear selection')}
            </Button>
          </>
        )}
      </div>
      {!!chosen.length && (
        <div className="task-bulk" role="group" aria-label={t('Ações em lote', 'Bulk actions')}>
          <p>
            {t(
              'Máximo de 100 tarefas por ação atômica. Reservas ativas exigem retomada explícita.',
              'Maximum 100 tasks per atomic action. Active reservations require explicit intervention.',
            )}
          </p>
          {limited && (
            <p role="alert">
              {t(
                'Mais de 100 tarefas selecionadas. Reduza a seleção; nenhuma será aplicada parcialmente.',
                'More than 100 tasks selected. Reduce the selection; no partial changes will be applied.',
              )}
            </p>
          )}
          <select
            aria-label={t('Status em lote', 'Bulk status')}
            disabled={busy || limited}
            value=""
            onChange={e =>
              bulk(chosen, e.target.value === 'done' ? 'complete_task' : 'update_task', e.target.value === 'done' ? {} : { status: e.target.value })
            }
          >
            <option value="" disabled>
              {t('Alterar status', 'Change status')}
            </option>
            {taskStatuses.map(s => (
              <option key={s} value={s}>
                {statusLabel(s, t)}
              </option>
            ))}
          </select>
          <select
            aria-label={t('Prioridade em lote', 'Bulk priority')}
            disabled={busy || limited}
            value=""
            onChange={e => bulk(chosen, 'update_task', { priority: e.target.value })}
          >
            <option value="" disabled>
              {t('Alterar prioridade', 'Change priority')}
            </option>
            {priorities.map(p => (
              <option key={p} value={p}>
                {priorityLabel(p, t)}
              </option>
            ))}
          </select>
          <select
            aria-label={t('Responsável em lote', 'Bulk assignee')}
            disabled={busy || limited}
            value=""
            onChange={e => bulk(chosen, 'update_task', { assigneeUserId: e.target.value === 'none' ? null : e.target.value })}
          >
            <option value="" disabled>
              {t('Atribuir responsável', 'Assign member')}
            </option>
            <option value="none">{t('Sem responsável', 'Unassigned')}</option>
            {members.map(m => (
              <option key={m.user_id} value={m.user_id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            aria-label={t('Mover em lote', 'Bulk move')}
            disabled={busy || limited}
            value=""
            onChange={e => bulk(chosen, 'move_task', { projectId: e.target.value })}
          >
            <option value="" disabled>
              {t('Mover para projeto', 'Move to project')}
            </option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button variant="outline" disabled={busy || limited} onClick={() => bulk(chosen, 'archive_task')}>
            {t('Arquivar selecionadas', 'Archive selected')}
          </Button>
          <Button variant="destructive" disabled={busy || limited} onClick={() => setRemove(true)}>
            {t('Excluir selecionadas', 'Delete selected')}
          </Button>
        </div>
      )}
      {!visible.length ? (
        <div className="work-empty">
          <h2>{tasks.length ? t('Nenhum resultado encontrado', 'No matching tasks') : t('Nenhuma tarefa por aqui', 'No tasks here yet')}</h2>
          <p>{t('Crie uma tarefa ou ajuste os filtros.', 'Create a task or adjust the filters.')}</p>
          <Button variant="outline" onClick={() => setView({ ...view, q: '', filters: [], showDone: true })}>
            {t('Limpar filtros', 'Clear filters')}
          </Button>
        </div>
      ) : (
        <div className={board ? 'task-board' : 'task-view-groups'}>
          {groups.map(group => {
            const groupType = board ? 'status' : view.group,
              name = groupLabel(group.key, groupType, projects, members, t),
              collapsed = view.collapsed.includes(group.key),
              shownColumns = columns.filter(c => c === 'title' || !view.hidden.includes(c));
            return (
              <section
                className={board ? 'board-column' : 'task-view-group'}
                key={group.key}
                {...dropProps(groupType, group.key, null)}
                data-task-group={group.key}
              >
                <header className="task-group-heading">
                  <Button
                    variant="ghost"
                    aria-expanded={!collapsed}
                    onClick={() => setView({ ...view, collapsed: collapsed ? view.collapsed.filter(k => k !== group.key) : [...view.collapsed, group.key] })}
                  >
                    {collapsed ? '▸' : '▾'} {name} <small>{group.tasks.length}</small>
                  </Button>
                  {board && (
                    <details>
                      <summary aria-label={t('Opções da coluna', 'Column options') + ': ' + name}>⋯</summary>
                      <div className="view-options-body">
                        <Button
                          variant="ghost"
                          disabled={busy || !props.canCreate || !group.tasks.some(t => t.status !== 'done')}
                          onClick={() =>
                            bulk(
                              group.tasks.filter(t => t.status !== 'done'),
                              'complete_task',
                            )
                          }
                        >
                          {t('Concluir coluna', 'Complete column')}
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busy || !props.canCreate || !group.tasks.some(t => t.status === 'done')}
                          onClick={() =>
                            bulk(
                              group.tasks.filter(t => t.status === 'done'),
                              'archive_task',
                            )
                          }
                        >
                          {t('Arquivar concluídas', 'Archive completed')}
                        </Button>
                        <Button variant="ghost" onClick={() => setView({ ...view, sort: { f: 'priority', dir: 1 } })}>
                          {t('Ordenar por prioridade', 'Sort by priority')}
                        </Button>
                      </div>
                    </details>
                  )}
                </header>
                {!collapsed && (
                  <>
                    {board ? (
                      <div className="board-cards">
                        {group.tasks.map((task, index) => (
                          <article
                            className="task-card"
                            key={task.id}
                            {...contextProps(task)}
                            {...dragProps(task)}
                            {...dropProps(groupType, group.key, task.id)}
                          >
                            {pick(task)}
                            <Button variant="ghost" className="task-title" onClick={() => open(task.id)}>
                              <small>{task.key}</small>
                              <strong>{task.title}</strong>
                            </Button>
                            <span>{priorityLabel(task.priority, t)}</span>
                            <footer>
                              {members.find(m => m.user_id === task.assigneeUserId)?.name ?? t('Sem responsável', 'Unassigned')}
                              {task.executorAgentId && (
                                <small className="task-executor">{props.agents.find(a => a.id === task.executorAgentId)?.name ?? t('Agente', 'Agent')}</small>
                              )}
                            </footer>
                            {cell(task, 'status')}
                            {movement(task, index, group.tasks, groupType, group.key)}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <>
                        <div className={`task-view-table ${table ? 'is-table' : ''}`}>
                          <table
                            aria-label={name}
                            style={
                              {
                                '--task-table-width': `${shownColumns.reduce((sum, c) => sum + (view.colW[c] ?? (c === 'title' ? 300 : 150)), 168)}px`,
                              } as React.CSSProperties
                            }
                          >
                            <colgroup>
                              <col style={{ width: 40 }} />
                              {shownColumns.map(c => (
                                <col key={c} style={{ width: view.colW[c] ?? (c === 'title' ? 300 : 150) }} />
                              ))}
                              <col style={{ width: 128 }} />
                            </colgroup>
                            <thead>
                              <tr>
                                <th>
                                  <span className="sr-only">{t('Seleção', 'Selection')}</span>
                                </th>
                                {shownColumns.map(c => (
                                  <th
                                    key={c}
                                    style={{ minWidth: view.colW[c] ?? (c === 'title' ? 300 : 150) }}
                                    aria-sort={view.sort.f === c ? (view.sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                                  >
                                    <Button
                                      variant="ghost"
                                      disabled={c === 'labels' || c === 'deps'}
                                      onClick={() => setView({ ...view, sort: { f: c, dir: view.sort.f === c ? -view.sort.dir : 1 } })}
                                    >
                                      {fieldLabel(c, t)}
                                    </Button>
                                  </th>
                                ))}
                                <th>{t('Ordem', 'Order')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.tasks.map((task, index) => (
                                <tr key={task.id} {...contextProps(task)} {...dragProps(task)} {...dropProps(groupType, group.key, task.id)}>
                                  <td>{pick(task)}</td>
                                  {shownColumns.map(c => (
                                    <td key={c} data-task-column={c}>
                                      {cell(task, c)}
                                    </td>
                                  ))}
                                  <td>{movement(task, index, group.tasks, groupType, group.key)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                    {props.canCreate && (
                      <GroupComposer
                        projectId={projectId}
                        group={groupType}
                        groupId={group.key}
                        projects={projects}
                        t={t}
                        disabled={busy}
                        create={async input => {
                          setBusy(true);
                          setError('');
                          try {
                            await execute('create_task', input);
                            return true;
                          } catch (err) {
                            if (!repo.controller.signal.aborted) setError(errorMessage(err, t));
                            return false;
                          } finally {
                            setBusy(false);
                          }
                        }}
                      />
                    )}
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}
      {context?.scope === dragScope && (
        <TaskContextMenu
          key={`${dragScope}:${context.task.id}`}
          task={context.task}
          projects={projects}
          x={context.x}
          y={context.y}
          t={t}
          execute={execute}
          readOnly={!props.canCreate}
          signal={repo.controller.signal}
          close={closeContext}
          open={open}
          extraActions={props.extraTaskMenuActions}
        />
      )}
      <AlertDialog open={remove} onOpenChange={setRemove}>
        <AlertDialogContent>
          <AlertDialogTitle>{t('Excluir tarefas selecionadas?', 'Delete selected tasks?')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'A exclusão é permanente. Desvincule dependências e arquivos de tarefas que permanecerão no workspace antes de excluir.',
              'Deletion is permanent. Unlink dependencies and files from tasks that will remain in the workspace before deleting.',
            )}
          </AlertDialogDescription>
          <div className="button-row">
            <AlertDialogCancel asChild>
              <Button variant="outline">{t('Cancelar', 'Cancel')}</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" disabled={busy || limited} onClick={() => bulk(chosen, 'delete_task')}>
                {t('Confirmar exclusão', 'Confirm deletion')}
              </Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
function GroupComposer({
  projectId,
  group,
  groupId,
  projects,
  t,
  disabled,
  create,
}: {
  projectId?: string;
  group: string;
  groupId: string;
  projects: Project[];
  t: Translate;
  disabled: boolean;
  create: (input: Record<string, unknown>) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(''),
    [project, setProject] = useState(projectId ?? projects[0]?.id ?? '');
  return (
    <form
      className="task-group-composer"
      onSubmit={e => {
        e.preventDefault();
        const input: Record<string, unknown> = { id: crypto.randomUUID(), title, projectId: group === 'project' ? groupId : project };
        if (group === 'status') input.status = groupId;
        if (group === 'priority') input.priority = groupId;
        if (group === 'assignee') input.assigneeUserId = groupId === 'none' ? null : groupId;
        if (group === 'due' && ['today', 'week', 'overdue'].includes(groupId))
          input.dueDate = new Date(Date.now() + (groupId === 'overdue' ? -1 : groupId === 'week' ? 7 : 0) * 86400000).toISOString().slice(0, 10);
        void create(input).then(ok => {
          if (ok) setTitle('');
        });
      }}
    >
      <input
        required
        maxLength={500}
        aria-label={t('Nova tarefa no grupo', 'New task in group') + ': ' + groupId}
        placeholder={t('Nova tarefa...', 'New task...')}
        value={title}
        disabled={disabled}
        onChange={e => setTitle(e.target.value)}
      />
      {!projectId && group !== 'project' && (
        <select
          aria-label={t('Projeto da nova tarefa', 'New task project') + ': ' + groupId}
          value={project}
          onChange={e => setProject(e.target.value)}
          disabled={disabled}
        >
          {projects.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      <Button variant="ghost" type="submit" disabled={disabled || !projects.length}>
        <Plus size={16} />
        <span className="sr-only">{t('Adicionar ao grupo', 'Add to group') + ': ' + groupId}</span>
      </Button>
    </form>
  );
}
