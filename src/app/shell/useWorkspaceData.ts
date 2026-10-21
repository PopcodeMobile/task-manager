import { useCallback, useEffect, useRef, useState } from 'react';
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
} from '../../domain/contracts';
import { eventCursor, type Agent, type DomainEvent, type Member } from '../../workspace/normalized';
import type { WorkspaceRepository } from '../../workspace/repository';
import type { Translate } from '../auth/ConsentPage';
import type { Execute } from '../projects/ProjectsPage';
import { errorMessage } from './messages';
export type TaskGraph = {
  labels: Label[];
  taskLabels: TaskLabel[];
  dependencies: TaskDependency[];
  subtasks: Subtask[];
  events: DomainEvent[];
  files?: FileMetadata[];
  attachments?: TaskAttachment[];
};
type Snapshot = {
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
      const serial = ++refreshSerial.current;
      try {
        // Capture the event boundary BEFORE reading mutable rows. Later commits remain visible to polling.
        const events = initial ? await repo.list<DomainEvent>('list_domain_events', {}, true) : null;
        const [tasks, projects, agents, members, preferences, labels, taskLabels, dependencies, subtasks, files, attachments, calendarEvents] =
          await Promise.all([
            repo.list<Task>('list_tasks', {}, true),
            repo.list<Project>('list_projects', {}, true),
            repo.list<Agent>('list_agents', {}, true),
            initial ? repo.rpc<Member[]>('list_workspace_members', { p_workspace_id: repo.workspaceId }) : Promise.resolve(null),
            initial ? repo.preferences() : Promise.resolve(null),
            initial || operations.some(op => /label$|duplicate_task|complete_task|delete_project|delete_task/.test(op))
              ? repo.list<Label>('list_labels', {}, true)
              : Promise.resolve(null),
            initial || operations.some(op => /label$|duplicate_task|complete_task|delete_project|delete_task/.test(op))
              ? repo.list<TaskLabel>('list_task_labels', {}, true)
              : Promise.resolve(null),
            initial || operations.some(op => /dependency$|duplicate_task_graph|delete_project|delete_task/.test(op))
              ? repo.list<TaskDependency>('list_dependencies', {}, true)
              : Promise.resolve(null),
            initial || operations.some(op => /subtask$|duplicate_task|complete_task|delete_project|delete_task/.test(op))
              ? repo.list<Subtask>('list_subtasks', {}, true)
              : Promise.resolve(null),
            initial || operations.some(op => /file$|attachment$|delete_project|delete_task|duplicate_task|complete_task|move_task/.test(op))
              ? repo.list<FileMetadata>('list_files', {}, true)
              : Promise.resolve(null),
            initial || operations.some(op => /attachment$|delete_project|delete_task|duplicate_task|complete_task/.test(op))
              ? repo.list<TaskAttachment>('list_attachments', {}, true)
              : Promise.resolve(null),
            initial || operations.some(op => /calendar_event$|delete_project/.test(op))
              ? repo.list<CalendarEvent>('list_calendar_events', {}, true)
              : Promise.resolve(null),
          ]);
        if (repo.controller.signal.aborted || serial !== refreshSerial.current) return;
        setSnapshot(old => ({
          tasks,
          files: files ?? old.files,
          attachments: attachments ?? old.attachments,
          calendarEvents: calendarEvents ?? old.calendarEvents,
          labels: labels ?? old.labels,
          taskLabels: taskLabels ?? old.taskLabels,
          dependencies: dependencies ?? old.dependencies,
          subtasks: subtasks ?? old.subtasks,
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
    setSnapshot(emptySnapshot);
    setSnapshotScope('');
    setLoading(true);
    setError('');
    setSearch('');
    if (currentId) void refresh(true);
    return () => {
      repo.dispose();
      idempotency.current.clear();
    };
  }, [repo, currentId]);
  useEffect(() => {
    if (!currentId || loading) return;
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
      events = await repo.list<DomainEvent>('list_domain_events', eventWatermark.current ? { cursor: eventWatermark.current } : {}, true);
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

  async function toggleFavorite(taskId: string) {
    const preferences = await repo.preferences();
    const next = {
      ...preferences,
      favoriteTaskIds: preferences.favoriteTaskIds.includes(taskId)
        ? preferences.favoriteTaskIds.filter(id => id !== taskId)
        : [...preferences.favoriteTaskIds, taskId],
    };
    if (repo.mode === 'local' && repo.savePersonal) await repo.savePersonal({ preferences: { favoriteTaskIds: next.favoriteTaskIds } });
    else await execute('set_preferences', { preferences: { favoriteTaskIds: next.favoriteTaskIds } });
    if (!repo.controller.signal.aborted) setSnapshot(old => ({ ...old, preferences: next }));
  }
  return { snapshot, snapshotScope, loading, error, setError, revision, search, setSearch, refresh, execute, toggleFavorite };
}

export function useTaskDetails(repo: WorkspaceRepository, taskId: string | undefined, revision: number, t: Translate, graph: TaskGraph) {
  const [details, setDetails] = useState<{
    comments: import('../../domain/contracts').Comment[];
    files: import('../../domain/contracts').FileMetadata[];
    attachments: import('../../domain/contracts').TaskAttachment[];
    reactions: import('../../domain/contracts').CommentReaction[];
    history: import('../../domain/contracts').ActivityEntry[];
    actorId: string | null;
  }>({
    comments: [],
    files: [],
    attachments: [],
    reactions: [],
    history: [],
    actorId: null,
  });
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [attempt, retry] = useState(0);
  useEffect(() => {
    if (!taskId) return;
    let alive = true;
    setLoading(true);
    void Promise.all([
      repo.list<import('../../domain/contracts').Comment>('list_comments', { taskId }, true),
      graph.files ? Promise.resolve(graph.files) : repo.list<import('../../domain/contracts').FileMetadata>('list_files', {}, true),
      graph.attachments ? Promise.resolve(graph.attachments) : repo.list<import('../../domain/contracts').TaskAttachment>('list_attachments', {}, true),
      repo.list<import('../../domain/contracts').CommentReaction>('list_reactions', {}, true),
      repo.list<import('../../domain/contracts').ActivityEntry>('list_activity', { taskId }, true),
      repo.mode === 'local' ? repo.rpc<{ currentMemberId: string }>('get_local_actor').then(r => r.currentMemberId) : Promise.resolve(repo.userId),
    ])
      .then(([comments, files, attachments, reactions, history, actorId]) => {
        if (alive && !repo.controller.signal.aborted) {
          setDetails({ comments, files, attachments, reactions, history, actorId });
          setError('');
        }
      })
      .catch(err => {
        if (alive && !repo.controller.signal.aborted) setError(errorMessage(err, t));
      })
      .finally(() => {
        if (alive && !repo.controller.signal.aborted) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [repo, taskId, revision, t, attempt]);
  return {
    ...details,
    subtasks: graph.subtasks.filter(s => s.taskId === taskId),
    dependencies: graph.dependencies,
    labels: graph.labels,
    links: graph.taskLabels.filter(l => l.taskId === taskId),
    events: graph.events.filter(event => event.entityId === taskId || event.payload?.taskId === taskId),
    error,
    loading,
    retry: () => retry(value => value + 1),
  };
}
