import { useState, type CSSProperties } from 'react';
import {
  CircleDashed,
  FolderKanban,
  Globe,
  Code,
  Palette,
  Megaphone,
  Smartphone,
  ShoppingBag,
  BarChart3,
  Layers,
  Star,
  Zap,
  Heart,
  Rocket,
  Component,
  Building2,
  Target,
  Briefcase,
  User,
} from 'lucide-react';
import type { Project, Task } from '../../domain/contracts';
import type { Member } from '../../workspace/normalized';
import { ProjectStatus, ProjectProgress, projectTone, memberTone } from '../projects/ProjectVisual';
import type { Translate } from '../auth/ConsentPage';
import type { PanelProps } from './types';
import { TaskStatusIcon, TaskPriorityIcon } from '../tasks/TaskVisual';
import { iso, diffD } from '../../core/calendar.js';
import { preferredDate } from './panel-model';
import { errorMessage } from '../shell/messages';
export const projectColor = (project?: Project) => (project ? projectTone(project) : 'var(--accent)');
export function ProjectMark({ project }: { project: Project }) {
  const Icon =
    (
      {
        globe: Globe,
        code: Code,
        palette: Palette,
        megaphone: Megaphone,
        smartphone: Smartphone,
        'shopping-bag': ShoppingBag,
        'bar-chart-3': BarChart3,
        layers: Layers,
        star: Star,
        zap: Zap,
        heart: Heart,
        rocket: Rocket,
        component: Component,
        'building-2': Building2,
        target: Target,
        briefcase: Briefcase,
      } as Record<string, typeof Globe>
    )[String(project.legacyMetadata.icon)] ?? FolderKanban;
  return (
    <span className="picon" style={{ '--c': projectColor(project) } as CSSProperties}>
      <Icon size={14} />
    </span>
  );
}
export function PersonAvatar({ member, size = 'sm' }: { member?: Member; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  return (
    <span className={'av ' + size + (!member ? ' empty' : '')} title={member?.name} aria-hidden="true" style={{ '--c': memberTone(member) } as CSSProperties}>
      {member ? (
        member.name
          .split(' ')
          .map(part => part[0])
          .slice(0, 2)
          .join('')
      ) : (
        <User size={11} />
      )}
    </span>
  );
}
export function ProjectState({ project, t }: { project: Project; t: Translate }) {
  return <ProjectStatus status={project.status} t={t} />;
}
export const ProgressBar = ProjectProgress;
export function MiniTasks({ tasks, p, avatars = true }: { tasks: Task[]; p: PanelProps; avatars?: boolean }) {
  const [error, setError] = useState('');
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {tasks.map(task => {
        const project = p.snapshot.projects.find(project => project.id === task.projectId);
        return (
          <div className={'mini' + (task.status === 'done' ? ' done' : '')} key={task.id}>
            <input
              type="checkbox"
              className="check round"
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
            <TaskStatusIcon status={task.status} />
            <button className="tt" onClick={() => p.openTask(task.id)}>
              {task.title}
            </button>
            <span className="pj hide-m">
              <span className="pdot" style={{ '--c': projectColor(project) } as CSSProperties} />
              <span className="trunc">{project?.name}</span>
            </span>
            <TaskPriorityIcon priority={task.priority} />
            <span
              className={
                'hide-m mini-due due' +
                (task.status !== 'done' && task.dueDate && task.dueDate < iso(new Date())
                  ? ' over'
                  : task.status !== 'done' && task.dueDate && diffD(new Date(task.dueDate + 'T12:00:00'), new Date()) <= 1
                    ? ' soon'
                    : '')
              }
            >
              {relativeDate(task.dueDate, p)}
            </span>
            {avatars && <PersonAvatar member={p.snapshot.members.find(member => member.user_id === task.assigneeUserId)} />}
          </div>
        );
      })}
      {!tasks.length && (
        <div className="empty-state sm">
          <div className="glyph">
            <CircleDashed size={20} />
          </div>
          <h3 className="es-h">{p.t('Nenhuma tarefa nesta lista.', 'No tasks in this list.')}</h3>
        </div>
      )}
    </>
  );
}

export function relativeDate(value: string | null, p: Pick<PanelProps, 't' | 'prefs'>) {
  if (!value) return '';
  const date = new Date(value + 'T12:00:00');
  const days = diffD(date, new Date());
  if (days === 0) return p.t('Hoje', 'Today');
  if (days === 1) return p.t('Amanhã', 'Tomorrow');
  if (days === -1) return p.t('Ontem', 'Yesterday');
  if (days > 1 && days < 7) return date.toLocaleDateString(p.t('pt-BR', 'en'), { weekday: 'short' });
  return preferredDate(value, p.prefs, p.t('pt-BR', 'en'));
}
