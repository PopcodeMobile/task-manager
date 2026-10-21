import type { SupabaseClient } from '@supabase/supabase-js';
import { RepositoryError } from '../../workspace/normalized.ts';
type PasswordAuth = Pick<SupabaseClient['auth'], 'signInWithPassword' | 'signOut' | 'updateUser' | 'getUser'>;
/** Verify through an isolated in-memory session; terminate only that session before changing the main account. */
export async function changeAccountPassword(
  main: PasswordAuth,
  verifier: PasswordAuth,
  userId: string,
  email: string,
  current: string,
  next: string,
  signal: AbortSignal,
) {
  const active = () => {
    if (signal.aborted) throw new DOMException('Disposed', 'AbortError');
  };
  active();
  let authenticated = false;
  let verificationError: unknown;
  try {
    const result = await verifier.signInWithPassword({ email, password: current });
    authenticated = !!result.data.user;
    if (result.error || result.data.user?.id !== userId) throw new RepositoryError('unauthorized');
    active();
  } catch (error) {
    verificationError = error;
  }
  if (authenticated) {
    const cleanup = await verifier.signOut({ scope: 'local' });
    if (cleanup.error) throw new RepositoryError('network');
  }
  if (verificationError) throw verificationError;
  active();
  const actor = await main.getUser();
  active();
  if (actor.error || actor.data.user?.id !== userId) throw new RepositoryError('unauthorized');
  const result = await main.updateUser({ password: next, current_password: current });
  if (result.error) throw new RepositoryError('unauthorized');
  active();
}
