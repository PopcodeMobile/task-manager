import { useTaskDetails } from '../shell/useWorkspaceData';
import { fileTone, FileTypeIcon } from '../files/FilesView';
import { usePagedCollection } from '../shell/usePagedCollection';
import type { Comment, ActivityEntry } from '../../domain/contracts';
import type { DomainEvent } from '../../workspace/normalized';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Bot,
  Plus,
  Search,
  MailOpen,
  CheckCheck,
  Settings2,
  Mail,
  Clock,
  AtSign,
  UserPlus,
  MessageSquare,
  RefreshCw,
  TriangleAlert,
  Archive as ArchiveIcon,
  History,
  X,
  RotateCcw,
  Trash2,
  Calendar,
  ArrowLeft,
  PanelRightOpen,
} from 'lucide-react';
import { PersonAvatar, projectColor, ProjectMark, ProjectState, relativeDate } from './PanelVisual';
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
import { errorMessage } from '../shell/messages';
import { TaskStatusIcon, TaskPriorityIcon } from '../tasks/TaskVisual';
import { TaskList, statusLabel, priorityLabel } from '../tasks/TaskList';
import { ScheduleView } from '../schedules/ScheduleView';
import { TaskDiscussionSection } from '../tasks/TaskDiscussionSection';
import { ActivityPage } from '../activity/ActivityPage';
import { PeoplePages } from './PeoplePages';
import { SettingsPage } from './SettingsPage';
import { CataloguePage } from './CataloguePage';
import { Dashboard } from './Dashboard';
import { preferredDate } from './panel-model';
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
  return <Dashboard {...p} recentActivity={<HistoryPage {...p} compact />} />;
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
    <section className="page flush mytasks-page">
      <div className="ph">
        <div>
          <h1>{t('Minhas tarefas', 'My Tasks')}</h1>
          <p>
            {groups.today.length} {t('para hoje', 'due today')} · {groups.overdue.length} {t('atrasadas', 'overdue')} · {groups.upcoming.length}{' '}
            {t('próximas', 'upcoming')}
          </p>
        </div>
        <div className="acts">
          <div className="seg">
            <Button variant="ghost" className={!calendar ? 'on' : ''} onClick={() => setCalendar(false)}>
              {t('Lista', 'List')}
            </Button>
            <Button variant="ghost" className={calendar ? 'on' : ''} onClick={() => setCalendar(true)}>
              {t('Calendário', 'Calendar')}
            </Button>
          </div>
          <Button
            aria-label={t('Adicionar tarefa neste grupo', 'Add task in this group')}
            disabled={p.readOnly}
            onClick={() =>
              p.createTask(
                s.actorId,
                group === 'today' ? today : group === 'overdue' ? iso(addD(new Date(), -1)) : undefined,
                group === 'completed' ? 'done' : undefined,
              )
            }
          >
            <Plus size={14} />
            {t('Nova tarefa', 'New task')}
          </Button>
        </div>
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
          <TaskList
            tasks={mine}
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
            columnOrder={['title', 'project', 'status', 'priority', 'due']}
            defaultView={{ sort: { f: 'due', dir: 1 }, hidden: ['assignee', 'start', 'created', 'deps'] }}
            viewKey="mytasks"
            fixedGroups={Object.entries(groups).map(([key, rows]) => ({
              key,
              name: (
                {
                  overdue: t('Atrasadas', 'Overdue'),
                  today: t('Hoje', 'Today'),
                  upcoming: t('Próximas', 'Upcoming'),
                  completed: t('Concluídas', 'Completed'),
                } as Record<string, string>
              )[key],
              taskIds: rows.map(task => task.id),
              collapsed: key === 'completed',
              onSelect: () => setGroup(key),
              creationContext: {
                assigneeUserId: s.actorId,
                ...(key === 'today' ? { dueDate: today } : key === 'overdue' ? { dueDate: iso(addD(new Date(), -1)) } : {}),
                ...(key === 'completed' ? { status: 'done' as const } : {}),
              },
            }))}
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
  const rows = s.notifications
      .filter(n => (!unread || !s.preferences.notificationReadStates[n.id]) && (category === 'all' || n.notificationType === category))
      .sort((a, b) => notificationTimestamp(b.legacyMetadata.at) - notificationTimestamp(a.legacyMetadata.at)),
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
  const inbox = p.route === 'inbox';
  const unreadCount = s.notifications.filter(n => !s.preferences.notificationReadStates[n.id]).length;
  const markAll = (
    <Button
      variant={inbox ? 'ghost' : 'outline'}
      className={inbox ? 'ibtn ibtn-sm' : ''}
      aria-label={t('Marcar todas como lidas', 'Mark all as read')}
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
      <CheckCheck size={14} />
      {!inbox && t('Marcar todas como lidas', 'Mark all as read')}
    </Button>
  );
  const renderNotification = (n: (typeof rows)[number]) => {
    const person = s.members.find(member => member.user_id === n.authorUserId);
    const linkedTask = s.tasks.find(task => task.id === n.taskId);
    const project = s.projects.find(project => project.id === (n.projectId ?? linkedTask?.projectId));
    const TypeIcon =
      ({ mention: AtSign, assign: UserPlus, comment: MessageSquare, update: RefreshCw } as Record<string, typeof Clock>)[n.notificationType] ?? Clock;
    return (
      <div key={n.id}>
        <article className={'nrow panel-row' + (!s.preferences.notificationReadStates[n.id] ? ' unread' : '') + (n.id === selected ? ' selected' : '')}>
          {person ? (
            <PersonAvatar member={person} size="md" />
          ) : (
            <span className={'av md ' + (n.projectId ? 'notification-risk' : 'notification-clock')}>
              {n.notificationType === 'update' && n.projectId ? <TriangleAlert size={13} /> : <Clock size={13} />}
            </span>
          )}
          <button
            className="inline-link"
            onClick={() =>
              void (async () => {
                if (n.id !== selected && !(await canSwitch())) return;
                await action(async () => {
                  await p.markNotifications([n.id], true);
                  if (inbox) setSelected(n.id);
                  else if (n.taskId) p.openTask(n.taskId);
                  else if (n.projectId) p.openProject(n.projectId);
                });
              })()
            }
          >
            <span>
              {person ? (
                <>
                  <strong>{person.name}</strong> <span className="muted">{String(n.legacyMetadata.text ?? n.legacyMetadata.title ?? n.notificationType)}</span>
                  {linkedTask && <strong> {linkedTask.title}</strong>}
                </>
              ) : linkedTask ? (
                <>
                  <strong>{linkedTask.title}</strong> <span className="muted">{String(n.legacyMetadata.text ?? n.notificationType)}</span>
                </>
              ) : (
                <strong>{String(n.legacyMetadata.text ?? n.legacyMetadata.title ?? n.notificationType)}</strong>
              )}
            </span>
            <p className="trunc">
              {notificationSnippet(
                String(n.legacyMetadata.snippet ?? ''),
                s.members.map(member => member.name),
              )}
            </p>
            <span className="row notification-meta">
              <TypeIcon size={11} />
              {project && (
                <>
                  <span className="pdot" style={{ '--c': projectColor(project) } as CSSProperties} />
                  {project.name}
                  <span>·</span>
                </>
              )}
              <time>{relativeTime(n.legacyMetadata.at, p)}</time>
            </span>
          </button>
          {!s.preferences.notificationReadStates[n.id] && <span className="notification-unread-dot" aria-label={t('Não lida', 'Unread')} />}
          <Button
            variant="ghost"
            className="ibtn ibtn-xs"
            aria-label={s.preferences.notificationReadStates[n.id] ? t('Marcar não lida', 'Mark unread') : t('Marcar lida', 'Mark read')}
            disabled={busy}
            onClick={() => void action(() => p.markNotifications([n.id], !s.preferences.notificationReadStates[n.id]))}
          >
            {s.preferences.notificationReadStates[n.id] ? <Mail size={13} /> : <MailOpen size={13} />}
          </Button>
        </article>
      </div>
    );
  };
  const buckets = new Map<string, typeof rows>();
  for (const row of rows) {
    const label = notificationBucket(row.legacyMetadata.at, p);
    buckets.set(label, [...(buckets.get(label) ?? []), row]);
  }
  const list = (
    <div className="inbox-list">
      {inbox
        ? rows.map(renderNotification)
        : [...buckets].map(([label, entries]) => (
            <section className="notification-day" key={label}>
              <h3 className="day-h">{label}</h3>
              <div className="panel notification-group">{entries.map(renderNotification)}</div>
            </section>
          ))}
      {!rows.length && (
        <div className="empty-state sm">
          <div className="glyph">
            <MailOpen size={20} />
          </div>
          <h2 className="es-h">{t('Nenhuma notificação.', 'No notifications.')}</h2>
        </div>
      )}
    </div>
  );
  return (
    <section className={'page notifications-page' + (inbox ? ' inbox-page flush' : '')}>
      {!inbox && (
        <div className="ph">
          <div>
            <h1 className="row">
              {t('Notificações', 'Notifications')}
              {unreadCount > 0 && (
                <span className="badge accent">
                  {unreadCount} {t('não lidas', 'unread')}
                </span>
              )}
            </h1>
            <p>{t('Atualizações nas tarefas e projetos que você acompanha.', 'Updates on tasks and projects you follow.')}</p>
          </div>
          <div className="acts">
            <div className="seg">
              <Button variant="ghost" className={!unread ? 'on' : ''} onClick={() => setUnread(false)}>
                {t('Todas', 'All')}
              </Button>
              <Button variant="ghost" className={unread ? 'on' : ''} onClick={() => setUnread(true)}>
                {t('Não lidas', 'Unread')}
              </Button>
            </div>
            {markAll}
            <Button
              variant="ghost"
              className="ibtn"
              aria-label={t('Preferências de notificações', 'Notification preferences')}
              onClick={() => p.go('settings', { sec: 'notif-email' })}
            >
              <Settings2 size={16} />
            </Button>
          </div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <div className={'inbox-layout' + (notification ? ' has-selection' : '')}>
        {inbox ? (
          <div className="inbox-sidebar">
            <div className="row inbox-heading">
              <h1>{t('Caixa de entrada', 'Inbox')}</h1>
              <span className="sp" />
              <label className="row">
                <input className="toggle" type="checkbox" checked={unread} onChange={e => setUnread(e.target.checked)} />
                {t('Não lidas', 'Unread')}
              </label>
              {markAll}
            </div>
            <div className="tabs inbox-tabs" role="tablist">
              {['all', 'mention', 'assign', 'comment', 'update'].map(key => (
                <Button
                  key={key}
                  role="tab"
                  aria-selected={category === key}
                  variant="ghost"
                  className={'tab' + (category === key ? ' on' : '')}
                  onClick={() => setCategory(key)}
                >
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
                  }
                  {s.notifications.some(n => (key === 'all' || n.notificationType === key) && !s.preferences.notificationReadStates[n.id]) && (
                    <span className="cnt">
                      {s.notifications.filter(n => (key === 'all' || n.notificationType === key) && !s.preferences.notificationReadStates[n.id]).length}
                    </span>
                  )}
                </Button>
              ))}
            </div>
            {list}
          </div>
        ) : (
          list
        )}
        {!notification && inbox && (
          <section className="inbox-preview inbox-placeholder">
            <div className="empty-state">
              <div className="glyph">
                <MailOpen size={20} />
              </div>
              <h2 className="es-h">{t('Selecione uma notificação', 'Select a notification')}</h2>
              <p>{t('Leia a conversa e responda sem sair da caixa de entrada.', 'Read the conversation and reply without leaving your inbox.')}</p>
            </div>
          </section>
        )}
        {notification && (
          <section className="inbox-preview" aria-label={t('Conversa selecionada', 'Selected conversation')}>
            <div className="inbox-conversation-head">
              <Button
                className="ibtn ibtn-sm"
                variant="ghost"
                aria-label={t('Voltar', 'Back')}
                onClick={() =>
                  void canSwitch().then(allowed => {
                    if (allowed) setSelected(null);
                  })
                }
              >
                <ArrowLeft size={15} />
              </Button>
              {task && (
                <>
                  <span className="pdot" style={{ '--c': projectColor(s.projects.find(project => project.id === task.projectId)) } as CSSProperties} />
                  <span className="muted">{s.projects.find(project => project.id === task.projectId)?.name}</span>
                  <span className="faint mono">{task.key}</span>
                  <span className="sp" />
                  <Button className="btn-sm" variant="outline" onClick={() => p.openTask(task.id)}>
                    <PanelRightOpen size={14} />
                    {t('Abrir tarefa', 'Open task')}
                  </Button>
                </>
              )}
            </div>
            {task ? (
              <div className="inbox-conversation-body">
                <h2>{task.title}</h2>
                <div className="row inbox-task-properties">
                  <Button variant="ghost" className="pillbtn" onClick={() => p.openTask(task.id)}>
                    <TaskStatusIcon status={task.status} />
                    {statusLabel(task.status, t)}
                  </Button>
                  <Button variant="ghost" className="pillbtn" onClick={() => p.openTask(task.id)}>
                    <PersonAvatar member={s.members.find(member => member.user_id === task.assigneeUserId)} />
                    {s.members.find(member => member.user_id === task.assigneeUserId)?.name ?? t('Sem responsável', 'Unassigned')}
                  </Button>
                  <Button variant="ghost" className="pillbtn" onClick={() => p.openTask(task.id)}>
                    <TaskPriorityIcon priority={task.priority} />
                    {priorityLabel(task.priority, t)}
                  </Button>
                  <Button variant="ghost" className="pillbtn" onClick={() => p.openTask(task.id)}>
                    <Calendar size={12} />
                    {relativeDate(task.dueDate, p) || t('Sem prazo', 'No due date')}
                  </Button>
                </div>
                <div className="eyebrow">{t('Conversa', 'Conversation')}</div>
                {!detail.loading && !detail.error && !detail.comments.length && !detail.more && (
                  <p className="muted inbox-conversation-snippet">
                    {notificationSnippet(
                      String(notification.legacyMetadata.snippet ?? ''),
                      s.members.map(member => member.name),
                    )}
                  </p>
                )}
                {detail.error && <Button onClick={detail.retry}>{t('Tentar histórico novamente', 'Retry history')}</Button>}
                <TaskDiscussionSection
                  compact
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
              </div>
            ) : (
              <div className="inbox-conversation-body">
                <div className="alert danger">
                  <TriangleAlert size={16} />
                  <div>
                    <b>{String(notification.legacyMetadata.text ?? notification.notificationType)}</b>
                    <div className="muted">{String(notification.legacyMetadata.snippet ?? '')}</div>
                  </div>
                </div>
                {notification.projectId && (
                  <Button variant="outline" onClick={() => p.openProject(notification.projectId!)}>
                    {t('Abrir projeto', 'Open project')}
                  </Button>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </section>
  );
}
function notificationSnippet(text: string, names: string[]) {
  const mentions = names.map(name => '@' + name).filter(name => text.includes(name));
  if (!mentions.length) return text;
  const pattern = new RegExp('(' + mentions.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'g');
  return text.split(pattern).map((part, index) =>
    mentions.includes(part) ? (
      <span className="notification-mention" key={index}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}
function notificationTimestamp(value: unknown) {
  const number = new Date(typeof value === 'number' ? value : String(value)).valueOf();
  return Number.isNaN(number) ? 0 : number;
}
function notificationBucket(value: unknown, p: Pick<PanelProps, 't'>) {
  const date = new Date(notificationTimestamp(value)),
    today = new Date();
  date.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.valueOf() - date.valueOf()) / 86400000);
  return days === 0 ? p.t('Hoje', 'Today') : days === 1 ? p.t('Ontem', 'Yesterday') : days < 7 ? p.t('Esta semana', 'This week') : p.t('Anterior', 'Earlier');
}
function relativeTime(value: unknown, p: Pick<PanelProps, 't' | 'prefs'>) {
  const date = new Date(typeof value === 'number' ? value : String(value));
  if (Number.isNaN(date.valueOf())) return '';
  const minutes = Math.round((Date.now() - date.valueOf()) / 60000);
  if (minutes < 1) return p.t('agora', 'just now');
  if (minutes < 60) return `${minutes}m ${p.t('atrás', 'ago')}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ${p.t('atrás', 'ago')}`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ${p.t('atrás', 'ago')}`;
  return preferredDate(date.toISOString(), p.prefs, p.t('pt-BR', 'en'));
}
function SearchPage(p: PanelProps) {
  const { snapshot: s, t } = p;
  const commentPage = usePagedCollection<Comment>(p.repo, 'list_comments', {}, s.events.length);
  const visibleTaskIds = new Set(s.tasks.map(task => task.id));
  const [q, setQ] = useState(p.params.get('q') ?? ''),
    [category, setCategory] = useState(p.params.get('category') ?? 'all'),
    [error, setError] = useState(''),
    [localRecent, setLocalRecent] = useState<string[]>([]);
  useEffect(() => {
    if (p.repo.mode !== 'local') return;
    let active = true;
    void p.repo
      .rpc<{ recentSearches?: unknown }>('get_local_settings')
      .then(value => {
        if (active) setLocalRecent(Array.isArray(value.recentSearches) ? value.recentSearches.filter((item): item is string => typeof item === 'string') : []);
      })
      .catch(error => {
        if (active) setError(errorMessage(error, t));
      });
    return () => {
      active = false;
    };
  }, [p.repo, t]);
  const recent = Array.isArray(p.prefs.recentSearches) ? p.prefs.recentSearches.filter((v): v is string => typeof v === 'string') : localRecent;
  const results = [
    ...s.tasks.filter(x => !x.archived).map(x => ({ id: x.id, kind: 'tasks' as const, entity: x, text: x.title, open: () => p.openTask(x.id) })),
    ...s.projects.filter(x => !x.archived).map(x => ({ id: x.id, kind: 'projects' as const, entity: x, text: x.name, open: () => p.openProject(x.id) })),
    ...s.members.map(x => ({ id: x.user_id, kind: 'people' as const, entity: x, text: x.name + ' ' + x.email, open: () => p.go('member', { id: x.user_id }) })),
    ...s.files.map(x => ({ id: x.id, kind: 'files' as const, entity: x, text: x.name, open: () => p.go('files', { file: x.id }) })),
    ...commentPage.items
      .filter(x => visibleTaskIds.has(x.taskId))
      .map(x => ({ id: x.id, kind: 'comments' as const, entity: x, text: DOMPurify.sanitize(x.body, { ALLOWED_TAGS: [] }), open: () => p.openTask(x.taskId) })),
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
    <section className="page search-page">
      <h1 className="sr-only">{t('Busca', 'Search')}</h1>
      <form
        className="panel-toolbar search-form"
        onSubmit={e => {
          e.preventDefault();
          void remember().catch(e => setError(errorMessage(e, t)));
        }}
      >
        <label className="search-field">
          <span className="sr-only">{t('Buscar no espaço', 'Search workspace')}</span>
          <Search size={16} />
          <Input
            className="input-lg"
            placeholder={t('Buscar tarefas, projetos, pessoas, arquivos e comentários', 'Search tasks, projects, people, files, and comments')}
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </label>

        {q && (
          <Button className="ibtn search-clear" type="button" variant="ghost" aria-label={t('Limpar busca', 'Clear search')} onClick={() => setQ('')}>
            <X size={14} />
          </Button>
        )}
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
      <div className="tabs">
        {['all', 'tasks', 'projects', 'people', 'files', 'comments'].map(key => (
          <Button key={key} variant="ghost" className={'tab' + (category === key ? ' on' : '')} onClick={() => setCategory(key)}>
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
            <span className="cnt">{results.filter(x => key === 'all' || x.kind === key).length}</span>
          </Button>
        ))}
      </div>
      {(['tasks', 'projects', 'people', 'files', 'comments'] as const).map(kind => {
        const rows = results.filter(result => result.kind === kind);
        if (!rows.length || (category !== 'all' && category !== kind)) return null;
        return (
          <section className="search-result-section" key={kind}>
            <h2 className="eyebrow">
              {
                {
                  tasks: t('Tarefas', 'Tasks'),
                  projects: t('Projetos', 'Projects'),
                  people: t('Pessoas', 'People'),
                  files: t('Arquivos', 'Files'),
                  comments: t('Comentários', 'Comments'),
                }[kind]
              }{' '}
              · {rows.length}
            </h2>
            <div className="panel">
              {rows.map(result => {
                const open = () =>
                  void remember()
                    .then(result.open)
                    .catch(error => setError(errorMessage(error, t)));
                if (result.kind === 'tasks') {
                  const task = result.entity,
                    project = s.projects.find(project => project.id === task.projectId);
                  return (
                    <div className="mini panel-row" key={result.id}>
                      <TaskStatusIcon status={task.status} />
                      <span className="mono faint search-key">{task.key}</span>
                      <button className="tt" onClick={open}>
                        {highlight(task.title)}
                      </button>
                      <span className="pj">
                        <span className="pdot" style={{ '--c': projectColor(project) } as CSSProperties} />
                        {project?.name}
                      </span>
                      <PersonAvatar member={s.members.find(member => member.user_id === task.assigneeUserId)} />
                    </div>
                  );
                }
                if (result.kind === 'projects') {
                  const project = result.entity;
                  return (
                    <div className="mini panel-row" key={result.id}>
                      <ProjectMark project={project} />
                      <button className="tt" onClick={open}>
                        {highlight(project.name)} <span className="faint">{project.description.slice(0, 70)}</span>
                      </button>
                      <ProjectState project={project} t={t} />
                    </div>
                  );
                }
                if (result.kind === 'people') {
                  const member = result.entity;
                  return (
                    <div className="mini panel-row" key={result.id}>
                      <PersonAvatar member={member} size="md" />
                      <button className="tt" onClick={open}>
                        {highlight(member.name)} <span className="faint">{member.title}</span>
                      </button>
                      <span className="faint search-meta">{member.email}</span>
                    </div>
                  );
                }
                if (result.kind === 'files') {
                  const file = result.entity,
                    project = s.projects.find(project => project.id === file.projectId);
                  return (
                    <div className="mini panel-row" key={result.id}>
                      <span className="ftype" style={{ '--c': fileTone(file.fileType) } as CSSProperties}>
                        <FileTypeIcon type={file.fileType} size={14} />
                      </span>
                      <button className="tt" onClick={open}>
                        {highlight(file.name)}
                      </button>
                      <span className="faint search-meta">
                        {file.sizeLabel} · {project?.name}
                      </span>
                    </div>
                  );
                }
                const comment = result.entity,
                  task = s.tasks.find(task => task.id === comment.taskId);
                return (
                  <div className="mini panel-row search-comment" key={result.id}>
                    {comment.authorAgentId ? (
                      <span className="av sm agent-comment-avatar" aria-label={t('Agente', 'Agent')}>
                        <Bot size={16} />
                      </span>
                    ) : (
                      <PersonAvatar member={s.members.find(member => member.user_id === comment.authorUserId)} />
                    )}
                    <button className="tt" onClick={open}>
                      <span className="search-comment-context">
                        <b>
                          {comment.authorAgentId
                            ? (s.agents.find(agent => agent.id === comment.authorAgentId)?.name ?? t('Agente', 'Agent'))
                            : s.members.find(member => member.user_id === comment.authorUserId)?.name}
                        </b>{' '}
                        {t('em', 'on')} {task?.title} · {relativeTime(comment.createdAt, p)}
                      </span>
                      <span>{highlight(result.text)}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {q && !results.length && commentPage.complete && (
        <div className="panel empty-state">
          <div className="glyph">
            <Search size={20} />
          </div>
          <h2 className="es-h">{t('Nenhum resultado.', 'No results.')}</h2>
          <p>
            {t('Nenhum resultado para', 'Nothing matches')} “{q}”. {t('Confira a escrita ou tente outro termo.', 'Check the spelling or try a broader term.')}
          </p>
          <Button variant="outline" className="btn-sm" onClick={() => setQ('')}>
            {t('Limpar busca', 'Clear search')}
          </Button>
        </div>
      )}
      {!q && (
        <>
          <div className="row recent-searches">
            <span className="faint">{t('Recentes:', 'Recent:')}</span>
            {recent.map(value => (
              <Button key={value} className="badge" variant="ghost" onClick={() => setQ(value)}>
                <History size={11} />
                {value}
              </Button>
            ))}
            <Button
              className="ibtn ibtn-xs"
              aria-label={t('Limpar histórico', 'Clear history')}
              variant="ghost"
              onClick={() => void p.savePrefs({ recentSearches: [] }).catch(e => setError(errorMessage(e, t)))}
            >
              <X size={12} />
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
export function ArchivePage(p: PanelProps) {
  const { snapshot: s, t } = p;
  const [tab, setTab] = useState('task'),
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
    ...s.projects.filter(x => x.archived).map(x => ({ id: x.id, name: x.name, kind: 'project', version: x.version, date: x.legacyMetadata.archivedAt ?? '' })),
    ...s.tasks.filter(x => x.archived).map(x => ({ id: x.id, name: x.title, kind: 'task', version: x.version, date: x.archivedAt ?? '' })),
  ];
  return (
    <section className="page archive-page">
      <div className="ph">
        <div>
          <h1>{t('Arquivo', 'Archive')}</h1>
          <p>
            {t(
              'Trabalhos arquivados ficam ocultos. Restaure quando precisar ou exclua de vez.',
              'Archived work is hidden everywhere else. Restore it any time, or delete it for good.',
            )}
          </p>
        </div>
      </div>
      <div className="tabs">
        {[
          ['task', t('Tarefas', 'Tasks')],
          ['project', t('Projetos', 'Projects')],
        ].map(([key, label]) => (
          <Button key={key} variant="ghost" className={'tab' + (tab === key ? ' on' : '')} onClick={() => setTab(key)}>
            {label}
            <span className="cnt">{rows.filter(x => x.kind === key).length}</span>
          </Button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      {rows.some(row => row.kind === tab) && (
        <div className="panel archived-list">
          {rows
            .filter(row => row.kind === tab)
            .map(row => {
              const task = s.tasks.find(task => task.id === row.id),
                project = s.projects.find(project => project.id === (row.kind === 'project' ? row.id : task?.projectId));
              return (
                <article className="mini archive-row" key={row.kind + row.id}>
                  {row.kind === 'project' && project ? (
                    <ProjectMark project={project} />
                  ) : task ? (
                    <TaskStatusIcon status={task.status} size={15} />
                  ) : (
                    <ArchiveIcon size={15} />
                  )}
                  <div className="grow">
                    <div className="trunc archive-title">{row.name}</div>
                    <div className="faint trunc archive-subtitle">
                      {row.kind === 'task' ? (
                        <>
                          <span className="mono">{task?.key}</span> · {project?.name}
                        </>
                      ) : (
                        <>
                          {s.tasks.filter(task => task.projectId === row.id).length} {t('tarefas', 'tasks')} ·{' '}
                          {project && <ProjectState project={project} t={t} />}
                        </>
                      )}
                    </div>
                  </div>
                  <span className="faint hide-m archive-time">
                    {t('Arquivado', 'Archived')}
                    {row.date ? ' ' + relativeTime(row.date, p) : ''}
                  </span>
                  <Button disabled={p.readOnly || busy} variant="outline" className="btn-sm" onClick={() => void action(row.kind, row.id, row.version)}>
                    <RotateCcw size={13} />
                    {t('Restaurar', 'Restore')}
                  </Button>
                  <Button
                    className="ibtn ibtn-sm archive-delete"
                    aria-label={t('Excluir permanentemente', 'Delete permanently')}
                    disabled={p.readOnly || busy}
                    variant="ghost"
                    onClick={() => setRemove(row)}
                  >
                    <Trash2 size={15} />
                  </Button>
                </article>
              );
            })}
        </div>
      )}
      {!rows.filter(row => row.kind === tab).length && (
        <div className="panel empty-state archive-empty">
          <div className="glyph">
            <ArchiveIcon size={20} />
          </div>
          <h2 className="es-h">
            {tab === 'task' ? t('Nenhuma tarefa arquivada', 'No archived tasks') : t('Nenhum projeto arquivado', 'No archived projects')}
          </h2>
          <p>
            {tab === 'task'
              ? t(
                  'Arquive trabalhos concluídos para manter o foco. Eles ficam aqui até você restaurar.',
                  'Archive finished or abandoned tasks to keep boards focused. They wait here until you restore them.',
                )
              : t(
                  'Projetos arquivados saem das listas, mas mantêm tarefas, arquivos e comentários.',
                  'Archived projects disappear from the sidebar and project lists but keep every task, file, and comment.',
                )}
          </p>
        </div>
      )}
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
    <section className={p.compact ? 'compact-history' : 'page activity-page'}>
      {!p.compact && (
        <div className="ph">
          <div>
            <h1>{t('Atividade', 'Activity')}</h1>
            <p>{t('Tudo que mudou no espaço de trabalho.', "Everything that's changed across the workspace.")}</p>
          </div>
        </div>
      )}
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
        <div className="panel-toolbar activity-toolbar">
          <div className="seg">
            {[
              ['all', t('Tudo', 'All')],
              ['status', t('Mudanças de status', 'Status changes')],
              ['comments', t('Comentários', 'Comments')],
              ['projects', t('Projetos', 'Projects')],
            ].map(([key, label]) => (
              <Button key={key} variant="ghost" className={category === key ? 'on' : ''} onClick={() => setCategory(key)}>
                {label}
              </Button>
            ))}
          </div>
          <label className="activity-person">
            <span className="sr-only">{t('Pessoa', 'Person')}</span>
            <select value={actor} onChange={e => setActor(e.target.value)}>
              <option value="">{t('Todas as pessoas', 'Everyone')}</option>
              {s.members.map(m => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <ActivityPage
        actorId={s.actorId}
        events={events}
        history={history}
        projects={s.projects}
        members={s.members}
        agents={s.agents}
        tasks={s.tasks}
        openTask={p.openTask}
        openProject={p.openProject}
        limit={p.compact ? 7 : undefined}
        grouped={!p.compact}
        t={t}
      />
    </section>
  );
}
