import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
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
}>({ session: null, loading: true, configured: !!supabase, recovery: false, authError: false, completeRecovery: () => {} });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [recovery, setRecovery] = useState(() => sessionStorage.getItem('gr8r-recovery') === 'true'),
    [authError, setAuthError] = useState(false);
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
        setSession(value);
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
          setSession(data.session);
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
  return <AuthContext.Provider value={{ session, loading, configured: !!supabase, recovery, authError, completeRecovery }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
