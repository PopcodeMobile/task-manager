import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../integrations/client';
const AuthContext = createContext<{ session: Session | null; loading: boolean; configured: boolean }>({ session: null, loading: true, configured: !!supabase });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (alive) {
        setSession(data.session);
        setLoading(false);
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, value) => {
      if (alive) {
        setSession(value);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);
  return <AuthContext.Provider value={{ session, loading, configured: !!supabase }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
