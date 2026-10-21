import { useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { addD, diffD, iso, parse } from '../../core/calendar.js';
import type { CalendarEvent, Project, Task, BatchCommand, Json } from '../../domain/contracts';
import type { WorkspaceRepository } from '../../workspace/repository';
import type { Member } from '../../workspace/normalized';
import type { TaskGraph } from '../shell/useWorkspaceData';
import type { Execute } from '../projects/ProjectsPage';
import type { Translate } from '../auth/ConsentPage';
import { Button } from '../../components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../../components/ui/sheet';
import { TaskContextMenu, type ExtraTaskMenuAction } from '../tasks/TaskContextMenu';
import { TaskViewToolbar, groupLabel } from '../tasks/TaskViewToolbar';
import { applyTaskView, readTaskView, groupTaskView } from '../tasks/task-view-model';
import { errorMessage } from '../shell/messages';
import { useSurfaceView } from './useSurfaceView';
import { calendarDays, navigateCalendar, readScheduleDrag, scheduleCommand, milestones, weekStart, validDay, type ScheduleTask } from './schedule-model';
export type ScheduleViewProps = {
  mode: 'calendar' | 'timeline';
  extraTaskMenuActions?: ExtraTaskMenuAction[];
  projectId?: string;
  viewKey?: string;
  initialFilters?: Json[];
  repo: WorkspaceRepository;
  tasks: Task[];
  projects: Project[];
  members: Member[];
  graph: TaskGraph;
  events: CalendarEvent[];
  execute: Execute;
  t: Translate;
  readOnly: boolean;
  openTask: (id: string) => void;
  createTask: (day?: string) => void;
  openProject: (id: string) => void;
};
const projectTone = (project?: Project) => {
  const color = project?.legacyMetadata.color;
  return typeof color === 'string' && ['blue', 'violet', 'teal', 'rose', 'amber', 'green'].includes(color)
    ? `var(--${color})`
    : color === 'slate'
      ? 'var(--gray)'
      : 'var(--accent)';
};
const readView = (v: Record<string, unknown>) => ({
  ...readTaskView(v),
  date: validDay(v.date) ? v.date : iso(new Date()),
  calendarMode: v.calendarMode === 'week' ? 'week' : 'month',
  zoom: v.zoom === 'month' ? 'month' : 'week',
  timelineGroup: ['status', 'assignee', 'project', 'none'].includes(String(v.timelineGroup)) ? String(v.timelineGroup) : 'project',
});
export function ScheduleView(props: ScheduleViewProps) {
  const { repo, projectId, mode, t, readOnly } = props;
  const {
    value: view,
    save,
    prefs,
    ready,
    error,
    setError,
    retry,
  } = useSurfaceView(
    repo,
    props.viewKey ?? `${projectId ? `project:${projectId}:` : ''}${mode}`,
    value => readView({ filters: props.initialFilters ?? [], ...value }),
    t,
    props.initialFilters ? undefined : projectId || (mode === 'calendar' ? 'cal' : 'tl'),
  );
  const [busy, setBusy] = useState(false),
    [event, setEvent] = useState<CalendarEvent | null>(null),
    [overflow, setOverflow] = useState<string | null>(null);
  const [context, setContext] = useState<{ task: Task; x: number; y: number; trigger: HTMLElement } | null>(null);
  const panelOpener = useRef<HTMLElement | null>(null);
  function openTask(id: string) {
    panelOpener.current = null;
    setOverflow(null);
    setEvent(null);
    props.openTask(id);
  }
  function contextTask(task: Task, trigger: HTMLElement, x: number, y: number) {
    setContext({ task, trigger, x, y });
  }
  const scope = useMemo(() => crypto.randomUUID(), [repo, projectId, mode]),
    signal = repo.controller.signal;
  const locale = t('pt-BR', 'en'),
    first = Number(prefs.weekStart) === 0 ? 0 : 1;
  const dateLabel = (date: string) => {
    const day = parse(date)!;
    if (prefs.dateFmt === 'yyyy-MM-dd') return date;
    if (prefs.dateFmt === 'd/M') return `${day.getDate()}/${day.getMonth() + 1}/${day.getFullYear()}`;
    if (prefs.dateFmt === 'M/d') return `${day.getMonth() + 1}/${day.getDate()}/${day.getFullYear()}`;
    return day.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const projects = props.projects.filter(p => !p.archived && (!projectId || p.id === projectId));
  const tasks = props.tasks
    .filter(task => !task.archived && projects.some(p => p.id === task.projectId))
    .map(task => ({
      ...task,
      legacyMetadata: { ...task.legacyMetadata, labels: props.graph.taskLabels.filter(l => l.taskId === task.id).map(l => l.labelId) },
    }));
  const visible = applyTaskView(tasks, view, projects, props.members),
    events = props.events.filter(e => (!projectId || e.projectId === projectId) && (!e.projectId || projects.some(p => p.id === e.projectId)));
  async function run(command: BatchCommand | null) {
    if (busy || readOnly || signal.aborted || !command) return;
    setBusy(true);
    setError('');
    try {
      await props.execute(command.operation, command.input, command.expectedVersion);
    } catch (err) {
      if (!signal.aborted) setError(errorMessage(err, t));
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  function move(task: ScheduleTask, due: string) {
    if (signal.aborted || task.workspaceId !== repo.workspaceId) return;
    try {
      void run(scheduleCommand(task, due));
    } catch (err) {
      setError(errorMessage(err, t));
    }
  }
  const chip = (task: Task) => (
    <button
      key={task.id}
      onContextMenu={e => {
        e.preventDefault();
        contextTask(task, e.currentTarget, e.clientX, e.clientY);
      }}
      onKeyDown={e => {
        if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          contextTask(task, e.currentTarget, rect.left, rect.bottom);
        }
      }}
      style={{ '--schedule-color': projectTone(projects.find(p => p.id === task.projectId)) } as CSSProperties}
      className={`schedule-task ${task.status === 'done' ? 'is-done' : ''}`}
      draggable={!readOnly && !busy}
      onDragStart={e => {
        e.dataTransfer.setData('application/x-gr8r-schedule', JSON.stringify({ scope, task }));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => openTask(task.id)}
      title={`${task.title} · ${dateLabel(task.dueDate!)}`}
    >
      {task.title}
    </button>
  );
  const eventChip = (e: CalendarEvent) => (
    <button
      key={e.id}
      style={{ '--schedule-color': projectTone(projects.find(p => p.id === e.projectId)) } as CSSProperties}
      className="schedule-event"
      onClick={click => {
        // An event opened inside overflow removes its button; retain the calendar opener.
        if (!overflow && !event) panelOpener.current = click.currentTarget;
        setEvent(e);
      }}
    >
      <small>{e.eventTime}</small> {e.title}
    </button>
  );
  const items = (date: string) => [...events.filter(e => e.eventDate === date).map(eventChip), ...visible.filter(task => task.dueDate === date).map(chip)];
  const days = calendarDays(view.date, view.calendarMode, first);
  return (
    <section className="schedule-view">
      {error && (
        <div className="error-row">
          <p role="alert">{error}</p>
          {!ready && <Button onClick={retry}>{t('Tentar novamente', 'Try again')}</Button>}
        </div>
      )}
      {!ready ? (
        <p role="status">{t('Carregando visualização...', 'Loading view...')}</p>
      ) : (
        <>
          <TaskViewToolbar
            view={view}
            setView={v => save({ ...view, ...v })}
            projects={projects}
            members={props.members}
            tasks={tasks}
            t={t}
            table={false}
            grouping={false}
          />
          {mode === 'calendar' ? (
            <>
              <div className="schedule-controls">
                <Button variant="outline" onClick={() => save({ ...view, date: iso(new Date()) })}>
                  {t('Hoje', 'Today')}
                </Button>
                {[-1, 1].map(direction => (
                  <Button
                    key={direction}
                    variant="ghost"
                    aria-label={direction < 0 ? t('Anterior', 'Previous') : t('Próximo', 'Next')}
                    onClick={() => save({ ...view, date: navigateCalendar(view.date, view.calendarMode, direction) })}
                  >
                    {direction < 0 ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                  </Button>
                ))}
                <h2 aria-live="polite">
                  {view.calendarMode === 'month'
                    ? parse(view.date)!.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
                    : `${dateLabel(days[0])} – ${dateLabel(days[6])}`}
                </h2>
                <div className="button-row">
                  {['month', 'week'].map(m => (
                    <Button key={m} variant="outline" aria-pressed={view.calendarMode === m} onClick={() => save({ ...view, calendarMode: m })}>
                      {m === 'month' ? t('Mês', 'Month') : t('Semana', 'Week')}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="schedule-calendar-scroll">
                <div className={`schedule-calendar ${view.calendarMode}`}>
                  {days.slice(0, 7).map(date => (
                    <div key={date} className="schedule-weekday">
                      {parse(date)!.toLocaleDateString(locale, { weekday: 'short' })}
                    </div>
                  ))}
                  {days.map(date => {
                    const rows = items(date);
                    return (
                      <div
                        key={date}
                        data-calendar-day={date}
                        className={`schedule-day ${date.slice(0, 7) !== view.date.slice(0, 7) ? 'outside' : ''}`}
                        onDragOver={e => {
                          if (!readOnly && !busy && e.dataTransfer.types.includes('application/x-gr8r-schedule')) e.preventDefault();
                        }}
                        onDrop={e => {
                          e.preventDefault();
                          const task = readScheduleDrag(e.dataTransfer.getData('application/x-gr8r-schedule'), scope);
                          if (task) move(task, date);
                        }}
                      >
                        <header>
                          <time dateTime={date} aria-current={date === iso(new Date()) ? 'date' : undefined}>
                            {parse(date)!.getDate()}
                          </time>
                          <Button
                            variant="ghost"
                            disabled={readOnly || busy || !projects.length}
                            aria-label={`${t('Adicionar tarefa em', 'Add task on')} ${dateLabel(date)}`}
                            onClick={() => props.createTask(date)}
                          >
                            <Plus size={13} />
                          </Button>
                        </header>
                        {view.calendarMode === 'week' ? rows : rows.slice(0, 3)}
                        {view.calendarMode === 'month' && rows.length > 3 && (
                          <Button
                            variant="ghost"
                            onClick={e => {
                              panelOpener.current = e.currentTarget;
                              setOverflow(date);
                            }}
                          >
                            +{rows.length - 3} {t('mais', 'more')}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <Timeline
              {...props}
              contextTask={contextTask}
              tasks={visible}
              projects={projects}
              group={view.timelineGroup}
              zoom={view.zoom}
              first={first}
              scope={scope}
              busy={busy}
              move={move}
              dateLabel={dateLabel}
              change={patch => save({ ...view, ...patch })}
            />
          )}
        </>
      )}
      {context && (
        <TaskContextMenu
          task={context.task}
          projects={projects}
          x={context.x}
          y={context.y}
          execute={props.execute}
          readOnly={readOnly}
          t={t}
          signal={signal}
          close={(restore = true) => {
            if (restore) context.trigger.focus();
            setContext(null);
          }}
          open={openTask}
          extraActions={props.extraTaskMenuActions}
        />
      )}
      <Sheet
        open={!!overflow || !!event}
        onOpenChange={open => {
          if (!open) {
            setOverflow(null);
            setEvent(null);
          }
        }}
      >
        <SheetContent
          closeLabel={t('Fechar painel', 'Close panel')}
          onCloseAutoFocus={e => {
            e.preventDefault();
            const opener = panelOpener.current;
            panelOpener.current = null;
            if (!signal.aborted && opener?.isConnected) opener.focus();
          }}
        >
          <SheetTitle>{event?.title ?? (overflow ? dateLabel(overflow) : '')}</SheetTitle>
          <SheetDescription>
            {event ? t('Detalhes do evento', 'Event details') : t('Tarefas e eventos nesta data.', 'Tasks and events on this date.')}
          </SheetDescription>
          {event ? (
            <dl>
              <dt>{t('Data', 'Date')}</dt>
              <dd>
                {event.eventDate ? dateLabel(event.eventDate) : '—'} {event.eventTime}
              </dd>
              <dt>{t('Projeto', 'Project')}</dt>
              <dd>{projects.find(p => p.id === event.projectId)?.name ?? '—'}</dd>
              {event.projectId && (
                <Button
                  onClick={() => {
                    panelOpener.current = null;
                    setOverflow(null);
                    setEvent(null);
                    props.openProject(event.projectId!);
                  }}
                >
                  {t('Abrir projeto', 'Open project')}
                </Button>
              )}
            </dl>
          ) : (
            overflow && <div className="schedule-overflow">{items(overflow)}</div>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
function Timeline(
  props: ScheduleViewProps & {
    contextTask: (task: Task, trigger: HTMLElement, x: number, y: number) => void;
    group: string;
    zoom: string;
    first: number;
    scope: string;
    busy: boolean;
    move: (task: ScheduleTask, due: string) => void;
    dateLabel: (date: string) => string;
    change: (patch: { zoom?: string; timelineGroup?: string }) => void;
  },
) {
  const { t, zoom, group, scope, tasks, projects, dateLabel } = props;
  const scroll = useRef<HTMLDivElement>(null),
    pointer = useRef<{ task: Task; x: number; id: number; scope: string } | null>(null),
    suppressClick = useRef(false);
  const [offset, setOffset] = useState<{ id: string; days: number } | null>(null);
  const dw = zoom === 'week' ? 32 : 11,
    count = zoom === 'week' ? 91 : 238,
    start = weekStart(addD(new Date(), zoom === 'week' ? -21 : -56), props.first);
  const X = (date: string) => diffD(parse(date), start) * dw;
  const ms = milestones(projects),
    rows: ({ type: 'milestones' } | { type: 'group'; key: string; count: number } | { type: 'task'; task: Task })[] = ms.length ? [{ type: 'milestones' }] : [];
  for (const g of groupTaskView(
    tasks.filter(task => validDay(task.dueDate)),
    group === 'project' && props.projectId ? 'status' : group,
    projects,
    props.members,
  ).filter(g => g.tasks.length)) {
    if (group !== 'none') rows.push({ type: 'group', key: g.key, count: g.tasks.length });
    rows.push(...g.tasks.sort((a, b) => (a.startDate || a.dueDate!).localeCompare(b.startDate || b.dueDate!)).map(task => ({ type: 'task' as const, task })));
  }
  const y = new Map(rows.flatMap((row, i) => (row.type === 'task' ? [[row.task.id, i * 40 + 20] as const] : [])));
  function end(e: PointerEvent<HTMLButtonElement>) {
    const captured = pointer.current;
    pointer.current = null;
    setOffset(null);
    if (!captured || captured.id !== e.pointerId || captured.scope !== scope || props.repo.controller.signal.aborted) return;
    const days = Math.round((e.clientX - captured.x) / dw);
    if (Math.abs(e.clientX - captured.x) > 4) suppressClick.current = true;
    if (days) props.move(captured.task, iso(addD(parse(captured.task.dueDate!), days)));
  }
  return (
    <>
      <div className="schedule-controls">
        {['week', 'month'].map(z => (
          <Button key={z} variant="outline" aria-pressed={zoom === z} onClick={() => props.change({ zoom: z })}>
            {z === 'week' ? t('Semanas', 'Weeks') : t('Meses', 'Months')}
          </Button>
        ))}
        <label>
          {t('Agrupar', 'Group')}
          <select aria-label={t('Agrupar', 'Group')} value={group} onChange={e => props.change({ timelineGroup: e.target.value })}>
            {['status', 'assignee', 'project', 'none'].map(g => (
              <option key={g} value={g}>
                {g === 'status'
                  ? t('Status', 'Status')
                  : g === 'assignee'
                    ? t('Responsável', 'Assignee')
                    : g === 'project'
                      ? t('Projeto', 'Project')
                      : t('Sem agrupamento', 'No grouping')}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="ghost"
          onClick={() => {
            if (scroll.current) scroll.current.scrollLeft = Math.max(0, X(iso(new Date())) - 160);
          }}
        >
          {t('Hoje', 'Today')}
        </Button>
        <small>{t('Setas movem a barra selecionada em um dia.', 'Arrow keys move the focused bar by one day.')}</small>
      </div>
      {!rows.length ? (
        <p className="work-empty">{t('Nenhuma tarefa com prazo. Defina datas para ver o cronograma.', 'No dated tasks. Set dates to see the timeline.')}</p>
      ) : (
        <div className="schedule-timeline" ref={scroll}>
          <div className="timeline-canvas" style={{ width: count * dw + 220 }}>
            <div className="timeline-heading">
              <strong>{t('Tarefa', 'Task')}</strong>
              <div style={{ width: count * dw }}>
                {Array.from({ length: count / (zoom === 'week' ? 1 : 7) }, (_, i) => {
                  const day = addD(start, i * (zoom === 'week' ? 1 : 7));
                  return (
                    <span key={i} style={{ width: dw * (zoom === 'week' ? 1 : 7) }} title={dateLabel(iso(day))}>
                      {day.toLocaleDateString(t('pt-BR', 'en'), {
                        day: 'numeric',
                        ...(day.getDate() === 1 || zoom === 'month' ? { month: 'short' as const } : {}),
                      })}
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="timeline-body" style={{ height: rows.length * 40 }}>
              {rows.map((row, i) => (
                <div
                  className="timeline-row"
                  key={row.type === 'task' ? row.task.id : row.type === 'group' ? `group:${row.key}` : 'milestones'}
                  style={{ top: i * 40 }}
                >
                  <div className="timeline-row-name">
                    {row.type === 'task' ? (
                      <Button variant="ghost" onClick={() => props.openTask(row.task.id)}>
                        {row.task.title}
                      </Button>
                    ) : (
                      <strong>
                        {row.type === 'milestones'
                          ? t('Marcos', 'Milestones')
                          : `${groupLabel(row.key, group === 'project' && props.projectId ? 'status' : group, projects, props.members, t)} (${row.count})`}
                      </strong>
                    )}
                  </div>
                  {row.type === 'task'
                    ? (() => {
                        const task = row.task,
                          date = task.startDate && task.startDate <= task.dueDate! ? task.startDate : task.dueDate!,
                          width = Math.max(dw, (diffD(parse(task.dueDate!), parse(date)) + 1) * dw);
                        return (
                          <button
                            className={`timeline-bar ${task.status === 'done' ? 'is-done' : ''}`}
                            onContextMenu={e => {
                              e.preventDefault();
                              props.contextTask(task, e.currentTarget, e.clientX, e.clientY);
                            }}
                            data-schedule-bar={task.id}
                            data-due-date={task.dueDate}
                            style={
                              {
                                left: 220 + X(date) + (offset?.id === task.id ? offset.days * dw : 0),
                                width,
                                '--schedule-color': ['status', 'none'].includes(group)
                                  ? projectTone(projects.find(p => p.id === task.projectId))
                                  : `var(--st-${task.status})`,
                              } as CSSProperties
                            }
                            title={`${task.title} · ${dateLabel(date)} → ${dateLabel(task.dueDate!)}`}
                            onClick={() => {
                              if (suppressClick.current) {
                                suppressClick.current = false;
                                return;
                              }
                              props.openTask(task.id);
                            }}
                            onPointerDown={e => {
                              suppressClick.current = false;
                              if (e.button !== 0 || props.busy || props.readOnly) return;
                              pointer.current = { task: structuredClone(task), x: e.clientX, id: e.pointerId, scope };
                              e.currentTarget.setPointerCapture(e.pointerId);
                            }}
                            onPointerMove={e => {
                              if (pointer.current?.id === e.pointerId) setOffset({ id: task.id, days: Math.round((e.clientX - pointer.current.x) / dw) });
                            }}
                            onPointerUp={end}
                            onPointerCancel={() => {
                              pointer.current = null;
                              setOffset(null);
                            }}
                            onKeyDown={e => {
                              if (['ArrowLeft', 'ArrowRight'].includes(e.key) && !props.readOnly && !props.busy) {
                                e.preventDefault();
                                props.move(task, iso(addD(parse(task.dueDate!), e.key === 'ArrowLeft' ? -1 : 1)));
                              }
                            }}
                          >
                            {task.title}
                          </button>
                        );
                      })()
                    : row.type === 'milestones' &&
                      ms.map((point, index) => (
                        <span
                          key={point.date}
                          className="timeline-milestone"
                          tabIndex={0}
                          aria-label={`${t('Marco', 'Milestone')}: ${point.items.map(m => m.name).join(' · ')} · ${dateLabel(point.date)}`}
                          title={`${point.items.map(m => `${m.name} (${m.project.name})`).join(' · ')} · ${dateLabel(point.date)}`}
                          style={{ left: 220 + X(point.date), maxWidth: ms[index + 1] ? Math.max(16, X(ms[index + 1].date) - X(point.date) - 8) : 220 }}
                        >
                          ◆ {point.items[0].name}
                          {point.items.length > 1 ? ` +${point.items.length - 1}` : ''}
                        </span>
                      ))}
                </div>
              ))}
              <div className="timeline-today" style={{ left: 220 + X(iso(new Date())) + dw / 2 }} aria-label={t('Hoje', 'Today')} />
              <svg className="timeline-dependencies" width={count * dw} height={rows.length * 40} aria-label={t('Dependências', 'Dependencies')}>
                {props.graph.dependencies.map(dep => {
                  const a = tasks.find(task => task.id === dep.dependsOnTaskId),
                    b = tasks.find(task => task.id === dep.taskId);
                  if (!a?.dueDate || !b?.dueDate || !y.has(a.id) || !y.has(b.id)) return null;
                  const x1 = X(a.dueDate) + dw,
                    x2 = X(b.startDate && b.startDate <= b.dueDate ? b.startDate : b.dueDate);
                  return (
                    <path
                      key={`${a.id}:${b.id}`}
                      d={`M${x1} ${y.get(a.id)} C${x1 + 12} ${y.get(a.id)},${x2 - 12} ${y.get(b.id)},${x2} ${y.get(b.id)}`}
                      fill="none"
                      stroke="var(--text-3)"
                      strokeWidth="1.3"
                      strokeDasharray={x2 < x1 ? '3 3' : undefined}
                    />
                  );
                })}
              </svg>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
