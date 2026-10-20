import { useCallback, useEffect, useRef, useState } from 'react';
export function useNavigation(beforeLeave?: () => Promise<boolean>) {
  const [url, setUrl] = useState(() => new URL(location.href));
  const current = useRef(url),
    guard = useRef(beforeLeave),
    generation = useRef(0);
  guard.current = beforeLeave;
  useEffect(() => {
    let alive = true;
    const changed = async () => {
      const next = new URL(location.href),
        previous = current.current,
        request = ++generation.current;
      const allowed = !guard.current || (await guard.current());
      if (!alive || request !== generation.current) return;
      if (!allowed) {
        history.pushState({}, '', previous.href);
        return;
      }
      current.current = next;
      setUrl(next);
    };
    addEventListener('popstate', changed);
    return () => {
      alive = false;
      removeEventListener('popstate', changed);
    };
  }, []);
  const navigate = useCallback((href: string, replace = false) => {
    generation.current++;
    history[replace ? 'replaceState' : 'pushState']({}, '', href);
    current.current = new URL(location.href);
    setUrl(current.current);
  }, []);
  return { url, navigate };
}
export type Navigation = ReturnType<typeof useNavigation>;
