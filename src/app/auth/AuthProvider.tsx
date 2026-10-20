import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '../integrations/client';
function safeReturn(value: string | null) {
  return value && /^\/(?:app(?:\/|$)|oauth\/consent(?:\?|$)|integrations(?:\?|$)|login(?:\?|$))/.test(value) ? value : '/app';
}
let callback: Promise<void> | null = null;
function exchangeCallback() {
  if (location.pathname !== '/auth/callback' || !supabase) return Promise.resolve();
  if (callback) return callback;
  const url = new URL(location.href),
    code = url.searchParams.get('code');
  callback = (async () => {
    if (!code) throw new Error('invalid_callback');
    const destination = safeReturn(url.searchParams.get('returnTo'));
    sessionStorage.setItem('gr8r-auth-return', destination);
    if (url.searchParams.get('mode') === 'recovery') sessionStorage.setItem('gr8r-recovery', 'true');
    const { error } = await supabase!.auth.exchangeCodeForSession(code);
    if (error) {
      sessionStorage.removeItem('gr8r-recovery');
      throw error;
    }
    history.replaceState({}, '', destination);
  })();
  return callback;
}
const AuthContext = createContext<{
  session: Session | null;
  loading: boolean;
  configured: boolean;
  recovery: boolean;
  authError: boolean;
  completeRecovery: () => void;
  sessionBoundary: string | null;
}>({ session: null, loading: true, configured: !!supabase, recovery: false, authError: false, completeRecovery: () => {}, sessionBoundary: null });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [recovery, setRecovery] = useState(() => sessionStorage.getItem('gr8r-recovery') === 'true'),
    [authError, setAuthError] = useState(false),
    [sessionBoundary, setSessionBoundary] = useState<string | null>(null);
  const boundary = useRef<{ userId: string; sessionId: string | null; token: string; epoch: number } | null>(null),
    epoch = useRef(0);
  function acceptSession(value: Session | null, event: AuthChangeEvent = 'INITIAL_SESSION') {
    if (!value) {
      boundary.current = null;
      setSessionBoundary(null);
      setSession(null);
      return;
    }
    // This claim partitions local state only. The existing Auth/RPC stack still validates authority.
    let sessionId: string | null = null;
    try {
      const payload = JSON.parse(atob(value.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (typeof payload.session_id === 'string' && payload.session_id) sessionId = payload.session_id;
    } catch {
      /* Missing identity fails closed on replacement sign-in. */
    }
    const previous = boundary.current;
    const same =
      previous?.userId === value.user.id &&
      (sessionId ? previous.sessionId === sessionId : previous.sessionId === null && (event === 'TOKEN_REFRESHED' || previous.token === value.access_token));
    const generation = same ? previous!.epoch : ++epoch.current;
    boundary.current = { userId: value.user.id, sessionId, token: value.access_token, epoch: generation };
    setSessionBoundary(`${value.user.id}:${sessionId ?? 'unidentified'}:${generation}`);
    setSession(value);
  }
  useEffect(() => {
    let alive = true;
    if (!supabase) {
      setLoading(false);
      return;
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, value) => {
      if (alive) {
        acceptSession(value, event);
        if (event === 'SIGNED_IN') setAuthError(false);
        if (event === 'PASSWORD_RECOVERY') {
          sessionStorage.setItem('gr8r-recovery', 'true');
          setRecovery(true);
        }
        if (event === 'SIGNED_OUT') {
          sessionStorage.removeItem('gr8r-recovery');
          setRecovery(false);
        }
      }
    });
    exchangeCallback()
      .then(() => supabase!.auth.getSession())
      .then(({ data, error }) => {
        if (error) throw error;
        if (alive) {
          acceptSession(data.session);
          setRecovery(sessionStorage.getItem('gr8r-recovery') === 'true');
        }
      })
      .catch(() => {
        if (alive) setAuthError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);
  function completeRecovery() {
    sessionStorage.removeItem('gr8r-recovery');
    setRecovery(false);
    if (location.pathname === '/auth/callback' || location.pathname === '/login')
      history.replaceState({}, '', safeReturn(sessionStorage.getItem('gr8r-auth-return')));
    sessionStorage.removeItem('gr8r-auth-return');
  }
  return (
    <AuthContext.Provider value={{ session, loading, configured: !!supabase, recovery, authError, completeRecovery, sessionBoundary }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
