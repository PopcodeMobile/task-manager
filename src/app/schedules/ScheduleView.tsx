import { weekStartsOn, preferredDate } from '../panel/panel-model';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent } from 'react';
import { Plus, ChevronLeft, ChevronRight, Clock, Calendar, Crosshair } from 'lucide-react';
import { addD, diffD, iso, parse } from '../../core/calendar.js';
import type { CalendarEvent, Project, Task, BatchCommand, Json } from '../../domain/contracts';
import type { WorkspaceRepository } from '../../workspace/repository';
import type { Member } from '../../workspace/normalized';
import type { TaskGraph } from '../shell/useWorkspaceData';
import type { Execute } from '../projects/ProjectsPage';
import type { Translate } from '../auth/ConsentPage';
import { Button } from '../../components/ui/button';
import { AnchoredSurface } from '../tasks/AnchoredSurface';
import { statusLabel, priorityLabel } from '../tasks/TaskList';
import { TaskContextMenu, type ExtraTaskMenuAction } from '../tasks/TaskContextMenu';
import { MemberAvatar, projectTone as projectColor } from '../projects/ProjectVisual';
import { TaskStatusIcon, TaskPriorityIcon } from '../tasks/TaskVisual';
import { TaskViewToolbar, groupLabel } from '../tasks/TaskViewToolbar';
import { applyTaskView, readTaskView, groupTaskView, type TaskView } from '../tasks/task-view-model';
import { errorMessage } from '../shell/messages';
import { useSurfaceView } from './useSurfaceView';
import { calendarDays, navigateCalendar, readScheduleDrag, scheduleCommand, milestones, weekStart, validDay, type ScheduleTask } from './schedule-model';
export type ScheduleViewProps = {
  mode: 'calendar' | 'timeline';
  toolbarActions?: ReactNode;
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
  openTask: (id: string, options?: { quick?: boolean }) => void;
  createTask: (day?: string) => void;
  openProject: (id: string) => void;
};
const projectTone = (project?: Project) => (project ? projectColor(project) : 'var(--accent)');
const readView = (v: Record<string, unknown>) => ({
  ...readTaskView(v),
  date: validDay(v.date) ? v.date : iso(new Date()),
  calendarMode: v.calendarMode === 'week' ? 'week' : 'month',
  zoom: v.zoom === 'month' ? 'month' : 'week',
  timelineGroup: ['status', 'assignee', 'project', 'none'].includes(String(v.timelineGroup)) ? String(v.timelineGroup) : 'project',
});
export function ScheduleView(props: ScheduleViewProps) {
  const { repo, projectId, mode, t, readOnly } = props;
  const surface = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const fit = () => {
      if (surface.current) surface.current.style.height = `${Math.max(640, innerHeight - surface.current.getBoundingClientRect().top)}px`;
    };
    fit();
    addEventListener('resize', fit);
    const observer = new ResizeObserver(fit);
    if (surface.current?.parentElement) observer.observe(surface.current.parentElement);
    return () => {
      removeEventListener('resize', fit);
      observer.disconnect();
    };
  }, [mode]);
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
  function openTask(id: string, options?: { quick?: boolean }) {
    panelOpener.current = null;
    setOverflow(null);
    setEvent(null);
    props.openTask(id, options);
  }
  function contextTask(task: Task, trigger: HTMLElement, x: number, y: number) {
    setContext({ task, trigger, x, y });
  }
  const scope = useMemo(() => crypto.randomUUID(), [repo, projectId, mode]),
    signal = repo.controller.signal;
  const locale = t('pt-BR', 'en'),
    first = weekStartsOn(prefs.weekStart);
  const dateLabel = (date: string) => preferredDate(date, prefs, locale);
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
      className={`schedule-task cev ${task.status === 'done' ? 'is-done done' : ''}`}
      data-week={view.calendarMode === 'week'}
      draggable={!readOnly && !busy}
      onDragStart={e => {
        e.dataTransfer.setData('application/x-gr8r-schedule', JSON.stringify({ scope, task }));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => openTask(task.id)}
      title={`${task.title} · ${dateLabel(task.dueDate!)}`}
    >
      {task.status === 'done' ? <TaskStatusIcon status={task.status} size={12} /> : <TaskPriorityIcon priority={task.priority} size={12} />}
      <span className="trunc">{task.title}</span>
      <MemberAvatar member={props.members.find(m => m.user_id === task.assigneeUserId)} />
    </button>
  );
  const eventChip = (e: CalendarEvent) => (
    <button
      key={e.id}
      style={{ '--schedule-color': projectTone(projects.find(p => p.id === e.projectId)) } as CSSProperties}
      className="schedule-event cev event"
      onClick={click => {
        // An event opened inside overflow removes its button; retain the calendar opener.
        if (!overflow && !event) panelOpener.current = click.currentTarget;
        setEvent(e);
      }}
    >
      <small>{e.eventTime}</small>
      <span className="trunc">{e.title}</span>
    </button>
  );
  const items = (date: string) => [...events.filter(e => e.eventDate === date).map(eventChip), ...visible.filter(task => task.dueDate === date).map(chip)];
  const days = calendarDays(view.date, view.calendarMode, first);
  return (
    <section className="schedule-view" ref={surface}>
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
          {mode === 'calendar' && (
            <TaskViewToolbar
              view={view}
              setView={v => save({ ...view, ...v })}
              projects={projects}
              members={props.members}
              tasks={tasks}
              t={t}
              table={false}
              grouping={false}
              right={props.toolbarActions}
            />
          )}
          {mode === 'calendar' ? (
            <div className="calendar-content">
              <div className="schedule-controls schedule-navigation">
                <Button variant="outline" onClick={() => save({ ...view, date: iso(new Date()) })}>
                  {t('Hoje', 'Today')}
                </Button>
                <div className="schedule-nav-arrows">
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
                </div>
                <h2 aria-live="polite">
                  {view.calendarMode === 'month'
                    ? parse(view.date)!.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
                    : `${dateLabel(days[0])} – ${dateLabel(days[6])}`}
                </h2>
                {!projectId && (
                  <ul className="calendar-project-legend hide-m" aria-label={t('Projetos no calendário', 'Calendar projects')}>
                    {projects
                      .filter(project => visible.some(task => task.projectId === project.id))
                      .slice(0, 5)
                      .map(project => (
                        <li key={project.id}>
                          <span className="pdot" style={{ '--c': projectTone(project) } as CSSProperties} />
                          {project.name}
                        </li>
                      ))}
                  </ul>
                )}
                <div className="button-row seg">
                  {['month', 'week'].map(m => (
                    <Button
                      key={m}
                      className={view.calendarMode === m ? 'on' : undefined}
                      variant="ghost"
                      aria-pressed={view.calendarMode === m}
                      onClick={() => save({ ...view, calendarMode: m })}
                    >
                      {m === 'month' ? t('Mês', 'Month') : t('Semana', 'Week')}
                    </Button>
                  ))}
                </div>
              </div>
              {view.calendarMode === 'week' ? (
                <div className="week schedule-week">
                  {days.map(date => {
                    const dayTasks = visible.filter(task => task.dueDate === date),
                      dayEvents = events.filter(event => event.eventDate === date);
                    return (
                      <div
                        className={`wcol ${date === iso(new Date()) ? 'today' : ''}`}
                        key={date}
                        data-calendar-day={date}
                        onDragOver={e => {
                          if (!readOnly && !busy && e.dataTransfer.types.includes('application/x-gr8r-schedule')) e.preventDefault();
                        }}
                        onDrop={e => {
                          e.preventDefault();
                          const task = readScheduleDrag(e.dataTransfer.getData('application/x-gr8r-schedule'), scope);
                          if (task) move(task, date);
                        }}
                      >
                        <header className="wcol-h">
                          <strong className="n">{parse(date)!.getDate()}</strong>
                          <span>{parse(date)!.toLocaleDateString(locale, { weekday: 'short' })}</span>
                          <Button
                            className="ibtn ibtn-xs"
                            variant="ghost"
                            disabled={readOnly || busy || !projects.length}
                            aria-label={`${t('Adicionar tarefa em', 'Add task on')} ${dateLabel(date)}`}
                            onClick={() => props.createTask(date)}
                          >
                            <Plus size={13} />
                          </Button>
                        </header>
                        <div className="wcol-b">
                          {dayEvents.map(e => (
                            <button
                              key={e.id}
                              className="wcard event"
                              style={{ '--c': projectTone(projects.find(p => p.id === e.projectId)) } as CSSProperties}
                              onClick={click => {
                                panelOpener.current = click.currentTarget;
                                setEvent(e);
                              }}
                            >
                              <span className="wcard-title">
                                <span className="pdot" style={{ '--c': projectTone(projects.find(p => p.id === e.projectId)) } as CSSProperties} />
                                {e.title}
                              </span>
                              <span className="m">
                                <Clock size={12} />
                                {e.eventTime}
                                <span className="trunc">{projects.find(p => p.id === e.projectId)?.name}</span>
                              </span>
                            </button>
                          ))}
                          {dayTasks.map(task => (
                            <button
                              key={task.id}
                              className={`wcard ${task.status === 'done' ? 'done' : ''}`}
                              draggable={!readOnly && !busy}
                              onDragStart={e => {
                                e.dataTransfer.setData('application/x-gr8r-schedule', JSON.stringify({ scope, task }));
                                e.dataTransfer.effectAllowed = 'move';
                              }}
                              onClick={() => openTask(task.id)}
                              onContextMenu={e => {
                                e.preventDefault();
                                contextTask(task, e.currentTarget, e.clientX, e.clientY);
                              }}
                              onKeyDown={e => {
                                if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
                                  e.preventDefault();
                                  const r = e.currentTarget.getBoundingClientRect();
                                  contextTask(task, e.currentTarget, r.left, r.bottom);
                                }
                              }}
                            >
                              <span className="wcard-title">
                                <span className="pdot" style={{ '--c': projectTone(projects.find(p => p.id === task.projectId)) } as CSSProperties} />
                                <span>{task.title}</span>
                              </span>
                              <span className="m">
                                <span title={statusLabel(task.status, t)}>
                                  <TaskStatusIcon status={task.status} size={12} />
                                </span>
                                <span title={priorityLabel(task.priority, t)}>
                                  <TaskPriorityIcon priority={task.priority} size={12} />
                                </span>
                                <span className="trunc">{projects.find(p => p.id === task.projectId)?.name}</span>
                                <MemberAvatar member={props.members.find(m => m.user_id === task.assigneeUserId)} />
                              </span>
                            </button>
                          ))}
                          {!dayTasks.length && !dayEvents.length && <p className="wempty">{t('Nenhuma tarefa', 'No tasks')}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="schedule-calendar-scroll cal">
                  <div
                    className={`schedule-calendar ${view.calendarMode}`}
                    style={{ gridTemplateRows: `34px repeat(${days.length / 7},minmax(112px,1fr))`, '--calendar-weeks': days.length / 7 } as CSSProperties}
                  >
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
                          className={`schedule-day cday ${date.slice(0, 7) !== view.date.slice(0, 7) ? 'outside out' : ''} ${date === iso(new Date()) ? 'today' : ''}`}
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
                            <time className="dn" dateTime={date} aria-current={date === iso(new Date()) ? 'date' : undefined}>
                              {parse(date)!.getDate()}
                            </time>
                            <Button
                              variant="ghost"
                              className="add ibtn ibtn-xs"
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
              )}
            </div>
          ) : (
            <Timeline
              {...props}
              view={view}
              setTaskView={v => save({ ...view, ...v })}
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
      {(event || overflow) && (
        <AnchoredSurface
          key={event ? `event:${event.id}` : `overflow:${overflow}`}
          anchor={panelOpener}
          width={event ? 270 : 280}
          label={event ? t('Detalhes do evento', 'Event details') : dateLabel(overflow!)}
          className="schedule-detail-popover"
          close={() => {
            setOverflow(null);
            setEvent(null);
          }}
        >
          <header>
            <strong>{event?.title ?? dateLabel(overflow!)}</strong>
            <Button
              className="ibtn ibtn-xs"
              variant="ghost"
              aria-label={t('Fechar', 'Close')}
              onClick={() => {
                setOverflow(null);
                setEvent(null);
                panelOpener.current?.focus();
              }}
            >
              ×
            </Button>
          </header>
          {event ? (
            <>
              <div className="event-detail-row">
                <Calendar size={14} />
                <span>
                  {event.eventDate ? dateLabel(event.eventDate) : '—'}
                  {event.eventTime && ` · ${event.eventTime}`}
                </span>
              </div>
              <div className="event-detail-row">
                <span className="pdot" style={{ '--c': projectTone(projects.find(p => p.id === event.projectId)) } as CSSProperties} />
                <span>{projects.find(p => p.id === event.projectId)?.name ?? '—'}</span>
              </div>
              {event.projectId && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEvent(null);
                    setOverflow(null);
                    props.openProject(event.projectId!);
                  }}
                >
                  {t('Abrir projeto', 'Open project')}
                </Button>
              )}
            </>
          ) : (
            <div className="schedule-overflow">{items(overflow!)}</div>
          )}
        </AnchoredSurface>
      )}
    </section>
  );
}
function Timeline(
  props: ScheduleViewProps & {
    view: TaskView;
    setTaskView: (view: TaskView) => void;
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
  useEffect(() => {
    if (scroll.current) scroll.current.scrollLeft = Math.max(0, diffD(new Date(), start) * dw - 160);
  }, [zoom, scope]);
  const months: { label: string; width: number }[] = [];
  for (let i = 0; i < count; i++) {
    const day = addD(start, i),
      label = day.toLocaleDateString(t('pt-BR', 'en'), { month: 'long', year: 'numeric' });
    const last = months.at(-1);
    if (last?.label === label) last.width += dw;
    else months.push({ label, width: dw });
  }
  const ms = milestones(projects),
    rows: ({ type: 'milestones' } | { type: 'group'; key: string; count: number } | { type: 'task'; task: Task })[] = ms.length ? [{ type: 'milestones' }] : [];
  for (const g of groupTaskView(
    tasks.filter(task => validDay(task.dueDate)),
    group === 'project' && props.projectId ? 'status' : group,
    projects,
    props.members,
  ).filter(g => g.tasks.length)) {
    if (group !== 'none') rows.push({ type: 'group', key: g.key, count: g.tasks.length });
    rows.push(...g.tasks.sort((a, b) => ((a.startDate || a.dueDate!) > (b.startDate || b.dueDate!) ? 1 : -1)).map(task => ({ type: 'task' as const, task })));
  }
  const y = new Map(rows.flatMap((row, i) => (row.type === 'task' ? [[row.task.id, i * 36 + 18] as const] : [])));
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
      <TaskViewToolbar
        view={props.view}
        setView={props.setTaskView}
        projects={projects}
        tasks={tasks}
        members={props.members}
        t={t}
        table={false}
        grouping={false}
        right={props.toolbarActions}
        extra={
          <div className="timeline-controls">
            {['week', 'month'].map(z => (
              <Button key={z} variant="outline" aria-pressed={zoom === z} onClick={() => props.change({ zoom: z })}>
                {z === 'week' ? t('Semanas', 'Weeks') : t('Meses', 'Months')}
              </Button>
            ))}
            <label>
              <span className="sr-only">{t('Agrupar', 'Group')}</span>
              <select aria-label={t('Agrupar', 'Group')} value={group} onChange={e => props.change({ timelineGroup: e.target.value })}>
                {['status', 'assignee', 'project', 'none'].map(g => (
                  <option key={g} value={g}>
                    {g === 'status'
                      ? t('Agrupar: Status', 'Group: Status')
                      : g === 'assignee'
                        ? t('Agrupar: Responsável', 'Group: Assignee')
                        : g === 'project'
                          ? t('Agrupar: Projeto', 'Group: Project')
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
              <Crosshair size={14} />
              {t('Hoje', 'Today')}
            </Button>
          </div>
        }
      />
      {!rows.length ? (
        <p className="work-empty">{t('Nenhuma tarefa com prazo. Defina datas para ver o cronograma.', 'No dated tasks. Set dates to see the timeline.')}</p>
      ) : (
        <div className="schedule-timeline" ref={scroll}>
          <div className="timeline-canvas" style={{ width: count * dw + 300 }}>
            <div className="timeline-heading">
              <strong>{t('Tarefa', 'Task')}</strong>
              <div className="timeline-date-heading" style={{ width: count * dw }}>
                <div className="tl-months">
                  {months.map(month => (
                    <div key={month.label} style={{ width: month.width }}>
                      <span>{month.label}</span>
                    </div>
                  ))}
                </div>
                <div className="tl-days">
                  {Array.from({ length: Math.ceil(count / (zoom === 'week' ? 1 : 7)) }, (_, i) => {
                    const day = addD(start, i * (zoom === 'week' ? 1 : 7));
                    return (
                      <span
                        key={i}
                        className={`${day.getDay() === 0 || day.getDay() === 6 ? 'weekend' : ''} ${iso(day) === iso(new Date()) ? 'today' : ''}`}
                        style={{ width: dw * (zoom === 'week' ? 1 : 7) }}
                        title={dateLabel(iso(day))}
                      >
                        {day.getDate()}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="timeline-body" style={{ height: rows.length * 36 }}>
              <div className="timeline-grid" aria-hidden="true">
                {Array.from({ length: count }, (_, i) => {
                  const d = addD(start, i);
                  return (
                    (d.getDay() === 0 || d.getDay() === 6 || d.getDay() === props.first) && (
                      <span
                        key={i}
                        className={d.getDay() === 0 || d.getDay() === 6 ? 'timeline-weekend' : 'timeline-week-line'}
                        style={{ left: 300 + i * dw, width: dw }}
                      />
                    )
                  );
                })}
              </div>
              {rows.map((row, i) => (
                <div
                  className={`timeline-row ${row.type === 'group' ? 'timeline-group-row' : ''}`}
                  key={row.type === 'task' ? row.task.id : row.type === 'group' ? `group:${row.key}` : 'milestones'}
                  style={{ top: i * 36 }}
                >
                  <div className="timeline-row-name">
                    {row.type === 'task' ? (
                      <Button variant="ghost" onClick={() => props.openTask(row.task.id)}>
                        <TaskStatusIcon status={row.task.status} size={13} />
                        <span className="trunc">{row.task.title}</span>
                        {!!props.graph.subtasks.filter(s => s.taskId === row.task.id).length && (
                          <small>
                            {props.graph.subtasks.filter(s => s.taskId === row.task.id && s.done).length}/
                            {props.graph.subtasks.filter(s => s.taskId === row.task.id).length}
                          </small>
                        )}
                        <MemberAvatar member={props.members.find(m => m.user_id === row.task.assigneeUserId)} />
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
                          <>
                            <button
                              aria-label={task.title}
                              className={`timeline-bar ${task.status === 'done' ? 'is-done' : ''}`}
                              onContextMenu={e => {
                                e.preventDefault();
                                props.contextTask(task, e.currentTarget, e.clientX, e.clientY);
                              }}
                              data-schedule-bar={task.id}
                              data-due-date={task.dueDate}
                              style={
                                {
                                  left: 300 + X(date) + (offset?.id === task.id ? offset.days * dw : 0),
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
                              <span
                                className="timeline-bar-progress"
                                style={{
                                  width: `${task.status === 'done' ? 100 : props.graph.subtasks.filter(s => s.taskId === task.id).length ? (props.graph.subtasks.filter(s => s.taskId === task.id && s.done).length / props.graph.subtasks.filter(s => s.taskId === task.id).length) * 100 : 0}%`,
                                }}
                              />
                              {width > 110 && (
                                <>
                                  <MemberAvatar member={props.members.find(m => m.user_id === task.assigneeUserId)} />
                                  <span className="trunc">{task.title}</span>
                                </>
                              )}
                            </button>
                            {width <= 110 && (
                              <span className="bar-lbl" style={{ left: 300 + X(date) + width + 8 + (offset?.id === task.id ? offset.days * dw : 0) }}>
                                {task.title}
                              </span>
                            )}
                          </>
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
                          style={{ left: 300 + X(point.date) + dw / 2 - 6, color: projectTone(point.items[0].project) }}
                        >
                          <span className="milestone-diamond" />
                          {(!ms[index + 1] || X(ms[index + 1].date) - X(point.date) - 24 >= 28) && (
                            <span
                              className="milestone-label"
                              style={{ maxWidth: ms[index + 1] ? Math.round(X(ms[index + 1].date) - X(point.date) - 24) : undefined }}
                            >
                              {point.items[0].name}
                              {point.items.length > 1 ? ` +${point.items.length - 1}` : ''}
                            </span>
                          )}
                        </span>
                      ))}
                </div>
              ))}
              <div className="timeline-today" style={{ left: 300 + X(iso(new Date())) + dw / 2 }} aria-label={t('Hoje', 'Today')} />
              <svg className="timeline-dependencies" width={count * dw} height={rows.length * 36} aria-label={t('Dependências', 'Dependencies')}>
                <defs>
                  <marker id={`timeline-arrow-${scope}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0 0 L6 3 L0 6" fill="var(--text-3)" />
                  </marker>
                </defs>
                {props.graph.dependencies.map(dep => {
                  const a = tasks.find(task => task.id === dep.dependsOnTaskId),
                    b = tasks.find(task => task.id === dep.taskId);
                  if (!a?.dueDate || !b?.dueDate || !y.has(a.id) || !y.has(b.id)) return null;
                  const x1 = X(a.dueDate) + dw,
                    x2 = X(b.startDate && b.startDate <= b.dueDate ? b.startDate : b.dueDate);
                  return (
                    <path
                      key={`${a.id}:${b.id}`}
                      d={`M${x1} ${y.get(a.id)} C${Math.max(x1 + 10, x2 - 10)} ${y.get(a.id)},${Math.min(x1 + 10, x2 - 10)} ${y.get(b.id)},${x2 - 1} ${y.get(b.id)}`}
                      fill="none"
                      stroke="var(--text-3)"
                      markerEnd={`url(#timeline-arrow-${scope})`}
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
