import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task, Project, UserPreferences } from '../../domain/contracts';
import { eventCursor, type Agent, type DomainEvent, type Member } from '../../workspace/normalized';
import type { WorkspaceRepository } from '../../workspace/repository';
import type { Translate } from '../auth/ConsentPage';
import type { Execute } from '../projects/ProjectsPage';
import { errorMessage } from './messages';
type Snapshot = { tasks: Task[]; projects: Project[]; agents: Agent[]; members: Member[]; events: DomainEvent[]; preferences: UserPreferences['preferences'] };
export const emptySnapshot: Snapshot = {
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
    async (initial = false) => {
      const serial = ++refreshSerial.current;
      try {
        // Capture the event boundary BEFORE reading mutable rows. Later commits remain visible to polling.
        const events = initial ? await repo.list<DomainEvent>('list_domain_events', {}, true) : null;
        const [tasks, projects, agents, members, preferences] = await Promise.all([
          repo.list<Task>('list_tasks', {}, true),
          repo.list<Project>('list_projects', {}, true),
          repo.list<Agent>('list_agents', {}, true),
          initial ? repo.rpc<Member[]>('list_workspace_members', { p_workspace_id: repo.workspaceId }) : Promise.resolve(null),
          initial ? repo.preferences() : Promise.resolve(null),
        ]);
        if (repo.controller.signal.aborted || serial !== refreshSerial.current) return;
        setSnapshot(old => ({
          tasks,
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
            if (await refresh()) eventWatermark.current = eventCursor(events.at(-1)!);
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
    const updated = await refresh();
    if (events.length && !repo.controller.signal.aborted) {
      setSnapshot(old => ({ ...old, events: [...new Map([...old.events, ...events].map(e => [e.id, e])).values()] }));
      if (updated) eventWatermark.current = eventCursor(events.at(-1)!);
    }
    return result.data;
  };

  return { snapshot, snapshotScope, loading, error, setError, revision, search, setSearch, refresh, execute };
}
