import { useTaskDetails } from '../shell/useWorkspaceData';
import { usePagedCollection } from '../shell/usePagedCollection';
import type { Comment, ActivityEntry } from '../../domain/contracts';
import type { DomainEvent } from '../../workspace/normalized';
import { useCallback, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { iso, addD } from '../../core/calendar.js';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '../../components/ui/alert-dialog';
import type { Task } from '../../domain/contracts';
import { errorMessage } from '../shell/messages';
import { TaskList, statusLabel } from '../tasks/TaskList';
import { ScheduleView } from '../schedules/ScheduleView';
import { TaskDiscussionSection } from '../tasks/TaskDiscussionSection';
import { ActivityPage } from '../activity/ActivityPage';
import { PeoplePages } from './PeoplePages';
import { SettingsPage } from './SettingsPage';
import { CataloguePage } from './CataloguePage';
import { preferredDate, notificationDay } from './panel-model';
import type { PanelProps } from './types';
export const remainingRoutes = [
  'home',
  'inbox',
  'mytasks',
  'favorites',
  'notifications',
  'search',
  'overview',
  'members',
  'member',
  'teams',
  'team',
  'archive',
  'settings',
  'system',
  'states',
  'activity',
];
export function RemainingRoutes(p: PanelProps) {
  if (['members', 'member', 'teams', 'team'].includes(p.route)) return <PeoplePages {...p} />;
  if (p.route === 'settings') return <SettingsPage {...p} />;
  if (p.route === 'system' || p.route === 'states') return <CataloguePage {...p} />;
  if (p.route === 'inbox' || p.route === 'notifications') return <NotificationsPage {...p} />;
  if (p.route === 'search') return <SearchPage key={JSON.stringify([p.params.get('q'), p.params.get('category')])} {...p} />;
  if (p.route === 'archive') return <ArchivePage {...p} />;
  if (p.route === 'activity') return <HistoryPage {...p} />;
  if (p.route === 'mytasks') return <MyTasks {...p} />;
  return <Dashboard {...p} />;
}
function TaskRows({ tasks, p }: { tasks: Task[]; p: PanelProps }) {
  const [error, setError] = useState('');
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {tasks.map(task => (
        <div className="panel-row" key={task.id}>
          <input
            type="checkbox"
            aria-label={p.t('Concluir: ', 'Complete: ') + task.title}
            checked={task.status === 'done'}
            disabled={p.readOnly || !!task.reservation?.active}
            onChange={() =>
              void p
                .execute(
                  task.status === 'done' ? 'update_task' : 'complete_task',
                  { id: task.id, ...(task.status === 'done' ? { status: 'todo' } : {}) },
                  task.version,
                )
                .catch(e => setError(errorMessage(e, p.t)))
            }
          />
          <button className="inline-link" onClick={() => p.openTask(task.id)}>
            {task.title}
          </button>
          <time>{preferredDate(task.dueDate, p.prefs, p.t('pt-BR', 'en'))}</time>
        </div>
      ))}
      {!tasks.length && <p className="work-empty">{p.t('Nenhuma tarefa nesta lista.', 'No tasks in this list.')}</p>}
    </>
  );
}
function Dashboard(p: PanelProps) {
  const { snapshot: s, t } = p,
    today = iso(new Date()),
    tasks = s.tasks.filter(task => !task.archived && s.projects.some(project => project.id === task.projectId && !project.archived)),
    projects = s.projects.filter(project => !project.archived),
    mine = tasks.filter(task => task.assigneeUserId === s.actorId),
    done = tasks.filter(task => task.status === 'done'),
    overdue = tasks.filter(task => task.status !== 'done' && task.dueDate && task.dueDate < today);
  const [error, setError] = useState('');
  if (p.route === 'favorites')
    return (
      <section className="panel-page">
        {error && <p role="alert">{error}</p>}
        <h2>{t('Projetos favoritos', 'Favorite projects')}</h2>
        {projects
          .filter(project => s.preferences.favoriteProjectIds.includes(project.id))
          .map(project => (
            <div className="panel-row" key={project.id}>
              <button className="inline-link" onClick={() => p.openProject(project.id)}>
                {project.name}
              </button>
              <Button variant="ghost" onClick={() => void p.toggleFavorite(project.id, 'project').catch(e => setError(errorMessage(e, t)))}>
                {t('Remover favorito', 'Remove favorite')}
              </Button>
            </div>
          ))}
        <h2>{t('Tarefas favoritas', 'Favorite tasks')}</h2>
        <TaskRows p={p} tasks={tasks.filter(task => s.preferences.favoriteTaskIds.includes(task.id))} />
        <Button variant="outline" onClick={() => p.go('projects')}>
          {t('Explorar projetos', 'Browse projects')}
        </Button>
      </section>
    );
  return (
    <section className="panel-page">
      <div className="button-row">
        <Button disabled={p.readOnly} onClick={() => p.createTask(s.actorId)}>
          {t('Nova tarefa', 'New task')}
        </Button>
        <Button disabled={p.readOnly} variant="outline" onClick={() => p.go('projects', { create: 'true' })}>
          {t('Novo projeto', 'New project')}
        </Button>
        <Button variant="ghost" onClick={() => p.go('members')}>
          {t('Convidar pessoas', 'Invite people')}
        </Button>
      </div>
      {p.route === 'home' && (
        <p>
          {t('Olá, ', 'Hello, ')}
          {s.members.find(m => m.user_id === s.actorId)?.name ?? t('você', 'you')} ·{' '}
          {new Date().toLocaleDateString(t('pt-BR', 'en'), { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      )}
      <div className="panel-metrics">
        {[
          [t('Projetos', 'Projects'), projects.length, 'projects', ''],
          [t('Em aberto', 'Open'), tasks.length - done.length, 'tasks', 'open'],
          [t('Concluídas', 'Completed'), done.length, 'tasks', 'done'],
          [t('Atrasadas', 'Overdue'), overdue.length, 'tasks', 'overdue'],
        ].map(([label, count, route, filter]) => (
          <button className="panel-card" key={String(label)} onClick={() => p.go(String(route), { filter: String(filter) })}>
            <strong>{count}</strong>
            <span>{label}</span>
          </button>
        ))}
      </div>
      {p.route === 'home' ? (
        <>
          <h2>{t('Minhas tarefas', 'My tasks')}</h2>
          <TaskRows
            p={p}
            tasks={mine
              .filter(task => task.status !== 'done')
              .sort((a, b) => (a.dueDate ?? 'z').localeCompare(b.dueDate ?? 'z'))
              .slice(0, 8)}
          />
          <h2>{t('Prazos próximos', 'Upcoming deadlines')}</h2>
          <TaskRows
            p={p}
            tasks={tasks
              .filter(task => task.status !== 'done' && task.dueDate)
              .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
              .slice(0, 6)}
          />
        </>
      ) : (
        <>
          <h2>{t('Distribuição de tarefas', 'Task distribution')}</h2>
          <div className="panel-metrics">
            {['backlog', 'todo', 'progress', 'review', 'done'].map(status => (
              <div key={status}>
                <strong>{tasks.filter(task => task.status === status).length}</strong>
                <span>{statusLabel(status, t)}</span>
              </div>
            ))}
          </div>
          <h2>{t('Carga por pessoa', 'Workload by person')}</h2>
          {s.members.map(member => (
            <div className="panel-row" key={member.user_id}>
              <button className="inline-link" onClick={() => p.go('member', { id: member.user_id })}>
                {member.name}
              </button>
              <span>{tasks.filter(task => task.assigneeUserId === member.user_id && task.status !== 'done').length}</span>
            </div>
          ))}
        </>
      )}
      <h2>{t('Progresso dos projetos', 'Project progress')}</h2>
      {projects.map(project => {
        const rows = tasks.filter(task => task.projectId === project.id),
          completed = rows.filter(task => task.status === 'done').length;
        return (
          <article className="panel-row" key={project.id}>
            <button className="inline-link" onClick={() => p.openProject(project.id)}>
              {project.name}
            </button>
            <progress aria-label={project.name} value={completed} max={rows.length || 1} />
            <span>
              {completed}/{rows.length}
            </span>
            <Button variant="ghost" onClick={() => p.openProject(project.id, 'timeline')}>
              {t('Cronograma', 'Timeline')}
            </Button>
          </article>
        );
      })}
      <h2>{t('Marcos', 'Milestones')}</h2>
      {projects.flatMap(project =>
        Array.isArray(project.legacyMetadata.milestones)
          ? project.legacyMetadata.milestones.map((milestone, index) =>
              milestone && typeof milestone === 'object' && !Array.isArray(milestone) ? (
                <Button key={project.id + index} variant="ghost" onClick={() => p.openProject(project.id, 'timeline')}>
                  {String(milestone.title ?? milestone.name ?? '')} {String(milestone.date ?? '')}
                </Button>
              ) : null,
            )
          : [],
      )}
      <h2>{t('Atividade recente', 'Recent activity')}</h2>
      <HistoryPage {...p} compact />
    </section>
  );
}
function MyTasks(p: PanelProps) {
  const [calendar, setCalendar] = useState(false),
    [group, setGroup] = useState('today');
  const { snapshot: s, t } = p,
    today = iso(new Date()),
    mine = s.tasks.filter(task => !task.archived && task.assigneeUserId === s.actorId),
    groups = {
      overdue: mine.filter(task => task.status !== 'done' && task.dueDate && task.dueDate < today),
      today: mine.filter(task => task.status !== 'done' && task.dueDate === today),
      upcoming: mine.filter(task => task.status !== 'done' && (!task.dueDate || task.dueDate > today)),
      completed: mine.filter(task => task.status === 'done'),
    };
  return (
    <section className="panel-page">
      <div className="button-row">
        <Button variant={!calendar ? 'default' : 'ghost'} onClick={() => setCalendar(false)}>
          {t('Lista', 'List')}
        </Button>
        <Button variant={calendar ? 'default' : 'ghost'} onClick={() => setCalendar(true)}>
          {t('Calendário', 'Calendar')}
        </Button>
        <Button
          disabled={p.readOnly}
          onClick={() =>
            p.createTask(
              s.actorId,
              group === 'today' ? today : group === 'overdue' ? iso(addD(new Date(), -1)) : undefined,
              group === 'completed' ? 'done' : undefined,
            )
          }
        >
          {t('Adicionar tarefa neste grupo', 'Add task in this group')}
        </Button>
      </div>
      {calendar ? (
        <ScheduleView
          mode="calendar"
          repo={p.repo}
          tasks={mine}
          projects={s.projects}
          members={s.members}
          graph={s}
          events={[]}
          execute={p.execute}
          t={t}
          readOnly={p.readOnly}
          openTask={p.openTask}
          createTask={day => p.createTask(s.actorId, day)}
          openProject={p.openProject}
          initialFilters={[]}
        />
      ) : (
        <>
          <div className="button-row">
            {Object.entries(groups).map(([key, rows]) => (
              <Button key={key} variant={group === key ? 'default' : 'ghost'} onClick={() => setGroup(key)}>
                {
                  (
                    {
                      overdue: t('Atrasadas', 'Overdue'),
                      today: t('Hoje', 'Today'),
                      upcoming: t('Próximas', 'Upcoming'),
                      completed: t('Concluídas', 'Completed'),
                    } as Record<string, string>
                  )[key]
                }{' '}
                ({rows.length})
              </Button>
            ))}
          </div>
          <TaskList
            key={group}
            tasks={groups[group as keyof typeof groups]}
            projects={s.projects}
            members={s.members}
            agents={s.agents}
            graph={s}
            repo={p.repo}
            execute={p.execute}
            t={t}
            board={false}
            canCreate={!p.readOnly}
            open={p.openTask}
            view={() => {}}
            href={() => ''}
            hideLayoutSwitch
            viewKey={'mytasks:' + group}
            creationContext={{
              assigneeUserId: s.actorId,
              ...(group === 'today' ? { dueDate: today } : group === 'overdue' ? { dueDate: iso(addD(new Date(), -1)) } : {}),
              ...(group === 'completed' ? { status: 'done' as const } : {}),
            }}
          />
        </>
      )}
    </section>
  );
}
function NotificationsPage(p: PanelProps) {
  const { snapshot: s, t } = p;
  const replyGuard = useRef<import('../tasks/TaskDrawer').DraftGuard | null>(null);
  const registerReply = useCallback(
    (guard: import('../tasks/TaskDrawer').DraftGuard | null) => {
      replyGuard.current = guard;
      p.registerDraft(guard);
    },
    [p.registerDraft],
  );
  const canSwitch = async () => !busy && (!replyGuard.current?.dirty || (await replyGuard.current.flush()));

  const [unread, setUnread] = useState(false),
    [category, setCategory] = useState('all'),
    [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const rows = s.notifications.filter(n => (!unread || !s.preferences.notificationReadStates[n.id]) && (category === 'all' || n.notificationType === category)),
    notification = s.notifications.find(n => n.id === selected),
    task = s.tasks.find(task => task.id === notification?.taskId);
  const detail = useTaskDetails(p.repo, task?.id, s.tasks.reduce((sum, row) => sum + row.version, 0) + s.events.length, t, s);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel-page">
      <div className="panel-toolbar">
        <label className="panel-check">
          <input type="checkbox" checked={unread} onChange={e => setUnread(e.target.checked)} />
          {t('Somente não lidas', 'Unread only')} ({s.notifications.filter(n => !s.preferences.notificationReadStates[n.id]).length})
        </label>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void action(() =>
              p.markNotifications(
                s.notifications.map(n => n.id),
                true,
              ),
            )
          }
        >
          {t('Marcar todas como lidas', 'Mark all as read')}
        </Button>
        <Button variant="ghost" onClick={() => p.go('settings', { sec: 'notif-email' })}>
          {t('Preferências de notificações', 'Notification preferences')}
        </Button>
      </div>
      {p.route === 'inbox' && (
        <div className="button-row">
          {['all', 'mention', 'assign', 'comment', 'update'].map(key => (
            <Button key={key} variant={category === key ? 'default' : 'ghost'} onClick={() => setCategory(key)}>
              {
                (
                  {
                    all: t('Todas', 'All'),
                    mention: t('Menções', 'Mentions'),
                    assign: t('Atribuições', 'Assignments'),
                    comment: t('Comentários', 'Comments'),
                    update: t('Atualizações', 'Updates'),
                  } as Record<string, string>
                )[key]
              }{' '}
              ({s.notifications.filter(n => key === 'all' || n.notificationType === key).length})
            </Button>
          ))}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <div className={'inbox-layout' + (notification ? ' has-selection' : '')}>
        <div className="inbox-list">
          {rows.map((n, index) => (
            <div key={n.id}>
              {(index === 0 || notificationDay(rows[index - 1].legacyMetadata.at) !== notificationDay(n.legacyMetadata.at)) && (
                <h3>
                  {preferredDate(
                    typeof n.legacyMetadata.at === 'number' ? new Date(n.legacyMetadata.at).toISOString() : String(n.legacyMetadata.at ?? ''),
                    p.prefs,
                    t('pt-BR', 'en'),
                  )}
                </h3>
              )}
              <article className="panel-row">
                <button
                  className="inline-link"
                  onClick={() =>
                    void (async () => {
                      if (n.id !== selected && !(await canSwitch())) return;
                      await action(async () => {
                        await p.markNotifications([n.id], true);
                        if (p.route === 'inbox') setSelected(n.id);
                        else if (n.taskId) p.openTask(n.taskId);
                        else if (n.projectId) p.openProject(n.projectId);
                      });
                    })()
                  }
                >
                  <strong>{String(n.legacyMetadata.text ?? n.legacyMetadata.title ?? n.notificationType)}</strong>
                  <p>{String(n.legacyMetadata.snippet ?? '')}</p>
                  {!s.preferences.notificationReadStates[n.id] && <small>{t('Não lida', 'Unread')}</small>}
                </button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void action(() => p.markNotifications([n.id], !s.preferences.notificationReadStates[n.id]))}
                >
                  {s.preferences.notificationReadStates[n.id] ? t('Marcar não lida', 'Mark unread') : t('Marcar lida', 'Mark read')}
                </Button>
              </article>
            </div>
          ))}
          {!rows.length && <p className="work-empty">{t('Nenhuma notificação.', 'No notifications.')}</p>}
        </div>
        {notification && (
          <section className="inbox-preview" aria-label={t('Conversa selecionada', 'Selected conversation')}>
            <Button
              variant="outline"
              onClick={() =>
                void canSwitch().then(allowed => {
                  if (allowed) setSelected(null);
                })
              }
            >
              {t('Voltar', 'Back')}
            </Button>
            <h2>{String(notification.legacyMetadata.text ?? notification.notificationType)}</h2>
            {task ? (
              <>
                <Button onClick={() => p.openTask(task.id)}>{task.title}</Button>
                {detail.error && <Button onClick={detail.retry}>{t('Tentar histórico novamente', 'Retry history')}</Button>}
                <TaskDiscussionSection
                  registerDraft={registerReply}
                  task={task}
                  comments={detail.comments}
                  more={detail.more}
                  loadMore={detail.loadMore}
                  reactions={detail.reactions}
                  events={detail.events}
                  history={detail.history}
                  members={s.members}
                  agents={s.agents}
                  actorId={s.actorId}
                  admin={p.admin}
                  action={async fn => {
                    await action(fn);
                  }}
                  execute={p.execute}
                  disabled={p.readOnly || busy || detail.loading || !!detail.error}
                  t={t}
                />
              </>
            ) : notification.projectId ? (
              <Button onClick={() => p.openProject(notification.projectId!)}>{t('Abrir projeto', 'Open project')}</Button>
            ) : (
              <p>{String(notification.legacyMetadata.snippet ?? '')}</p>
            )}
          </section>
        )}
      </div>
    </section>
  );
}
function SearchPage(p: PanelProps) {
  const { snapshot: s, t } = p;
  const commentPage = usePagedCollection<Comment>(p.repo, 'list_comments', {}, s.events.length);
  const visibleTaskIds = new Set(s.tasks.map(task => task.id));
  const [q, setQ] = useState(p.params.get('q') ?? ''),
    [category, setCategory] = useState(p.params.get('category') ?? 'all'),
    [error, setError] = useState('');
  const recent = Array.isArray(p.prefs.recentSearches) ? p.prefs.recentSearches.filter((v): v is string => typeof v === 'string') : [];
  const results = [
    ...s.tasks.filter(x => !x.archived).map(x => ({ id: x.id, kind: 'tasks', text: x.title, open: () => p.openTask(x.id) })),
    ...s.projects.filter(x => !x.archived).map(x => ({ id: x.id, kind: 'projects', text: x.name, open: () => p.openProject(x.id) })),
    ...s.members.map(x => ({ id: x.user_id, kind: 'people', text: x.name + ' ' + x.email, open: () => p.go('member', { id: x.user_id }) })),
    ...s.files.map(x => ({ id: x.id, kind: 'files', text: x.name, open: () => p.go('files', { file: x.id }) })),
    ...commentPage.items
      .filter(x => visibleTaskIds.has(x.taskId))
      .map(x => ({ id: x.id, kind: 'comments', text: DOMPurify.sanitize(x.body, { ALLOWED_TAGS: [] }), open: () => p.openTask(x.taskId) })),
  ].filter(x => q.trim() && x.text.toLocaleLowerCase().includes(q.toLocaleLowerCase()));
  async function remember() {
    if (q.trim()) await p.savePrefs({ recentSearches: [q, ...recent.filter(x => x !== q)].slice(0, 10) });
  }
  function highlight(text: string) {
    const index = text.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());
    return index < 0 ? (
      text
    ) : (
      <>
        {text.slice(0, index)}
        <mark>{text.slice(index, index + q.length)}</mark>
        {text.slice(index + q.length)}
      </>
    );
  }
  return (
    <section className="panel-page">
      <form
        className="panel-toolbar"
        onSubmit={e => {
          e.preventDefault();
          void remember().catch(e => setError(errorMessage(e, t)));
        }}
      >
        <label>
          {t('Buscar no espaço', 'Search workspace')}
          <Input autoFocus value={q} onChange={e => setQ(e.target.value)} />
        </label>
        <Button>{t('Buscar', 'Search')}</Button>
        <Button type="button" variant="ghost" onClick={() => setQ('')}>
          {t('Limpar busca', 'Clear search')}
        </Button>
      </form>
      {error && <p role="alert">{error}</p>}
      {(commentPage.more || commentPage.error) && (
        <p role="status">
          {t('Busca parcial. Há mais comentários para consultar.', 'Partial search. More comments remain to search.')}{' '}
          <Button disabled={commentPage.loading} onClick={() => void commentPage.loadMore()}>
            {t('Carregar mais comentários', 'Load more comments')}
          </Button>
        </p>
      )}
      <div className="button-row">
        {['all', 'tasks', 'projects', 'people', 'files', 'comments'].map(key => (
          <Button key={key} variant={category === key ? 'default' : 'ghost'} onClick={() => setCategory(key)}>
            {
              (
                {
                  all: t('Tudo', 'All'),
                  tasks: t('Tarefas', 'Tasks'),
                  projects: t('Projetos', 'Projects'),
                  people: t('Pessoas', 'People'),
                  files: t('Arquivos', 'Files'),
                  comments: t('Comentários', 'Comments'),
                } as Record<string, string>
              )[key]
            }{' '}
            ({results.filter(x => key === 'all' || x.kind === key).length})
          </Button>
        ))}
      </div>
      {results
        .filter(x => category === 'all' || x.kind === category)
        .map(x => (
          <div className="panel-row" key={x.kind + x.id}>
            <button
              className="inline-link"
              onClick={() =>
                void remember()
                  .then(x.open)
                  .catch(e => setError(errorMessage(e, t)))
              }
            >
              {highlight(x.text)}
            </button>
          </div>
        ))}
      {q && !results.length && commentPage.complete && <p>{t('Nenhum resultado.', 'No results.')}</p>}
      {!q && (
        <>
          <h2>{t('Buscas recentes', 'Recent searches')}</h2>
          {recent.map(value => (
            <Button key={value} variant="ghost" onClick={() => setQ(value)}>
              {value}
            </Button>
          ))}
          <Button variant="outline" onClick={() => void p.savePrefs({ recentSearches: [] }).catch(e => setError(errorMessage(e, t)))}>
            {t('Limpar histórico', 'Clear history')}
          </Button>
        </>
      )}
    </section>
  );
}
export function ArchivePage(p: PanelProps) {
  const { snapshot: s, t } = p;
  const [tab, setTab] = useState('all'),
    [error, setError] = useState(''),
    [remove, setRemove] = useState<{ id: string; kind: string; version: number } | null>(null),
    [busy, setBusy] = useState(false);
  async function action(kind: string, id: string, version: number, permanent = false) {
    setBusy(true);
    setError('');
    try {
      await p.execute(`${permanent ? 'delete' : 'restore'}_${kind}`, { id }, version);
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }
  const rows = [
    ...s.projects
      .filter(x => x.archived)
      .map(x => ({ id: x.id, name: x.name, kind: 'project', version: x.version, date: String(x.legacyMetadata.archivedAt ?? '') })),
    ...s.tasks.filter(x => x.archived).map(x => ({ id: x.id, name: x.title, kind: 'task', version: x.version, date: x.archivedAt ?? '' })),
  ];
  return (
    <section className="panel-page">
      <div className="button-row">
        {[
          ['all', t('Tudo', 'All')],
          ['project', t('Projetos', 'Projects')],
          ['task', t('Tarefas', 'Tasks')],
        ].map(([key, label]) => (
          <Button key={key} variant={tab === key ? 'default' : 'ghost'} onClick={() => setTab(key)}>
            {label} ({rows.filter(x => key === 'all' || x.kind === key).length})
          </Button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      {rows
        .filter(x => tab === 'all' || x.kind === tab)
        .map(row => (
          <article className="panel-row" key={row.kind + row.id}>
            <div>
              <strong>{row.name}</strong>
              <p>{preferredDate(row.date, p.prefs, t('pt-BR', 'en'))}</p>
            </div>
            <div className="button-row">
              <Button disabled={p.readOnly || busy} variant="outline" onClick={() => void action(row.kind, row.id, row.version)}>
                {t('Restaurar', 'Restore')}
              </Button>
              <Button disabled={p.readOnly || busy} variant="destructive" onClick={() => setRemove(row)}>
                {t('Excluir permanentemente', 'Delete permanently')}
              </Button>
            </div>
          </article>
        ))}
      {!rows.length && <p className="work-empty">{t('O arquivo está vazio.', 'The archive is empty.')}</p>}
      <AlertDialog
        open={!!remove}
        onOpenChange={open => {
          if (!open) setRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{t('Excluir permanentemente?', 'Delete permanently?')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'Esta ação não pode ser desfeita. Relações ativas precisam ser desvinculadas antes.',
              'This action cannot be undone. Active relations must be unlinked first.',
            )}
          </AlertDialogDescription>
          <div className="button-row">
            <AlertDialogCancel asChild>
              <Button variant="outline">{t('Cancelar', 'Cancel')}</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                onClick={() => {
                  if (remove) void action(remove.kind, remove.id, remove.version, true);
                }}
              >
                {t('Confirmar exclusão', 'Confirm deletion')}
              </Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
function HistoryPage(p: PanelProps & { compact?: boolean }) {
  const { snapshot: s, t } = p;
  const activityPage = usePagedCollection<ActivityEntry>(p.repo, 'list_activity', {}, s.events.length);
  const eventPage = usePagedCollection<DomainEvent>(p.repo, 'list_domain_events', {}, s.events.length);
  const visible = (row: { projectId?: string | null; taskId?: string | null }) =>
    p.repo.mode === 'cloud' || ((!row.projectId || s.projects.some(p => p.id === row.projectId)) && (!row.taskId || s.tasks.some(t => t.id === row.taskId)));
  const [actor, setActor] = useState(''),
    [category, setCategory] = useState('all');
  const match = (operation: string) =>
    category === 'all' ||
    (category === 'status' ? /status|complete|update_task/.test(operation) : category === 'comments' ? /comment/.test(operation) : /project/.test(operation));
  const history = activityPage.items.filter(visible).filter(e => (!actor || e.actorUserId === actor) && match(e.verb)),
    events = eventPage.items.filter(e => visible(e.payload)).filter(e => (!actor || e.actorUserId === actor) && match(e.operation));
  return (
    <section>
      {(activityPage.more || eventPage.more || activityPage.error || eventPage.error) && (
        <p role="status">
          {t('Histórico parcial. Continue para consultar registros anteriores.', 'Partial history. Continue to view further records.')}
          <Button
            disabled={activityPage.loading || eventPage.loading}
            onClick={() => {
              if (activityPage.more) void activityPage.loadMore();
              if (eventPage.more) void eventPage.loadMore();
            }}
          >
            {t('Carregar mais histórico', 'Load more history')}
          </Button>
        </p>
      )}
      {!p.compact && (
        <div className="panel-toolbar">
          <label>
            {t('Tipo', 'Type')}
            <select value={category} onChange={e => setCategory(e.target.value)}>
              {[
                ['all', t('Tudo', 'All')],
                ['status', t('Mudanças de status', 'Status changes')],
                ['comments', t('Comentários', 'Comments')],
                ['projects', t('Projetos', 'Projects')],
              ].map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Pessoa', 'Person')}
            <select value={actor} onChange={e => setActor(e.target.value)}>
              <option value="">{t('Todas', 'All')}</option>
              {s.members.map(m => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <ActivityPage events={p.compact ? events.slice(-5) : events} members={s.members} agents={s.agents} tasks={s.tasks} openTask={p.openTask} t={t} />
      {(p.compact ? history.slice(0, 5) : history).map((entry, index) => (
        <div key={entry.id}>
          {(index === 0 || history[index - 1]?.createdAt.slice(0, 10) !== entry.createdAt.slice(0, 10)) && (
            <h3>{preferredDate(entry.createdAt, p.prefs, t('pt-BR', 'en'))}</h3>
          )}
          <div className="panel-row">
            <span>
              {s.members.find(m => m.user_id === entry.actorUserId)?.name ?? t('Autor histórico', 'Historical author')} {entry.verb}
            </span>
            {entry.taskId && (
              <Button variant="ghost" onClick={() => p.openTask(entry.taskId!)}>
                {s.tasks.find(task => task.id === entry.taskId)?.title ?? t('Abrir tarefa', 'Open task')}
              </Button>
            )}
            {entry.projectId && (
              <Button variant="ghost" onClick={() => p.openProject(entry.projectId!)}>
                {s.projects.find(project => project.id === entry.projectId)?.name ?? t('Abrir projeto', 'Open project')}
              </Button>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
