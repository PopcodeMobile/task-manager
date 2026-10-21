import { useEffect, useState } from 'react';
import type { WorkspaceRepository } from '../../workspace/repository';
import type { Translate } from '../auth/ConsentPage';
import { errorMessage } from '../shell/messages';
const object = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
/** Same identity/workspace preference envelope as TaskViews, preserving unknown fields. */
export function useSurfaceView<T extends object>(
  repo: WorkspaceRepository,
  key: string,
  read: (v: Record<string, unknown>) => T,
  t: Translate,
  legacyKey?: string,
) {
  const [value, setValue] = useState(() => read({})),
    [prefs, setPrefs] = useState<Record<string, unknown>>({}),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [attempt, retry] = useState(0);
  useEffect(() => {
    let alive = true;
    setReady(false);
    void (async () => {
      try {
        await repo.personal?.();
        const personal = object(JSON.parse(localStorage.getItem(`gr8r.preferences.${repo.userId}`) || '{}'));
        if (!alive || repo.controller.signal.aborted) return;
        const workspace = object(object(personal.views)[repo.workspaceId!]);
        setValue(read(object(workspace[key] ?? (legacyKey ? workspace[legacyKey] : undefined))));
        setPrefs(object(personal.prefs));
        setError('');
        setReady(true);
      } catch (err) {
        if (alive && !repo.controller.signal.aborted) setError(errorMessage(err, t));
      }
    })();
    return () => {
      alive = false;
    };
  }, [repo, key, attempt]);
  function save(next: T) {
    if (!ready || repo.controller.signal.aborted) return;
    try {
      const storageKey = `gr8r.preferences.${repo.userId}`,
        personal = object(JSON.parse(localStorage.getItem(storageKey) || '{}')),
        views = object(personal.views),
        workspace = object(views[repo.workspaceId!]);
      localStorage.setItem(
        storageKey,
        JSON.stringify({ ...personal, views: { ...views, [repo.workspaceId!]: { ...workspace, [key]: { ...object(workspace[key]), ...next } } } }),
      );
      setValue(next);
      setError('');
    } catch (err) {
      setError(errorMessage(err, t));
    }
  }
  return { value, save, prefs, ready, error, setError, retry: () => retry(n => n + 1) };
}
