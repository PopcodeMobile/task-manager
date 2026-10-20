import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Activity, Bot, CheckCheck, ChevronRight, FolderKanban, ListTodo, Plug, Plus, RefreshCw, Star } from 'lucide-react';
import type { Project, Task, Workspace, UserPreferences } from '../../domain/contracts';
import { NormalizedRepository, eventCursor, type Agent, type DomainEvent, type Member } from '../../workspace/normalized';
import { supabase } from '../integrations/client';
import type { Translate } from '../auth/ConsentPage';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../../components/ui/sheet';
import { WorkspacePicker } from '../workspaces/WorkspacePicker';
import { TaskList } from '../tasks/TaskList';
import { TaskDrawer, type DraftGuard } from '../tasks/TaskDrawer';
import { ProjectsPage, type Execute } from '../projects/ProjectsPage';
import { AgentsPage } from '../agents/AgentsPage';
import { ActivityPage } from '../activity/ActivityPage';
import { IntegrationsPanel } from '../agents/IntegrationsPanel';
import { useNavigation } from './navigation';
import { errorMessage } from './messages';
type Snapshot = { tasks: Task[]; projects: Project[]; agents: Agent[]; members: Member[]; events: DomainEvent[]; preferences: UserPreferences['preferences'] };
const empty: Snapshot = {
  tasks: [],
  projects: [],
  agents: [],
  members: [],
  events: [],
  preferences: { favoriteProjectIds: [], favoriteTaskIds: [], notificationReadStates: {} },
};
export function WorkspacePanel({ session, t, controls }: { session: Session; t: Translate; controls: ReactNode }) {
  const draft = useRef<DraftGuard | null>(null);
  const { url, navigate: commitNavigation } = useNavigation(async () => !draft.current?.dirty || (await draft.current.flush()));
  const registerDraft = useCallback((value: DraftGuard | null) => {
    draft.current = value;
  }, []);
  const navigate = (href: string, replace = false) => {
    void (async () => {
      if (!replace && draft.current?.dirty && !(await draft.current.flush())) return;
      commitNavigation(href, replace);
    })();
  };
  const segments = url.pathname.split('/'),
    workspaceId = segments[3] ?? '',
    route = segments[4] ?? 'tasks';
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]),
    [discovery, setDiscovery] = useState(true),
    [discoveryError, setDiscoveryError] = useState(''),
    [discoveryAttempt, setDiscoveryAttempt] = useState(0),
    [createWorkspace, setCreateWorkspace] = useState(false),
    [workspaceName, setWorkspaceName] = useState(''),
    [creating, setCreating] = useState(false);
  const discoveryRepo = useMemo(() => new NormalizedRepository(supabase!, session.user.id, null), [session.user.id]);
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
          else if (!workspaceId) navigate(`/app/w/${rows[0].id}/tasks`, true);
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
  const creationAttempt = useRef<{ name: string; key: string; slug: string } | null>(null);
  const current = workspaces.find(w => w.id === workspaceId);
  const repo = useMemo(() => new NormalizedRepository(supabase!, session.user.id, workspaceId || null), [session.user.id, workspaceId]);
  const [snapshot, setSnapshot] = useState<Snapshot>(empty),
    [snapshotScope, setSnapshotScope] = useState(''),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [search, setSearch] = useState('');
  const [, tick] = useState(0);
  const eventWatermark = useRef<string | undefined>(undefined),
    refreshSerial = useRef(0),
    idempotency = useRef(new Map<string, string>());
  const refresh = useCallback(
    async (initial = false) => {
      const serial = ++refreshSerial.current;
      try {
        // Capture the event boundary BEFORE reading mutable rows. Later commits remain visible to polling.
        const events = initial ? await repo.list<DomainEvent>('list_domain_events', {}, true) : null;
        const [tasks, projects, agents, members, preferences] = await Promise.all([
          repo.list<Task>('list_tasks', {}, true),
          repo.list<Project>('list_projects', {}, true),
          repo.list<Agent>('list_agents', {}, true),
          initial ? repo.rpc<Member[]>('list_workspace_members', { p_workspace_id: repo.workspaceId }) : Promise.resolve(null),
          initial ? repo.preferences() : Promise.resolve(null),
        ]);
        if (repo.controller.signal.aborted || serial !== refreshSerial.current) return;
        setSnapshot(old => ({
          tasks,
          projects,
          agents,
          events: events ?? old.events,
          members: members ?? old.members,
          preferences: preferences ?? old.preferences,
        }));
        if (events?.length) eventWatermark.current = eventCursor(events.at(-1)!);
        setSnapshotScope(workspaceId);
        setRevision(value => value + 1);
        setError('');
        return true;
      } catch (err) {
        if (!repo.controller.signal.aborted && serial === refreshSerial.current) setError(errorMessage(err, t));
      } finally {
        if (!repo.controller.signal.aborted && serial === refreshSerial.current) setLoading(false);
      }
      return false;
    },
    [repo, workspaceId, t],
  );
  useEffect(() => {
    repo.activate();
    eventWatermark.current = undefined;
    setSnapshot(empty);
    setSnapshotScope('');
    setLoading(true);
    setError('');
    setSearch('');
    if (current) void refresh(true);
    return () => {
      repo.dispose();
      idempotency.current.clear();
    };
  }, [repo, current?.id]);
  useEffect(() => {
    if (!current || loading) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        tick(value => value + 1);
        if (document.visibilityState !== 'hidden') {
          const events = await repo.list<DomainEvent>('list_domain_events', eventWatermark.current ? { cursor: eventWatermark.current } : {}, true);
          if (!alive) return;
          if (events.length) {
            setSnapshot(old => ({ ...old, events: [...new Map([...old.events, ...events].map(e => [e.id, e])).values()] }));
            if (await refresh()) eventWatermark.current = eventCursor(events.at(-1)!);
          }
        }
      } catch (err) {
        if (alive && !repo.controller.signal.aborted) setError(errorMessage(err, t));
      } finally {
        if (alive) timer = setTimeout(() => void poll(), 10000);
      }
    };
    timer = setTimeout(() => void poll(), 10000);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [repo, current?.id, loading, refresh, t]);
  const execute: Execute = async <T,>(operation: string, input: Record<string, unknown>, version?: number): Promise<T> => {
    const signature = JSON.stringify([operation, input, version]);
    const key = idempotency.current.get(signature) ?? crypto.randomUUID();
    idempotency.current.set(signature, key);
    const result = await repo.command<T>(operation, { input, expectedVersion: version, idempotencyKey: key });
    idempotency.current.delete(signature);
    // Apply only server-returned task DTOs; keep the current lease until a fresh read replaces it.
    const data = result.data as unknown as Partial<Task>;
    if (data && data.id && data.projectId && data.title)
      setSnapshot(old => ({
        ...old,
        tasks: old.tasks.some(item => item.id === data.id)
          ? old.tasks.map(item => (item.id === data.id ? { ...item, ...data } : item))
          : [...old.tasks, data as Task],
      }));
    let events: DomainEvent[] = [];
    try {
      events = await repo.list<DomainEvent>('list_domain_events', eventWatermark.current ? { cursor: eventWatermark.current } : {}, true);
    } catch (err) {
      if (!repo.controller.signal.aborted) setError(errorMessage(err, t));
    }
    const updated = await refresh();
    if (events.length && !repo.controller.signal.aborted) {
      setSnapshot(old => ({ ...old, events: [...new Map([...old.events, ...events].map(e => [e.id, e])).values()] }));
      if (updated) eventWatermark.current = eventCursor(events.at(-1)!);
    }
    return result.data;
  };
  const base = `/app/w/${workspaceId}`;
  const taskHref = (params: Record<string, string>) => {
    const q = new URLSearchParams(url.search);
    for (const [key, value] of Object.entries(params)) {
      if (value) q.set(key, value);
      else q.delete(key);
    }
    return `${base}/tasks${q.size ? '?' + q.toString() : ''}`;
  };
  const openTask = (id: string) => navigate(taskHref({ task: id }));
  const shown = snapshotScope === workspaceId ? snapshot : empty;
  const projectId = url.searchParams.get('project') ?? '',
    filterProject = shown.projects.find(p => p.id === projectId),
    taskId = url.searchParams.get('task'),
    selected = shown.tasks.find(task => task.id === taskId),
    readOnly = current?.role === 'guest',
    admin = current?.role === 'owner' || current?.role === 'admin';
  const nav = [
    { id: 'tasks', label: t('Tarefas', 'Tasks'), icon: ListTodo },
    { id: 'projects', label: t('Projetos', 'Projects'), icon: FolderKanban },
    { id: 'agents', label: t('Agentes', 'Agents'), icon: Bot },
    { id: 'activity', label: t('Atividade', 'Activity'), icon: Activity },
    { id: 'integrations', label: t('Integrações', 'Integrations'), icon: Plug },
  ];
  const activeNav = nav.find(item => item.id === route);
  useEffect(() => {
    document.title = `${activeNav?.label ?? 'Gr8r Studio'} | Gr8r Studio`;
  }, [activeNav?.label]);
  const taskList = shown.tasks.filter(
      task =>
        !task.archived && (!projectId || task.projectId === projectId) && (!search || task.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())),
    ),
    projects = shown.projects.filter(p => !p.archived);
  return (
    <div className="work-shell">
      <a className="work-skip" href="#work-content">
        {t('Ir para conteúdo', 'Skip to content')}
      </a>
      <aside className="work-sidebar">
        <div className="work-brand">
          {workspaces.length ? (
            <WorkspacePicker items={workspaces} value={workspaceId} onChange={id => navigate(`/app/w/${id}/tasks`)} t={t} />
          ) : (
            <span className="brand">Gr8r Studio</span>
          )}
          <Button
            className="mobile-create"
            variant="ghost"
            aria-label={t('Criar organização', 'Create workspace')}
            onClick={() => {
              setCreateWorkspace(true);
              setWorkspaceName('');
            }}
          >
            <Plus size={16} />
          </Button>
        </div>
        <nav aria-label={t('Navegação principal', 'Main navigation')}>
          <div className="nav-caption">{t('ESPAÇO DE TRABALHO', 'WORKSPACE')}</div>
          {nav.map(item => (
            <a
              href={`${base}/${item.id}`}
              key={item.id}
              aria-current={route === item.id ? 'page' : undefined}
              onClick={e => {
                e.preventDefault();
                navigate(e.currentTarget.href);
              }}
            >
              <item.icon size={17} />
              {item.label}
              {item.id === 'tasks' && <small aria-hidden="true">{shown.tasks.filter(task => task.status !== 'done' && !task.archived).length}</small>}
            </a>
          ))}
          <div className="nav-caption">{t('PROJETOS', 'PROJECTS')}</div>
          {projects.map(p => (
            <a
              key={p.id}
              className="project-nav"
              href={`${base}/tasks?project=${encodeURIComponent(p.id)}`}
              onClick={e => {
                e.preventDefault();
                navigate(e.currentTarget.href);
              }}
            >
              <FolderKanban size={16} />
              <span>{p.name}</span>
            </a>
          ))}
        </nav>
        <div className="work-sidebar-bottom">
          <span>
            <Star size={15} />
            {t('Favoritos', 'Favorites')}{' '}
            <small data-testid="favorite-count">{shown.preferences.favoriteProjectIds.length + shown.preferences.favoriteTaskIds.length}</small>
          </span>
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
          <span className="account-name">
            <span className="account-avatar">
              {String(session.user.user_metadata?.name ?? session.user.email ?? '?')
                .slice(0, 2)
                .toUpperCase()}
            </span>
            {session.user.user_metadata?.name ?? session.user.email}
          </span>
        </div>
      </aside>
      <div className="work-main">
        <header className="work-topbar">
          <div className="work-breadcrumb">
            {current?.name ?? 'Gr8r Studio'}
            <ChevronRight size={14} />
            <strong>{activeNav?.label ?? t('Página', 'Page')}</strong>
          </div>
          <div
            className="shell-controls"
            onClickCapture={event => {
              if ((event.target as HTMLElement).closest('[data-action="logout"]') && draft.current?.dirty) {
                event.preventDefault();
                event.stopPropagation();
                void (async () => {
                  if (await draft.current!.flush()) {
                    const result = await supabase!.auth.signOut();
                    if (result.error) setError(errorMessage(result.error, t));
                  }
                })();
              }
            }}
          >
            {controls}
          </div>
        </header>
        <div className="work-status">
          <span className="sync-dot" />
          {t('Organização na nuvem', 'Cloud workspace')}
          <span>{readOnly ? t('Somente leitura', 'Read only') : t('Alterações por versão', 'Versioned changes')}</span>
          <label className="density-label">
            {t('Densidade', 'Density')}
            <select
              aria-label={t('Densidade', 'Density')}
              defaultValue={localStorage.getItem('gr8r-react-density') ?? 'comfortable'}
              onChange={e => {
                document.documentElement.dataset.density = e.target.value;
                localStorage.setItem('gr8r-react-density', e.target.value);
              }}
            >
              <option value="comfortable">{t('Confortável', 'Comfortable')}</option>
              <option value="compact">{t('Compacta', 'Compact')}</option>
            </select>
          </label>
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
              {route === 'projects' ? (
                <ProjectsPage
                  projects={projects}
                  execute={execute}
                  t={t}
                  openProject={id => navigate(`${base}/tasks?project=${encodeURIComponent(id)}`)}
                  readOnly={readOnly}
                />
              ) : (
                <div className="page-heading">
                  <div>
                    <h1>{filterProject?.name ?? activeNav?.label ?? t('Página indisponível', 'Page unavailable')}</h1>
                    <p>
                      {route === 'tasks'
                        ? t('Todo o trabalho da equipe, com cada próximo passo no lugar.', 'Your team’s work, with every next step in place.')
                        : route === 'agents'
                          ? t('Acompanhe atribuições e reservas de execução.', 'Supervise assignments and execution reservations.')
                          : route === 'activity'
                            ? t('Alterações de pessoas e agentes, no mesmo histórico.', 'Updates from people and agents in one history.')
                            : route === 'integrations'
                              ? t('Acesso dos aplicativos e entrega de eventos.', 'App access and event delivery.')
                              : t('Esta rota será concluída na próxima etapa da migração.', 'This route will be completed in the next migration stage.')}
                    </p>
                  </div>
                  <div className="button-row">
                    <Button variant="ghost" aria-label={t('Atualizar dados', 'Refresh data')} onClick={() => void refresh(true)}>
                      <RefreshCw size={16} />
                    </Button>
                    {route === 'tasks' && (
                      <Button disabled={readOnly || !projects.length} onClick={() => openTask('new')}>
                        <Plus size={16} />
                        {t('Nova tarefa', 'New task')}
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {loading ? (
                <p role="status">{t('Carregando trabalho...', 'Loading work...')}</p>
              ) : route === 'tasks' ? (
                <>
                  <div className="task-summary">
                    <span>
                      <CheckCheck size={16} />
                      {shown.tasks.filter(task => task.status === 'done').length} {t('concluídas', 'completed')}
                    </span>
                    <Input
                      aria-label={t('Buscar tarefas', 'Search tasks')}
                      placeholder={t('Buscar tarefas...', 'Search tasks...')}
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>
                  <TaskList
                    tasks={taskList}
                    projects={projects}
                    members={shown.members}
                    agents={shown.agents}
                    board={url.searchParams.get('view') === 'board'}
                    href={taskHref}
                    view={navigate}
                    open={openTask}
                    t={t}
                    canCreate={!readOnly}
                  />
                </>
              ) : route === 'agents' ? (
                <AgentsPage agents={shown.agents} tasks={shown.tasks} openTask={openTask} t={t} />
              ) : route === 'activity' ? (
                <ActivityPage events={shown.events} members={shown.members} agents={shown.agents} tasks={shown.tasks} openTask={openTask} t={t} />
              ) : route === 'integrations' ? (
                <IntegrationsPanel repo={repo} t={t} admin={admin} />
              ) : null}
              {taskId && !loading && route === 'tasks' && (selected || taskId === 'new') && (
                <TaskDrawer
                  key={`${workspaceId}:${taskId}`}
                  task={selected ?? 'new'}
                  tasks={shown.tasks}
                  projects={projects}
                  agents={shown.agents}
                  members={shown.members}
                  repo={repo}
                  execute={execute}
                  t={t}
                  close={() => navigate(taskHref({ task: '' }))}
                  created={openTask}
                  readOnly={readOnly}
                  projectId={projectId}
                  revision={revision}
                  admin={admin}
                  refresh={async () => {
                    await refresh(true);
                  }}
                  registerDraft={registerDraft}
                />
              )}{' '}
              {taskId && !loading && route === 'tasks' && !selected && taskId !== 'new' && (
                <p role="status">{t('Tarefa não encontrada nesta organização.', 'Task not found in this workspace.')}</p>
              )}
            </>
          )}
        </main>
      </div>
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
                navigate(`/app/w/${result.data.id}/tasks`);
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
