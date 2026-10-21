// Pure historical configuration validator. No Auth client or module side effects.
import { WorkspaceError } from '../../src/workspace/errors.js';
export function workspaceConfig(env = {}) {
  const mode = env.VITE_DATA_MODE || 'local';
  if (!['local', 'supabase'].includes(mode)) throw new WorkspaceError('configuration');
  if (mode === 'local') return { mode };
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new WorkspaceError('configuration');
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error();
    if (parsed.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) throw new Error();
  } catch {
    throw new WorkspaceError('configuration');
  }
  if (key.startsWith('sb_secret_')) throw new WorkspaceError('configuration');
  try {
    if (key.split('.').length === 3 && JSON.parse(atob(key.split('.')[1])).role === 'service_role') throw new WorkspaceError('configuration');
  } catch (error) {
    if (error instanceof WorkspaceError) throw error;
  }
  return { mode, url, key };
}
