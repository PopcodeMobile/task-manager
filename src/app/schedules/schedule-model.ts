import { addD, diffD, iso, parse, sod } from '../../core/calendar.js';
import type { BatchCommand, Project, Task } from '../../domain/contracts.ts';
import { RepositoryError } from '../../workspace/normalized.ts';
import { prepareTaskAction } from '../tasks/task-view-model.ts';
export type ScheduleTask = Pick<Task, 'id' | 'workspaceId' | 'version' | 'startDate' | 'dueDate' | 'reservation'>;
export function validDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && iso(parse(value)) === value;
}
export function weekStart(date: Date, first: number) {
  return addD(sod(date), -((date.getDay() - first + 7) % 7));
}
export function calendarDays(date: string, mode: string, first: number): string[] {
  const current = parse(date)!;
  const start = weekStart(mode === 'week' ? current : new Date(current.getFullYear(), current.getMonth(), 1), first);
  const count = mode === 'week' ? 7 : addD(start, 35).getMonth() === current.getMonth() ? 42 : 35;
  return Array.from({ length: count }, (_, i) => iso(addD(start, i)));
}
export function navigateCalendar(date: string, mode: string, direction: number): string {
  const current = parse(date)!;
  return iso(mode === 'week' ? addD(current, direction * 7) : new Date(current.getFullYear(), current.getMonth() + direction, 1));
}
export function scheduleCommand(task: ScheduleTask, due: string): BatchCommand | null {
  if (!validDay(due) || !validDay(task.dueDate) || (task.startDate !== null && !validDay(task.startDate))) throw new RepositoryError('validation_error');
  if (task.dueDate === due) return null;
  const start = task.startDate ? iso(addD(parse(due), -diffD(parse(task.dueDate), parse(task.startDate)))) : null;
  // The shared guard uses the drag's captured version/reservation; the server rechecks current authority.
  return prepareTaskAction(task as Task, 'update_task', { dueDate: due, startDate: start });
}
export function readScheduleDrag(value: string, scope: string): ScheduleTask | null {
  try {
    const parsed = JSON.parse(value),
      task = parsed.task;
    if (
      parsed.scope !== scope ||
      !task ||
      typeof task.id !== 'string' ||
      typeof task.workspaceId !== 'string' ||
      !Number.isInteger(task.version) ||
      task.version < 1 ||
      !validDay(task.dueDate) ||
      (task.startDate !== null && !validDay(task.startDate))
    )
      return null;
    return task;
  } catch {
    return null;
  }
}
export function milestones(projects: Project[]) {
  const dates = new Map<string, { name: string; project: Project }[]>();
  for (const project of projects)
    for (const item of Array.isArray(project.legacyMetadata.milestones) ? project.legacyMetadata.milestones : []) {
      if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.name !== 'string' || !validDay(item.date)) continue;
      dates.set(item.date, [...(dates.get(item.date) ?? []), { name: item.name, project }]);
    }
  return [...dates].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => ({ date, items }));
}
