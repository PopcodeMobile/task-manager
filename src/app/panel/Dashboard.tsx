import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Calendar,
  ChartGantt,
  CircleCheck,
  CircleDashed,
  ClockAlert,
  FolderKanban,
  FolderPlus,
  Plus,
  Star,
  UserPlus,
  Lock,
  Clock,
  MoreHorizontal,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import type { Project, Task } from '../../domain/contracts';
import { iso, addD } from '../../core/calendar.js';
import { TaskStatusIcon, TaskPriorityIcon } from '../tasks/TaskVisual';
import { statusLabel } from '../tasks/TaskList';
import { errorMessage } from '../shell/messages';
import { MemberStack } from '../projects/ProjectVisual';
import { preferredDate } from './panel-model';
import type { PanelProps } from './types';
import { MiniTasks, ProjectMark, ProjectState, ProgressBar, PersonAvatar, projectColor, relativeDate } from './PanelVisual';

export function Dashboard(p: PanelProps & { recentActivity: ReactNode }) {
  const { snapshot: s, t } = p;
  const today = iso(new Date());
  const projects = s.projects.filter(project => !project.archived);
  const tasks = s.tasks.filter(task => !task.archived && projects.some(project => project.id === task.projectId));
  const mine = tasks.filter(task => task.assigneeUserId === s.actorId);
  const done = tasks.filter(task => task.status === 'done');
  const overdue = tasks.filter(task => task.status !== 'done' && task.dueDate && task.dueDate < today);
  const [tab, setTab] = useState<'upcoming' | 'overdue' | 'completed'>('upcoming');
  const lists = {
    upcoming: mine.filter(task => task.status !== 'done' && (!task.dueDate || task.dueDate >= today)).sort(byDue),
    overdue: mine.filter(task => overdue.includes(task)),
    completed: mine.filter(task => task.status === 'done').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
  const openByPerson = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.status === 'done' || !task.assigneeUserId) continue;
    const rows = openByPerson.get(task.assigneeUserId) ?? [];
    rows.push(task);
    openByPerson.set(task.assigneeUserId, rows);
  }
  const workload = s.members
    .filter(member => !member.status || member.status.toLowerCase() === 'active')
    .map(member => ({ member, rows: openByPerson.get(member.user_id) ?? [] }))
    .sort((a, b) => b.rows.length - a.rows.length);
  const maximumWorkload = Math.max(1, ...workload.map(row => row.rows.length));
  const activeProjects = projects.filter(project => project.status !== 'complete');
  const home = p.route === 'home';
  const firstName = (s.members.find(member => member.user_id === s.actorId)?.name ?? t('você', 'you')).split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('Bom dia', 'Good morning') : hour < 18 ? t('Boa tarde', 'Good afternoon') : t('Boa noite', 'Good evening');
  const milestones = projects
    .flatMap(project =>
      Array.isArray(project.legacyMetadata.milestones)
        ? project.legacyMetadata.milestones.flatMap(milestone =>
            milestone && typeof milestone === 'object' && !Array.isArray(milestone)
              ? [{ name: String(milestone.name ?? milestone.title ?? ''), date: String(milestone.date ?? ''), project }]
              : [],
          )
        : [],
    )
    .filter(milestone => milestone.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);
  if (p.route === 'favorites') return <Favorites p={p} projects={projects} tasks={tasks} />;
  const stats = home
    ? [
        {
          label: t('Projetos ativos', 'Active projects'),
          value: activeProjects.length,
          detail: `${activeProjects.filter(project => project.status === 'risk').length} ${t('em risco', 'at risk')}`,
          icon: FolderKanban,
          route: 'projects',
          filter: '',
        },
        {
          label: t('Tarefas abertas', 'Open tasks'),
          value: tasks.length - done.length,
          detail: `${mine.filter(task => task.status !== 'done').length} ${t('atribuídas a você', 'assigned to you')}`,
          icon: CircleDashed,
          route: 'tasks',
          filter: 'open',
        },
        {
          label: t('Concluídas', 'Completed'),
          value: done.filter(task => task.completedAt && Date.now() - Date.parse(task.completedAt) < 7 * 86400000).length,
          detail: t('nesta semana', 'this week'),
          icon: CircleCheck,
          route: 'tasks',
          filter: 'done',
        },
        {
          label: t('Atrasadas', 'Overdue'),
          value: overdue.length,
          detail: overdue.length ? t('precisam de atenção', 'need attention') : t('tudo em dia', 'all on track'),
          icon: ClockAlert,
          route: 'tasks',
          filter: 'overdue',
        },
      ]
    : [
        {
          label: t('Projetos', 'Projects'),
          value: projects.length,
          detail: `${projects.filter(project => project.status === 'complete').length} ${t('concluídos', 'completed')}`,
          icon: null,
          route: 'projects',
          filter: '',
        },
        {
          label: t('Tarefas', 'Tasks'),
          value: tasks.length,
          detail: `${tasks.length - done.length} ${t('abertas', 'open')}`,
          icon: null,
          route: 'tasks',
          filter: '',
        },
        {
          label: t('Taxa de conclusão', 'Completion rate'),
          value: Math.round((done.length / Math.max(tasks.length, 1)) * 100) + '%',
          detail: t('em todos os projetos', 'across all projects'),
          icon: null,
          route: 'tasks',
          filter: 'done',
        },
        {
          label: t('Membros', 'Members'),
          value: s.members.length,
          detail: `${s.members.filter(member => member.status?.toLowerCase() === 'invited').length} ${t('convites pendentes', 'pending invite')}`,
          icon: null,
          route: 'members',
          filter: '',
        },
      ];
  return (
    <section className="page dashboard-page">
      <div className="ph">
        <div>
          <h1>{home ? `${greeting}, ${firstName}` : t('Visão geral do espaço', 'Workspace overview')}</h1>
          <p>
            {home ? (
              <>
                <span className="num">{new Date().toLocaleDateString(t('pt-BR', 'en'), { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                {' · '}
                {t('Veja o que acontece no seu espaço.', "Here's what's happening across your workspace.")}
              </>
            ) : (
              t('Acompanhe todos os projetos de ', 'Health of every project in ') + p.workspace.name + '.'
            )}
          </p>
        </div>
        <div className="acts">
          {home ? (
            <>
              <Button variant="outline" className="hide-m" onClick={() => p.go('members')}>
                <UserPlus size={14} />
                {t('Convidar membro', 'Invite member')}
              </Button>
              <Button variant="outline" className="hide-m" disabled={p.readOnly} onClick={() => p.go('projects', { create: 'true' })}>
                <FolderPlus size={14} />
                {t('Novo projeto', 'New project')}
              </Button>
              <Button disabled={p.readOnly} onClick={() => p.createTask(s.actorId)}>
                <Plus size={14} />
                {t('Nova tarefa', 'New task')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => p.go('timeline')}>
                <ChartGantt size={14} />
                {t('Cronograma', 'Timeline')}
              </Button>
              <Button disabled={p.readOnly} onClick={() => p.go('projects', { create: 'true' })}>
                <Plus size={14} />
                {t('Novo projeto', 'New project')}
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="stats" style={{ marginBottom: 'var(--s-4)' }}>
        {stats.map((stat, index) => (
          <button className="stat" key={stat.label} onClick={() => p.go(stat.route, { filter: stat.filter })}>
            <span className="k">
              {stat.icon && <stat.icon size={14} />}
              {stat.label}
            </span>
            <span className="v" style={home && index === 3 && overdue.length ? { color: 'var(--red)' } : undefined}>
              {stat.value}
            </span>
            <span className={'d' + (home && index === 2 ? ' up' : home && index === 3 && overdue.length ? ' bad' : '')}>{stat.detail}</span>
          </button>
        ))}
      </div>
      {home ? (
        <div className="grid2">
          <div className="stack">
            <section className="panel" aria-labelledby="dashboard-my-tasks">
              <div className="panel-h">
                <h2 id="dashboard-my-tasks">{t('Minhas tarefas', 'My tasks')}</h2>
                <div className="acts">
                  <div className="seg" role="tablist" aria-label={t('Minhas tarefas', 'My tasks')}>
                    {(
                      [
                        ['upcoming', t('Próximas', 'Upcoming')],
                        ['overdue', t('Atrasadas', 'Overdue')],
                        ['completed', t('Concluídas', 'Completed')],
                      ] as const
                    ).map(([key, label]) => (
                      <Button role="tab" aria-selected={tab === key} variant="ghost" className={tab === key ? 'on' : ''} key={key} onClick={() => setTab(key)}>
                        {label}
                        <span className="faint">{lists[key].length}</span>
                      </Button>
                    ))}
                  </div>
                  <Button variant="ghost" className="ibtn ibtn-sm" aria-label={t('Abrir minhas tarefas', 'Open My Tasks')} onClick={() => p.go('mytasks')}>
                    <ArrowUpRight size={15} />
                  </Button>
                </div>
              </div>
              <MiniTasks tasks={lists[tab].slice(0, 7)} p={p} avatars={false} />
              {lists[tab].length > 7 && (
                <Button className="addrow" variant="ghost" onClick={() => p.go('mytasks')}>
                  {t('Ver todas', 'View all')} {lists[tab].length} {t('tarefas', 'tasks')}
                </Button>
              )}
            </section>
            <section className="panel">
              <div className="panel-h">
                <h2>{t('Progresso dos projetos', 'Project progress')}</h2>
                <div className="acts">
                  <Button variant="ghost" className="btn-sm" onClick={() => p.go('projects')}>
                    {t('Todos os projetos', 'All projects')}
                  </Button>
                </div>
              </div>
              <ProjectTable projects={activeProjects} tasks={tasks} p={p} />
            </section>
          </div>
          <div className="stack">
            <section className="panel">
              <div className="panel-h">
                <h2>{t('Prazos próximos', 'Upcoming deadlines')}</h2>
                <div className="acts">
                  <Button className="btn-sm" variant="ghost" onClick={() => p.go('calendar')}>
                    <Calendar size={13} />
                    {t('Calendário', 'Calendar')}
                  </Button>
                </div>
              </div>
              <div className="panel-b" style={{ paddingBottom: 'var(--s-1-5)' }}>
                {[
                  [t('Hoje', 'Today'), today, today],
                  [t('Amanhã', 'Tomorrow'), iso(addD(new Date(), 1)), iso(addD(new Date(), 1))],
                  [t('Esta semana', 'This week'), iso(addD(new Date(), 2)), iso(addD(new Date(), 7))],
                ].map(([label, from, to]) => {
                  const rows = tasks
                    .filter(task => task.status !== 'done' && task.dueDate && task.dueDate >= from && task.dueDate <= to)
                    .sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);
                  return (
                    <div key={label} style={{ marginBottom: 'var(--s-2-5)' }}>
                      <div className="row deadline-heading">
                        {label}
                        <span className="faint">{rows.length}</span>
                      </div>
                      {rows.slice(0, 4).map(task => (
                        <button className="row deadline-row" key={task.id} onClick={() => p.openTask(task.id)}>
                          <span className="pdot" style={{ '--c': projectColor(projects.find(project => project.id === task.projectId)) } as CSSProperties} />
                          <span className="trunc grow">{task.title}</span>
                          <TaskPriorityIcon priority={task.priority} />
                          <PersonAvatar member={s.members.find(member => member.user_id === task.assigneeUserId)} />
                        </button>
                      ))}
                      {rows.length > 4 && (
                        <div className="faint deadline-more">
                          +{rows.length - 4} {t('mais', 'more')}
                        </div>
                      )}
                      {!rows.length && <div className="faint deadline-empty">{t('Nenhum prazo', 'Nothing due')}</div>}
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="panel">
              <div className="panel-h">
                <h2>{t('Atividade recente', 'Recent activity')}</h2>
                <div className="acts">
                  <Button variant="ghost" className="btn-sm" onClick={() => p.go('activity')}>
                    {t('Ver tudo', 'View all')}
                  </Button>
                </div>
              </div>
              <div className="panel-b feed lined dashboard-feed">{p.recentActivity}</div>
            </section>
          </div>
        </div>
      ) : (
        <div className="grid2">
          <section className="panel">
            <div className="panel-h">
              <h2>{t('Portfólio', 'Portfolio')}</h2>
            </div>
            <ProjectTable projects={projects} tasks={tasks} p={p} portfolio />
          </section>
          <div className="stack">
            <section className="panel">
              <div className="panel-h">
                <h2>{t('Tarefas por status', 'Tasks by status')}</h2>
              </div>
              <div className="panel-b">
                <div className="stackbar" style={{ height: 10, marginBottom: 'var(--s-3)' }}>
                  {statuses.map(status => (
                    <i
                      key={status}
                      style={{
                        width: `${(tasks.filter(task => task.status === status).length / Math.max(tasks.length, 1)) * 100}%`,
                        background: `var(--st-${status})`,
                      }}
                    />
                  ))}
                </div>
                {statuses.map(status => {
                  const count = tasks.filter(task => task.status === status).length;
                  return (
                    <div className="row status-distribution" key={status}>
                      <TaskStatusIcon status={status} />
                      <span className="grow">{statusLabel(status, t)}</span>
                      <span className="num muted">{count}</span>
                      <span className="num faint percentage">{Math.round((count / Math.max(tasks.length, 1)) * 100)}%</span>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="panel">
              <div className="panel-h">
                <h2>{t('Carga de trabalho', 'Workload')}</h2>
                <div className="acts">
                  <span className="faint" style={{ fontSize: 'var(--fs-xs)' }}>
                    {t('Tarefas abertas por pessoa', 'Open tasks per person')}
                  </span>
                </div>
              </div>
              <div className="panel-b">
                {workload.map(({ member, rows }) => {
                  return (
                    <button className="row workload-row" key={member.user_id} onClick={() => p.go('member', { id: member.user_id })}>
                      <PersonAvatar member={member} />
                      <span className="trunc workload-name">{member.name.split(' ')[0]}</span>
                      <span className="grow workload-track">
                        <span style={{ width: `${(rows.length / maximumWorkload) * 100}%` }}>
                          {statuses
                            .filter(status => status !== 'done')
                            .map(status => {
                              const count = rows.filter(task => task.status === status).length;
                              return count ? <i key={status} style={{ flex: count, background: `var(--st-${status})` }} /> : null;
                            })}
                        </span>
                      </span>
                      <span className="num muted workload-count">{rows.length}</span>
                    </button>
                  );
                })}
              </div>
            </section>
            <section className="panel">
              <div className="panel-h">
                <h2>{t('Próximos marcos', 'Upcoming milestones')}</h2>
              </div>
              <div className="panel-b">
                {milestones.map((milestone, index) => (
                  <button className="row milestone-row" key={milestone.project.id + index} onClick={() => p.openProject(milestone.project.id, 'timeline')}>
                    <span className="milestone-diamond" style={{ background: projectColor(milestone.project) }} />
                    <span className="grow trunc">
                      {milestone.name} <span className="faint">· {milestone.project.name}</span>
                    </span>
                    <span className="num muted">{relativeDate(milestone.date, p)}</span>
                  </button>
                ))}
                {!milestones.length && <div className="faint">{t('Nenhum marco próximo', 'No upcoming milestones')}</div>}
              </div>
            </section>
          </div>
        </div>
      )}
    </section>
  );
}
const statuses = ['backlog', 'todo', 'progress', 'review', 'done'] as const;
const priorityWeight = { none: 0, low: 1, medium: 2, high: 3, urgent: 4 };
const byDue = (a: Task, b: Task) => (a.dueDate ?? 'z').localeCompare(b.dueDate ?? 'z');

function ProjectTable({ projects, tasks, p, portfolio = false }: { projects: Project[]; tasks: Task[]; p: PanelProps; portfolio?: boolean }) {
  const { t, snapshot: s } = p;
  return (
    <div className="dashboard-table">
      <table className="perm-t" style={{ minWidth: portfolio ? 600 : 560 }}>
        <thead>
          <tr>
            <th>{t('Projeto', 'Project')}</th>
            {portfolio && <th>{t('Líder', 'Lead')}</th>}
            <th>{t('Status', 'Status')}</th>
            <th style={{ width: portfolio ? '22%' : '26%' }}>{t('Progresso', 'Progress')}</th>
            {portfolio && (
              <>
                <th>{t('Abertas', 'Open')}</th>
                <th>{t('Atrasadas', 'Overdue')}</th>
              </>
            )}
            <th>{t('Prazo', 'Due')}</th>
            {!portfolio && <th className="project-table-team">{t('Equipe', 'Team')}</th>}
          </tr>
        </thead>
        <tbody>
          {projects.map(project => {
            const rows = tasks.filter(task => task.projectId === project.id),
              completed = rows.filter(task => task.status === 'done').length,
              progress = Math.round((completed / Math.max(rows.length, 1)) * 100),
              over = rows.filter(task => task.status !== 'done' && task.dueDate && task.dueDate < iso(new Date())).length,
              lead = s.members.find(member => member.user_id === project.leadUserId),
              members = s.projectMembers
                .filter(link => link.projectId === project.id)
                .sort((a, b) => {
                  const order = Array.isArray(project.legacyMetadata.members) ? project.legacyMetadata.members : [];
                  return order.indexOf(a.userId) - order.indexOf(b.userId);
                });
            return (
              <tr key={project.id}>
                <td>
                  <button className="row project-table-name" onClick={() => p.openProject(project.id)}>
                    <ProjectMark project={project} />
                    <span className="trunc">{project.name}</span>
                  </button>
                </td>
                {portfolio && (
                  <td>
                    <span className="row">
                      <PersonAvatar member={lead} />
                      <span className="muted trunc">{lead?.name.split(' ')[0]}</span>
                    </span>
                  </td>
                )}
                <td>
                  <ProjectState project={project} t={t} />
                </td>
                <td>
                  <span className="row">
                    <ProgressBar value={progress} name={project.name} tone={project.status === 'risk' ? 'red' : project.status === 'complete' ? 'green' : ''} />
                    <span className="num faint progress-number">{progress}%</span>
                  </span>
                </td>
                {portfolio && (
                  <>
                    <td className="num">{rows.length - completed}</td>
                    <td className="num" style={{ color: over ? 'var(--red)' : 'var(--text-3)' }}>
                      {over}
                    </td>
                  </>
                )}
                <td className="num muted">
                  <button onClick={() => p.openProject(project.id, 'timeline')}>
                    {preferredDate(
                      project.dueDate,
                      p.prefs,
                      t('pt-BR', 'en'),
                      !!project.dueDate && new Date(project.dueDate + 'T12:00:00').getFullYear() !== new Date().getFullYear(),
                    )}
                  </button>
                </td>
                {!portfolio && (
                  <td className="project-table-team">
                    <span className="avs">
                      {members.slice(0, 3).map(link => (
                        <PersonAvatar key={link.userId} member={s.members.find(member => member.user_id === link.userId)} />
                      ))}
                      {members.length > 3 && <span className="av sm more">+{members.length - 3}</span>}
                    </span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function Favorites({ p, projects, tasks }: { p: PanelProps; projects: Project[]; tasks: Task[] }) {
  const { t, snapshot: s } = p;
  const [error, setError] = useState('');
  const favorites = projects.filter(project => s.preferences.favoriteProjectIds.includes(project.id));
  const favoriteTasks = tasks.filter(task => s.preferences.favoriteTaskIds.includes(task.id));
  return (
    <section className="page wide favorites-page">
      <div className="ph">
        <div>
          <h1>{t('Favoritos', 'Favorites')}</h1>
          <p>{t('Projetos e tarefas marcados para acesso rápido.', "Projects and tasks you've starred for quick access.")}</p>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {!favorites.length && !favoriteTasks.length ? (
        <div className="panel empty-state">
          <div className="glyph">
            <Star size={20} />
          </div>
          <h2 className="es-h">{t('Nenhum favorito ainda', 'No favorites yet')}</h2>
          <p>{t('Marque um projeto ou tarefa para fixar aqui.', 'Star a project or task to pin it here.')}</p>
          <Button variant="outline" className="btn-sm" onClick={() => p.go('projects')}>
            {t('Explorar projetos', 'Browse projects')}
          </Button>
        </div>
      ) : (
        <>
          <h2 className="sec">
            {t('Projetos', 'Projects')} <span className="faint">{favorites.length}</span>
          </h2>
          {favorites.length ? (
            <div className="pgrid">
              {favorites.map(project => {
                const rows = tasks.filter(task => task.projectId === project.id),
                  completed = rows.filter(task => task.status === 'done').length,
                  progress = Math.round((completed / Math.max(rows.length, 1)) * 100),
                  members = s.projectMembers.filter(link => link.projectId === project.id).map(link => link.userId);
                const recent = Math.max(0, ...rows.map(task => Date.parse(task.updatedAt) || 0));
                return (
                  <article className="project-card pcard" key={project.id}>
                    <div className="row project-card-head">
                      <ProjectMark project={project} />
                      <button className="project-card-title grow" onClick={() => p.openProject(project.id)}>
                        <strong>{project.name}</strong>
                      </button>
                      <Star size={12} className="project-favorite-mark" />
                      {project.legacyMetadata.private && <Lock size={12} className="faint" />}
                      <ProjectState project={project} t={t} />
                    </div>
                    <div className="desc">{project.description}</div>
                    <div className="row project-card-progress">
                      <ProgressBar
                        value={progress}
                        name={t('Progresso de ', 'Progress of ') + project.name}
                        tone={project.status === 'complete' ? 'green' : project.status === 'risk' ? 'red' : ''}
                      />
                      <span className="num">{progress}%</span>
                    </div>
                    <div className="foot">
                      <span className="row">
                        <CircleCheck size={12} />
                        {completed}/{rows.length}
                      </span>
                      <span className="row">
                        <Calendar size={12} />
                        <time>
                          {preferredDate(
                            project.dueDate,
                            p.prefs,
                            t('pt-BR', 'en'),
                            !!project.dueDate && new Date(project.dueDate + 'T12:00:00').getFullYear() !== new Date().getFullYear(),
                          ) || '—'}
                        </time>
                      </span>
                      <span className="row hide-m">
                        <Clock size={12} />
                        {projectActivity(project, recent, p)}
                      </span>
                      <span className="sp" />
                      <MemberStack ids={members} members={s.members} />
                    </div>
                    <details className="favorite-project-options">
                      <summary className="ibtn ibtn-sm" aria-label={t('Opções do projeto', 'Project options')}>
                        <MoreHorizontal size={14} />
                      </summary>
                      <div className="panel">
                        <Button variant="ghost" onClick={() => p.openProject(project.id)}>
                          {t('Abrir projeto', 'Open project')}
                        </Button>
                        <Button variant="ghost" onClick={() => void p.toggleFavorite(project.id, 'project').catch(e => setError(errorMessage(e, t)))}>
                          {t('Remover favorito', 'Remove favorite')}
                        </Button>
                      </div>
                    </details>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="faint favorite-missing">{t('Nenhum projeto favorito.', 'No favorite projects.')}</p>
          )}
          <h2 className="sec">
            {t('Tarefas', 'Tasks')} <span className="faint">{favoriteTasks.length}</span>
          </h2>
          {favoriteTasks.length ? (
            <div className="panel">
              <MiniTasks tasks={favoriteTasks} p={p} />
            </div>
          ) : (
            <p className="faint">{t('Abra uma tarefa e marque a estrela para fixar aqui.', 'Open a task and click the star to add it here.')}</p>
          )}
        </>
      )}
    </section>
  );
}

function projectActivity(project: Project, recent: number, p: PanelProps) {
  if (typeof project.legacyMetadata.last !== 'number' && !recent) return '—';
  const minutes = typeof project.legacyMetadata.last === 'number' ? project.legacyMetadata.last : Math.round((Date.now() - recent) / 60000);
  if (minutes < 1) return p.t('agora', 'just now');
  if (minutes < 60) return p.t(`há ${minutes} min`, `${minutes}m ago`);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return p.t(`há ${hours} h`, `${hours}h ago`);
  const days = Math.round(hours / 24);
  if (days < 7) return p.t(`há ${days} d`, `${days}d ago`);
  return preferredDate(new Date(Date.now() - minutes * 60000).toISOString(), p.prefs, p.t('pt-BR', 'en'));
}
