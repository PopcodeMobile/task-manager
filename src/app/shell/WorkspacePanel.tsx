import { iso } from '../../core/calendar.js';
import DOMPurify from 'dompurify';
import { CommandPalette, type PaletteItem } from '../panel/CommandPalette';
import { RemainingRoutes, remainingRoutes } from '../panel/RemainingRoutes';
import { defaultProjectTab, visiblePanelSnapshot } from '../panel/panel-model';
import { loadAppearance, saveAppearance } from '../../workspace/device-preferences.js';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Home,
  Inbox,
  Users,
  Settings,
  Search,
  Archive,
  Bell,
  LayoutDashboard,
  Menu,
  Palette,
  Code,
  Megaphone,
  Target,
  Activity,
  CalendarDays,
  ChartGantt,
  Files,
  Bot,
  CircleCheck,
  ListChecks,
  Paperclip,
  SquareKanban,
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
  CircleHelp,
  PanelLeft,
  Ellipsis,
  Lock,
  List,
  FolderKanban,
  Plug,
  Plus,
  RefreshCw,
  Star,
} from 'lucide-react';
import type { Workspace } from '../../domain/contracts';
import type { RepositoryFactory } from '../../workspace/repository';
import { useWorkspaceData, emptySnapshot } from './useWorkspaceData';
import type { Translate } from '../auth/ConsentPage';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../../components/ui/sheet';
import { WorkspacePicker } from '../workspaces/WorkspacePicker';
import type { ExtraTaskMenuAction } from '../tasks/TaskContextMenu';
import { taskLink } from '../tasks/task-detail-model';
import { ScheduleView } from '../schedules/ScheduleView';
import { FilesView } from '../files/FilesView';
import { TaskList } from '../tasks/TaskList';
import { TaskDrawer, type DraftGuard } from '../tasks/TaskDrawer';
import { ProjectsPage, ProjectIcon } from '../projects/ProjectsPage';
import { ShellPopover } from '../design/ShellPopover';
import { AgentsPage } from '../agents/AgentsPage';
import { IntegrationsPanel } from '../agents/IntegrationsPanel';
import { useNavigation } from './navigation';
import { errorMessage } from './messages';
export function WorkspacePanel({
  identity,
  repositoryFactory,
  onSignOut,
  density,
  setDensity,
  t,
  controls,
}: {
  identity: { name: string; email?: string };
  repositoryFactory: RepositoryFactory;
  onSignOut?: () => Promise<void>;
  density: string;
  setDensity: (value: string) => void;
  t: Translate;
  controls: ReactNode;
}) {
  const draft = useRef<DraftGuard | null>(null),
    panelDraft = useRef<DraftGuard | null>(null);
  const canLeave = async () => {
    for (const guard of [draft.current, panelDraft.current]) if (guard?.dirty && !(await guard.flush())) return false;
    return true;
  };
  const { url, navigate: commitNavigation } = useNavigation(canLeave);
  const registerPanelDraft = useCallback((value: DraftGuard | null) => {
    panelDraft.current = value;
  }, []);
  const registerDraft = useCallback((value: DraftGuard | null) => {
    draft.current = value;
  }, []);
  const navigate = (href: string, replace = false) => {
    void (async () => {
      if (!replace && !(await canLeave())) return;
      commitNavigation(href, replace);
    })();
  };
  const segments = url.pathname.split('/'),
    workspaceId = segments[3] ?? '',
    route = segments[4] || 'home';
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]),
    [discovery, setDiscovery] = useState(true),
    [discoveryError, setDiscoveryError] = useState(''),
    [discoveryAttempt, setDiscoveryAttempt] = useState(0),
    [createWorkspace, setCreateWorkspace] = useState(false),
    [workspaceName, setWorkspaceName] = useState(''),
    [creating, setCreating] = useState(false);
  const discoveryRepo = useMemo(() => repositoryFactory(null), [repositoryFactory]);
  useEffect(() => {
    discoveryRepo.activate();
    return () => discoveryRepo.dispose();
  }, [discoveryRepo]);
  useEffect(() => {
    let alive = true;
    setDiscovery(true);
    setDiscoveryError('');
    discoveryRepo
      .workspaces(true)
      .then(rows => {
        if (alive) {
          setWorkspaces(rows);
          if (!rows.length) setCreateWorkspace(true);
          else if (!workspaceId) {
            void (async () => {
              const personal = await discoveryRepo.personal?.();
              if (alive)
                navigate(
                  `${discoveryRepo.mode === 'local' ? '/app-local' : '/app'}/w/${rows.find(w => w.id === personal?.activeWorkspace)?.id ?? rows[0].id}/home`,
                  true,
                );
            })().catch(err => {
              if (alive) setDiscoveryError(errorMessage(err, t));
            });
          }
        }
      })
      .catch(err => {
        if (alive) setDiscoveryError(errorMessage(err, t));
      })
      .finally(() => {
        if (alive) setDiscovery(false);
      });
    return () => {
      alive = false;
    };
  }, [discoveryRepo, discoveryAttempt, t]);
  const routeRoot = discoveryRepo.mode === 'local' ? '/app-local' : '/app';
  const creationAttempt = useRef<{ name: string; key: string; slug: string } | null>(null);
  const current = workspaces.find(w => w.id === workspaceId);
  const repo = useMemo(() => repositoryFactory(workspaceId || null), [repositoryFactory, workspaceId]);
  const { markNotifications, snapshot, snapshotScope, loading, error, setError, revision, refresh, execute, toggleFavorite, addCopiedFavorites } =
    useWorkspaceData(repo, current?.id, workspaceId, t);
  useEffect(() => {
    if (current && repo.savePersonal) void repo.savePersonal({ activeWorkspace: current.id }).catch(err => setError(errorMessage(err, t)));
  }, [repo, current?.id, t]);
  const base = `${routeRoot}/w/${workspaceId}`;
  const [prefs, setPrefs] = useState<Record<string, unknown>>({}),
    [collapsed, setCollapsed] = useState(false),
    [palette, setPalette] = useState(false),
    [mobileNavigation, setMobileNavigation] = useState(false),
    [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({}),
    [paletteMode, setPaletteMode] = useState<'command' | 'search'>('command');
  const paletteOpener = useRef<HTMLElement | null>(null),
    gPending = useRef(0);
  useEffect(() => {
    if (!mobileNavigation) return;
    const opener = document.activeElement as HTMLElement | null;
    const sidebar = document.querySelector<HTMLElement>('.work-sidebar');
    sidebar?.querySelector<HTMLElement>('select,button,a[href]')?.focus();
    const key = (event: KeyboardEvent) => {
      if (document.querySelector('.ui-sheet')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileNavigation(false);
      }
      if (event.key === 'Tab') {
        const items = [...(sidebar?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),select') ?? [])].filter(
          item => item.getClientRects().length && getComputedStyle(item).display !== 'none',
        );
        const first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      opener?.focus();
    };
  }, [mobileNavigation]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const personal = await repo.personal?.();
      if (alive) {
        setPrefs(loadAppearance(localStorage, repo.userId));
        setCollapsed(personal?.collapsed ?? !!JSON.parse(localStorage.getItem(`gr8r.preferences.${repo.userId}`) ?? '{}').collapsed);
      }
    })().catch(err => {
      if (alive) setError(errorMessage(err, t));
    });
    return () => {
      alive = false;
    };
  }, [repo, current?.id]);
  useEffect(() => {
    const update = () => setPrefs(loadAppearance(localStorage, repo.userId));
    addEventListener('gr8r:appearance', update);
    return () => removeEventListener('gr8r:appearance', update);
  }, [repo]);
  async function savePrefs(patch: Record<string, unknown>) {
    saveAppearance(localStorage, repo.userId, patch);
    setPrefs(previous => ({ ...previous, ...patch }));
    dispatchEvent(new Event('gr8r:appearance'));
  }
  const go = (route: string, params: Record<string, string> = {}) =>
    navigate(`${base}/${route}${Object.keys(params).length ? '?' + new URLSearchParams(params) : ''}`);
  const openProject = (id: string, tab = defaultProjectTab(prefs)) => go('project', { project: id, tab });
  useEffect(() => {
    const open = () => {
      paletteOpener.current = document.activeElement as HTMLElement;
      setPaletteMode('command');
      setPalette(true);
    };
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        open();
      }
    };
    addEventListener('keydown', key);
    document.addEventListener('gr8r:palette', open);
    return () => {
      removeEventListener('keydown', key);
      document.removeEventListener('gr8r:palette', open);
    };
  }, []);

  const taskHref = (params: Record<string, string>) => {
    const q = new URLSearchParams(url.search);
    for (const [key, value] of Object.entries(params)) {
      if (value) q.set(key, value);
      else q.delete(key);
    }
    return `${base}/${route}${q.size ? '?' + q.toString() : ''}`;
  };
  const openTask = (id: string, options?: { quick?: boolean }) => navigate(taskHref({ task: id, due: '', file: '', edit: options?.quick ? 'quick' : '' }));
  const shown = snapshotScope === workspaceId ? snapshot : emptySnapshot;
  const projectId = url.searchParams.get('project') ?? '',
    filterProject = shown.projects.find(p => p.id === projectId),
    taskId = url.searchParams.get('task'),
    selected = shown.tasks.find(task => task.id === taskId),
    readOnly = current?.role === 'guest',
    admin = current?.role === 'owner' || current?.role === 'admin';
  const retainedTask = useRef<{ scope: string; task: import('../../domain/contracts').Task } | null>(null);
  const editorScope = `${workspaceId}:${taskId}`;
  if (selected) retainedTask.current = { scope: editorScope, task: selected };
  else if (retainedTask.current?.scope !== editorScope) retainedTask.current = null;
  const editorTask = selected ?? retainedTask.current?.task;
  const pageLocation = [workspaceId, route, projectId, url.searchParams.get('tab'), url.searchParams.get('id'), url.searchParams.get('sec')].join(':');
  useEffect(() => {
    const content = document.getElementById('work-content');
    if (content) content.scrollTop = 0;
    setMobileNavigation(false);
  }, [pageLocation]);
  const nav = [
    { id: 'home', label: t('Início', 'Home'), icon: Home },
    { id: 'inbox', label: t('Caixa de entrada', 'Inbox'), icon: Inbox },
    { id: 'mytasks', label: t('Minhas tarefas', 'My tasks'), icon: CircleCheck },
    { id: 'favorites', label: t('Favoritos', 'Favorites'), icon: Star },
    { id: 'notifications', label: t('Notificações', 'Notifications'), icon: Bell },
    { id: 'search', label: t('Busca', 'Search'), icon: Search },
    { id: 'overview', label: t('Visão geral', 'Overview'), icon: LayoutDashboard },
    { id: 'members', label: t('Membros', 'Members'), icon: Users },
    { id: 'teams', label: t('Equipes', 'Teams'), icon: Users },
    { id: 'archive', label: t('Arquivo', 'Archive'), icon: Archive },
    { id: 'settings', label: t('Configurações', 'Settings'), icon: Settings },
    { id: 'system', label: t('Sistema visual', 'Design system'), icon: Palette },
    { id: 'states', label: t('Estados', 'States'), icon: LayoutDashboard },
    { id: 'tasks', label: t('Tarefas', 'Tasks'), icon: ListChecks },
    { id: 'calendar', label: t('Calendário', 'Calendar'), icon: CalendarDays },
    { id: 'timeline', label: t('Cronograma', 'Timeline'), icon: ChartGantt },
    { id: 'files', label: t('Arquivos', 'Files'), icon: Files },
    { id: 'projects', label: t('Projetos', 'Projects'), icon: FolderKanban },
    { id: 'agents', label: t('Agentes', 'Agents'), icon: Bot },
    { id: 'activity', label: t('Atividade', 'Activity'), icon: Activity },
    { id: 'integrations', label: t('Integrações', 'Integrations'), icon: Plug },
  ];
  const activeNav =
    route === 'project'
      ? { label: filterProject?.name ?? t('Projeto', 'Project') }
      : route === 'member'
        ? { label: shown.members.find(m => m.user_id === url.searchParams.get('id'))?.name ?? t('Membro', 'Member') }
        : route === 'team'
          ? { label: shown.teams.find(team => team.id === url.searchParams.get('id'))?.name ?? t('Equipe', 'Team') }
          : nav.find(item => item.id === route);
  useEffect(() => {
    document.title = `${activeNav?.label ?? 'Kairos'} | Kairos`;
  }, [activeNav?.label]);
  const taskList = shown.tasks.filter(
      task =>
        !task.archived &&
        (!projectId || task.projectId === projectId) &&
        (url.searchParams.get('filter') === 'done'
          ? task.status === 'done'
          : url.searchParams.get('filter') === 'open'
            ? task.status !== 'done'
            : url.searchParams.get('filter') === 'overdue'
              ? task.status !== 'done' && !!task.dueDate && task.dueDate < iso(new Date())
              : true),
    ),
    projects = shown.projects
      .filter(
        p =>
          !p.archived &&
          (repo.mode !== 'local' || !p.legacyMetadata.private || shown.projectMembers.some(m => m.projectId === p.id && m.userId === shown.actorId)),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
  const projectIsExpanded = (id: string) => expandedProjects[`${workspaceId}:${id}`] ?? id === projects.find(project => project.status !== 'complete')?.id;
  const taskMenuActions: ExtraTaskMenuAction[] = [
    {
      id: 'favorite',
      personal: true,
      label: t('Alternar favorito', 'Toggle favorite'),
      run: task => {
        void toggleFavorite(task.id).catch(err => {
          if (!repo.controller.signal.aborted) setError(errorMessage(err, t));
        });
      },
    },
    {
      id: 'copy-link',
      personal: true,
      label: t('Copiar link', 'Copy link'),
      run: task => {
        void navigator.clipboard.writeText(taskLink(task, repo.mode === 'local', location.origin)).catch(err => {
          if (!repo.controller.signal.aborted) setError(errorMessage(err, t));
        });
      },
    },
  ];
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.shiftKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        void savePrefs({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' }).catch(err => setError(errorMessage(err, t)));
        return;
      }
      if (
        mod ||
        event.altKey ||
        (event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true]') ||
        document.querySelector('[role=dialog],[role=alertdialog]')
      )
        return;
      const k = event.key.toLowerCase();
      if (gPending.current && Date.now() - gPending.current < 1200) {
        gPending.current = 0;
        const destination = (
          { h: 'home', t: 'mytasks', p: 'projects', i: 'inbox', c: 'calendar', s: 'settings', n: 'notifications', a: 'activity', m: 'members' } as Record<
            string,
            string
          >
        )[k];
        if (destination) {
          event.preventDefault();
          go(destination);
        }
        return;
      }
      if (k === 'g') {
        gPending.current = Date.now();
        return;
      }
      if (k === '/') {
        event.preventDefault();
        paletteOpener.current = document.activeElement as HTMLElement;
        setPaletteMode('search');
        setPalette(true);
      }
      if (k === 'n' && !readOnly && projects.length) {
        event.preventDefault();
        openTask('new');
      }
      if (k === 'p' && !readOnly) {
        event.preventDefault();
        go('projects', { create: 'true' });
      }
      if (k === '?') {
        event.preventDefault();
        go('settings', { sec: 'shortcuts' });
      }
      if (k === '[') {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>('[data-sidebar-toggle]')?.click();
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });
  const displayName = (repo.mode === 'local' ? shown.members.find(m => m.user_id === shown.actorId)?.name : identity.name) || identity.email || '?';
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
  const unread = shown.notifications.filter(item => !shown.preferences.notificationReadStates[item.id]);
  const navLink = (id: string) => {
    const item = nav.find(value => value.id === id)!;
    const count =
      id === 'notifications'
        ? unread.length
        : id === 'inbox'
          ? unread.filter(n => n.notificationType !== 'update').length
          : id === 'mytasks'
            ? visiblePanelSnapshot(shown, repo.mode === 'local').tasks.filter(
                task => !task.archived && task.assigneeUserId === shown.actorId && task.status !== 'done' && !!task.dueDate && task.dueDate <= iso(new Date()),
              ).length
            : 0;
    return (
      <a
        href={`${base}/${item.id}`}
        key={item.id}
        aria-label={item.label}
        title={collapsed ? item.label : undefined}
        aria-current={route === item.id ? 'page' : undefined}
        onClick={event => {
          event.preventDefault();
          navigate(event.currentTarget.href);
        }}
      >
        <item.icon size={16} />
        <span className="nav-text">{item.label}</span>
        {count > 0 && (
          <small className={id === 'inbox' ? 'nav-count unread' : 'nav-count'} aria-hidden="true">
            {count}
          </small>
        )}
      </a>
    );
  };
  const toggleSidebar = () => {
    const next = !collapsed;
    void (async () => {
      if (repo.savePersonal) await repo.savePersonal({ collapsed: next });
      else {
        const key = `gr8r.preferences.${repo.userId}`;
        const value = JSON.parse(localStorage.getItem(key) ?? '{}');
        localStorage.setItem(key, JSON.stringify({ ...value, collapsed: next }));
      }
      setCollapsed(next);
    })().catch(err => setError(errorMessage(err, t)));
  };
  const openPalette = () => {
    paletteOpener.current = document.activeElement as HTMLElement;
    setPaletteMode('command');
    setPalette(true);
  };
  const accountControls = (
    <>
      <div
        className="shell-controls"
        onClickCapture={event => {
          if ((event.target as HTMLElement).closest('[data-action="logout"]') && (draft.current?.dirty || panelDraft.current?.dirty)) {
            event.preventDefault();
            event.stopPropagation();
            void (async () => {
              if (await canLeave()) {
                try {
                  await onSignOut?.();
                } catch (err) {
                  setError(errorMessage(err, t));
                }
              }
            })();
          }
        }}
      >
        {controls}
      </div>
      <label className="density-label">
        {t('Densidade', 'Density')}
        <select aria-label={t('Densidade', 'Density')} value={density} onChange={event => setDensity(event.target.value)}>
          <option value="comfortable">{t('Confortável', 'Comfortable')}</option>
          <option value="compact">{t('Compacta', 'Compact')}</option>
        </select>
      </label>
      <Button
        variant="ghost"
        onClick={() => {
          setCreateWorkspace(true);
          setWorkspaceName('');
        }}
      >
        <Plus size={15} />
        {t('Criar organização', 'Create workspace')}
      </Button>
    </>
  );
  return (
    <div data-route={route} className={'work-shell' + (collapsed ? ' sidebar-collapsed' : '') + (mobileNavigation ? ' mobile-navigation-open' : '')}>
      <a className="work-skip" href="#work-content">
        {t('Ir para conteúdo', 'Skip to content')}
      </a>
      <aside className="work-sidebar">
        <div className="work-brand">
          {workspaces.length ? (
            <WorkspacePicker
              items={workspaces}
              value={workspaceId}
              onChange={id => navigate(`${routeRoot}/w/${id}/home`)}
              onCreate={() => {
                setCreateWorkspace(true);
                setWorkspaceName('');
              }}
              onSettings={() => go('settings', { sec: 'workspace' })}
              onInvite={() => go('members')}
              t={t}
            />
          ) : (
            <span className="brand">Kairos</span>
          )}
          <Button
            className="sidebar-toggle"
            variant="ghost"
            data-sidebar-toggle
            aria-label={t('Alternar barra lateral', 'Toggle sidebar')}
            aria-expanded={!collapsed}
            onClick={toggleSidebar}
          >
            <PanelLeft size={15} />
          </Button>
          <Button className="mobile-close" variant="ghost" aria-label={t('Fechar navegação', 'Close navigation')} onClick={() => setMobileNavigation(false)}>
            <Menu size={16} />
          </Button>
        </div>
        <nav aria-label={t('Navegação principal', 'Main navigation')}>
          {['home', 'inbox', 'mytasks', 'favorites', 'notifications'].map(navLink)}
          <section className="nav-group">
            <div className="nav-caption">{t('Espaço de trabalho', 'Workspace')}</div>
            {['overview', 'projects', 'tasks', 'calendar', 'timeline', 'members', 'activity'].map(navLink)}
          </section>
          <section className="nav-group">
            <div className="nav-caption">
              <span>{t('Projetos', 'Projects')}</span>
              <Button variant="ghost" disabled={readOnly} aria-label={t('Novo projeto', 'New project')} onClick={() => go('projects', { create: 'true' })}>
                <Plus size={14} />
              </Button>
            </div>
            {projects
              .filter(project => project.status !== 'complete')
              .map(project => (
                <div className="sidebar-project" key={project.id}>
                  <div className="sidebar-project-row">
                    <a
                      className="project-nav"
                      aria-current={route === 'project' && projectId === project.id ? 'page' : undefined}
                      title={project.name}
                      href={`${base}/project?project=${encodeURIComponent(project.id)}&tab=${defaultProjectTab(prefs)}`}
                      onClick={event => {
                        event.preventDefault();
                        navigate(event.currentTarget.href);
                      }}
                    >
                      <ProjectIcon project={project} />
                      <span className="nav-text">{project.name}</span>
                      {shown.preferences.favoriteProjectIds.includes(project.id) && <Star className="project-favorite" size={11} />}
                      {project.legacyMetadata.private === true && <Lock className="project-lock" size={11} />}
                      <span className="project-state-dot" data-status={project.status} />
                    </a>
                    <Button
                      className="project-expand"
                      variant="ghost"
                      aria-label={`${t('Expandir projeto', 'Expand project')}: ${project.name}`}
                      aria-expanded={projectIsExpanded(project.id)}
                      onClick={() => setExpandedProjects(value => ({ ...value, [`${workspaceId}:${project.id}`]: !projectIsExpanded(project.id) }))}
                    >
                      <ChevronRight size={13} />
                    </Button>
                  </div>
                  {projectIsExpanded(project.id) && (
                    <div className="project-children">
                      {(
                        [
                          ['board', t('Quadro', 'Board'), SquareKanban],
                          ['list', t('Lista', 'List'), List],
                          ['timeline', t('Cronograma', 'Timeline'), ChartGantt],
                          ['files', t('Arquivos', 'Files'), Paperclip],
                        ] as const
                      ).map(([tab, label, Icon]) => (
                        <a
                          key={tab}
                          href={`${base}/project?project=${encodeURIComponent(project.id)}&tab=${tab}`}
                          aria-current={route === 'project' && projectId === project.id && url.searchParams.get('tab') === tab ? 'page' : undefined}
                          onClick={event => {
                            event.preventDefault();
                            navigate(event.currentTarget.href);
                          }}
                        >
                          <Icon size={14} />
                          <span className="nav-text">{label}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            {navLink('archive')}
          </section>
          <section className="nav-group">
            <div className="nav-caption">
              <span>{t('Equipes', 'Teams')}</span>
              <Button variant="ghost" aria-label={t('Ver equipes', 'View teams')} onClick={() => go('teams')}>
                <Plus size={14} />
              </Button>
            </div>
            {shown.teams.map(team => {
              const TeamIcon =
                ({ palette: Palette, code: Code, megaphone: Megaphone, target: Target } as Record<string, typeof Users>)[String(team.legacyMetadata.icon)] ??
                Users;
              return (
                <a
                  key={team.id}
                  href={`${base}/team?id=${encodeURIComponent(team.id)}`}
                  aria-label={team.name}
                  title={collapsed ? team.name : undefined}
                  aria-current={route === 'team' && url.searchParams.get('id') === team.id ? 'page' : undefined}
                  onClick={event => {
                    event.preventDefault();
                    navigate(event.currentTarget.href);
                  }}
                >
                  <TeamIcon size={16} />
                  <span className="nav-text">{team.name}</span>
                </a>
              );
            })}
          </section>
        </nav>
        <div className="work-sidebar-bottom">
          <ShellPopover
            label={t('Ajuda e recursos', 'Help & resources')}
            className="sidebar-help"
            menu
            trigger={
              <>
                <CircleHelp size={16} />
                <span className="nav-text">{t('Ajuda e recursos', 'Help & resources')}</span>
              </>
            }
          >
            {['files', 'agents', 'integrations', 'search', 'system', 'states'].map(id => (
              <button role="menuitem" key={id} onClick={() => go(id)}>
                {nav.find(item => item.id === id)!.label}
              </button>
            ))}
            {['tasks', 'calendar', 'timeline'].includes(route) && (
              <button role="menuitem" onClick={() => void refresh(true)}>
                <RefreshCw size={15} />
                {t('Atualizar dados', 'Refresh data')}
              </button>
            )}
            <button role="menuitem" onClick={() => go('settings', { sec: 'shortcuts' })}>
              {t('Atalhos de teclado', 'Keyboard shortcuts')}
            </button>
          </ShellPopover>
          <a
            href={`${base}/settings`}
            aria-label={t('Configurações', 'Settings')}
            title={collapsed ? t('Configurações', 'Settings') : undefined}
            aria-current={route === 'settings' ? 'page' : undefined}
            onClick={event => {
              event.preventDefault();
              navigate(event.currentTarget.href);
            }}
          >
            <Settings size={16} />
            <span className="nav-text">{t('Configurações', 'Settings')}</span>
          </a>
          <ShellPopover
            label={t('Menu da conta', 'Account menu')}
            className="account-popover sidebar-account-popover"
            trigger={
              <>
                <span className="account-avatar presence">{initials}</span>
                <span className="nav-text">{displayName}</span>
                <ChevronsUpDown size={13} />
              </>
            }
          >
            {accountControls}
          </ShellPopover>
          <span className="sr-only" data-testid="favorite-count">
            {shown.preferences.favoriteProjectIds.length + shown.preferences.favoriteTaskIds.length}
          </span>
        </div>
      </aside>
      {mobileNavigation && (
        <button className="navigation-scrim" aria-label={t('Fechar navegação', 'Close navigation')} onClick={() => setMobileNavigation(false)} />
      )}
      <div className="work-main" inert={mobileNavigation}>
        <header className="work-topbar">
          <Button
            className="mobile-nav-toggle"
            variant="ghost"
            aria-label={t('Abrir navegação', 'Open navigation')}
            aria-expanded={mobileNavigation}
            onClick={() => setMobileNavigation(true)}
          >
            <Menu size={17} />
          </Button>
          <div className="work-breadcrumb">
            {['project', 'member', 'team'].includes(route) && (
              <>
                <button onClick={() => go(route === 'project' ? 'projects' : route === 'member' ? 'members' : 'teams')}>
                  {t(
                    route === 'project' ? 'Projetos' : route === 'member' ? 'Membros' : 'Equipes',
                    route === 'project' ? 'Projects' : route === 'member' ? 'Members' : 'Teams',
                  )}
                </button>
                <span>/</span>
              </>
            )}
            <strong>{activeNav?.label ?? t('Página', 'Page')}</strong>
            <span className="sr-only">{current?.name ?? 'Kairos'}</span>
          </div>
          <span className="sp" />
          <Button className="topsearch" variant="ghost" aria-label={t('Busca e comandos', 'Search and commands')} onClick={openPalette}>
            <Search size={14} />
            <span className="lbltxt">{t('Buscar ou ir para…', 'Search or jump to…')}</span>
            <kbd>⌘K</kbd>
          </Button>
          <Button className="topbar-notifications" variant="ghost" aria-label={t('Notificações', 'Notifications')} onClick={() => go('notifications')}>
            <Bell size={16} />
            {unread.length > 0 && <span className="notification-dot" />}
          </Button>
          <ShellPopover
            label={t('Criar novo', 'Create new')}
            className="new-popover"
            menu
            trigger={
              <>
                <Plus size={14} />
                <span>{t('Novo', 'New')}</span>
                <ChevronDown size={12} />
              </>
            }
          >
            <button role="menuitem" disabled={readOnly || !projects.length} onClick={() => openTask('new')}>
              {t('Nova tarefa', 'New task')}
            </button>
            <button role="menuitem" disabled={readOnly} onClick={() => go('projects', { create: 'true' })}>
              {t('Novo projeto', 'New project')}
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setCreateWorkspace(true);
                setWorkspaceName('');
              }}
            >
              {t('Criar organização', 'Create workspace')}
            </button>
          </ShellPopover>
          <ShellPopover label={t('Menu da conta', 'Account menu')} className="account-popover" trigger={<span className="account-avatar">{initials}</span>}>
            {accountControls}
          </ShellPopover>
        </header>
        <div className="work-status sr-only" role="status">
          <span className="sync-dot" />
          {repo.mode === 'local' ? t('Armazenado neste dispositivo', 'Stored on this device') : t('Organização na nuvem', 'Cloud workspace')}
          <span>{readOnly ? t('Somente leitura', 'Read only') : t('Alterações por versão', 'Versioned changes')}</span>
        </div>
        <main className="work-content" id="work-content" tabIndex={-1}>
          {discovery ? (
            <p role="status">{t('Carregando organizações...', 'Loading workspaces...')}</p>
          ) : discoveryError ? (
            <div>
              <p role="alert" className="error-message">
                {discoveryError}
              </p>
              <Button onClick={() => setDiscoveryAttempt(n => n + 1)}>{t('Tentar novamente', 'Try again')}</Button>
            </div>
          ) : !current ? (
            <p className="work-empty">
              {workspaces.length
                ? t('Organização indisponível. Selecione uma organização no menu.', 'Workspace unavailable. Select a workspace from the menu.')
                : t('Crie sua primeira organização para começar.', 'Create your first workspace to begin.')}
            </p>
          ) : (
            <>
              {error && (
                <div className="error-row">
                  <p role="alert" className="error-message">
                    {error}
                  </p>
                  <Button variant="outline" onClick={() => void refresh(true)}>
                    {t('Tentar novamente', 'Try again')}
                  </Button>
                </div>
              )}
              {['projects', 'project'].includes(route) ? (
                <ProjectsPage
                  key={workspaceId}
                  snapshot={shown}
                  repo={repo}
                  projectId={route === 'project' ? projectId : undefined}
                  tab={url.searchParams.get('tab') || defaultProjectTab(prefs)}
                  initialCreate={url.searchParams.get('create') === 'true'}
                  consumeCreate={() => {
                    const next = new URL(url.href);
                    next.searchParams.delete('create');
                    navigate(next.pathname + next.search, true);
                  }}
                  back={() => navigate(`${base}/projects`)}
                  projectHref={id => `${base}/project?${new URLSearchParams({ project: id, tab: 'overview' })}`}
                  href={taskHref}
                  navigate={navigate}
                  openTask={openTask}
                  createTask={day => navigate(taskHref({ task: 'new', due: day || '' }))}
                  fileId={url.searchParams.get('file') || undefined}
                  selectFile={id => navigate(taskHref({ file: id, task: '' }))}
                  registerDraft={registerDraft}
                  toggleFavorite={toggleFavorite}
                  copyFavorites={addCopiedFavorites}
                  refresh={() => refresh(true)}
                  extraTaskMenuActions={taskMenuActions}
                  execute={execute}
                  t={t}
                  openProject={openProject}
                  readOnly={readOnly}
                />
              ) : remainingRoutes.includes(route) ? null : (
                <div className="page-heading ph workspace-page-heading">
                  <div>
                    <h1>{filterProject?.name ?? activeNav?.label ?? t('Página indisponível', 'Page unavailable')}</h1>
                    <p>
                      {route === 'tasks'
                        ? t(`Todas as tarefas de ${projects.length} projetos.`, `Every task across ${projects.length} projects.`)
                        : route === 'calendar'
                          ? t('Prazos e eventos de todos os projetos.', 'Deadlines and events across every project.')
                          : route === 'timeline'
                            ? t('Prazos, dependências e marcos dos projetos.', 'Schedules, dependencies, and milestones across projects.')
                            : route === 'files'
                              ? t('Documentos e metadados dos projetos.', 'Project documents and metadata.')
                              : route === 'agents'
                                ? t('Acompanhe atribuições e reservas de execução.', 'Supervise assignments and execution reservations.')
                                : route === 'activity'
                                  ? t('Alterações de pessoas e agentes, no mesmo histórico.', 'Updates from people and agents in one history.')
                                  : route === 'integrations'
                                    ? t('Acesso dos aplicativos e entrega de eventos.', 'App access and event delivery.')
                                    : t('Seu espaço de trabalho.', 'Your workspace.')}
                    </p>
                  </div>
                  {route !== 'timeline' && (
                    <div className="button-row acts">
                      {!['tasks', 'calendar'].includes(route) && (
                        <Button variant="ghost" aria-label={t('Atualizar dados', 'Refresh data')} onClick={() => void refresh(true)}>
                          <RefreshCw size={16} />
                        </Button>
                      )}
                      {['tasks', 'calendar'].includes(route) && (
                        <Button disabled={readOnly || !projects.length} onClick={() => openTask('new')}>
                          <Plus size={14} />
                          {t('Nova tarefa', 'New task')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {loading ? (
                <p role="status">{t('Carregando trabalho...', 'Loading work...')}</p>
              ) : route === 'tasks' ? (
                <>
                  <TaskList
                    tasks={taskList}
                    graph={shown}
                    projects={projects}
                    members={shown.members}
                    agents={shown.agents}
                    board={url.searchParams.get('view') === 'board'}
                    table={url.searchParams.get('view') === 'table'}
                    repo={repo}
                    execute={execute}
                    projectId={projectId}
                    href={taskHref}
                    view={navigate}
                    open={openTask}
                    t={t}
                    canCreate={!readOnly}
                    extraTaskMenuActions={taskMenuActions}
                  />
                </>
              ) : route === 'calendar' || route === 'timeline' ? (
                <ScheduleView
                  key={`${workspaceId}:${route}:${projectId}`}
                  mode={route}
                  extraTaskMenuActions={taskMenuActions}
                  projectId={projectId}
                  repo={repo}
                  tasks={shown.tasks}
                  projects={projects}
                  members={shown.members}
                  graph={shown}
                  events={shown.calendarEvents}
                  execute={execute}
                  t={t}
                  readOnly={!!readOnly}
                  openTask={openTask}
                  createTask={day => navigate(taskHref({ task: 'new', due: day || '' }))}
                  openProject={openProject}
                />
              ) : route === 'files' ? (
                <FilesView
                  key={`${workspaceId}:files:${projectId}`}
                  repo={repo}
                  files={shown.files}
                  attachments={shown.attachments}
                  tasks={shown.tasks}
                  projects={projects}
                  members={shown.members}
                  projectId={projectId}
                  execute={execute}
                  readOnly={!!readOnly}
                  t={t}
                  openTask={openTask}
                  fileId={url.searchParams.get('file') || undefined}
                  selectFile={id => navigate(taskHref({ file: id, task: '' }))}
                />
              ) : route === 'agents' ? (
                repo.mode === 'local' ? (
                  <p role="status" className="configuration-note">
                    {t('Agentes exigem uma organização na nuvem.', 'Agents require a cloud workspace.')}
                  </p>
                ) : (
                  <AgentsPage agents={shown.agents} tasks={shown.tasks} openTask={openTask} t={t} />
                )
              ) : route === 'integrations' ? (
                repo.mode === 'local' ? (
                  <p role="status" className="configuration-note">
                    {t('OAuth, agentes e webhooks exigem uma organização na nuvem.', 'OAuth, agents and webhooks require a cloud workspace.')}
                  </p>
                ) : (
                  <IntegrationsPanel repo={repo} t={t} admin={admin} members={shown.members} />
                )
              ) : ['projects', 'project'].includes(route) ? null : remainingRoutes.includes(route) ? (
                <RemainingRoutes
                  registerDraft={registerPanelDraft}
                  key={`${workspaceId}:${route}:${route === 'settings' ? (url.searchParams.get('sec') ?? 'workspace') : ''}`}
                  route={route}
                  params={url.searchParams}
                  snapshot={visiblePanelSnapshot(shown, repo.mode === 'local')}
                  repo={repo}
                  workspace={current}
                  t={t}
                  execute={execute}
                  go={go}
                  openTask={openTask}
                  createTask={(assignee, due, status) => navigate(taskHref({ task: 'new', assignee: assignee ?? '', due: due ?? '', status: status ?? '' }))}
                  openProject={openProject}
                  readOnly={readOnly}
                  admin={admin}
                  prefs={prefs}
                  savePrefs={savePrefs}
                  markNotifications={markNotifications}
                  toggleFavorite={toggleFavorite}
                  refresh={() => refresh(true)}
                  workspaceChanged={async () => {
                    const rows = await repo.workspaces(true);
                    if (!repo.controller.signal.aborted) setWorkspaces(rows);
                    return rows;
                  }}
                />
              ) : (
                <div className="work-empty">
                  <h2>{t('Página não encontrada', 'Page not found')}</h2>
                  <div className="button-row">
                    <Button variant="outline" onClick={() => history.back()}>
                      {t('Voltar', 'Go back')}
                    </Button>
                    <Button onClick={() => go('home')}>{t('Ir para início', 'Go to Home')}</Button>
                  </div>
                </div>
              )}
              {taskId &&
                !loading &&
                (nav.some(item => item.id === route) || ['project', 'member', 'team'].includes(route)) &&
                (editorTask || taskId === 'new') && (
                  <TaskDrawer
                    key={`${workspaceId}:${taskId}:${url.searchParams.get('edit') ?? ''}`}
                    graph={shown}
                    task={editorTask ?? 'new'}
                    removed={!!editorTask && !selected}
                    tasks={shown.tasks}
                    projects={projects}
                    agents={shown.agents}
                    members={shown.members}
                    repo={repo}
                    execute={execute}
                    t={t}
                    close={() => navigate(taskHref({ task: '', edit: '', due: '', assignee: '', status: '' }))}
                    quickEdit={url.searchParams.get('edit') === 'quick'}
                    created={openTask}
                    readOnly={readOnly}
                    projectId={projectId}
                    initialDueDate={url.searchParams.get('due') || undefined}
                    initialAssignee={url.searchParams.get('assignee') || undefined}
                    initialStatus={url.searchParams.get('status') || undefined}
                    prefs={prefs}
                    revision={revision}
                    admin={admin}
                    refresh={async () => {
                      await refresh(true);
                    }}
                    registerDraft={registerDraft}
                    favorite={shown.preferences.favoriteTaskIds.includes(taskId)}
                    toggleFavorite={() => toggleFavorite(taskId)}
                    copyLink={() => (selected ? navigator.clipboard.writeText(taskLink(selected, repo.mode === 'local', location.origin)) : Promise.resolve())}
                  />
                )}{' '}
              {taskId &&
                !loading &&
                (nav.some(item => item.id === route) || ['project', 'member', 'team'].includes(route)) &&
                !editorTask &&
                taskId !== 'new' && <p role="status">{t('Tarefa não encontrada nesta organização.', 'Task not found in this workspace.')}</p>}
            </>
          )}
        </main>
      </div>
      <nav className="work-bottomnav" aria-label={t('Navegação móvel', 'Mobile navigation')}>
        {['home', 'mytasks', 'projects', 'inbox'].map(id => {
          const item = nav.find(value => value.id === id)!;
          return (
            <button key={id} aria-current={route === id ? 'page' : undefined} onClick={() => go(id)}>
              <item.icon size={19} />
              <span>{item.label}</span>
            </button>
          );
        })}
        <button onClick={() => setMobileNavigation(true)}>
          <Ellipsis size={19} />
          <span>{t('Mais', 'More')}</span>
        </button>
      </nav>
      <CommandPalette
        open={palette}
        onOpenChange={setPalette}
        opener={paletteOpener.current}
        initialMode={paletteMode}
        searchHistory={(q, category) =>
          go('search', {
            q,
            category:
              ({ task: 'tasks', project: 'projects', person: 'people', file: 'files', comment: 'comments' } as Record<string, string>)[category] ?? 'all',
          })
        }
        t={t}
        items={
          [
            ...nav.map(item => ({ id: item.id, label: item.label, kind: 'command' as const, run: () => go(item.id) })),
            ...workspaces.map(workspace => ({
              id: workspace.id,
              label: t('Mudar para ', 'Switch to ') + workspace.name,
              kind: 'command' as const,
              run: () => navigate(`${routeRoot}/w/${workspace.id}/home`),
            })),
            ...(!readOnly && projects.length
              ? [
                  { id: 'create-task', label: t('Criar tarefa', 'Create task'), kind: 'command' as const, run: () => openTask('new') },
                  {
                    id: 'create-project',
                    label: t('Criar projeto', 'Create project'),
                    kind: 'command' as const,
                    run: () => go('projects', { create: 'true' }),
                  },
                ]
              : []),
            {
              id: 'theme',
              label: t('Alternar tema', 'Toggle theme'),
              kind: 'command',
              run: () => {
                void savePrefs({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' }).catch(err => setError(errorMessage(err, t)));
              },
            },
            ...visiblePanelSnapshot(shown, repo.mode === 'local').projects.map(project => ({
              id: project.id,
              label: project.name,
              kind: 'project' as const,
              run: () => openProject(project.id),
            })),
            ...visiblePanelSnapshot(shown, repo.mode === 'local')
              .tasks.filter(task => !task.archived)
              .map(task => ({ id: task.id, label: task.title, kind: 'task' as const, run: () => openTask(task.id) })),
            ...shown.members.map(member => ({
              id: member.user_id,
              label: member.name,
              kind: 'person' as const,
              run: () => go('member', { id: member.user_id }),
            })),
            ...visiblePanelSnapshot(shown, repo.mode === 'local').files.map(file => ({
              id: file.id,
              label: file.name,
              kind: 'file' as const,
              run: () => go('files', { file: file.id }),
            })),
            ...visiblePanelSnapshot(shown, repo.mode === 'local').comments.map(comment => ({
              id: comment.id,
              label: DOMPurify.sanitize(comment.body, { ALLOWED_TAGS: [] }),
              kind: 'comment' as const,
              run: () => openTask(comment.taskId),
            })),
          ] as PaletteItem[]
        }
      />
      <Sheet
        open={createWorkspace}
        onOpenChange={open => {
          if (!creating) setCreateWorkspace(open);
        }}
      >
        <SheetContent closeLabel={t('Fechar painel', 'Close panel')}>
          <SheetTitle>{t('Criar organização', 'Create workspace')}</SheetTitle>
          <SheetDescription>
            {t('Um espaço separado, começando sem projetos ou tarefas.', 'A separate space, starting with no projects or tasks.')}
          </SheetDescription>
          <form
            onSubmit={async e => {
              e.preventDefault();
              setCreating(true);
              try {
                if (creationAttempt.current?.name !== workspaceName)
                  creationAttempt.current = {
                    name: workspaceName,
                    key: crypto.randomUUID(),
                    slug:
                      workspaceName
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/^-|-$/g, '')
                        .slice(0, 80) +
                      '-' +
                      crypto.randomUUID().slice(0, 8),
                  };
                const result = await discoveryRepo.rpc<{ data: Workspace }>('create_workspace_v2', {
                  p_name: workspaceName,
                  p_slug: creationAttempt.current.slug,
                  p_idempotency_key: creationAttempt.current.key,
                });
                setWorkspaces(rows => [...rows.filter(row => row.id !== result.data.id), result.data]);
                creationAttempt.current = null;
                setCreateWorkspace(false);
                navigate(`${routeRoot}/w/${result.data.id}/home`);
              } catch (err) {
                setDiscoveryError(errorMessage(err, t));
              } finally {
                setCreating(false);
              }
            }}
          >
            <label className="form-field">
              {t('Nome da organização', 'Workspace name')}
              <Input required value={workspaceName} maxLength={120} onChange={e => setWorkspaceName(e.target.value)} />
            </label>
            {discoveryError && (
              <p role="alert" className="error-message">
                {discoveryError}
              </p>
            )}
            <Button type="submit" disabled={creating}>
              {t('Criar organização', 'Create workspace')}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
