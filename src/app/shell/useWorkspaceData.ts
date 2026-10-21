import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  Task,
  Project,
  UserPreferences,
  Label,
  TaskLabel,
  TaskDependency,
  Subtask,
  FileMetadata,
  TaskAttachment,
  CalendarEvent,
  SavedView,
  Team,
  Comment,
  ActivityEntry,
  Notification,
  CommentReaction,
} from '../../domain/contracts';
import { eventCursor, type Agent, type DomainEvent, type Member } from '../../workspace/normalized';
import type { WorkspaceRepository } from '../../workspace/repository';
import type { Translate } from '../auth/ConsentPage';
import type { Execute } from '../projects/ProjectsPage';
import { errorMessage } from './messages';
import { type CompleteDiscussion } from '../tasks/task-discussion-data';
import { affectedCollections } from './refresh-dependencies';
import { usePagedCollection } from './usePagedCollection';
export type TaskGraph = CompleteDiscussion & {
  historyComplete?: boolean;
  actorId?: string;
  labels: Label[];
  taskLabels: TaskLabel[];
  dependencies: TaskDependency[];
  subtasks: Subtask[];
  events: DomainEvent[];
  files?: FileMetadata[];
  attachments?: TaskAttachment[];
};
export type Snapshot = {
  historyComplete: boolean;
  actorId: string;
  actorTeamId: string | null;
  teams: Team[];
  teamMembers: { teamId: string; userId: string }[];
  notifications: Notification[];
  reactions: CommentReaction[];
  views: SavedView[];
  projectMembers: { projectId: string; userId: string }[];
  comments: Comment[];
  activity: ActivityEntry[];
  files: FileMetadata[];
  attachments: TaskAttachment[];
  calendarEvents: CalendarEvent[];
  labels: Label[];
  taskLabels: TaskLabel[];
  dependencies: TaskDependency[];
  subtasks: Subtask[];
  tasks: Task[];
  projects: Project[];
  agents: Agent[];
  members: Member[];
  events: DomainEvent[];
  preferences: UserPreferences['preferences'];
};
export const emptySnapshot: Snapshot = {
  historyComplete: false,
  actorId: '',
  actorTeamId: null,
  teams: [],
  teamMembers: [],
  notifications: [],
  reactions: [],
  views: [],
  projectMembers: [],
  comments: [],
  activity: [],
  files: [],
  attachments: [],
  calendarEvents: [],
  labels: [],
  taskLabels: [],
  dependencies: [],
  subtasks: [],
  tasks: [],
  projects: [],
  agents: [],
  members: [],
  events: [],
  preferences: { favoriteProjectIds: [], favoriteTaskIds: [], notificationReadStates: {} },
};
export function useWorkspaceData(repo: WorkspaceRepository, currentId: string | undefined, workspaceId: string, t: Translate) {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot),
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
    async (initial = false, operations: string[] = []) => {
      if (operations.includes('local_reset_demo')) initial = true;
      const serial = ++refreshSerial.current;
      try {
        // Capture the event boundary BEFORE reading mutable rows. Later commits remain visible to polling.
        const boundary = initial ? await repo.query<{ data: { cursor: string } }>('get_event_cursor', {}, true) : null;
        const affected = affectedCollections(operations);
        const [
          tasks,
          projects,
          agents,
          members,
          preferences,
          labels,
          taskLabels,
          dependencies,
          subtasks,
          files,
          attachments,
          calendarEvents,
          teams,
          teamMembers,
          notifications,
          reactions,
          views,
          projectMembers,
          comments,
          activity,
          actorId,
        ] = await Promise.all([
          repo.list<Task>('list_tasks', {}, true),
          repo.list<Project>('list_projects', {}, true),
          repo.list<Agent>('list_agents', {}, true),
          initial || affected.has('members') ? repo.rpc<Member[]>('list_workspace_members', { p_workspace_id: repo.workspaceId }) : Promise.resolve(null),
          initial || affected.has('preferences') ? repo.preferences(true) : Promise.resolve(null),
          initial || affected.has('labels') ? repo.list<Label>('list_labels', {}, true) : Promise.resolve(null),
          initial || affected.has('taskLabels') ? repo.list<TaskLabel>('list_task_labels', {}, true) : Promise.resolve(null),
          initial || affected.has('dependencies') ? repo.list<TaskDependency>('list_dependencies', {}, true) : Promise.resolve(null),
          initial || affected.has('subtasks') ? repo.list<Subtask>('list_subtasks', {}, true) : Promise.resolve(null),
          initial || affected.has('files') ? repo.list<FileMetadata>('list_files', {}, true) : Promise.resolve(null),
          initial || affected.has('attachments') ? repo.list<TaskAttachment>('list_attachments', {}, true) : Promise.resolve(null),
          initial || affected.has('calendarEvents') ? repo.list<CalendarEvent>('list_calendar_events', {}, true) : Promise.resolve(null),
          initial || affected.has('teams') ? repo.list<Team>('list_teams', {}, true) : Promise.resolve(null),
          initial || affected.has('teamMembers') ? repo.list<{ teamId: string; userId: string }>('list_team_members', {}, true) : Promise.resolve(null),
          initial || affected.has('notifications') ? repo.list<Notification>('list_notifications', {}, true) : Promise.resolve(null),
          Promise.resolve(null),
          initial || affected.has('views') ? repo.list<SavedView>('list_views', {}, true) : Promise.resolve(null),
          initial || affected.has('projectMembers')
            ? repo.list<{ projectId: string; userId: string }>('list_project_members', {}, true)
            : Promise.resolve(null),
          Promise.resolve(null),
          Promise.resolve(null),
          initial || affected.has('members')
            ? repo.mode === 'local'
              ? repo.rpc<{ currentMemberId: string; teamId?: string | null }>('get_local_actor')
              : Promise.resolve({ currentMemberId: repo.userId, teamId: null })
            : Promise.resolve(null),
        ]);
        if (repo.controller.signal.aborted || serial !== refreshSerial.current) return;
        setSnapshot(old => ({
          tasks,
          historyComplete: false,
          actorId: actorId?.currentMemberId ?? old.actorId,
          actorTeamId: actorId ? (actorId.teamId ?? null) : old.actorTeamId,
          teams: teams ?? old.teams,
          teamMembers: teamMembers ?? old.teamMembers,
          notifications: notifications ?? old.notifications,
          reactions: reactions ?? [],
          views: views ?? old.views,
          projectMembers: projectMembers ?? old.projectMembers,
          comments: comments ?? [],
          activity: activity ?? [],
          files: files ?? old.files,
          attachments: attachments ?? old.attachments,
          calendarEvents: calendarEvents ?? old.calendarEvents,
          labels: labels ?? old.labels,
          taskLabels: taskLabels ?? old.taskLabels,
          dependencies: dependencies ?? old.dependencies,
          subtasks: subtasks ?? old.subtasks,
          projects,
          agents,
          events: initial ? [] : old.events,
          members: members ?? old.members,
          preferences: preferences ?? old.preferences,
        }));
        if (boundary) eventWatermark.current = boundary.data.cursor;
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
  useLayoutEffect(() => {
    repo.activate();
    return () => {
      repo.dispose();
      idempotency.current.clear();
    };
  }, [repo]);
  useEffect(() => {
    eventWatermark.current = undefined;
    setSnapshot(emptySnapshot);
    setSnapshotScope('');
    setLoading(true);
    setError('');
    setSearch('');
    if (currentId) void refresh(true);
  }, [repo, currentId]);
  useEffect(() => {
    if (!currentId || loading) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        tick(value => value + 1);
        if (document.visibilityState !== 'hidden') {
          const events = (
            await repo.query<import('../../domain/contracts').Page<DomainEvent>>(
              'list_domain_events',
              { limit: 100, ...(eventWatermark.current ? { cursor: eventWatermark.current } : {}) },
              true,
            )
          ).items;
          if (!alive) return;
          if (events.length) {
            setSnapshot(old => ({ ...old, events: [...new Map([...old.events, ...events].map(e => [e.id, e])).values()] }));
            if (
              await refresh(
                false,
                events.map(event => event.operation),
              )
            )
              eventWatermark.current = eventCursor(events.at(-1)!);
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
  }, [repo, currentId, loading, refresh, t]);
  const execute: Execute = async <T>(operation: string, input: Record<string, unknown>, version?: number): Promise<T> => {
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
      events = (
        await repo.query<import('../../domain/contracts').Page<DomainEvent>>(
          'list_domain_events',
          { limit: 100, ...(eventWatermark.current ? { cursor: eventWatermark.current } : {}) },
          true,
        )
      ).items;
    } catch (err) {
      if (!repo.controller.signal.aborted) setError(errorMessage(err, t));
    }
    // The command is authoritative even if its subsequent event read failed.
    const operations = [operation, ...events.map(event => event.operation)];
    if (operation === 'batch' && Array.isArray(input.commands)) {
      for (const child of input.commands) {
        if (child && typeof child === 'object' && 'operation' in child && typeof child.operation === 'string') operations.push(child.operation);
      }
    }
    const updated = await refresh(false, operations);
    if (events.length && !repo.controller.signal.aborted) {
      setSnapshot(old => ({ ...old, events: [...new Map([...old.events, ...events].map(e => [e.id, e])).values()] }));
      if (updated) eventWatermark.current = eventCursor(events.at(-1)!);
    }
    return result.data;
  };

  async function toggleFavorite(taskId: string, kind: 'task' | 'project' = 'task') {
    const field = kind === 'project' ? 'favoriteProjectIds' : 'favoriteTaskIds';
    const preferences = await repo.preferences(true);
    const next = {
      ...preferences,
      [field]: preferences[field].includes(taskId) ? preferences[field].filter(id => id !== taskId) : [...preferences[field], taskId],
    };
    if (repo.mode === 'local' && repo.savePersonal) await repo.savePersonal({ preferences: { [field]: next[field] } });
    else await execute('set_preferences', { preferences: { [field]: next[field] } });
    if (!repo.controller.signal.aborted) setSnapshot(old => ({ ...old, preferences: next }));
  }
  async function markNotifications(ids: string[], read: boolean) {
    const existing = await repo.preferences(true);
    const notificationReadStates = { ...existing.notificationReadStates, ...Object.fromEntries(ids.map(id => [id, read])) };
    if (repo.mode === 'local' && repo.savePersonal) await repo.savePersonal({ preferences: { notificationReadStates } });
    else await execute('set_preferences', { preferences: { notificationReadStates } });
    if (!repo.controller.signal.aborted) setSnapshot(old => ({ ...old, preferences: { ...old.preferences, notificationReadStates } }));
  }
  async function addCopiedFavorites(ids: string[]) {
    const current = await repo.preferences(true);
    const next = { ...current, favoriteTaskIds: [...new Set([...current.favoriteTaskIds, ...ids])] };
    if (repo.mode === 'local' && repo.savePersonal) await repo.savePersonal({ preferences: { favoriteTaskIds: next.favoriteTaskIds } });
    else await execute('set_preferences', { preferences: { favoriteTaskIds: next.favoriteTaskIds } });
    if (!repo.controller.signal.aborted) setSnapshot(old => ({ ...old, preferences: next }));
  }
  return {
    markNotifications,
    addCopiedFavorites,
    snapshot,
    snapshotScope,
    loading,
    error,
    setError,
    revision,
    search,
    setSearch,
    refresh,
    execute,
    toggleFavorite,
  };
}

export function useTaskDetails(repo: WorkspaceRepository, taskId: string | undefined, revision: number, t: Translate, graph: TaskGraph) {
  const complete = graph.historyComplete !== false;
  const comments = usePagedCollection<Comment>(
    repo,
    'list_comments',
    { taskId: taskId ?? '' },
    revision,
    complete ? graph.comments?.filter(c => c.taskId === taskId) : undefined,
    !!taskId,
  );
  const reactions = usePagedCollection<CommentReaction>(
    repo,
    'list_reactions',
    { taskId: taskId ?? '' },
    revision,
    complete ? graph.reactions : undefined,
    !!taskId,
  );
  const history = usePagedCollection<ActivityEntry>(
    repo,
    'list_activity',
    { taskId: taskId ?? '' },
    revision,
    complete ? graph.activity?.filter(c => c.taskId === taskId) : undefined,
    !!taskId,
  );
  const events = usePagedCollection<DomainEvent>(
    repo,
    'list_task_activity',
    { taskId: taskId ?? '' },
    revision,
    complete ? graph.events.filter(e => e.entityId === taskId || e.payload?.taskId === taskId) : undefined,
    !!taskId,
  );
  const commentIds = new Set(comments.items.map(c => c.id));
  return {
    comments: comments.items,
    reactions: reactions.items.filter(r => commentIds.has(r.commentId)),
    history: history.items,
    files: graph.files ?? [],
    attachments: graph.attachments ?? [],
    actorId: graph.actorId ?? repo.userId,
    subtasks: graph.subtasks.filter(s => s.taskId === taskId),
    dependencies: graph.dependencies,
    labels: graph.labels,
    links: graph.taskLabels.filter(l => l.taskId === taskId),
    events: events.items,
    error:
      comments.error || reactions.error || history.error || events.error ? t('Não foi possível carregar o histórico.', 'History could not be loaded.') : '',
    loading: comments.loading || reactions.loading || history.loading || events.loading,
    more: comments.more || reactions.more || history.more || events.more,
    loadMore: async () => {
      for (const page of [comments, reactions, history, events]) if (page.more) await page.loadMore();
    },
    retry: () => {
      comments.retry();
      reactions.retry();
      history.retry();
      events.retry();
    },
  };
}
