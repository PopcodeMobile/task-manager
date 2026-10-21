import type { ActivityEntry, Comment } from '../../domain/contracts';
import type { DomainEvent } from '../../workspace/normalized';
import type { WorkspaceRepository } from '../../workspace/repository';
import type { Snapshot } from '../shell/useWorkspaceData';
import type { Translate } from '../auth/ConsentPage';
import { usePagedCollection } from '../shell/usePagedCollection';
import { Button } from '../../components/ui/button';
import { ActivityPage } from './ActivityPage';

/** Existing workspace pages are filtered locally; an empty filtered page is never the end of history. */
export function ContextHistory({
  snapshot,
  repo,
  projectId,
  actorId,
  limit,
  openTask,
  t,
}: {
  snapshot: Snapshot;
  repo: WorkspaceRepository;
  projectId?: string;
  actorId?: string;
  limit?: number;
  openTask: (id: string) => void;
  t: Translate;
}) {
  const revision = snapshot.events.length;
  const eventPage = usePagedCollection<DomainEvent>(repo, 'list_domain_events', {}, revision, snapshot.historyComplete ? snapshot.events : undefined);
  const activityPage = usePagedCollection<ActivityEntry>(repo, 'list_activity', {}, revision, snapshot.historyComplete ? snapshot.activity : undefined);
  const commentPage = usePagedCollection<Comment>(repo, 'list_comments', {}, revision, snapshot.historyComplete ? snapshot.comments : undefined);
  const pages = [eventPage, activityPage, commentPage];
  const complete = pages.every(page => page.complete),
    loading = pages.some(page => page.loading),
    failed = pages.some(page => page.error);
  // Polled events remain visible even when the selected history page predates them.
  const domain = [...new Map([...eventPage.items, ...snapshot.events].map(event => [event.id, event])).values()];
  const events = [
    ...domain.filter(event => event.operation !== 'batch'),
    ...activityPage.items.map((entry): DomainEvent => ({
      id: 'history:' + entry.id,
      operation: entry.verb,
      entityId: entry.taskId,
      actorUserId: entry.actorUserId ?? '',
      actorAgentId: null,
      createdAt: entry.createdAt,
      payload: { projectId: entry.projectId ?? undefined, taskId: entry.taskId ?? undefined },
    })),
    ...commentPage.items
      .filter(comment => !domain.some(event => event.operation === 'add_task_comment' && event.entityId === comment.id))
      .map((comment): DomainEvent => ({
        id: 'comment:' + comment.id,
        operation: 'add_task_comment',
        entityId: comment.taskId,
        actorUserId: comment.authorUserId ?? '',
        actorAgentId: null,
        createdAt: comment.createdAt,
        payload: { taskId: comment.taskId },
      })),
  ]
    .filter(event => {
      const taskId = event.payload.taskId ?? event.entityId;
      const task = snapshot.tasks.find(task => task.id === taskId);
      const eventProject = event.payload.projectId ?? task?.projectId;
      if (repo.mode === 'local' && ((eventProject && !snapshot.projects.some(project => project.id === eventProject)) || (event.payload.taskId && !task)))
        return false;
      return (!actorId || event.actorUserId === actorId) && (!projectId || eventProject === projectId || event.entityId === projectId);
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    <div className="context-history">
      {!complete && (
        <p role={failed ? 'alert' : 'status'}>
          {failed
            ? t('Não foi possível carregar parte do histórico. Tente novamente.', 'Part of the history could not be loaded. Try again.')
            : t(
                'Histórico parcial. Continue para consultar mais registros deste contexto.',
                'Partial history. Continue to view more records for this context.',
              )}
        </p>
      )}
      {(events.length > 0 || complete) && (
        <ActivityPage
          events={limit ? events.slice(-limit) : events}
          members={snapshot.members}
          agents={snapshot.agents}
          tasks={snapshot.tasks}
          openTask={openTask}
          t={t}
        />
      )}
      {!complete && (
        <Button
          disabled={loading}
          onClick={() => {
            for (const page of pages) if (page.more) void page.loadMore();
          }}
        >
          {loading
            ? t('Carregando histórico…', 'Loading history…')
            : failed
              ? t('Tentar histórico novamente', 'Retry history')
              : t('Carregar mais histórico', 'Load more history')}
        </Button>
      )}
    </div>
  );
}
