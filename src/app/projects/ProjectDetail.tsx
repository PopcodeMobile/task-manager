import { type CSSProperties, useState } from 'react';
import {
  LayoutDashboard,
  Columns3,
  List,
  Table2,
  Calendar,
  ChartGantt,
  Paperclip,
  Activity,
  ListFilter,
  Plus,
  CircleDot,
  User,
  Users,
  Flag,
  UserPlus,
  Pencil,
  Diamond,
  ClockAlert,
} from 'lucide-react';
import type { Project, Json, Task, SavedView } from '../../domain/contracts';
import type { Snapshot } from '../shell/useWorkspaceData';
import type { WorkspaceRepository } from '../../workspace/repository';
import type { Translate } from '../auth/ConsentPage';
import type { Execute } from './ProjectsPage';
import type { ExtraTaskMenuAction } from '../tasks/TaskContextMenu';
import { Button } from '../../components/ui/button';
import { TaskList, statuses, statusLabel } from '../tasks/TaskList';
import { prepareTaskAction, readTaskView, saveTaskView, type TaskView } from '../tasks/task-view-model';
import { ScheduleView } from '../schedules/ScheduleView';
import { FilesView } from '../files/FilesView';
import { ContextHistory } from '../activity/ContextHistory';
import { taskDateLabel } from '../tasks/TaskFieldPopover';
import { diffD, parse, iso } from '../../core/calendar.js';
import { preferredDate } from '../panel/panel-model';
import { MemberAvatar, MemberStack, ProjectStatus, projectTone } from './ProjectVisual';
import { TaskStatusIcon, TaskPriorityIcon } from '../tasks/TaskVisual';
import { projectError } from './ProjectEditor';
import type { ViewEdit } from './SavedViewEditor';
import { SavedViewMenu } from './SavedViewMenu';
export const projectTabs = ['overview', 'board', 'list', 'table', 'calendar', 'timeline', 'files', 'activity'] as const;
export function tabLabel(tab: string, t: Translate) {
  return (
    (
      {
        overview: t('Visão geral', 'Overview'),
        board: t('Quadro', 'Board'),
        list: t('Lista', 'List'),
        table: t('Tabela', 'Table'),
        calendar: t('Calendário', 'Calendar'),
        timeline: t('Cronograma', 'Timeline'),
        files: t('Arquivos', 'Files'),
        activity: t('Atividade', 'Activity'),
      } as Record<string, string>
    )[tab] ?? tab
  );
}
function rawPersonal(repo: WorkspaceRepository, key: string): Record<string, unknown> {
  const root = JSON.parse(localStorage.getItem(`gr8r.preferences.${repo.userId}`) || '{}');
  return root.views?.[repo.workspaceId!]?.[key] ?? {};
}
export function ProjectDetail({
  project,
  snapshot,
  repo,
  execute,
  t,
  readOnly,
  tab,
  href,
  navigate,
  openTask,
  createTask,
  openProject,
  edit,
  share,
  saveView,
  deleteView,
  extraTaskMenuActions,
  fileId,
  selectFile,
}: {
  project: Project;
  snapshot: Snapshot;
  repo: WorkspaceRepository;
  execute: Execute;
  t: Translate;
  readOnly: boolean;
  tab: string;
  href: (params: Record<string, string>) => string;
  navigate: (href: string) => void;
  openTask: (id: string, options?: { quick?: boolean }) => void;
  createTask: (date?: string) => void;
  openProject: (id: string) => void;
  edit: () => void;
  share: () => void;
  saveView: (value: ViewEdit) => void;
  deleteView: (id: string, opener: HTMLElement) => void;
  extraTaskMenuActions: ExtraTaskMenuAction[];
  fileId?: string;
  selectFile: (id: string) => void;
}) {
  const [viewMenu, setViewMenu] = useState<{ view: SavedView; opener: HTMLAnchorElement; x: number; y: number } | null>(null);
  const saved = tab.startsWith('v:') ? snapshot.views.find(v => v.id === tab.slice(2) && v.projectId === project.id) : undefined;
  const mode = saved?.viewType ?? tab,
    key = saved ? `sv:${saved.id}` : `p:${project.id}`;
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const tasks = snapshot.tasks.filter(task => task.projectId === project.id && !task.archived),
    views = snapshot.views.filter(v => v.projectId === project.id);
  const raw = (() => {
    try {
      return rawPersonal(repo, key);
    } catch {
      return {};
    }
  })();
  const initial = { ...(saved ? { filters: saved.filters } : {}), ...raw };
  const [currentView, setCurrentView] = useState<TaskView>(() => readTaskView(initial));
  const members = snapshot.projectMembers.filter(m => m.projectId === project.id).map(m => m.userId);
  async function complete(task: Task) {
    setBusy(true);
    try {
      const c = prepareTaskAction(task, task.status === 'done' ? 'update_task' : 'complete_task', task.status === 'done' ? { status: 'todo' } : {});
      await execute(c.operation, c.input, c.expectedVersion);
    } catch (err) {
      if (!repo.controller.signal.aborted) setError(projectError(err, t));
    } finally {
      setBusy(false);
    }
  }
  const filtered = (status: string) => {
    try {
      saveTaskView(localStorage, repo.userId, repo.workspaceId!, `p:${project.id}`, {
        ...readTaskView(rawPersonal(repo, `p:${project.id}`)),
        filters: [{ f: 'status', op: 'is', v: [status] }],
      });
      navigate(href({ tab: 'list', view: '' }));
    } catch (err) {
      setError(projectError(err, t));
    }
  };
  const activity = (limit?: number) => (
    <ContextHistory key={project.id} snapshot={snapshot} repo={repo} projectId={project.id} limit={limit} openTask={openTask} t={t} />
  );
  return (
    <>
      <nav className="project-tabs tabs" aria-label={t('Abas do projeto', 'Project tabs')}>
        {[...projectTabs, ...views.map(v => `v:${v.id}`)].map(id => (
          <a
            key={id}
            className={`tab ${id === tab ? 'on' : ''}`}
            href={href({ tab: id, view: '', task: '', file: '' })}
            aria-current={id === tab ? 'page' : undefined}
            onContextMenu={e => {
              const view = views.find(v => id === `v:${v.id}`);
              if (!view || readOnly) return;
              e.preventDefault();
              setViewMenu({ view, opener: e.currentTarget, x: e.clientX, y: e.clientY });
            }}
            onKeyDown={e => {
              const view = views.find(v => id === `v:${v.id}`);
              if (!view || readOnly || !(e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey))) return;
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              setViewMenu({ view, opener: e.currentTarget, x: rect.left, y: rect.bottom });
            }}
            onClick={e => {
              e.preventDefault();
              navigate(e.currentTarget.href);
            }}
          >
            {(() => {
              const Icon =
                (
                  {
                    overview: LayoutDashboard,
                    board: Columns3,
                    list: List,
                    table: Table2,
                    calendar: Calendar,
                    timeline: ChartGantt,
                    files: Paperclip,
                    activity: Activity,
                  } as Record<string, typeof List>
                )[id] ?? ListFilter;
              return <Icon size={14} />;
            })()}
            {id.startsWith('v:') ? views.find(v => v.id === id.slice(2))?.name : tabLabel(id, t)}
          </a>
        ))}
        <Button
          variant="ghost"
          className="project-save-view-trigger ibtn ibtn-sm"
          aria-label={t('Salvar visualização', 'Save view')}
          disabled={readOnly}
          onClick={e => {
            let filters: Json[] = currentView.filters;
            try {
              const stored = rawPersonal(repo, !saved && ['calendar', 'timeline'].includes(mode) ? `p:${project.id}:${mode}` : key);
              filters = (Array.isArray(stored.filters) ? stored.filters : (saved?.filters ?? currentView.filters)) as Json[];
            } catch (err) {
              setError(projectError(err, t));
              return;
            }
            saveView({ projectId: project.id, filters, type: ['list', 'board', 'table'].includes(mode) ? mode : 'list', opener: e.currentTarget });
          }}
        >
          <Plus size={14} />
        </Button>
      </nav>
      {viewMenu && (
        <SavedViewMenu
          x={viewMenu.x}
          y={viewMenu.y}
          t={t}
          close={(restore = true) => {
            if (restore && viewMenu.opener.isConnected) viewMenu.opener.focus();
            setViewMenu(null);
          }}
          rename={() => {
            saveView({ projectId: project.id, view: viewMenu.view, filters: viewMenu.view.filters, type: viewMenu.view.viewType, opener: viewMenu.opener });
            setViewMenu(null);
          }}
          remove={() => {
            deleteView(viewMenu.view.id, viewMenu.opener);
            setViewMenu(null);
          }}
        />
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {tab.startsWith('v:') && !saved ? (
        <p role="status" className="work-empty">
          {t('Visualização não encontrada.', 'View not found.')}
        </p>
      ) : !projectTabs.includes(mode as (typeof projectTabs)[number]) ? (
        <p role="status">{t('Página não encontrada.', 'Page not found.')}</p>
      ) : (
        <>
          {['board', 'list', 'table'].includes(mode) && (
            <TaskList
              hideLayoutSwitch
              toolbarActions={
                <Button className="btn-sm" disabled={readOnly} onClick={() => openTask('new')}>
                  <Plus size={13} />
                  {t('Nova tarefa', 'New task')}
                </Button>
              }
              tasks={tasks}
              prefs={snapshot.preferences}
              graph={snapshot}
              projects={snapshot.projects.filter(p => !p.archived)}
              members={snapshot.members}
              agents={snapshot.agents}
              board={mode === 'board'}
              table={mode === 'table'}
              href={params => href({ ...params, ...(params.view ? { tab: params.view, view: '' } : {}) })}
              view={navigate}
              open={openTask}
              t={t}
              canCreate={!readOnly}
              repo={repo}
              execute={execute}
              projectId={project.id}
              viewKey={key}
              initialView={initial}
              onViewChange={setCurrentView}
              extraTaskMenuActions={extraTaskMenuActions}
            />
          )}
          {(mode === 'calendar' || mode === 'timeline') && (
            <ScheduleView
              toolbarActions={
                <Button className="btn-sm" disabled={readOnly} onClick={() => openTask('new')}>
                  <Plus size={13} />
                  {t('Nova tarefa', 'New task')}
                </Button>
              }
              mode={mode}
              projectId={project.id}
              viewKey={saved ? key : `p:${project.id}:${mode}`}
              repo={repo}
              tasks={snapshot.tasks}
              initialFilters={saved?.filters}
              projects={snapshot.projects}
              members={snapshot.members}
              graph={snapshot}
              events={snapshot.calendarEvents}
              execute={execute}
              t={t}
              readOnly={readOnly}
              openTask={openTask}
              createTask={createTask}
              openProject={openProject}
              extraTaskMenuActions={extraTaskMenuActions}
            />
          )}
          {mode === 'files' && (
            <FilesView
              repo={repo}
              files={snapshot.files}
              attachments={snapshot.attachments}
              tasks={snapshot.tasks}
              projects={snapshot.projects}
              members={snapshot.members}
              projectId={project.id}
              viewKey={`p:${project.id}:files`}
              execute={execute}
              readOnly={readOnly}
              t={t}
              openTask={openTask}
              fileId={fileId}
              selectFile={selectFile}
            />
          )}
          {mode === 'activity' && <div className="project-activity">{activity()}</div>}
          {mode === 'overview' && (
            <div className="project-overview page" style={{ maxWidth: 1160, paddingTop: 'calc(var(--space-unit) * 5.5)' }}>
              <div className="grid2">
                <div className="stack">
                  <section className="panel">
                    <div className="panel-h">
                      <h2>{t('Sobre', 'About')}</h2>
                      <div className="acts">
                        <Button variant="ghost" className="btn-sm" disabled={readOnly} onClick={edit}>
                          <Pencil size={13} />
                          {t('Editar', 'Edit')}
                        </Button>
                      </div>
                    </div>
                    <div className="panel-b project-description">{project.description || t('Sem descrição.', 'No description.')}</div>
                  </section>
                  <section className="panel">
                    <div className="panel-h">
                      <h2>{t('Progresso', 'Progress')}</h2>
                      <div className="acts">
                        <span className="faint">
                          {tasks.filter(task => task.status === 'done').length} {t('de', 'of')} {tasks.length} {t('tarefas concluídas', 'tasks done')}
                        </span>
                      </div>
                    </div>
                    <div className="panel-b">
                      <div className="row project-progress-summary">
                        <strong className="num">{Math.round((tasks.filter(task => task.status === 'done').length / Math.max(1, tasks.length)) * 100)}%</strong>
                        <span className="muted">
                          {project.dueDate
                            ? `${diffD(parse(project.dueDate), new Date())} ${t('dias até', 'days until')} ${preferredDate(project.dueDate, snapshot.preferences, t('pt-BR', 'en'))}`
                            : t('Sem prazo', 'No due date')}
                        </span>
                        {tasks.some(task => task.status !== 'done' && task.dueDate && task.dueDate < iso(new Date())) && (
                          <span className="badge project-overdue">
                            <ClockAlert size={11} />
                            {tasks.filter(task => task.status !== 'done' && task.dueDate && task.dueDate < iso(new Date())).length} {t('atrasada', 'overdue')}
                          </span>
                        )}
                      </div>
                      <div
                        className="stackbar"
                        role="progressbar"
                        aria-label={t('Progresso do projeto', 'Project progress')}
                        aria-valuemin={0}
                        aria-valuemax={tasks.length || 1}
                        aria-valuenow={tasks.filter(task => task.status === 'done').length}
                      >
                        {statuses.map(status => (
                          <i
                            key={status}
                            style={{
                              width: `${(tasks.filter(task => task.status === status).length / Math.max(1, tasks.length)) * 100}%`,
                              background: `var(--st-${status})`,
                            }}
                          />
                        ))}
                      </div>
                      <div className="row project-status-counts">
                        {statuses.map(status => (
                          <button className="row" key={status} onClick={() => filtered(status)}>
                            <TaskStatusIcon status={status} size={12} />
                            <span className="muted">{statusLabel(status, t)}</span>
                            <b className="num">{tasks.filter(task => task.status === status).length}</b>
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>
                  <section className="panel">
                    <div className="panel-h">
                      <h2>{t('A seguir', 'Coming up')}</h2>
                      <div className="acts">
                        <a
                          className="btn btn-sm btn-ghost"
                          href={href({ tab: 'list' })}
                          onClick={e => {
                            e.preventDefault();
                            navigate(e.currentTarget.href);
                          }}
                        >
                          {t('Ver lista', 'View list')}
                        </a>
                      </div>
                    </div>
                    {tasks
                      .filter(task => task.status !== 'done' && task.dueDate)
                      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
                      .slice(0, 6)
                      .map(task => (
                        <div className="project-upcoming mini" key={task.id}>
                          <input
                            className="check round"
                            type="checkbox"
                            checked={task.status === 'done'}
                            disabled={busy || readOnly || !!task.reservation?.active}
                            aria-label={t('Concluir ', 'Complete ') + task.title}
                            onChange={() => void complete(task)}
                          />
                          <TaskStatusIcon status={task.status} />
                          <button className="tt inline-link" onClick={() => openTask(task.id)}>
                            {task.title}
                          </button>
                          <TaskPriorityIcon priority={task.priority} />
                          <time className={`hide-m ${task.dueDate! < iso(new Date()) ? 'over' : diffD(parse(task.dueDate), new Date()) <= 1 ? 'soon' : ''}`}>
                            {taskDateLabel(task.dueDate, t, snapshot.preferences)}
                          </time>
                          <MemberAvatar member={snapshot.members.find(m => m.user_id === task.assigneeUserId)} />
                        </div>
                      ))}
                    {!tasks.some(task => task.status !== 'done' && task.dueDate) && (
                      <div className="empty-state sm">
                        <h3>{t('Nada agendado', 'Nothing scheduled')}</h3>
                        <p>{t('Tarefas com prazo aparecem aqui.', 'Tasks with due dates will show up here.')}</p>
                      </div>
                    )}
                  </section>
                </div>
                <div className="stack">
                  <section className="panel">
                    <div className="panel-h">
                      <h2>{t('Detalhes', 'Details')}</h2>
                    </div>
                    <div className="panel-b">
                      <dl className="kv">
                        <dt>
                          <CircleDot size={14} />
                          {t('Status', 'Status')}
                        </dt>
                        <dd>
                          <ProjectStatus status={project.status} t={t} />
                        </dd>
                        <dt>
                          <User size={14} />
                          {t('Líder', 'Lead')}
                        </dt>
                        <dd>
                          <span className="pillbtn">
                            <MemberAvatar member={snapshot.members.find(m => m.user_id === project.leadUserId)} />
                            {snapshot.members.find(m => m.user_id === project.leadUserId)?.name ?? t('Sem líder', 'No lead')}
                          </span>
                        </dd>
                        <dt>
                          <Users size={14} />
                          {t('Equipe', 'Team')}
                        </dt>
                        <dd>
                          <span className="pillbtn">{snapshot.teams.find(team => team.id === project.teamId)?.name ?? t('Sem equipe', 'No team')}</span>
                        </dd>
                        <dt>
                          <Calendar size={14} />
                          {t('Início', 'Start')}
                        </dt>
                        <dd>
                          <span className="pillbtn num">{preferredDate(project.startDate, snapshot.preferences, t('pt-BR', 'en'), true) || '—'}</span>
                        </dd>
                        <dt>
                          <Flag size={14} />
                          {t('Prazo', 'Due date')}
                        </dt>
                        <dd>
                          <span className="pillbtn num">{preferredDate(project.dueDate, snapshot.preferences, t('pt-BR', 'en'), true) || '—'}</span>
                        </dd>
                        <dt>
                          <UserPlus size={14} />
                          {t('Membros', 'Members')}
                        </dt>
                        <dd>
                          <button className="pillbtn" onClick={share}>
                            <MemberStack ids={members} members={snapshot.members} max={6} />
                            <span className="faint">{members.length}</span>
                          </button>
                        </dd>
                      </dl>
                    </div>
                  </section>
                  <section className="panel">
                    <div className="panel-h">
                      <h2>{t('Marcos', 'Milestones')}</h2>
                    </div>
                    <div className="panel-b">
                      {Array.isArray(project.legacyMetadata.milestones) && project.legacyMetadata.milestones.length ? (
                        project.legacyMetadata.milestones.map((m, i) =>
                          m && typeof m === 'object' && !Array.isArray(m) ? (
                            <div className="row project-milestone" key={i}>
                              <Diamond size={13} fill="currentColor" style={{ color: projectTone(project) } as CSSProperties} />
                              <span className="grow trunc">{String(m.name ?? '')}</span>
                              <time className="num muted">{preferredDate(String(m.date ?? ''), snapshot.preferences, t('pt-BR', 'en'))}</time>
                            </div>
                          ) : null,
                        )
                      ) : (
                        <span className="faint">{t('Ainda não há marcos.', 'No milestones yet.')}</span>
                      )}
                    </div>
                  </section>
                  <section className="panel">
                    <div className="panel-h">
                      <h2>{t('Atividade recente', 'Recent activity')}</h2>
                      <div className="acts">
                        <a
                          className="btn btn-sm btn-ghost"
                          href={href({ tab: 'activity' })}
                          onClick={e => {
                            e.preventDefault();
                            navigate(e.currentTarget.href);
                          }}
                        >
                          {t('Ver tudo', 'View all')}
                        </a>
                      </div>
                    </div>
                    <div className="panel-b feed">{activity(6)}</div>
                  </section>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
