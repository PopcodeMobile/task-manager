import { WorkspaceError } from './errors.js';
export function workspaceConfig(env = import.meta.env || {}) {
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
let configuration;
let configurationError = null;
try {
  configuration = workspaceConfig();
} catch (error) {
  configurationError = error;
  configuration = { mode: 'supabase' };
}
export { configurationError };
export const isCloudMode = () => configuration.mode === 'supabase';
let client;
export async function getSupabase() {
  if (configurationError) throw configurationError;
  if (!isCloudMode()) throw new WorkspaceError('configuration');
  if (!client) {
    client = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(configuration.url, configuration.key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      }),
    );
  }
  return client;
}
