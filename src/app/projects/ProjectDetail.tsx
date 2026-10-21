import { useState } from 'react';
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
import { projectStatusLabel } from './project-model';
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
  openTask: (id: string) => void;
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
      <nav className="project-tabs" aria-label={t('Abas do projeto', 'Project tabs')}>
        {[...projectTabs, ...views.map(v => `v:${v.id}`)].map(id => (
          <a
            key={id}
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
            {id.startsWith('v:') ? views.find(v => v.id === id.slice(2))?.name : tabLabel(id, t)}
          </a>
        ))}
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
          {['board', 'list', 'table', 'calendar', 'timeline'].includes(mode) && (
            <div className="project-view-actions">
              <Button
                disabled={readOnly}
                variant="outline"
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
                {t('Salvar visualização', 'Save view')}
              </Button>
              {saved && (
                <>
                  <Button
                    disabled={readOnly}
                    variant="ghost"
                    onClick={e => saveView({ projectId: project.id, view: saved, filters: saved.filters, type: saved.viewType, opener: e.currentTarget })}
                  >
                    {t('Renomear visualização', 'Rename view')}
                  </Button>
                  <Button disabled={readOnly} variant="ghost" onClick={e => deleteView(saved.id, e.currentTarget)}>
                    {t('Excluir visualização', 'Delete view')}
                  </Button>
                </>
              )}
            </div>
          )}
          {['board', 'list', 'table'].includes(mode) && (
            <TaskList
              hideLayoutSwitch
              tasks={tasks}
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
            <div className="project-overview">
              <section>
                <div className="project-section-heading">
                  <h2>{t('Sobre', 'About')}</h2>
                  <Button variant="ghost" disabled={readOnly} onClick={edit}>
                    {t('Editar', 'Edit')}
                  </Button>
                </div>
                <p className="project-description">{project.description || t('Sem descrição.', 'No description.')}</p>
              </section>
              <section>
                <h2>{t('Detalhes', 'Details')}</h2>
                <dl>
                  <dt>{t('Status', 'Status')}</dt>
                  <dd>{projectStatusLabel(project.status, t)}</dd>
                  <dt>{t('Líder', 'Lead')}</dt>
                  <dd>{snapshot.members.find(m => m.user_id === project.leadUserId)?.name ?? t('Sem líder', 'No lead')}</dd>
                  <dt>{t('Equipe', 'Team')}</dt>
                  <dd>{snapshot.teams.find(team => team.id === project.teamId)?.name ?? t('Sem equipe', 'No team')}</dd>
                  <dt>{t('Início', 'Start')}</dt>
                  <dd>{project.startDate ?? '—'}</dd>
                  <dt>{t('Prazo', 'Due date')}</dt>
                  <dd>{project.dueDate ?? '—'}</dd>
                  <dt>{t('Membros', 'Members')}</dt>
                  <dd>
                    <Button variant="ghost" onClick={share}>
                      {snapshot.members
                        .filter(m => members.includes(m.user_id))
                        .map(m => m.name)
                        .join(', ') || '0'}
                    </Button>
                  </dd>
                </dl>
              </section>
              <section>
                <h2>{t('Progresso', 'Progress')}</h2>
                <strong className="project-progress-number">
                  {Math.round((tasks.filter(task => task.status === 'done').length / Math.max(1, tasks.length)) * 100)}%
                </strong>
                <progress
                  max={Math.max(1, tasks.length)}
                  value={tasks.filter(task => task.status === 'done').length}
                  aria-label={t('Progresso do projeto', 'Project progress')}
                />
                <div className="button-row">
                  {statuses.map(status => (
                    <Button key={status} variant="ghost" onClick={() => filtered(status)}>
                      {statusLabel(status, t)} <strong>{tasks.filter(task => task.status === status).length}</strong>
                    </Button>
                  ))}
                </div>
              </section>
              <section>
                <h2>{t('Marcos', 'Milestones')}</h2>
                {Array.isArray(project.legacyMetadata.milestones) && project.legacyMetadata.milestones.length ? (
                  project.legacyMetadata.milestones.map((m, i) =>
                    m && typeof m === 'object' && !Array.isArray(m) ? (
                      <p key={i}>
                        {String(m.name ?? '')} <time>{String(m.date ?? '')}</time>
                      </p>
                    ) : null,
                  )
                ) : (
                  <p>{t('Ainda não há marcos.', 'No milestones yet.')}</p>
                )}
              </section>
              <section>
                <h2>{t('A seguir', 'Coming up')}</h2>
                {tasks
                  .filter(task => task.status !== 'done' && task.dueDate)
                  .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
                  .slice(0, 6)
                  .map(task => (
                    <div className="project-upcoming" key={task.id}>
                      <Button
                        variant="ghost"
                        disabled={busy || readOnly || !!task.reservation?.active}
                        aria-label={t('Concluir ', 'Complete ') + task.title}
                        onClick={() => void complete(task)}
                      >
                        ○
                      </Button>
                      <button className="inline-link" onClick={() => openTask(task.id)}>
                        {task.title}
                      </button>
                      <time>{task.dueDate}</time>
                    </div>
                  ))}
              </section>
              <section>
                <div className="project-section-heading">
                  <h2>{t('Atividade recente', 'Recent activity')}</h2>
                  <a
                    href={href({ tab: 'activity' })}
                    onClick={e => {
                      e.preventDefault();
                      navigate(e.currentTarget.href);
                    }}
                  >
                    {t('Ver tudo', 'View all')}
                  </a>
                </div>
                {activity(6)}
              </section>
            </div>
          )}
        </>
      )}
    </>
  );
}
