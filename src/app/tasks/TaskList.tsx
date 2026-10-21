import type { Translate } from '../auth/ConsentPage';
import { TaskViews, type TaskViewsProps } from './TaskViews';
export const statuses = ['backlog', 'todo', 'progress', 'review', 'done'] as const;
export function statusLabel(status: string, t: Translate) {
  return (
    (
      {
        backlog: t('Backlog', 'Backlog'),
        todo: t('A fazer', 'To do'),
        progress: t('Em andamento', 'In progress'),
        review: t('Em revisão', 'In review'),
        done: t('Concluídas', 'Done'),
      } as Record<string, string>
    )[status] ?? status
  );
}
export function priorityLabel(priority: string, t: Translate) {
  return (
    (
      {
        none: t('Sem prioridade', 'No priority'),
        low: t('Baixa', 'Low'),
        medium: t('Média', 'Medium'),
        high: t('Alta', 'High'),
        urgent: t('Urgente', 'Urgent'),
      } as Record<string, string>
    )[priority] ?? priority
  );
}
export function TaskList(props: TaskViewsProps) {
  return <TaskViews {...props} />;
}
