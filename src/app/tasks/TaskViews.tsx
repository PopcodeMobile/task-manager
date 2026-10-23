import { taskCreateCommand, knownNonCommitting } from './task-create-command';
import { iso, addD } from '../../core/calendar.js';
import React, { useEffect, useMemo, useState } from 'react';
import {
  List,
  Columns3,
  Table2,
  Plus,
  GripVertical,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Check,
  Pencil,
  Repeat2,
  MessageSquare,
  Paperclip,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  ListChecks,
  Timer,
  ClockAlert,
  Sun,
  CalendarDays,
  CircleCheck,
} from 'lucide-react';
import type { Task, Project, Json, BatchCommand, Label, TaskLabel, TaskDependency, Subtask, Comment, TaskAttachment } from '../../domain/contracts';
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
  priorities,
  taskStatuses,
  type TaskView,
  type Column,
  defaultTaskColumnWidths,
} from './task-view-model';
import { ProjectProgress, projectTone, taskKeyTone } from '../projects/ProjectVisual';
import { TaskStatusIcon, labelVisual } from './TaskVisual';
import { statusLabel, priorityLabel } from './TaskList';
export type TaskViewsProps = {
  tasks: Task[];
  prefs?: Record<string, unknown>;
  toolbarActions?: React.ReactNode;
  columnOrder?: Column[];
  graph?: {
    labels: Label[];
    taskLabels: TaskLabel[];
    dependencies: TaskDependency[];
    subtasks: Subtask[];
    comments?: Comment[];
    attachments?: TaskAttachment[];
    historyComplete?: boolean;
  };
  projects: Project[];
  agents: Agent[];
  members: Member[];
  board: boolean;
  table?: boolean;
  href: (params: Record<string, string>) => string;
  open: (id: string, options?: { quick?: boolean }) => void;
  view: (href: string) => void;
  t: Translate;
  canCreate: boolean;
  creationContext?: Partial<Pick<Task, 'assigneeUserId' | 'dueDate' | 'status'>>;
  repo: WorkspaceRepository;
  execute: Execute;
  projectId?: string;
  viewKey?: string;
  hideLayoutSwitch?: boolean;
  fixedGroups?: {
    key: string;
    name: string;
    taskIds: string[];
    creationContext?: TaskViewsProps['creationContext'];
    collapsed?: boolean;
    onSelect?: () => void;
  }[];
  initialView?: unknown;
  defaultView?: unknown;
  onViewChange?: (view: TaskView) => void;
  extraTaskMenuActions?: ExtraTaskMenuAction[];
};
export function TaskViews(props: TaskViewsProps) {
  const { projects, members, t, repo, execute, board, table, open, projectId } = props;
  const tasks = useMemo(
    () =>
      props.graph
        ? props.tasks.map(task => ({
            ...task,
            legacyMetadata: {
              ...task.legacyMetadata,
              labels: props.graph!.taskLabels.filter(l => l.taskId === task.id).map(l => l.labelId),
              deps: props.graph!.dependencies.filter(d => d.taskId === task.id).map(d => d.dependsOnTaskId),
            },
          }))
        : props.tasks,
    [props.tasks, props.graph],
  );
  const [context, setContext] = useState<{ task: Task; x: number; y: number; trigger: HTMLElement; scope: string } | null>(null);
  const dragScope = useMemo(() => crypto.randomUUID(), [repo]);
  const mode = board ? 'board' : table ? 'table' : 'list',
    key = props.viewKey ?? `${projectId ? `project:${projectId}` : 'tasks'}:${mode}`;
  const [view, setViewState] = useState<TaskView>(() => readTaskView(props.initialView ?? props.defaultView)),
    [ready, setReady] = useState(false),
    [loadFailed, setLoadFailed] = useState(false),
    [loadAttempt, setLoadAttempt] = useState(0),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [remove, setRemove] = useState(false);
  useEffect(() => {
    let alive = true;
    setReady(false);
    setLoadFailed(false);
    setSelected([]);
    setContext(null);
    setError('');
    void (async () => {
      try {
        await repo.personal?.();
        if (!alive || repo.controller.signal.aborted) return;
        setViewState(props.initialView ? readTaskView(props.initialView) : loadTaskView(localStorage, repo.userId, repo.workspaceId!, key, props.defaultView));
        setReady(true);
      } catch {
        if (alive && !repo.controller.signal.aborted) setLoadFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [repo, key, loadAttempt]);
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
    groups = props.fixedGroups
      ? props.fixedGroups.map(group => ({ key: group.key, tasks: visible.filter(task => group.taskIds.includes(task.id)) }))
      : groupTaskView(visible, board ? 'status' : view.group, projects, members),
    chosen = tasks.filter(task => selected.includes(task.id)),
    limited = chosen.length > 100,
    resolvedGrouping = board ? 'status' : props.fixedGroups ? 'none' : view.group;
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
  async function createTask(input: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const command = taskCreateCommand(input);
      await execute(command.operation, command.input);
      return true;
    } catch (err) {
      if (!repo.controller.signal.aborted) setError(errorMessage(err, t));
      throw err;
    } finally {
      setBusy(false);
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
  const listColumns: Column[] = (props.columnOrder ?? ['title', 'status', 'assignee', 'priority', 'due', projectId ? 'labels' : 'project']).filter(
    column => column !== 'title',
  );
  const listTemplate = `18px 30px minmax(220px,1fr) ${listColumns
    .map(column => (({ status: 126, assignee: 150, priority: 108, due: 104, project: 160, labels: 168 }) as Record<string, number>)[column] ?? 112)
    .map(width => `${width}px`)
    .join(' ')} 40px`;
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
  const selectAll = (
    <input
      type="checkbox"
      className="check"
      aria-label={t('Selecionar todas as tarefas visíveis', 'Select all visible tasks')}
      disabled={busy || !props.canCreate || !visible.length}
      checked={!!visible.length && visible.every(task => selected.includes(task.id))}
      onChange={e => setSelected(e.target.checked ? visible.map(task => task.id) : [])}
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
  function movement(task: Task, index: number, rows: Task[], group: string, groupId: string, compact = false) {
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
          <MoreHorizontal size={15} />
        </Button>
        {!compact && (
          <>
            <Button
              variant="ghost"
              aria-label={t('Arrastar tarefa', 'Drag task') + ': ' + (task.key ?? task.id)}
              disabled={disabled(task)}
              {...dragProps(task)}
            >
              <GripVertical size={14} />
            </Button>
            <Button
              variant="ghost"
              aria-label={t('Mover para cima', 'Move up') + ': ' + (task.key ?? task.id)}
              disabled={disabled(task) || index === 0}
              onClick={() => drop(task.id, rows[index - 1].id, group, groupId)}
            >
              <ArrowUp size={12} />
            </Button>
            <Button
              variant="ghost"
              aria-label={t('Mover para baixo', 'Move down') + ': ' + (task.key ?? task.id)}
              disabled={disabled(task) || index === rows.length - 1}
              onClick={() => drop(task.id, rows[index + 2]?.id ?? null, group, groupId)}
            >
              <ArrowDown size={12} />
            </Button>
          </>
        )}
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
    <TaskCell
      task={task}
      column={column}
      projects={projects}
      members={members}
      agents={props.agents}
      t={t}
      open={open}
      edit={edit}
      disabled={disabled(task)}
      graph={props.graph}
      tasks={tasks}
      prefs={props.prefs}
    />
  );
  if (!ready)
    return loadFailed ? (
      <div>
        <p role="alert">
          {t(
            'Não foi possível carregar as preferências da visualização. Seus dados foram mantidos. Tente novamente.',
            'Could not load view preferences. Your stored data was kept. Try again.',
          )}
        </p>
        <Button variant="outline" onClick={() => setLoadAttempt(attempt => attempt + 1)}>
          {t('Tentar novamente', 'Try again')}
        </Button>
      </div>
    ) : (
      <p role="status">{t('Carregando visualização...', 'Loading view...')}</p>
    );
  return (
    <>
      <div className="task-toolbar">
        <TaskViewToolbar
          view={view}
          setView={setView}
          projects={projects}
          members={members}
          tasks={tasks}
          t={t}
          table={!!table}
          grouping={!props.fixedGroups && !board}
          selectionControl={
            <label className={`task-select-all ${!board && !table ? 'only-m' : ''}`}>
              {selectAll}
              <span>{t('Selecionar visíveis', 'Select visible')}</span>
            </label>
          }
          right={
            <div className="task-layout-toolbar">
              {props.toolbarActions}{' '}
              {!props.hideLayoutSwitch && (
                <div className="view-tabs seg">
                  {[
                    ['list', t('Lista', 'List'), List],
                    ['board', t('Quadro', 'Board'), Columns3],
                    ['table', t('Tabela', 'Table'), Table2],
                  ].map(([id, name, Icon]) => {
                    const I = Icon as typeof List;
                    return (
                      <a
                        key={String(id)}
                        aria-label={String(name)}
                        className={mode === id ? 'on' : ''}
                        href={props.href({ view: String(id) })}
                        aria-current={mode === id ? 'page' : undefined}
                        onClick={e => {
                          e.preventDefault();
                          props.view(e.currentTarget.href);
                        }}
                      >
                        <I size={15} />
                        <span className="hide-m">{String(name)}</span>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          }
        />
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {!!chosen.length && (
        <div className="task-bulk" role="group" aria-label={t('Ações em lote', 'Bulk actions')}>
          <strong>
            {selected.length} {t('selecionadas', 'selected')}
          </strong>
          <Button variant="ghost" onClick={() => setSelected([])}>
            {t('Limpar seleção', 'Clear selection')}
          </Button>
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
      ) : table ? (
        <TaskTableView
          groups={groups}
          orderedTasks={visible}
          createTask={createTask}
          busy={busy}
          view={view}
          setView={setView}
          props={props}
          selected={selected}
          pick={pick}
          movement={movement}
          cell={cell}
          contextProps={contextProps}
          dragProps={dragProps}
          dropProps={dropProps}
        />
      ) : (
        <div
          className={board ? 'task-board board' : table ? 'task-view-groups table-groups' : 'task-view-groups list-wrap'}
          role={!board && !table ? 'table' : undefined}
          aria-label={!board && !table ? t('Tarefas', 'Tasks') : undefined}
        >
          {!board && !table && (
            <div className="thead" role="row" style={{ '--cols': listTemplate } as React.CSSProperties}>
              <div />
              <div>{selectAll}</div>
              <div role="columnheader">{t('Tarefa', 'Task')}</div>
              {listColumns.map(c => (
                <div role="columnheader" key={c}>
                  <button onClick={() => setView({ ...view, sort: { f: c === 'labels' ? 'manual' : c, dir: view.sort.f === c ? -view.sort.dir : 1 } })}>
                    {fieldLabel(c, t)}
                  </button>
                </div>
              ))}
              <div />
            </div>
          )}
          {groups.map(group => {
            const groupType = resolvedGrouping,
              name = props.fixedGroups?.find(item => item.key === group.key)?.name ?? groupLabel(group.key, groupType, projects, members, t),
              collapsed =
                view.collapsed.includes(group.key) ||
                (!!props.fixedGroups?.find(item => item.key === group.key)?.collapsed && !view.collapsed.includes(`expanded:${group.key}`));
            return (
              <section
                className={board ? `board-column bcol ${collapsed ? 'collapsed' : ''}` : 'task-view-group task-list-group'}
                key={group.key}
                {...dropProps(groupType, group.key, null)}
                data-task-group={group.key}
              >
                <header className={`task-group-heading ${board ? 'bcol-h' : 'grp'}`}>
                  <Button
                    variant="ghost"
                    aria-expanded={!collapsed}
                    onClick={() => {
                      props.fixedGroups?.find(item => item.key === group.key)?.onSelect?.();
                      const retained = view.collapsed.filter(k => k !== group.key && k !== `expanded:${group.key}`);
                      setView({ ...view, collapsed: [...retained, collapsed ? `expanded:${group.key}` : group.key] });
                    }}
                  >
                    {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    {groupType === 'status' && taskStatuses.includes(group.key as Task['status']) && <TaskStatusIcon status={group.key as Task['status']} />}
                    {props.fixedGroups &&
                      (() => {
                        const Icon = ({ overdue: ClockAlert, today: Sun, upcoming: CalendarDays, completed: CircleCheck } as Record<string, typeof ClockAlert>)[
                          group.key
                        ];
                        return Icon ? (
                          <Icon size={14} style={{ color: group.key === 'overdue' ? 'var(--red)' : group.key === 'completed' ? 'var(--green)' : undefined }} />
                        ) : null;
                      })()}
                    {name} <small className="cnt">{group.tasks.length}</small>
                  </Button>
                  {board && (
                    <details>
                      <summary className="ibtn ibtn-sm" aria-label={t('Opções da coluna', 'Column options') + ': ' + name}>
                        <MoreHorizontal size={15} />
                      </summary>
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
                      <div className="board-cards bcol-b">
                        {group.tasks.map((task, index) => (
                          <article
                            className={`task-card kcard ${task.status === 'done' ? 'done' : ''}`}
                            key={task.id}
                            {...contextProps(task)}
                            {...dragProps(task)}
                            {...dropProps(groupType, group.key, task.id)}
                          >
                            {!!props.graph?.taskLabels.some(link => link.taskId === task.id) && (
                              <div className="labels">
                                {props.graph.labels
                                  .filter(label => props.graph!.taskLabels.some(link => link.taskId === task.id && link.labelId === label.id))
                                  .map(label => (
                                    <span className="lbl" key={label.id} style={{ '--c': labelVisual(label, t).color } as React.CSSProperties}>
                                      <i />
                                      {labelVisual(label, t).name}
                                    </span>
                                  ))}
                              </div>
                            )}
                            <div className="top">
                              {task.status === 'done' && (
                                <span className="done-ic">
                                  <TaskStatusIcon status="done" size={14} />
                                </span>
                              )}
                              <Button variant="ghost" className="task-title title" onClick={() => open(task.id)}>
                                {task.title}
                              </Button>
                            </div>
                            {!!props.graph?.subtasks.some(sub => sub.taskId === task.id) && (
                              <div className="subp">
                                <ListChecks size={12} />
                                <span className="num">
                                  {props.graph.subtasks.filter(sub => sub.taskId === task.id && sub.done).length}/
                                  {props.graph.subtasks.filter(sub => sub.taskId === task.id).length}
                                </span>
                                <ProjectProgress
                                  value={Math.round(
                                    (props.graph.subtasks.filter(sub => sub.taskId === task.id && sub.done).length /
                                      Math.max(1, props.graph.subtasks.filter(sub => sub.taskId === task.id).length)) *
                                      100,
                                  )}
                                  name={t('Progresso das subtarefas', 'Subtask progress')}
                                />
                              </div>
                            )}
                            <div className="meta">
                              {!projectId && (
                                <span className="m">
                                  <span
                                    className="pdot"
                                    style={
                                      {
                                        '--c': projects.find(p => p.id === task.projectId)
                                          ? projectTone(projects.find(p => p.id === task.projectId)!)
                                          : 'var(--accent)',
                                      } as React.CSSProperties
                                    }
                                  />
                                </span>
                              )}
                              <span className="key task-key" style={{ '--c': taskKeyTone(task, projects) } as React.CSSProperties}>
                                {task.key}
                              </span>
                              <span className="board-priority">{cell(task, 'priority')}</span>
                              {task.dueDate && <span className="board-due">{cell(task, 'due')}</span>}
                              {task.recurrence && (
                                <span className="m" title={task.recurrence}>
                                  <Repeat2 size={12} />
                                </span>
                              )}
                              {!!props.graph?.comments?.filter(item => item.taskId === task.id).length && (
                                <span
                                  className="m"
                                  aria-label={`${props.graph.comments.filter(item => item.taskId === task.id).length} ${t('comentários carregados', 'loaded comments')}`}
                                >
                                  <MessageSquare size={12} />
                                  {props.graph.comments.filter(item => item.taskId === task.id).length}
                                </span>
                              )}
                              {!!props.graph?.attachments?.filter(item => item.taskId === task.id).length && (
                                <span className="m">
                                  <Paperclip size={12} />
                                  {props.graph.attachments.filter(item => item.taskId === task.id).length}
                                </span>
                              )}
                              <span className="board-assignee">{cell(task, 'assignee')}</span>
                            </div>
                            {task.executorAgentId && (
                              <small className="task-executor">{props.agents.find(a => a.id === task.executorAgentId)?.name ?? t('Agente', 'Agent')}</small>
                            )}
                            <div className="hacts">
                              <Button
                                type="button"
                                variant="ghost"
                                className="ibtn ibtn-xs"
                                aria-label={task.status === 'done' ? t('Reabrir', 'Reopen') : t('Marcar como concluída', 'Mark complete')}
                                disabled={disabled(task)}
                                onClick={() =>
                                  bulk([task], task.status === 'done' ? 'update_task' : 'complete_task', task.status === 'done' ? { status: 'todo' } : {})
                                }
                              >
                                {task.status === 'done' ? <RotateCcw size={13} /> : <Check size={13} />}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                className="ibtn ibtn-xs"
                                aria-label={t('Edição rápida', 'Quick edit')}
                                onClick={() => open(task.id, { quick: true })}
                              >
                                <Pencil size={12} />
                              </Button>
                              {movement(task, index, group.tasks, groupType, group.key, true)}
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="task-view-table task-list-rows">
                        {group.tasks.map((task, index) => (
                          <div
                            className={`trow ${task.status === 'done' ? 'done' : ''} ${selected.includes(task.id) ? 'sel' : ''}`}
                            role="row"
                            data-task-row={task.id}
                            key={task.id}
                            style={{ '--cols': listTemplate } as React.CSSProperties}
                            {...contextProps(task)}
                            {...dragProps(task)}
                            {...dropProps(groupType, group.key, task.id)}
                          >
                            <div className="handle">
                              <GripVertical size={14} />
                            </div>
                            <div className="c-check">{pick(task)}</div>
                            <div className="ttl" data-task-column="title">
                              {cell(task, 'title')}
                            </div>
                            {listColumns.map(c => (
                              <div className={`c-meta c-${c}`} data-task-column={c} key={c}>
                                {cell(task, c)}
                              </div>
                            ))}
                            <div className="c-more">{movement(task, index, group.tasks, groupType, group.key)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {props.canCreate && (
                      <GroupComposer
                        compact
                        projectId={projectId}
                        group={groupType}
                        groupId={group.key}
                        projects={projects}
                        t={t}
                        disabled={busy}
                        creationContext={props.fixedGroups?.find(item => item.key === group.key)?.creationContext ?? props.creationContext}
                        create={async input => {
                          setBusy(true);
                          setError('');
                          try {
                            const command = taskCreateCommand(input);
                            await execute(command.operation, command.input);
                            return true;
                          } catch (err) {
                            if (!repo.controller.signal.aborted) setError(errorMessage(err, t));
                            throw err;
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
          extraActions={[
            ...(props.extraTaskMenuActions ?? []),
            {
              id: 'selection',
              personal: true,
              label: selected.includes(context.task.id) ? t('Desmarcar tarefa', 'Deselect task') : t('Selecionar tarefa', 'Select task'),
              run: task => toggle(task.id),
            },
            ...([-1, 1] as const).map(direction => ({
              id: `order:${direction}`,
              label: direction < 0 ? t('Mover para cima', 'Move up') : t('Mover para baixo', 'Move down'),
              disabled: disabled(context.task),
              run: (task: Task) => {
                const group = groups.find(item => item.tasks.some(row => row.id === task.id));
                if (!group) return;
                const index = group.tasks.findIndex(row => row.id === task.id);
                if (direction < 0 && index > 0) drop(task.id, group.tasks[index - 1].id, resolvedGrouping, group.key);
                if (direction > 0 && index < group.tasks.length - 1) drop(task.id, group.tasks[index + 2]?.id ?? null, resolvedGrouping, group.key);
              },
            })),
          ]}
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
  compact = false,
  onCreated,
  onCancel,
  creationContext,
  projectId,
  group,
  groupId,
  projects,
  t,
  disabled,
  create,
}: {
  compact?: boolean;
  onCreated?: () => void;
  onCancel?: () => void;
  projectId?: string;
  group: string;
  groupId: string;
  projects: Project[];
  t: Translate;
  disabled: boolean;
  creationContext?: Record<string, unknown>;
  create: (input: Record<string, unknown>) => Promise<boolean>;
}) {
  const [composing, setComposing] = useState(!compact);
  const [title, setTitle] = useState(''),
    [project, setProject] = useState(projectId || projects[0]?.id || ''),
    [attempt, setAttempt] = useState<Record<string, unknown> | null>(null);
  const targetProject = group === 'project' ? groupId : projectId || projects.find(p => p.id === project)?.id || projects[0]?.id || '';
  const validProject = projects.some(p => p.id === targetProject);
  if (!composing)
    return (
      <Button
        type="button"
        variant="ghost"
        className="group-add-task"
        disabled={disabled || !validProject}
        aria-label={t('Adicionar tarefa no grupo', 'Add task in group') + ': ' + groupId}
        onClick={() => setComposing(true)}
      >
        <Plus size={13} />
        {t('Adicionar tarefa', 'Add task')}
      </Button>
    );
  return (
    <form
      className="task-group-composer"
      onSubmit={e => {
        e.preventDefault();
        if (disabled || !validProject) return;
        const input: Record<string, unknown> = attempt ?? { id: crypto.randomUUID(), title, projectId: targetProject };
        if (!attempt && group === 'status') input.status = groupId;
        if (!attempt && group === 'priority') input.priority = groupId;
        if (!attempt && group === 'assignee') input.assigneeUserId = groupId === 'none' ? null : groupId;
        if (!attempt && group === 'due' && ['today', 'week', 'overdue'].includes(groupId))
          input.dueDate = iso(addD(new Date(), groupId === 'overdue' ? -1 : groupId === 'week' ? 7 : 0));
        if (!attempt) Object.assign(input, creationContext);
        setAttempt(input);
        void create(input)
          .then(ok => {
            if (ok) {
              setTitle('');
              setAttempt(null);
              if (compact) setComposing(false);
              onCreated?.();
            }
          })
          .catch(error => {
            if (knownNonCommitting(error)) setAttempt(null);
          });
      }}
    >
      <input
        required
        autoFocus
        maxLength={500}
        aria-label={t('Nova tarefa no grupo', 'New task in group') + ': ' + groupId}
        placeholder={t('Nova tarefa...', 'New task...')}
        value={title}
        disabled={disabled || !!attempt || !validProject}
        onChange={e => setTitle(e.target.value)}
      />
      {!projectId && group !== 'project' && (
        <select
          aria-label={t('Projeto da nova tarefa', 'New task project') + ': ' + groupId}
          value={validProject ? targetProject : ''}
          onChange={e => setProject(e.target.value)}
          disabled={disabled || !!attempt || !validProject}
        >
          {projects.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      {attempt && !disabled && <p role="status">{t('Confirme o envio anterior tentando novamente.', 'Retry to confirm the previous submission.')}</p>}
      {!validProject && <p>{t('Crie um projeto antes de adicionar tarefas.', 'Create a project before adding tasks.')}</p>}
      <Button variant="ghost" type="submit" disabled={disabled || !validProject}>
        <Plus size={16} />
        <span className="sr-only">{t('Adicionar ao grupo', 'Add to group') + ': ' + groupId}</span>
      </Button>
      {onCancel && (
        <Button variant="ghost" type="button" disabled={disabled || !!attempt || !!title} onClick={onCancel}>
          {t('Cancelar criação', 'Cancel creation')}
        </Button>
      )}
    </form>
  );
}

const originalTableColumns: Column[] = ['title', 'status', 'priority', 'assignee', 'due', 'start', 'labels', 'deps', 'estimate', 'created', 'project'];

function TaskTableView({
  groups,
  orderedTasks,
  createTask,
  busy,
  view,
  setView,
  props,
  selected,
  pick,
  movement,
  cell,
  contextProps,
  dragProps,
  dropProps,
}: {
  groups: { key: string; tasks: Task[] }[];
  orderedTasks: Task[];
  createTask: (input: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
  view: TaskView;
  setView: (view: TaskView) => void;
  props: TaskViewsProps;
  selected: string[];
  pick: (task: Task) => React.ReactNode;
  movement: (task: Task, index: number, rows: Task[], group: string, groupId: string, compact?: boolean) => React.ReactNode;
  cell: (task: Task, column: Column) => React.ReactNode;
  contextProps: (task: Task) => React.HTMLAttributes<HTMLElement>;
  dragProps: (task: Task) => React.HTMLAttributes<HTMLElement>;
  dropProps: (group: string, groupId: string, before: string | null) => React.HTMLAttributes<HTMLElement>;
}) {
  const { t, projects, members } = props;
  const [composer, setComposer] = useState<{ group: string; groupId: string } | null>(null);
  const shown = originalTableColumns.filter(c => c === 'title' || (!view.hidden.includes(c) && !(props.projectId && c === 'project')));
  const width = (c: Column) => view.colW[c] ?? defaultTaskColumnWidths[c];
  return (
    <>
      <div className="task-view-table is-table tbl-wrap hide-m">
        <table className="tbl" aria-label={t('Tabela de tarefas', 'Tasks table')} style={{ width: shown.reduce((sum, c) => sum + width(c), 0) }}>
          <colgroup>
            {shown.map(c => (
              <col key={c} data-col={c} style={{ width: width(c) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {shown.map(c => (
                <th
                  key={c}
                  scope="col"
                  className={c === 'title' ? 'sticky' : ''}
                  aria-sort={view.sort.f === c ? (view.sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                >
                  <Button
                    variant="ghost"
                    className="thi"
                    onClick={() =>
                      setView({ ...view, sort: { f: ['labels', 'deps'].includes(c) ? 'manual' : c, dir: view.sort.f === c ? -view.sort.dir : 1 } })
                    }
                  >
                    {c === 'title' ? t('Tarefa', 'Task') : fieldLabel(c, t)}
                  </Button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(group => (
              <React.Fragment key={group.key}>
                {view.group !== 'none' && (
                  <tr className="grow-row">
                    <td className="sticky" colSpan={shown.length}>
                      <div className="row">
                        <Button
                          variant="ghost"
                          className="row"
                          aria-expanded={!view.collapsed.includes(group.key)}
                          onClick={() =>
                            setView({
                              ...view,
                              collapsed: view.collapsed.includes(group.key) ? view.collapsed.filter(key => key !== group.key) : [...view.collapsed, group.key],
                            })
                          }
                        >
                          {view.collapsed.includes(group.key) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                          {view.group === 'status' && taskStatuses.includes(group.key as Task['status']) && (
                            <TaskStatusIcon status={group.key as Task['status']} />
                          )}
                          <b>{groupLabel(group.key, view.group, projects, members, t)}</b>
                          <span className="faint">{group.tasks.length}</span>
                        </Button>
                        {props.canCreate && (
                          <Button
                            type="button"
                            variant="ghost"
                            className="ibtn ibtn-xs"
                            aria-label={t('Adicionar tarefa no grupo', 'Add task in group') + ': ' + group.key}
                            disabled={busy || composer !== null}
                            onClick={() => setComposer({ group: view.group, groupId: group.key })}
                          >
                            <Plus size={13} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {(view.group === 'none' || !view.collapsed.includes(group.key)) &&
                  group.tasks.map((task, index) => (
                    <tr
                      key={task.id}
                      data-task-row={task.id}
                      className={selected.includes(task.id) ? 'sel' : ''}
                      {...contextProps(task)}
                      {...dragProps(task)}
                      {...dropProps(view.group, group.key, task.id)}
                    >
                      {shown.map(c => (
                        <td key={c} data-task-column={c} className={c === 'title' ? 'sticky task-table-title-cell' : ''}>
                          {c === 'title' ? (
                            <div className="row task-table-title">
                              {pick(task)}
                              <TaskStatusIcon status={task.status} size={13} />
                              {cell(task, c)}
                              <div className="table-row-actions">{movement(task, index, group.tasks, view.group, group.key, true)}</div>
                            </div>
                          ) : (
                            cell(task, c)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
              </React.Fragment>
            ))}
            {props.canCreate && (
              <tr className="table-new-row">
                <td colSpan={shown.length}>
                  {composer ? (
                    <GroupComposer
                      projectId={props.projectId}
                      group={composer.group}
                      groupId={composer.groupId}
                      projects={projects}
                      t={t}
                      disabled={busy}
                      creationContext={props.creationContext}
                      create={createTask}
                      onCreated={() => setComposer(null)}
                      onCancel={() => setComposer(null)}
                    />
                  ) : (
                    <Button variant="ghost" className="table-new-task" onClick={() => setComposer({ group: 'none', groupId: 'all' })}>
                      <Plus size={14} />
                      {t('Nova tarefa', 'New task')}
                    </Button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="task-mobile-cards only-m">
        {orderedTasks.map(task => (
          <article className="task-mobile-card panel" key={task.id} {...contextProps(task)}>
            <div className="row">
              {pick(task)}
              <TaskStatusIcon status={task.status} />
              <Button variant="ghost" className="task-mobile-title" onClick={() => props.open(task.id)}>
                {task.title}
              </Button>
              <span className="key faint">{task.key}</span>
            </div>
            <div className="row task-mobile-meta">
              {cell(task, 'priority')}
              <span data-mobile-assignee>{cell(task, 'assignee')}</span>
              <span data-mobile-due>{cell(task, 'due')}</span>
              {task.legacyMetadata.estimate && (
                <span className="num faint">
                  <Timer size={12} />
                  {String(task.legacyMetadata.estimate)}
                </span>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
