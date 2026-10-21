import { useEffect, useRef, useState } from 'react';
import type { Page } from '../../domain/contracts';
import type { WorkspaceRepository } from '../../workspace/repository';
/** One request per explicit page. Failed continuation retains both data and cursor. */
export function usePagedCollection<T>(
  repo: WorkspaceRepository,
  operation: string,
  query: Record<string, string | number>,
  revision: number,
  complete?: T[],
  enabled = true,
) {
  const key = JSON.stringify([repo.workspaceId, operation, query]);
  const [state, setState] = useState<{ key: string; items: T[]; cursor: string | null; loaded: boolean }>({ key, items: [], cursor: null, loaded: false });
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  const consumedRetry = useRef(0),
    generation = useRef(0),
    failedRead = useRef<{ key: string; cursor?: string; reset: boolean } | null>(null);
  const current = state.key === key ? state : { key, items: [], cursor: null, loaded: false };
  async function read(cursor?: string, reset = false) {
    const serial = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const page = await repo.query<Page<T>>(operation, { ...query, limit: 100, ...(cursor ? { cursor } : {}) }, true);
      if (serial !== generation.current || repo.controller.signal.aborted) return;
      setState(old => ({ key, items: reset || old.key !== key ? page.items : [...old.items, ...page.items], cursor: page.nextCursor, loaded: true }));
      consumedRetry.current = retry;
      failedRead.current = null;
    } catch {
      if (serial === generation.current && !repo.controller.signal.aborted) {
        failedRead.current = { key, cursor, reset };
        setError('history_unavailable');
      }
    } finally {
      if (serial === generation.current && !repo.controller.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    if (!enabled) return;
    if (complete !== undefined && consumedRetry.current === retry) {
      setState({ key, items: complete, cursor: null, loaded: true });
      setLoading(false);
      setError('');
    } else void read(undefined, true);
    return () => {
      generation.current++;
    };
  }, [repo, key, revision, retry, enabled]);
  return {
    items: current.items,
    loading,
    error,
    complete: current.loaded && current.cursor === null && !error,
    more: !current.loaded || current.cursor !== null || !!error,
    loadMore: () => {
      if (loading) return Promise.resolve();
      const failed = failedRead.current;
      return failed?.key === key ? read(failed.cursor, failed.reset) : read(current.cursor ?? undefined, !current.loaded);
    },
    retry: () => setRetry(value => value + 1),
  };
}
