import { type CSSProperties, useEffect, useRef, useState } from 'react';
import {
  FolderKanban,
  Folder,
  Zap,
  Sparkles,
  Plus,
  Star,
  Target,
  Globe,
  Megaphone,
  Palette,
  Code,
  Heart,
  Rocket,
  Briefcase,
  Layers,
  Smartphone,
  Component,
  Building2,
  Search,
  LayoutGrid,
  List,
  Table2,
  CircleCheck,
  Calendar,
  Clock,
  Lock,
  MoreHorizontal,
  Share2,
  Settings,
  ListFilter,
} from 'lucide-react';
import type { Project, SavedView } from '../../domain/contracts';
import type { Translate } from '../auth/ConsentPage';
import type { WorkspaceRepository } from '../../workspace/repository';
import type { Snapshot } from '../shell/useWorkspaceData';
import type { DraftGuard } from '../tasks/TaskDrawer';
import type { ExtraTaskMenuAction } from '../tasks/TaskContextMenu';
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
import { preferredDate } from '../panel/panel-model';
import { MemberAvatar, MemberStack, ProjectStatus, ProjectProgress, projectTone } from './ProjectVisual';
import { useSurfaceView } from '../schedules/useSurfaceView';
import { ProjectEditor, projectError, type ProjectEdit } from './ProjectEditor';
import { ProjectSharing } from './ProjectSharing';
import { ProjectDetail } from './ProjectDetail';
import { SavedViewEditor, type ViewEdit } from './SavedViewEditor';
import { projectStatuses, projectStatusLabel, reorderProjects } from './project-model';
export type Execute = <T = unknown>(operation: string, input: Record<string, unknown>, version?: number) => Promise<T>;
export function ProjectIcon({ project, size = 15 }: { project: Project; size?: number }) {
  const Icon =
    (
      {
        target: Target,
        folder: Folder,
        zap: Zap,
        sparkles: Sparkles,
        globe: Globe,
        megaphone: Megaphone,
        palette: Palette,
        code: Code,
        heart: Heart,
        rocket: Rocket,
        briefcase: Briefcase,
        layers: Layers,
        smartphone: Smartphone,
        'layout-grid': LayoutGrid,
        component: Component,
        'building-2': Building2,
      } as Record<string, typeof FolderKanban>
    )[String(project.legacyMetadata.icon)] ?? FolderKanban;
  return (
    <span className="project-icon picon" data-tone={String(project.legacyMetadata.color)} style={{ '--c': projectTone(project) } as CSSProperties}>
      <Icon size={size} />
    </span>
  );
}
const readCollection = (value: Record<string, unknown>) => ({
  q: String(value.q ?? ''),
  status: String(value.status ?? ''),
  sort: String(value.sort ?? 'recent'),
  layout: ['grid', 'list', 'table'].includes(String(value.layout)) ? String(value.layout) : 'grid',
  archived: value.archived === true,
});
export function ProjectsPage({
  snapshot,
  repo,
  execute,
  t,
  projectId,
  tab = 'overview',
  openProject,
  projectHref,
  back,
  href,
  navigate,
  openTask,
  createTask,
  fileId,
  selectFile,
  readOnly,
  registerDraft,
  toggleFavorite,
  copyFavorites,
  extraTaskMenuActions,
  refresh,
  initialCreate = false,
  consumeCreate,
}: {
  snapshot: Snapshot;
  repo: WorkspaceRepository;
  execute: Execute;
  t: Translate;
  projectId?: string;
  tab?: string;
  openProject: (id: string, tab?: string) => void;
  projectHref: (id: string) => string;
  back: () => void;
  href: (params: Record<string, string>) => string;
  navigate: (href: string) => void;
  openTask: (id: string, options?: { quick?: boolean }) => void;
  createTask: (day?: string) => void;
  fileId?: string;
  selectFile: (id: string) => void;
  readOnly: boolean;
  registerDraft: (guard: DraftGuard | null) => void;
  toggleFavorite: (id: string, kind: 'project') => Promise<void>;
  copyFavorites: (ids: string[]) => Promise<void>;
  extraTaskMenuActions: ExtraTaskMenuAction[];
  refresh: () => Promise<unknown>;
  initialCreate?: boolean;
  consumeCreate: () => void;
}) {
  const [edit, setEdit] = useState<ProjectEdit | null>(initialCreate && !readOnly ? { kind: 'new', opener: null } : null),
    [share, setShare] = useState<{ project: Project; opener: HTMLElement | null } | null>(null),
    [viewEdit, setViewEdit] = useState<ViewEdit | null>(null),
    [confirmation, setConfirmation] = useState<{ operation: string; entity: Project | SavedView; opener: HTMLElement | null } | null>(null),
    [typed, setTyped] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!initialCreate || readOnly) return;
    setEdit(current => current ?? { kind: 'new', opener: document.activeElement as HTMLElement });
    consumeCreate();
  }, [initialCreate, readOnly]);
  const confirmTrigger = useRef<HTMLElement | null>(null);
  const collection = useSurfaceView(repo, 'projects', readCollection, t);
  const available = snapshot.projects.filter(
    p => repo.mode !== 'local' || !p.legacyMetadata.private || snapshot.projectMembers.some(m => m.projectId === p.id && m.userId === snapshot.actorId),
  );
  const active = snapshot.projects.find(p => p.id === projectId),
    accessible = available.some(p => p.id === projectId);
  const progress = (p: Project) => {
    const tasks = snapshot.tasks.filter(task => task.projectId === p.id && !task.archived);
    return Math.round((tasks.filter(task => task.status === 'done').length / Math.max(tasks.length, 1)) * 100);
  };
  const recent = (p: Project) =>
    typeof p.legacyMetadata.last === 'number'
      ? Date.now() - p.legacyMetadata.last * 60000
      : Math.max(0, ...snapshot.tasks.filter(task => task.projectId === p.id).map(task => Date.parse(task.updatedAt) || 0));
  const lastActivity = (p: Project) => {
    const minutes = typeof p.legacyMetadata.last === 'number' ? p.legacyMetadata.last : Math.round((Date.now() - recent(p)) / 60000);
    if (minutes < 1) return t('agora', 'just now');
    if (minutes < 60) return t(`há ${minutes} min`, `${minutes}m ago`);
    const hours = Math.round(minutes / 60);
    if (hours < 24) return t(`há ${hours} h`, `${hours}h ago`);
    const days = Math.round(hours / 24);
    if (days < 7) return t(`há ${days} d`, `${days}d ago`);
    return preferredDate(new Date(Date.now() - minutes * 60000).toISOString(), collection.prefs, t('pt-BR', 'en'));
  };
  const shown = available
    .filter(
      p =>
        p.archived === collection.value.archived &&
        (!collection.value.status || p.status === collection.value.status) &&
        `${p.name} ${p.description}`.toLocaleLowerCase().includes(collection.value.q.toLocaleLowerCase()),
    )
    .sort((a, b) =>
      collection.value.sort === 'name'
        ? a.name.localeCompare(b.name)
        : collection.value.sort === 'due'
          ? (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')
          : collection.value.sort === 'progress'
            ? progress(b) - progress(a)
            : collection.value.sort === 'recent'
              ? recent(b) - recent(a) || a.sortOrder - b.sortOrder
              : a.sortOrder - b.sortOrder,
    );
  const begin = (kind: ProjectEdit['kind'], project?: Project) => setEdit({ kind, project, opener: document.activeElement as HTMLElement });
  async function action(run: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await run();
    } catch (err) {
      if (!repo.controller.signal.aborted) setError(projectError(err, t));
    } finally {
      setBusy(false);
    }
  }
  const confirm = (operation: string, entity: Project | SavedView, opener: HTMLElement | null) => {
    setTyped('');
    setError('');
    confirmTrigger.current = opener;
    setConfirmation({ operation, entity, opener });
  };
  const favorite = (p: Project) => (
    <Button
      variant="ghost"
      className="ibtn ibtn-sm project-favorite"
      aria-label={t('Favoritar projeto ', 'Favorite project ') + p.name}
      aria-pressed={snapshot.preferences.favoriteProjectIds.includes(p.id)}
      style={{ color: snapshot.preferences.favoriteProjectIds.includes(p.id) ? 'var(--amber)' : undefined }}
      onClick={() => void action(() => toggleFavorite(p.id, 'project'))}
    >
      <Star size={15} fill="none" />
    </Button>
  );
  const options = (p: Project) => (
    <details className="project-options">
      <summary className="ibtn ibtn-sm" aria-label={t('Opções do projeto ', 'Project options ') + p.name}>
        <MoreHorizontal size={14} />
      </summary>
      <div>
        <Button
          variant="ghost"
          disabled={busy}
          aria-pressed={snapshot.preferences.favoriteProjectIds.includes(p.id)}
          aria-label={
            (snapshot.preferences.favoriteProjectIds.includes(p.id)
              ? t('Desfavoritar projeto ', 'Unfavorite project ')
              : t('Favoritar projeto ', 'Favorite project ')) + p.name
          }
          onClick={() => void action(() => toggleFavorite(p.id, 'project'))}
        >
          {snapshot.preferences.favoriteProjectIds.includes(p.id)
            ? t('Desfavoritar projeto', 'Unfavorite project')
            : t('Favoritar projeto', 'Favorite project')}
        </Button>
        <Button variant="ghost" disabled={readOnly || busy} onClick={() => begin('edit', p)}>
          {t('Editar projeto', 'Edit project')}
        </Button>
        <Button variant="ghost" disabled={readOnly || busy} onClick={() => begin('copy', p)}>
          {t('Duplicar projeto', 'Duplicate project')}
        </Button>
        <Button variant="ghost" onClick={() => setShare({ project: p, opener: document.activeElement as HTMLElement })}>
          {t('Membros do projeto', 'Project members')}
        </Button>
        <Button variant="ghost" disabled={readOnly || busy} onClick={e => confirm(p.archived ? 'restore_project' : 'archive_project', p, e.currentTarget)}>
          {p.archived ? t('Restaurar projeto', 'Restore project') : t('Arquivar projeto', 'Archive project')}
        </Button>
        <Button variant="ghost" disabled={readOnly || busy} onClick={e => confirm('delete_project', p, e.currentTarget)}>
          {t('Excluir projeto', 'Delete project')}
        </Button>
        {[-1, 1].map(direction => (
          <Button
            variant="ghost"
            key={direction}
            disabled={readOnly || busy}
            onClick={() =>
              void action(async () => {
                const commands = reorderProjects(
                  snapshot.projects,
                  available.filter(p => !p.archived).map(p => p.id),
                  p.id,
                  direction,
                );
                if (commands.length) await execute('batch', { commands });
              })
            }
          >
            {direction === -1 ? t('Subir no menu', 'Move up in sidebar') : t('Descer no menu', 'Move down in sidebar')}
          </Button>
        ))}
      </div>
    </details>
  );
  const context = (event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
    if ('key' in event && event.key === 'Escape') {
      const details = event.currentTarget.querySelector<HTMLDetailsElement>('.project-options[open]');
      if (details) {
        details.open = false;
        details.querySelector<HTMLElement>('summary')?.focus();
        event.preventDefault();
      }
      return;
    }
    if ('key' in event && event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    if ((event.target as HTMLElement).closest('input,select,textarea')) return;
    event.preventDefault();
    const details = event.currentTarget.querySelector<HTMLDetailsElement>('.project-options');
    if (details) {
      details.open = true;
      details.querySelector<HTMLElement>('button')?.focus();
    }
  };
  const confirmLabel =
    confirmation?.operation === 'delete_view'
      ? t('Excluir visualização', 'Delete view')
      : confirmation?.operation === 'delete_project'
        ? t('Excluir projeto', 'Delete project')
        : confirmation?.operation === 'restore_project'
          ? t('Restaurar projeto', 'Restore project')
          : t('Arquivar projeto', 'Archive project');
  return (
    <>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {projectId ? (
        !active ? (
          <div className="work-empty">
            <h1>{t('Projeto não encontrado', 'Project not found')}</h1>
            <Button onClick={back}>{t('Ver projetos', 'Browse projects')}</Button>
          </div>
        ) : !accessible ? (
          <div className="work-empty">
            <h1>{t('Acesso restrito', 'Access restricted')}</h1>
            <p>{t('Este projeto é privado na demonstração local.', 'This project is private in the local demonstration.')}</p>
            <Button
              onClick={() =>
                setError(
                  t(
                    'Solicitação registrada somente nesta demonstração local. Nenhuma notificação foi enviada.',
                    'Request recorded only in this local demonstration. No notification was sent.',
                  ),
                )
              }
            >
              {t('Solicitar acesso local', 'Request local access')}
            </Button>
          </div>
        ) : (
          <>
            <div className="proj-h project-heading" onContextMenu={context} onKeyDown={context}>
              <div className="t">
                <ProjectIcon project={active} size={18} />
                <h1>{active.name}</h1>
                {favorite(active)}
                <select
                  className="project-status-control pillbtn bordered"
                  aria-label={t('Status do projeto', 'Project status')}
                  disabled={readOnly || busy}
                  value={active.status}
                  onChange={e => void action(() => execute('update_project', { id: active.id, status: e.target.value }, active.version))}
                >
                  {projectStatuses.map(status => (
                    <option key={status} value={status}>
                      {projectStatusLabel(status, t)}
                    </option>
                  ))}
                </select>
                <span className="sp" />
                <div className="row project-heading-actions">
                  <Button
                    variant="ghost"
                    className="project-members-trigger"
                    aria-label={t('Membros', 'Members')}
                    onClick={() => setShare({ project: active, opener: document.activeElement as HTMLElement })}
                  >
                    <MemberStack
                      ids={snapshot.projectMembers.filter(m => m.projectId === active.id).map(m => m.userId)}
                      members={snapshot.members}
                      max={5}
                      size="md"
                    />
                  </Button>
                  <Button
                    variant="outline"
                    className="btn-sm hide-m"
                    onClick={() => setShare({ project: active, opener: document.activeElement as HTMLElement })}
                  >
                    <Share2 size={13} />
                    {t('Compartilhar', 'Share')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="ibtn ibtn-sm"
                    disabled={readOnly || busy}
                    aria-label={t('Configurações do projeto', 'Project settings')}
                    onClick={() => begin('edit', active)}
                  >
                    <Settings size={15} />
                  </Button>
                  {options(active)}
                </div>
              </div>
            </div>
            <ProjectDetail
              key={`${repo.workspaceId}:${projectId}:${tab}`}
              project={active}
              snapshot={snapshot}
              repo={repo}
              execute={execute}
              t={t}
              readOnly={readOnly}
              tab={tab}
              href={href}
              navigate={navigate}
              openTask={openTask}
              createTask={createTask}
              openProject={openProject}
              edit={() => begin('edit', active)}
              share={() => setShare({ project: active, opener: document.activeElement as HTMLElement })}
              saveView={setViewEdit}
              deleteView={(id, opener) => {
                const view = snapshot.views.find(v => v.id === id);
                if (view) confirm('delete_view', view, opener);
              }}
              extraTaskMenuActions={extraTaskMenuActions}
              fileId={fileId}
              selectFile={selectFile}
            />
          </>
        )
      ) : (
        <div className="page wide project-collection-page">
          <div className="ph">
            <div>
              <h1>{t('Projetos', 'Projects')}</h1>
              <p>
                {available.filter(p => !p.archived && p.status !== 'complete').length} {t('ativos', 'active')} ·{' '}
                {available.filter(p => !p.archived && p.status === 'complete').length} {t('concluídos', 'completed')}
              </p>
            </div>
            <div className="acts">
              <Button disabled={readOnly || !snapshot.actorId} onClick={() => begin('new')}>
                <Plus size={14} />
                {t('Novo projeto', 'New project')}
              </Button>
            </div>
          </div>
          {collection.error && <p role="alert">{collection.error}</p>}
          <fieldset className="project-collection-tools project-form-fields row" disabled={!collection.ready}>
            <div className="inwrap">
              <Search className="i" size={13} />
              <Input
                className="input search-sm"
                aria-label={t('Buscar projetos', 'Search projects')}
                placeholder={t('Buscar projetos', 'Search projects')}
                value={collection.value.q}
                onChange={e => collection.save({ ...collection.value, q: e.target.value })}
              />
            </div>
            <select
              className="select"
              aria-label={t('Filtrar status do projeto', 'Filter project status')}
              value={collection.value.status}
              onChange={e => collection.save({ ...collection.value, status: e.target.value })}
            >
              <option value="">{t('Todos os status', 'All statuses')}</option>
              {projectStatuses.map(status => (
                <option key={status} value={status}>
                  {projectStatusLabel(status, t)}
                </option>
              ))}
            </select>
            <select
              className="select"
              aria-label={t('Ordenar projetos', 'Sort projects')}
              value={collection.value.sort}
              onChange={e => collection.save({ ...collection.value, sort: e.target.value })}
            >
              {[
                ['manual', t('Ordem do menu', 'Sidebar order')],
                ['name', t('Nome', 'Name')],
                ['due', t('Prazo', 'Due date')],
                ['progress', t('Progresso', 'Progress')],
                ['recent', t('Atividade recente', 'Recently active')],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {t('Ordenar: ', 'Sort: ')}
                  {label}
                </option>
              ))}
            </select>
            <details className="view-options project-collection-filter">
              <summary aria-label={t('Mais filtros de projetos', 'More project filters')}>
                <ListFilter size={13} />
              </summary>
              <div className="view-options-body">
                <label className="project-archive-filter">
                  <input
                    type="checkbox"
                    checked={collection.value.archived}
                    onChange={e => collection.save({ ...collection.value, archived: e.target.checked })}
                  />
                  {t('Arquivados', 'Archived')}
                </label>
              </div>
            </details>
            <span className="sp" />
            <div className="seg" role="tablist" aria-label={t('Layout', 'Layout')}>
              {(
                [
                  ['grid', t('Grade', 'Grid'), LayoutGrid],
                  ['list', t('Lista', 'List'), List],
                  ['table', t('Tabela', 'Table'), Table2],
                ] as const
              ).map(([value, label, Icon]) => (
                <Button
                  key={value}
                  role="tab"
                  aria-label={label}
                  variant="ghost"
                  className={collection.value.layout === value ? 'on' : ''}
                  aria-selected={collection.value.layout === value}
                  onClick={() => collection.save({ ...collection.value, layout: value })}
                >
                  <Icon size={13} />
                  <span className="hide-m">{label}</span>
                </Button>
              ))}
            </div>
          </fieldset>
          <div
            className={`project-collection project-layout-${collection.value.layout} ${collection.value.layout === 'grid' ? 'pgrid' : 'panel'}`}
            aria-label={t('Lista de projetos', 'Project collection')}
          >
            {collection.value.layout === 'table' ? (
              <table className="perm-t project-table" aria-label={t('Lista de projetos', 'Project collection')}>
                <thead>
                  <tr>
                    {[
                      t('Projeto', 'Project'),
                      t('Status', 'Status'),
                      t('Líder', 'Lead'),
                      t('Equipe', 'Team'),
                      t('Progresso', 'Progress'),
                      t('Tarefas', 'Tasks'),
                      t('Início', 'Start'),
                      t('Prazo', 'Due date'),
                      t('Atividade recente', 'Last activity'),
                      t('Opções', 'Options'),
                    ].map(label => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map(p => {
                    const ts = snapshot.tasks.filter(task => task.projectId === p.id && !task.archived);

                    return (
                      <tr key={p.id} data-project-id={p.id} onContextMenu={context} onKeyDown={context}>
                        <td>
                          <span className="row">
                            <ProjectIcon project={p} />
                            <button className="project-card-title" onClick={() => openProject(p.id)}>
                              {p.name}
                            </button>
                          </span>
                        </td>
                        <td>
                          <ProjectStatus status={p.status} t={t} />
                        </td>
                        <td>
                          <span className="row">
                            <MemberAvatar member={snapshot.members.find(m => m.user_id === p.leadUserId)} />
                            {snapshot.members.find(m => m.user_id === p.leadUserId)?.name ?? '—'}
                          </span>
                        </td>
                        <td className="muted">{snapshot.teams.find(team => team.id === p.teamId)?.name ?? '—'}</td>
                        <td>
                          <span className="row">
                            <ProjectProgress value={progress(p)} name={t('Progresso de ', 'Progress of ') + p.name} />
                            <span className="num faint">{progress(p)}%</span>
                          </span>
                        </td>
                        <td className="num">{ts.length}</td>
                        <td className="num muted">{preferredDate(p.startDate, collection.prefs, t('pt-BR', 'en')) || '—'}</td>
                        <td className="num muted">
                          <time dateTime={p.dueDate ?? undefined}>
                            {preferredDate(
                              p.dueDate,
                              collection.prefs,
                              t('pt-BR', 'en'),
                              !!p.dueDate && new Date(p.dueDate).getFullYear() !== new Date().getFullYear(),
                            ) || '—'}
                          </time>
                        </td>
                        <td className="muted">{lastActivity(p)}</td>
                        <td>{options(p)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              shown.map(p => {
                const ts = snapshot.tasks.filter(task => task.projectId === p.id && !task.archived);
                const ids = snapshot.projectMembers.filter(m => m.projectId === p.id).map(m => m.userId);

                if (collection.value.layout === 'list')
                  return (
                    <article key={p.id} data-project-id={p.id} className="project-list-row mini" onContextMenu={context} onKeyDown={context}>
                      <ProjectIcon project={p} />
                      <div className="grow project-list-name">
                        <button className="project-card-title" onClick={() => openProject(p.id)}>
                          {p.name}
                          {p.legacyMetadata.private && <Lock size={12} />}
                        </button>
                        <div className="trunc faint">{p.description}</div>
                      </div>
                      <div className="project-list-meta">
                        <ProjectStatus status={p.status} t={t} />
                        <span className="row project-list-progress hide-m">
                          <ProjectProgress value={progress(p)} name={t('Progresso de ', 'Progress of ') + p.name} />
                          <span className="num faint">{progress(p)}%</span>
                        </span>
                        <time className="num muted hide-m">{preferredDate(p.dueDate, collection.prefs, t('pt-BR', 'en')) || '—'}</time>
                        <MemberStack ids={ids} members={snapshot.members} />
                        {options(p)}
                      </div>
                    </article>
                  );
                return (
                  <article
                    key={p.id}
                    data-project-id={p.id}
                    className={collection.value.layout === 'grid' ? 'project-card pcard' : 'project-card project-list-row mini'}
                    onContextMenu={context}
                    onKeyDown={context}
                  >
                    <div className="row project-card-head">
                      <ProjectIcon project={p} />
                      <button className="project-card-title grow" onClick={() => openProject(p.id)}>
                        <strong>{p.name}</strong>
                        {snapshot.preferences.favoriteProjectIds.includes(p.id) && <Star size={12} className="project-favorite-mark" />}
                        {p.legacyMetadata.private && <Lock size={12} className="faint" />}
                      </button>
                      <ProjectStatus status={p.status} t={t} />
                    </div>
                    <div className="desc">{p.description}</div>
                    <div className="row project-card-progress">
                      <ProjectProgress
                        value={progress(p)}
                        name={t('Progresso de ', 'Progress of ') + p.name}
                        tone={p.status === 'complete' ? 'green' : p.status === 'risk' ? 'red' : ''}
                      />
                      <span className="num">{progress(p)}%</span>
                    </div>
                    <div className="foot">
                      <span className="row">
                        <CircleCheck size={12} />
                        {ts.filter(task => task.status === 'done').length}/{ts.length}
                      </span>
                      <span className="row">
                        <Calendar size={12} />
                        <time dateTime={p.dueDate ?? undefined}>
                          {preferredDate(
                            p.dueDate,
                            collection.prefs,
                            t('pt-BR', 'en'),
                            !!p.dueDate && new Date(p.dueDate).getFullYear() !== new Date().getFullYear(),
                          ) || '—'}
                        </time>
                      </span>
                      <span className="row hide-m">
                        <Clock size={12} />
                        {lastActivity(p)}
                      </span>
                      <span className="sp" />
                      <MemberStack ids={ids} members={snapshot.members} />
                    </div>
                    <div className="project-card-options">
                      {favorite(p)}
                      {options(p)}
                    </div>
                  </article>
                );
              })
            )}
          </div>
          {!shown.length && <p className="work-empty">{t('Nenhum projeto corresponde aos filtros.', 'No projects match these filters.')}</p>}
        </div>
      )}
      {edit && (
        <ProjectEditor
          key={`${edit.kind}:${edit.project?.id ?? 'new'}`}
          edit={edit}
          snapshot={snapshot}
          repo={repo}
          execute={execute}
          t={t}
          close={() => setEdit(null)}
          openProject={openProject}
          registerDraft={registerDraft}
          copyFavorites={copyFavorites}
          refresh={refresh}
        />
      )}
      {share && (
        <ProjectSharing
          project={snapshot.projects.find(p => p.id === share.project.id) ?? share.project}
          projectUrl={new URL(projectHref(share.project.id), location.origin).href}
          snapshot={snapshot}
          repo={repo}
          execute={execute}
          t={t}
          close={() => setShare(null)}
          opener={share.opener}
          readOnly={readOnly || !snapshot.projects.some(p => p.id === share.project.id)}
        />
      )}
      {viewEdit && (
        <SavedViewEditor
          edit={viewEdit}
          views={snapshot.views}
          refresh={refresh}
          execute={execute}
          repo={repo}
          t={t}
          close={() => setViewEdit(null)}
          open={id => navigate(href({ tab: `v:${id}` }))}
          registerDraft={registerDraft}
        />
      )}
      <AlertDialog
        open={!!confirmation}
        onOpenChange={open => {
          if (!open && !busy) setConfirmation(null);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={e => {
            e.preventDefault();
            if (!repo.controller.signal.aborted && confirmTrigger.current?.isConnected) confirmTrigger.current.focus();
          }}
        >
          <AlertDialogTitle>{confirmLabel}</AlertDialogTitle>
          <AlertDialogDescription>
            {confirmation?.operation === 'delete_project'
              ? t(
                  'O projeto, suas tarefas e comentários serão excluídos permanentemente. Digite o nome para confirmar.',
                  'The project, its tasks and comments will be permanently deleted. Type its name to confirm.',
                )
              : confirmation?.operation === 'archive_project'
                ? t(
                    'O projeto será ocultado das listas ativas. As tarefas serão mantidas.',
                    'The project will be hidden from active lists. Tasks will be kept.',
                  )
                : t('Confirme a alteração em ', 'Confirm the change to ') + confirmation?.entity.name}
          </AlertDialogDescription>
          {confirmation?.operation === 'delete_project' && (
            <Input aria-label={t('Nome para confirmar exclusão', 'Name to confirm deletion')} value={typed} onChange={e => setTyped(e.target.value)} />
          )}
          <div className="button-row">
            <AlertDialogCancel asChild>
              <Button disabled={busy} variant="outline">
                {t('Cancelar', 'Cancel')}
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                disabled={busy || (confirmation?.operation === 'delete_project' && typed !== confirmation.entity.name)}
                onClick={e => {
                  e.preventDefault();
                  if (!confirmation) return;
                  const selected = confirmation;
                  void action(async () => {
                    await execute(selected.operation, { id: selected.entity.id }, selected.entity.version);
                    if (repo.controller.signal.aborted) return;
                    setConfirmation(null);
                    if (selected.operation === 'delete_view') {
                      confirmTrigger.current = null;
                      navigate(href({ tab: 'list' }));
                    } else if (projectId && selected.operation !== 'restore_project') {
                      confirmTrigger.current = null;
                      back();
                    }
                  });
                }}
              >
                {confirmLabel}
              </Button>
            </AlertDialogAction>
          </div>
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
